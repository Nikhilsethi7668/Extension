/**
 * Cloudflare Workers Handler for AutoBridge Backend
 * Adapts Express server-simple.js to run on Cloudflare Workers
 */

import jwt from 'jsonwebtoken';
import { GoogleGenerativeAI } from '@google/generative-ai';

const JWT_SECRET = globalThis.JWT_SECRET || 'dev-secret-key-change-in-production';
const GEMINI_API_KEY = globalThis.GEMINI_API_KEY || '';

// In-memory storage (will be reset on each deployment; use KV for persistence)
let users = [
  {
    userId: 'admin',
    email: 'admin@shifty.com',
    password: 'admin',
    role: 'admin',
    status: 'active',
    createdAt: new Date().toISOString()
  },
  {
    userId: 'demo',
    email: 'demo@shifty.com',
    password: 'demo',
    role: 'user',
    status: 'active',
    createdAt: new Date().toISOString()
  }
];

let activityLogs = [];
let scrapeJobs = [];

/**
 * Main handler function
 */
export default {
  async fetch(request, env, ctx) {
    // Update globals from environment
    globalThis.JWT_SECRET = env.JWT_SECRET || JWT_SECRET;
    globalThis.GEMINI_API_KEY = env.GEMINI_API_KEY || GEMINI_API_KEY;
    globalThis.DB = env.DB; // KV namespace

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json'
    };

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    try {
      // Root path - serve dashboard
      if ((path === '/' || path === '') && method === 'GET') {
        return serveDashboard(headers);
      }

      // Serve dashboard for non-API paths
      if (!path.startsWith('/api')) {
        return serveDashboard(headers);
      }

      // Route handlers
      if (path === '/api/health' && method === 'GET') {
        return jsonResponse({ status: 'ok', message: 'Cloudflare Workers API running' }, headers);
      }

      if (path === '/api/auth/login' && method === 'POST') {
        const body = await request.json();
        return handleLogin(body, headers);
      }

      if (path === '/api/auth/validate' && method === 'POST') {
        const token = getToken(request);
        if (!token) return jsonResponse({ success: false, message: 'No token' }, headers, 401);
        try {
          const decoded = jwt.verify(token, globalThis.JWT_SECRET);
          return jsonResponse({ success: true, userId: decoded.userId, role: decoded.role }, headers);
        } catch (e) {
          return jsonResponse({ success: false, message: 'Invalid token' }, headers, 403);
        }
      }

      if (path === '/api/scrape/queue' && method === 'POST') {
        const token = getToken(request);
        if (!token) return jsonResponse({ success: false, message: 'No token' }, headers, 401);
        try {
          jwt.verify(token, globalThis.JWT_SECRET);
          const body = await request.json();
          return handleQueueScrape(body, headers);
        } catch (e) {
          return jsonResponse({ success: false, message: 'Invalid token' }, headers, 403);
        }
      }

      if (path === '/api/scrape/jobs' && method === 'GET') {
        const token = getToken(request);
        if (!token) return jsonResponse({ success: false, message: 'No token' }, headers, 401);
        try {
          const decoded = jwt.verify(token, globalThis.JWT_SECRET);
          const status = url.searchParams.get('status');
          const assignedTo = url.searchParams.get('assignedTo');
          let jobs = scrapeJobs.slice(-100).reverse();

          if (status) {
            jobs = jobs.filter(j => (j.status || '').toLowerCase() === status.toLowerCase());
          }

          if (decoded.role !== 'admin') {
            jobs = jobs.filter(j => (j.assignedTo || '') === decoded.userId);
          } else if (assignedTo) {
            jobs = jobs.filter(j => (j.assignedTo || '') === assignedTo);
          }

          return jsonResponse({ success: true, jobs }, headers);
        } catch (e) {
          return jsonResponse({ success: false, message: 'Invalid token' }, headers, 403);
        }
      }

      if (path.match(/^\/api\/scrape\/jobs\/[\w_]+$/) && method === 'PATCH') {
        const token = getToken(request);
        if (!token) return jsonResponse({ success: false, message: 'No token' }, headers, 401);
        try {
          const decoded = jwt.verify(token, globalThis.JWT_SECRET);
          const jobId = path.split('/').pop();
          const body = await request.json();
          const job = scrapeJobs.find(j => j.id === jobId);

          if (!job) return jsonResponse({ success: false, message: 'Job not found' }, headers, 404);

          const { status, scraped, assignedTo } = body;
          if (status) job.status = status;
          if (scraped) job.scraped = { ...job.scraped, ...scraped };

          if (typeof assignedTo !== 'undefined') {
            if (decoded.role !== 'admin') {
              return jsonResponse({ success: false, message: 'Admin required' }, headers, 403);
            }
            job.assignedTo = assignedTo || null;
          }

          return jsonResponse({ success: true, job }, headers);
        } catch (e) {
          return jsonResponse({ success: false, message: 'Error: ' + e.message }, headers, 500);
        }
      }

      if (path === '/api/users' && method === 'GET') {
        const token = getToken(request);
        if (!token) return jsonResponse({ success: false, message: 'No token' }, headers, 401);
        try {
          const decoded = jwt.verify(token, globalThis.JWT_SECRET);
          if (decoded.role !== 'admin') return jsonResponse({ success: false, message: 'Admin only' }, headers, 403);

          const userList = users.map(u => ({
            userId: u.userId,
            email: u.email,
            role: u.role,
            status: u.status,
            createdAt: u.createdAt
          }));

          return jsonResponse({ success: true, users: userList }, headers);
        } catch (e) {
          return jsonResponse({ success: false, message: 'Invalid token' }, headers, 403);
        }
      }

      return jsonResponse({ success: false, message: 'Not found' }, headers, 404);
    } catch (err) {
      console.error('Error:', err);
      return jsonResponse({ success: false, message: err.message }, headers, 500);
    }
  }
};

// ============ Handlers ============

function handleLogin(body, headers) {
  const { userId, password } = body;
  if (!userId || !password) {
    return jsonResponse({ success: false, message: 'Missing credentials' }, headers, 400);
  }

  const user = users.find(u => u.userId === userId);
  if (!user || user.password !== password) {
    return jsonResponse({ success: false, message: 'Invalid credentials' }, headers, 401);
  }

  if (user.status !== 'active') {
    return jsonResponse({ success: false, message: 'Account inactive' }, headers, 403);
  }

  const token = jwt.sign({ userId: user.userId, role: user.role }, globalThis.JWT_SECRET, { expiresIn: '24h' });

  activityLogs.push({
    userId: user.userId,
    action: 'login',
    timestamp: new Date().toISOString(),
    success: true
  });

  return jsonResponse(
    {
      success: true,
      token,
      userId: user.userId,
      role: user.role,
      email: user.email
    },
    headers
  );
}

async function handleQueueScrape(body, headers) {
  const { source = 'unknown', urls = [], options = {}, geminiApiKey } = body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return jsonResponse({ success: false, message: 'No URLs provided' }, headers, 400);
  }

  const created = [];

  for (const url of urls) {
    let scraped = null;
    try {
      scraped = await smartScrapeBasic(url, { source, geminiApiKey });
    } catch (err) {
      console.error('Scrape error:', err.message);
    }

    const job = {
      id: 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      source,
      urls: [url],
      url: url,
      options,
      status: scraped ? 'ready' : 'queued',
      createdAt: new Date().toISOString(),
      scraped,
      assignedTo: options && options.assignedTo ? options.assignedTo : null
    };

    scrapeJobs.push(job);
    created.push(job);
  }

  return jsonResponse({ success: true, created: created.length, first: created[0] || null }, headers);
}

// ============ Helpers ============

async function smartScrapeBasic(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) return null;

    const html = await res.text();

    // Very basic parsing
    const extracted = {
      url,
      source: options.source || 'auto',
      scrapedAt: new Date().toISOString(),
      images: []
    };

    // Extract price
    const priceMatch = html.match(/\$[\d,]+/);
    if (priceMatch) extracted.price = priceMatch[0];

    // Extract images
    const imgMatches = html.match(/src=["']([^"']*\.(jpg|jpeg|png|webp))['"]/gi) || [];
    extracted.images = imgMatches.slice(0, 5).map(m => m.match(/src=["']([^"']*)["']/)[1]);

    return extracted;
  } catch (err) {
    console.error('Scrape failed:', err.message);
    return null;
  }
}

function getToken(request) {
  const auth = request.headers.get('Authorization') || '';
  return auth.split(' ')[1];
}

function jsonResponse(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

function serveDashboard(headers) {
  // Serve React dashboard with API URL configured
  const apiUrl = 'https://autobridge-backend.dchatpar.workers.dev/api';
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="AutoBridge Admin Dashboard" />
    <title>AutoBridge - Admin Dashboard</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
          'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        background: #f5f5f5;
      }
      #root { width: 100%; min-height: 100vh; }
      .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        flex-direction: column;
        gap: 20px;
        font-size: 18px;
        color: #666;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }
      .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      .loading-text {
        color: white;
        font-weight: 500;
      }
    </style>
  </head>
  <body>
    <div id="root">
      <div class="loading">
        <div class="spinner"></div>
        <div class="loading-text">AutoBridge Dashboard</div>
        <small style="color: rgba(255,255,255,0.7);">Connecting to API...</small>
      </div>
    </div>
    <script>
      window.REACT_APP_API_URL = '${apiUrl}';
      window.API_URL = '${apiUrl}';
      console.log('API URL configured:', window.REACT_APP_API_URL);
    </script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 
      ...headers,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
