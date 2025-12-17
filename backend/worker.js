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

      if (path === '/api/auth/register' && method === 'POST') {
        const token = getToken(request);
        if (!token) return jsonResponse({ success: false, message: 'No token' }, headers, 401);
        try {
          const decoded = jwt.verify(token, globalThis.JWT_SECRET);
          if (decoded.role !== 'admin') return jsonResponse({ success: false, message: 'Admin only' }, headers, 403);

          const body = await request.json();
          const { userId, email, password, role } = body;
          if (!userId || !email || !password) {
            return jsonResponse({ success: false, message: 'Missing fields' }, headers, 400);
          }

          if (users.find(u => u.userId === userId)) {
            return jsonResponse({ success: false, message: 'User exists' }, headers, 400);
          }

          const newUser = {
            userId,
            email,
            password,
            role: role || 'user',
            status: 'active',
            createdAt: new Date().toISOString()
          };

          users.push(newUser);
          return jsonResponse({ success: true, message: 'User created', user: newUser }, headers);
        } catch (e) {
          return jsonResponse({ success: false, message: 'Error: ' + e.message }, headers, 500);
        }
      }

      if (path.match(/^\/api\/users\/[\w]+$/) && method === 'DELETE') {
        const token = getToken(request);
        if (!token) return jsonResponse({ success: false, message: 'No token' }, headers, 401);
        try {
          const decoded = jwt.verify(token, globalThis.JWT_SECRET);
          if (decoded.role !== 'admin') return jsonResponse({ success: false, message: 'Admin only' }, headers, 403);

          const userId = path.split('/').pop();
          if (userId === decoded.userId) {
            return jsonResponse({ success: false, message: 'Cannot delete self' }, headers, 400);
          }

          const idx = users.findIndex(u => u.userId === userId);
          if (idx === -1) return jsonResponse({ success: false, message: 'User not found' }, headers, 404);

          users.splice(idx, 1);
          return jsonResponse({ success: true, message: 'User deleted' }, headers);
        } catch (e) {
          return jsonResponse({ success: false, message: 'Error: ' + e.message }, headers, 500);
        }
      }

      if (path === '/api/logs/activity' && method === 'GET') {
        const token = getToken(request);
        if (!token) return jsonResponse({ success: false, message: 'No token' }, headers, 401);
        try {
          const decoded = jwt.verify(token, globalThis.JWT_SECRET);
          let logs = [...activityLogs];

          if (decoded.role !== 'admin') {
            logs = logs.filter(l => l.userId === decoded.userId);
          }

          const userId = url.searchParams.get('userId');
          if (userId) logs = logs.filter(l => l.userId === userId);

          logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          return jsonResponse({ success: true, logs }, headers);
        } catch (e) {
          return jsonResponse({ success: false, message: 'Invalid token' }, headers, 403);
        }
      }

      if (path === '/api/logs/activity' && method === 'POST') {
        const token = getToken(request);
        if (!token) return jsonResponse({ success: false, message: 'No token' }, headers, 401);
        try {
          const decoded = jwt.verify(token, globalThis.JWT_SECRET);
          const body = await request.json();
          const { action, metadata } = body;

          activityLogs.push({
            userId: decoded.userId,
            action,
            timestamp: new Date().toISOString(),
            metadata: metadata || {},
            success: body.success !== false
          });

          return jsonResponse({ success: true, message: 'Log created' }, headers);
        } catch (e) {
          return jsonResponse({ success: false, message: 'Error: ' + e.message }, headers, 500);
        }
      }

      if (path === '/api/stats/dashboard' && method === 'GET') {
        const token = getToken(request);
        if (!token) return jsonResponse({ success: false, message: 'No token' }, headers, 401);
        try {
          const decoded = jwt.verify(token, globalThis.JWT_SECRET);
          if (decoded.role !== 'admin') return jsonResponse({ success: false, message: 'Admin only' }, headers, 403);

          const stats = {
            totalUsers: users.length,
            totalJobs: scrapeJobs.length,
            totalLogs: activityLogs.length,
            readyJobs: scrapeJobs.filter(j => j.status === 'ready').length,
            queuedJobs: scrapeJobs.filter(j => j.status === 'queued').length,
            failedJobs: scrapeJobs.filter(j => j.status === 'failed').length
          };

          return jsonResponse({ success: true, stats }, headers);
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
  // Serve fully functional dashboard HTML with all features
  const apiUrl = 'https://autobridge-backend.dchatpar.workers.dev/api';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="AutoBridge Admin Dashboard">
  <title>AutoBridge - Admin Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f7fa;
      color: #333;
    }
    .navbar {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .navbar h1 { font-size: 1.5rem; }
    .navbar-right { display: flex; gap: 1rem; align-items: center; }
    .navbar-right small { opacity: 0.9; }
    .container { max-width: 1400px; margin: 0 auto; padding: 2rem 1rem; }
    .tabs { display: flex; gap: 0.5rem; margin-bottom: 2rem; border-bottom: 2px solid #ddd; }
    .tab-btn {
      background: none;
      border: none;
      padding: 1rem 1.5rem;
      cursor: pointer;
      font-size: 0.95rem;
      color: #666;
      border-bottom: 3px solid transparent;
      transition: all 0.2s;
    }
    .tab-btn.active { color: #667eea; border-bottom-color: #667eea; }
    .tab-btn:hover { color: #667eea; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .card {
      background: white;
      border-radius: 8px;
      padding: 1.5rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      transition: transform 0.2s;
    }
    .card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
    .stat-card { text-align: center; }
    .stat-value { font-size: 2.5rem; font-weight: bold; color: #667eea; }
    .stat-label { color: #666; margin-top: 0.5rem; }
    .btn {
      background: #667eea;
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.95rem;
      transition: background 0.2s;
      margin-right: 0.5rem;
    }
    .btn:hover { background: #5568d3; }
    .btn-sm { padding: 0.5rem 1rem; font-size: 0.85rem; }
    .btn-danger { background: #e74c3c; }
    .btn-danger:hover { background: #c0392b; }
    .btn-success { background: #27ae60; }
    .btn-success:hover { background: #229954; }
    .input-group { margin-bottom: 1rem; }
    .input-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
    .input-group input, .input-group textarea, .input-group select {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: inherit;
    }
    .input-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .jobs-table, .users-table, .logs-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    .jobs-table th, .users-table th, .logs-table th {
      background: #f0f0f0;
      padding: 1rem;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #ddd;
    }
    .jobs-table td, .users-table td, .logs-table td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #eee;
    }
    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 500;
    }
    .status-ready { background: #d4edda; color: #155724; }
    .status-queued { background: #fff3cd; color: #856404; }
    .status-failed { background: #f8d7da; color: #721c24; }
    .status-active { background: #d4edda; color: #155724; }
    .status-inactive { background: #f8d7da; color: #721c24; }
    .alert { padding: 1rem; border-radius: 4px; margin-bottom: 1rem; }
    .alert-error { background: #f8d7da; color: #721c24; border-left: 4px solid #e74c3c; }
    .alert-success { background: #d4edda; color: #155724; border-left: 4px solid #27ae60; }
    .section { margin-bottom: 2rem; }
    .section h2 { margin-bottom: 1rem; color: #333; font-size: 1.3rem; }
    .loading { text-align: center; color: #666; padding: 2rem; }
    .spinner {
      display: inline-block;
      width: 30px;
      height: 30px;
      border: 3px solid #f3f3f3;
      border-top: 3px solid #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); }
    .modal.show { display: flex; align-items: center; justify-content: center; }
    .modal-content { background: white; padding: 2rem; border-radius: 8px; width: 90%; max-width: 500px; }
    .close { float: right; font-size: 1.5rem; cursor: pointer; }
    .form-group { margin-bottom: 1rem; }
    .job-detail { background: #f9f9f9; padding: 1rem; border-radius: 4px; margin-top: 1rem; }
    .job-detail h4 { margin-bottom: 0.5rem; }
    .job-detail p { margin: 0.25rem 0; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="navbar">
    <h1>🚗 AutoBridge</h1>
    <div class="navbar-right">
      <div id="userInfo" style="text-align: right;">
        <div style="font-weight: 500;">Not logged in</div>
        <small id="apiStatus">Checking API...</small>
      </div>
      <button class="btn btn-sm" id="logoutBtn" style="display: none;" onclick="logout()">Logout</button>
    </div>
  </div>

  <div class="container">
    <div id="alert"></div>

    <!-- Login Tab -->
    <div id="loginTab" class="tab-content active">
      <div class="section">
        <h2>Login</h2>
        <div class="card" style="max-width: 400px;">
          <div class="input-group">
            <label>User ID</label>
            <input type="text" id="userIdInput" placeholder="admin or demo" />
          </div>
          <div class="input-group">
            <label>Password</label>
            <input type="password" id="passwordInput" placeholder="Enter password" />
          </div>
          <button class="btn" onclick="login()">Login</button>
          <p style="margin-top: 1rem; font-size: 0.9rem; color: #666;">Demo: admin/admin or demo/demo</p>
        </div>
      </div>
    </div>

    <!-- Dashboard Tab -->
    <div id="dashboardTab" class="tab-content" style="display: none;">
      <div class="tabs">
        <button class="tab-btn active" onclick="switchTab('dashboard-jobs')">📊 Dashboard</button>
        <button class="tab-btn" onclick="switchTab('dashboard-users')" id="usersTabBtn" style="display: none;">👥 Users</button>
        <button class="tab-btn" onclick="switchTab('dashboard-logs')" id="logsTabBtn" style="display: none;">📝 Logs</button>
      </div>

      <!-- Dashboard Stats -->
      <div id="dashboard-jobs" class="tab-content active">
        <div class="section">
          <h2>Quick Stats</h2>
          <div class="grid" id="stats">
            <div class="card stat-card">
              <div class="stat-value">--</div>
              <div class="stat-label">Total Jobs</div>
            </div>
            <div class="card stat-card">
              <div class="stat-value">--</div>
              <div class="stat-label">Ready Jobs</div>
            </div>
            <div class="card stat-card">
              <div class="stat-value">--</div>
              <div class="stat-label">Queued Jobs</div>
            </div>
            <div class="card stat-card">
              <div class="stat-value" id="failedCount">--</div>
              <div class="stat-label">Failed Jobs</div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>Queue New Job</h2>
          <div class="card">
            <div class="input-group">
              <label>URLs (one per line)</label>
              <textarea id="urlsInput" style="min-height: 100px;"></textarea>
            </div>
            <div class="input-row">
              <div class="input-group">
                <label>Source</label>
                <input type="text" id="sourceInput" placeholder="e.g., autotrader, cars.com" />
              </div>
              <div class="input-group">
                <label>Assign To (optional)</label>
                <input type="text" id="assignToInput" placeholder="username" />
              </div>
            </div>
            <button class="btn" onclick="queueJobs()">Queue Jobs</button>
          </div>
        </div>

        <div class="section">
          <h2>Recent Jobs</h2>
          <div class="card">
            <div id="jobsList" class="loading">
              <div class="spinner"></div>
              <p>Loading jobs...</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Users Management -->
      <div id="dashboard-users" class="tab-content">
        <div class="section">
          <h2>Register New User</h2>
          <div class="card">
            <div class="input-group">
              <label>User ID</label>
              <input type="text" id="newUserId" placeholder="username" />
            </div>
            <div class="input-group">
              <label>Email</label>
              <input type="email" id="newUserEmail" placeholder="email@example.com" />
            </div>
            <div class="input-group">
              <label>Password</label>
              <input type="password" id="newUserPassword" placeholder="password" />
            </div>
            <div class="input-group">
              <label>Role</label>
              <select id="newUserRole">
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button class="btn" onclick="registerUser()">Create User</button>
          </div>
        </div>

        <div class="section">
          <h2>All Users</h2>
          <div class="card">
            <div id="usersList" class="loading">
              <div class="spinner"></div>
              <p>Loading users...</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Activity Logs -->
      <div id="dashboard-logs" class="tab-content">
        <div class="section">
          <h2>Activity Logs</h2>
          <div class="card">
            <div id="logsList" class="loading">
              <div class="spinner"></div>
              <p>Loading logs...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const API_URL = '${apiUrl}';
    let token = localStorage.getItem('token');
    let currentUser = localStorage.getItem('currentUser');
    let currentUserRole = localStorage.getItem('currentUserRole');
    let refreshInterval = null;

    function showAlert(message, type = 'error', duration = 5000) {
      const alertDiv = document.getElementById('alert');
      alertDiv.innerHTML = \`<div class="alert alert-\${type}">\${message}</div>\`;
      if (duration) setTimeout(() => { alertDiv.innerHTML = ''; }, duration);
    }

    async function apiCall(endpoint, method = 'GET', body = null) {
      const opts = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': \`Bearer \${token}\` })
        }
      };
      if (body) opts.body = JSON.stringify(body);

      try {
        const res = await fetch(API_URL + endpoint, opts);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'API Error');
        return data;
      } catch (err) {
        throw err;
      }
    }

    async function login() {
      const userId = document.getElementById('userIdInput').value;
      const password = document.getElementById('passwordInput').value;
      if (!userId || !password) { showAlert('Please enter user ID and password'); return; }

      try {
        const res = await apiCall('/auth/login', 'POST', { userId, password });
        token = res.token;
        currentUser = userId;
        currentUserRole = res.role;
        localStorage.setItem('token', token);
        localStorage.setItem('currentUser', currentUser);
        localStorage.setItem('currentUserRole', currentUserRole);
        showAlert('Logged in successfully!', 'success', 2000);
        updateUI();
        showDashboard();
      } catch (err) {
        showAlert('Login failed: ' + err.message);
      }
    }

    function logout() {
      token = null;
      currentUser = null;
      currentUserRole = null;
      localStorage.removeItem('token');
      localStorage.removeItem('currentUser');
      localStorage.removeItem('currentUserRole');
      if (refreshInterval) clearInterval(refreshInterval);
      showAlert('Logged out', 'success', 2000);
      updateUI();
      switchToLoginTab();
    }

    function switchTab(tabName) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(tabName).classList.add('active');
      event.target.classList.add('active');
      
      if (tabName === 'dashboard-users') loadUsers();
      if (tabName === 'dashboard-logs') loadLogs();
    }

    async function queueJobs() {
      if (!token) { showAlert('Please login first'); return; }
      const urls = document.getElementById('urlsInput').value.trim().split('\\n').filter(u => u.trim());
      const source = document.getElementById('sourceInput').value || 'unknown';
      const assignedTo = document.getElementById('assignToInput').value || null;
      if (!urls.length) { showAlert('Please enter at least one URL'); return; }

      try {
        const res = await apiCall('/scrape/queue', 'POST', { urls, source, options: { assignedTo } });
        showAlert(\`Queued \${res.created} job(s)!\`, 'success', 2000);
        document.getElementById('urlsInput').value = '';
        document.getElementById('sourceInput').value = '';
        document.getElementById('assignToInput').value = '';
        loadJobs();
      } catch (err) {
        showAlert('Failed to queue jobs: ' + err.message);
      }
    }

    async function loadJobs() {
      if (!token) return;
      try {
        const res = await apiCall('/scrape/jobs');
        const jobs = res.jobs || [];
        const ready = jobs.filter(j => j.status === 'ready').length;
        const queued = jobs.filter(j => j.status === 'queued').length;
        const failed = jobs.filter(j => j.status === 'failed').length;

        document.getElementById('stats').innerHTML = \`
          <div class="card stat-card">
            <div class="stat-value">\${jobs.length}</div>
            <div class="stat-label">Total Jobs</div>
          </div>
          <div class="card stat-card">
            <div class="stat-value">\${ready}</div>
            <div class="stat-label">Ready Jobs</div>
          </div>
          <div class="card stat-card">
            <div class="stat-value">\${queued}</div>
            <div class="stat-label">Queued Jobs</div>
          </div>
          <div class="card stat-card">
            <div class="stat-value">\${failed}</div>
            <div class="stat-label">Failed Jobs</div>
          </div>
        \`;

        if (jobs.length === 0) {
          document.getElementById('jobsList').innerHTML = '<p style="text-align: center; color: #999;">No jobs yet</p>';
        } else {
          document.getElementById('jobsList').innerHTML = \`
            <table class="jobs-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>URL</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Assigned To</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                \${jobs.slice(0, 20).map(job => \`
                  <tr>
                    <td><small>\${job.id.slice(0, 8)}...</small></td>
                    <td><small><a href="\${job.url}" target="_blank">\${new URL(job.url).hostname}</a></small></td>
                    <td><span class="status-badge status-\${job.status}">\${job.status || 'unknown'}</span></td>
                    <td>\${job.source || '-'}</td>
                    <td>\${job.assignedTo || '-'}</td>
                    <td><small>\${new Date(job.createdAt).toLocaleDateString()}</small></td>
                    <td><button class="btn btn-sm" onclick="viewJobDetail('\${job.id}')">View</button></td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          \`;
        }
      } catch (err) {
        // Silently fail if not authenticated
      }
    }

    async function viewJobDetail(jobId) {
      try {
        const res = await apiCall('/scrape/jobs');
        const job = res.jobs.find(j => j.id === jobId);
        if (!job) { showAlert('Job not found'); return; }
        
        let detail = '<div class="job-detail">';
        detail += \`<h4>\${job.url}</h4>\`;
        detail += \`<p><strong>Status:</strong> \${job.status}</p>\`;
        detail += \`<p><strong>Source:</strong> \${job.source}</p>\`;
        detail += \`<p><strong>Created:</strong> \${new Date(job.createdAt).toLocaleString()}</p>\`;
        if (job.scraped) {
          detail += \`<p><strong>Data:</strong> \${Object.keys(job.scraped).length} fields extracted</p>\`;
          if (job.scraped.price) detail += \`<p><strong>Price:</strong> \${job.scraped.price}</p>\`;
          if (job.scraped.mileage) detail += \`<p><strong>Mileage:</strong> \${job.scraped.mileage}</p>\`;
        }
        detail += '</div>';
        
        const alertDiv = document.getElementById('alert');
        alertDiv.innerHTML = detail;
      } catch (err) {
        showAlert('Failed to load job details');
      }
    }

    async function registerUser() {
      if (currentUserRole !== 'admin') { showAlert('Admin access required'); return; }
      const userId = document.getElementById('newUserId').value;
      const email = document.getElementById('newUserEmail').value;
      const password = document.getElementById('newUserPassword').value;
      const role = document.getElementById('newUserRole').value;
      if (!userId || !email || !password) { showAlert('Please fill all fields'); return; }

      try {
        const res = await apiCall('/auth/register', 'POST', { userId, email, password, role });
        showAlert('User created successfully!', 'success', 2000);
        document.getElementById('newUserId').value = '';
        document.getElementById('newUserEmail').value = '';
        document.getElementById('newUserPassword').value = '';
        loadUsers();
      } catch (err) {
        showAlert('Failed to create user: ' + err.message);
      }
    }

    async function loadUsers() {
      if (currentUserRole !== 'admin') return;
      try {
        const res = await apiCall('/users');
        const users = res.users || [];

        if (users.length === 0) {
          document.getElementById('usersList').innerHTML = '<p style="text-align: center; color: #999;">No users</p>';
        } else {
          document.getElementById('usersList').innerHTML = \`
            <table class="users-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                \${users.map(user => \`
                  <tr>
                    <td>\${user.userId}</td>
                    <td>\${user.email}</td>
                    <td>\${user.role}</td>
                    <td><span class="status-badge status-\${user.status}">\${user.status}</span></td>
                    <td><small>\${new Date(user.createdAt).toLocaleDateString()}</small></td>
                    <td>
                      \${user.userId !== currentUser ? \`<button class="btn btn-sm btn-danger" onclick="deleteUser('\${user.userId}')">Delete</button>\` : '-'}
                    </td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          \`;
        }
      } catch (err) {
        showAlert('Failed to load users');
      }
    }

    async function deleteUser(userId) {
      if (!confirm('Are you sure?')) return;
      try {
        await apiCall(\`/users/\${userId}\`, 'DELETE');
        showAlert('User deleted', 'success', 2000);
        loadUsers();
      } catch (err) {
        showAlert('Failed to delete user: ' + err.message);
      }
    }

    async function loadLogs() {
      if (currentUserRole !== 'admin') return;
      try {
        const res = await apiCall('/logs/activity');
        const logs = res.logs || [];

        if (logs.length === 0) {
          document.getElementById('logsList').innerHTML = '<p style="text-align: center; color: #999;">No logs</p>';
        } else {
          document.getElementById('logsList').innerHTML = \`
            <table class="logs-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Action</th>
                  <th>Timestamp</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                \${logs.slice(0, 50).map(log => \`
                  <tr>
                    <td>\${log.userId}</td>
                    <td>\${log.action}</td>
                    <td><small>\${new Date(log.timestamp).toLocaleString()}</small></td>
                    <td><span class="status-badge \${log.success ? 'status-active' : 'status-inactive'}">\${log.success ? 'Success' : 'Failed'}</span></td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          \`;
        }
      } catch (err) {
        showAlert('Failed to load logs');
      }
    }

    function switchToLoginTab() {
      document.getElementById('loginTab').classList.add('active');
      document.getElementById('dashboardTab').classList.remove('active');
    }

    function showDashboard() {
      document.getElementById('loginTab').classList.remove('active');
      document.getElementById('dashboardTab').classList.add('active');
    }

    function updateUI() {
      const userInfo = document.getElementById('userInfo');
      const logoutBtn = document.getElementById('logoutBtn');
      const usersTabBtn = document.getElementById('usersTabBtn');
      const logsTabBtn = document.getElementById('logsTabBtn');

      if (token) {
        userInfo.innerHTML = \`<div style="font-weight: 500;">\${currentUser} ✓</div><small id="apiStatus">✅ Connected</small>\`;
        logoutBtn.style.display = 'block';
        usersTabBtn.style.display = currentUserRole === 'admin' ? 'block' : 'none';
        logsTabBtn.style.display = currentUserRole === 'admin' ? 'block' : 'none';
        
        loadJobs();
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(loadJobs, 10000); // Refresh every 10s
      } else {
        userInfo.innerHTML = '<div>Not logged in</div><small id="apiStatus">Waiting for login...</small>';
        logoutBtn.style.display = 'none';
        usersTabBtn.style.display = 'none';
        logsTabBtn.style.display = 'none';
      }
    }

    async function checkAPI() {
      try {
        await apiCall('/health');
      } catch (err) {
        // API error
      }
    }

    window.addEventListener('load', () => {
      checkAPI();
      updateUI();
      if (!token) switchToLoginTab();
    });
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
