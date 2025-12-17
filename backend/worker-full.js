/**
 * Cloudflare Workers Handler - AutoBridge Full Stack
 * Serves both React Dashboard + API from single worker
 */

import jwt from 'jsonwebtoken';
import { GoogleGenerativeAI } from '@google/generative-ai';

const JWT_SECRET = globalThis.JWT_SECRET || 'dev-secret-key-change-in-production';
const GEMINI_API_KEY = globalThis.GEMINI_API_KEY || '';

// In-memory storage
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
    globalThis.DB = env.DB;

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers for API
    const apiHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json'
    };

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: apiHeaders });
    }

    try {
      // API routes
      if (path.startsWith('/api/')) {
        return handleApiRequest(request, path, method, apiHeaders);
      }

      // Dashboard route - serve index.html for all non-API paths
      if (path === '/' || path === '' || !path.includes('.')) {
        return serveIndexHtml();
      }

      // 404 for unknown routes
      return jsonResponse({ success: false, message: 'Not found' }, apiHeaders, 404);
    } catch (err) {
      console.error('Error:', err);
      return jsonResponse({ success: false, message: err.message }, apiHeaders, 500);
    }
  }
};

/**
 * Handle API requests
 */
async function handleApiRequest(request, path, method, headers) {
  const url = new URL(request.url);

  // Root API info
  if (path === '/api' || path === '/api/') {
    return jsonResponse(
      {
        app: 'AutoBridge Backend API',
        version: '1.0.0',
        status: 'online',
        dashboard: '/',
        endpoints: {
          health: 'GET /api/health',
          login: 'POST /api/auth/login',
          validate: 'POST /api/auth/validate',
          queue: 'POST /api/scrape/queue',
          jobs: 'GET /api/scrape/jobs',
          updateJob: 'PATCH /api/scrape/jobs/:id',
          users: 'GET /api/users'
        },
        deployed: new Date().toISOString()
      },
      headers
    );
  }

  // Health check
  if (path === '/api/health' && method === 'GET') {
    return jsonResponse({ status: 'ok', message: 'Cloudflare Workers API running' }, headers);
  }

  // Login
  if (path === '/api/auth/login' && method === 'POST') {
    const body = await request.json();
    return handleLogin(body, headers);
  }

  // Validate token
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

  // Queue scrape
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

  // Get jobs
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

  // Update job
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

  // Get users
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
}

/**
 * Serve React dashboard
 */
function serveIndexHtml() {
  // Minimal HTML shell that loads React app
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="AutoBridge Admin Dashboard" />
    <title>AutoBridge - Admin Dashboard</title>
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
          'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      code {
        font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New', monospace;
      }
      #root {
        width: 100%;
        height: 100vh;
      }
      .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        font-size: 18px;
        color: #666;
      }
    </style>
  </head>
  <body>
    <div id="root"><div class="loading">Loading AutoBridge Dashboard...</div></div>
    <script>
      // Configure API URL
      window.REACT_APP_API_URL = '${globalThis.API_URL || ''}/api';
    </script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

/**
 * Handlers
 */

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

/**
 * Smart scrape function
 */
async function smartScrapeBasic(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) return null;

    const html = await res.text();

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

/**
 * Helpers
 */

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
