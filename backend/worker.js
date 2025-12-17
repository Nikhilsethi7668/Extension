/**
 * AutoBridge Cloudflare Workers Backend - Complete Implementation
 * All features: Auth, Job Management, User Management, Activity Logs
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = 'dev-secret-key-change-in-production';
const GEMINI_API_KEY = '';

// Global storage
let users = [
  { userId: 'admin', email: 'admin@shifty.com', password: 'admin', role: 'admin', status: 'active', createdAt: new Date().toISOString() },
  { userId: 'demo', email: 'demo@shifty.com', password: 'demo', role: 'user', status: 'active', createdAt: new Date().toISOString() }
];
let activityLogs = [];
let scrapeJobs = [];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json'
    };

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers });

    try {
      // Dashboard UI
      if ((path === '/' || path === '') && method === 'GET') return serveDashboard(headers);
      if (!path.startsWith('/api')) return serveDashboard(headers);

      // Extract token
      const token = request.headers.get('Authorization')?.split(' ')[1];
      let decoded = null;
      if (token) {
        try {
          decoded = jwt.verify(token, env.JWT_SECRET || JWT_SECRET);
        } catch (e) {
          return res({ success: false, message: 'Invalid token' }, headers, 403);
        }
      }

      // API Routes
      if (path === '/api/health' && method === 'GET') {
        return res({ status: 'ok', message: 'AutoBridge API running' }, headers);
      }

      if (path === '/api/auth/login' && method === 'POST') {
        const { userId, password } = await request.json();
        const user = users.find(u => u.userId === userId && u.password === password && u.status === 'active');
        if (!user) return res({ success: false, message: 'Invalid credentials' }, headers, 401);
        
        const t = jwt.sign({ userId: user.userId, role: user.role }, env.JWT_SECRET || JWT_SECRET, { expiresIn: '24h' });
        activityLogs.push({ userId, action: 'login', timestamp: new Date().toISOString(), success: true });
        return res({ success: true, token: t, userId: user.userId, role: user.role, email: user.email }, headers);
      }

      if (path === '/api/auth/validate' && method === 'POST') {
        if (!decoded) return res({ success: false, message: 'No token' }, headers, 401);
        return res({ success: true, userId: decoded.userId, role: decoded.role }, headers);
      }

      if (path === '/api/auth/register' && method === 'POST') {
        if (!decoded || decoded.role !== 'admin') return res({ success: false, message: 'Admin required' }, headers, 403);
        const { userId, email, password, role } = await request.json();
        if (users.find(u => u.userId === userId)) return res({ success: false, message: 'User exists' }, headers, 400);
        
        const newUser = { userId, email, password, role: role || 'user', status: 'active', createdAt: new Date().toISOString() };
        users.push(newUser);
        activityLogs.push({ userId: decoded.userId, action: 'create_user', timestamp: new Date().toISOString(), success: true, metadata: { targetUser: userId } });
        return res({ success: true, message: 'User created', user: newUser }, headers);
      }

      if (path === '/api/users' && method === 'GET') {
        if (!decoded || decoded.role !== 'admin') return res({ success: false, message: 'Admin required' }, headers, 403);
        const userList = users.map(u => ({ userId: u.userId, email: u.email, role: u.role, status: u.status, createdAt: u.createdAt }));
        return res({ success: true, users: userList }, headers);
      }

      if (path.match(/^\/api\/users\/[\w]+$/) && method === 'DELETE') {
        if (!decoded || decoded.role !== 'admin') return res({ success: false, message: 'Admin required' }, headers, 403);
        const userId = path.split('/').pop();
        if (userId === decoded.userId) return res({ success: false, message: 'Cannot delete self' }, headers, 400);
        const idx = users.findIndex(u => u.userId === userId);
        if (idx === -1) return res({ success: false, message: 'User not found' }, headers, 404);
        users.splice(idx, 1);
        activityLogs.push({ userId: decoded.userId, action: 'delete_user', timestamp: new Date().toISOString(), success: true, metadata: { targetUser: userId } });
        return res({ success: true, message: 'User deleted' }, headers);
      }

      if (path === '/api/scrape/queue' && method === 'POST') {
        if (!decoded) return res({ success: false, message: 'No token' }, headers, 401);
        const { urls, source, options } = await request.json();
        if (!urls || !urls.length) return res({ success: false, message: 'No URLs' }, headers, 400);
        
        const created = [];
        for (const url of urls) {
          const job = {
            id: 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            source: source || 'unknown',
            url,
            urls: [url],
            status: 'queued',
            createdAt: new Date().toISOString(),
            scraped: null,
            assignedTo: options?.assignedTo || null
          };
          scrapeJobs.push(job);
          created.push(job);
        }
        activityLogs.push({ userId: decoded.userId, action: 'queue_jobs', timestamp: new Date().toISOString(), success: true, metadata: { count: created.length, source } });
        return res({ success: true, created: created.length, first: created[0] || null }, headers);
      }

      if (path === '/api/scrape/jobs' && method === 'GET') {
        if (!decoded) return res({ success: false, message: 'No token' }, headers, 401);
        const status = url.searchParams.get('status');
        let jobs = scrapeJobs.slice().reverse();
        if (status) jobs = jobs.filter(j => j.status === status);
        if (decoded.role !== 'admin') jobs = jobs.filter(j => !j.assignedTo || j.assignedTo === decoded.userId);
        return res({ success: true, jobs }, headers);
      }

      if (path.match(/^\/api\/scrape\/jobs\/[\w_]+$/) && method === 'PATCH') {
        if (!decoded) return res({ success: false, message: 'No token' }, headers, 401);
        const jobId = path.split('/').pop();
        const { status, scraped, assignedTo } = await request.json();
        const job = scrapeJobs.find(j => j.id === jobId);
        if (!job) return res({ success: false, message: 'Job not found' }, headers, 404);
        
        if (status) job.status = status;
        if (scraped) job.scraped = { ...job.scraped, ...scraped };
        if (typeof assignedTo !== 'undefined') {
          if (decoded.role !== 'admin') return res({ success: false, message: 'Admin required' }, headers, 403);
          job.assignedTo = assignedTo || null;
        }
        activityLogs.push({ userId: decoded.userId, action: 'update_job', timestamp: new Date().toISOString(), success: true, metadata: { jobId, status } });
        return res({ success: true, job }, headers);
      }

      if (path === '/api/logs/activity' && method === 'GET') {
        if (!decoded) return res({ success: false, message: 'No token' }, headers, 401);
        let logs = [...activityLogs];
        if (decoded.role !== 'admin') logs = logs.filter(l => l.userId === decoded.userId);
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return res({ success: true, logs }, headers);
      }

      if (path === '/api/stats/dashboard' && method === 'GET') {
        if (!decoded || decoded.role !== 'admin') return res({ success: false, message: 'Admin required' }, headers, 403);
        return res({
          success: true,
          stats: {
            totalUsers: users.length,
            totalJobs: scrapeJobs.length,
            totalLogs: activityLogs.length,
            readyJobs: scrapeJobs.filter(j => j.status === 'ready').length,
            queuedJobs: scrapeJobs.filter(j => j.status === 'queued').length
          }
        }, headers);
      }

      return res({ success: false, message: 'Not found' }, headers, 404);
    } catch (err) {
      console.error(err);
      return res({ success: false, message: err.message }, headers, 500);
    }
  }
};

function res(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

function serveDashboard(headers) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AutoBridge - Admin Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; color: #333; }
    .navbar { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
    .navbar h1 { font-size: 1.5rem; }
    .navbar-right { display: flex; gap: 1rem; align-items: center; text-align: right; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem 1rem; }
    .tabs { display: flex; gap: 0.5rem; margin-bottom: 2rem; border-bottom: 2px solid #ddd; }
    .tab-btn { background: none; border: none; padding: 1rem 1.5rem; cursor: pointer; color: #666; border-bottom: 3px solid transparent; transition: all 0.2s; }
    .tab-btn.active { color: #667eea; border-bottom-color: #667eea; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: white; border-radius: 8px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .stat-value { font-size: 2rem; font-weight: bold; color: #667eea; }
    .btn { background: #667eea; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: pointer; margin: 0.5rem 0.25rem 0 0; }
    .btn:hover { background: #5568d3; }
    .btn-danger { background: #e74c3c; }
    .input-group { margin-bottom: 1rem; }
    .input-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
    .input-group input, textarea, select { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f0f0f0; padding: 1rem; text-align: left; font-weight: 600; border-bottom: 2px solid #ddd; }
    td { padding: 0.75rem; border-bottom: 1px solid #eee; }
    .alert { padding: 1rem; border-radius: 4px; margin-bottom: 1rem; }
    .alert-error { background: #f8d7da; color: #721c24; }
    .alert-success { background: #d4edda; color: #155724; }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem; font-weight: 500; }
    .badge-ready { background: #d4edda; color: #155724; }
    .badge-queued { background: #fff3cd; color: #856404; }
    .badge-active { background: #d4edda; color: #155724; }
  </style>
</head>
<body>
  <div class="navbar">
    <h1>🚗 AutoBridge</h1>
    <div class="navbar-right">
      <div id="userInfo">Not logged in</div>
      <button class="btn" id="logoutBtn" style="display: none; margin: 0;" onclick="logout()">Logout</button>
    </div>
  </div>

  <div class="container">
    <div id="alert"></div>

    <!-- LOGIN TAB -->
    <div id="loginTab" class="tab-content active">
      <div class="card" style="max-width: 400px; margin: 2rem auto;">
        <h2>Login</h2>
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

    <!-- DASHBOARD TAB -->
    <div id="dashboardTab" class="tab-content" style="display: none;">
      <div class="tabs">
        <button class="tab-btn active" onclick="switchTab(event, 'jobs')">📊 Jobs</button>
        <button class="tab-btn" onclick="switchTab(event, 'users')" id="usersBtn" style="display: none;">👥 Users</button>
        <button class="tab-btn" onclick="switchTab(event, 'logs')" id="logsBtn" style="display: none;">📝 Logs</button>
      </div>

      <!-- JOBS TAB -->
      <div id="jobs" class="tab-content active">
        <div class="grid">
          <div class="card" style="text-align: center;">
            <div style="font-size: 0.9rem; color: #666;">Total Jobs</div>
            <div class="stat-value" id="totalJobs">0</div>
          </div>
          <div class="card" style="text-align: center;">
            <div style="font-size: 0.9rem; color: #666;">Ready</div>
            <div class="stat-value" id="readyJobs">0</div>
          </div>
          <div class="card" style="text-align: center;">
            <div style="font-size: 0.9rem; color: #666;">Queued</div>
            <div class="stat-value" id="queuedJobs">0</div>
          </div>
        </div>

        <div class="card">
          <h3>Queue New Job</h3>
          <div class="input-group">
            <label>URLs (one per line)</label>
            <textarea id="urlsInput" placeholder="https://example.com" style="min-height: 100px;"></textarea>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="input-group">
              <label>Source</label>
              <input type="text" id="sourceInput" placeholder="e.g., autotrader" />
            </div>
            <div class="input-group">
              <label>Assign To (optional)</label>
              <input type="text" id="assignToInput" placeholder="username" />
            </div>
          </div>
          <button class="btn" onclick="queueJobs()">Queue Jobs</button>
        </div>

        <div class="card">
          <h3>Recent Jobs</h3>
          <div id="jobsList" style="overflow-x: auto;">Loading jobs...</div>
        </div>
      </div>

      <!-- USERS TAB -->
      <div id="users" class="tab-content">
        <div class="card">
          <h3>Register New User</h3>
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

        <div class="card" style="margin-top: 2rem;">
          <h3>All Users</h3>
          <div id="usersList" style="overflow-x: auto;">Loading users...</div>
        </div>
      </div>

      <!-- LOGS TAB -->
      <div id="logs" class="tab-content">
        <div class="card">
          <h3>Activity Logs</h3>
          <div id="logsList" style="overflow-x: auto;">Loading logs...</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const API = 'https://autobridge-backend.dchatpar.workers.dev/api';
    let token = localStorage.getItem('token');
    let user = localStorage.getItem('user');
    let role = localStorage.getItem('role');

    function alert(msg, type = 'error') {
      const el = document.getElementById('alert');
      el.innerHTML = \`<div class="alert alert-\${type}">\${msg}</div>\`;
      setTimeout(() => el.innerHTML = '', 5000);
    }

    async function call(endpoint, method = 'GET', body = null) {
      const opts = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': \`Bearer \${token}\` })
        },
        ...(body && { body: JSON.stringify(body) })
      };
      const res = await fetch(API + endpoint, opts);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'API Error');
      return data;
    }

    async function login() {
      const userId = document.getElementById('userIdInput').value;
      const password = document.getElementById('passwordInput').value;
      try {
        const res = await call('/auth/login', 'POST', { userId, password });
        token = res.token;
        user = userId;
        role = res.role;
        localStorage.setItem('token', token);
        localStorage.setItem('user', user);
        localStorage.setItem('role', role);
        updateUI();
      } catch (e) {
        alert('Login failed: ' + e.message);
      }
    }

    function logout() {
      token = user = role = null;
      localStorage.clear();
      updateUI();
    }

    function switchTab(e, name) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(name).classList.add('active');
      e.target.classList.add('active');
      if (name === 'users') loadUsers();
      if (name === 'logs') loadLogs();
    }

    async function queueJobs() {
      const urls = document.getElementById('urlsInput').value.trim().split('\\n').filter(u => u.trim());
      if (!urls.length) { alert('Enter at least one URL'); return; }
      try {
        await call('/scrape/queue', 'POST', {
          urls,
          source: document.getElementById('sourceInput').value || 'unknown',
          options: { assignedTo: document.getElementById('assignToInput').value || null }
        });
        alert('Jobs queued!', 'success');
        document.getElementById('urlsInput').value = '';
        loadJobs();
      } catch (e) {
        alert('Queue failed: ' + e.message);
      }
    }

    async function loadJobs() {
      try {
        const res = await call('/scrape/jobs');
        const jobs = res.jobs || [];
        const ready = jobs.filter(j => j.status === 'ready').length;
        const queued = jobs.filter(j => j.status === 'queued').length;
        
        document.getElementById('totalJobs').textContent = jobs.length;
        document.getElementById('readyJobs').textContent = ready;
        document.getElementById('queuedJobs').textContent = queued;

        let html = '<table><thead><tr><th>ID</th><th>URL</th><th>Status</th><th>Source</th><th>Created</th></tr></thead><tbody>';
        jobs.slice(0, 20).forEach(job => {
          html += \`<tr>
            <td><small>\${job.id.slice(0, 8)}...</small></td>
            <td><small><a href="\${job.url}" target="_blank">\${new URL(job.url).hostname}</a></small></td>
            <td><span class="badge badge-\${job.status}">\${job.status}</span></td>
            <td>\${job.source}</td>
            <td><small>\${new Date(job.createdAt).toLocaleDateString()}</small></td>
          </tr>\`;
        });
        html += '</tbody></table>';
        document.getElementById('jobsList').innerHTML = html || '<p>No jobs yet</p>';
      } catch (e) { }
    }

    async function registerUser() {
      try {
        await call('/auth/register', 'POST', {
          userId: document.getElementById('newUserId').value,
          email: document.getElementById('newUserEmail').value,
          password: document.getElementById('newUserPassword').value,
          role: document.getElementById('newUserRole').value
        });
        alert('User created!', 'success');
        document.getElementById('newUserId').value = '';
        document.getElementById('newUserEmail').value = '';
        document.getElementById('newUserPassword').value = '';
        loadUsers();
      } catch (e) {
        alert('Failed: ' + e.message);
      }
    }

    async function loadUsers() {
      if (role !== 'admin') return;
      try {
        const res = await call('/users');
        let html = '<table><thead><tr><th>User ID</th><th>Email</th><th>Role</th><th>Action</th></tr></thead><tbody>';
        (res.users || []).forEach(u => {
          html += \`<tr>
            <td>\${u.userId}</td>
            <td>\${u.email}</td>
            <td>\${u.role}</td>
            <td>\${u.userId !== user ? \`<button class="btn btn-danger" style="padding: 0.5rem 1rem; font-size: 0.85rem;" onclick="delUser('\${u.userId}')">Delete</button>\` : '-'}</td>
          </tr>\`;
        });
        html += '</tbody></table>';
        document.getElementById('usersList').innerHTML = html;
      } catch (e) { }
    }

    async function delUser(userId) {
      if (!confirm('Delete user?')) return;
      try {
        await call(\`/users/\${userId}\`, 'DELETE');
        alert('Deleted!', 'success');
        loadUsers();
      } catch (e) {
        alert('Failed: ' + e.message);
      }
    }

    async function loadLogs() {
      if (role !== 'admin') return;
      try {
        const res = await call('/logs/activity');
        let html = '<table><thead><tr><th>User</th><th>Action</th><th>Time</th><th>Status</th></tr></thead><tbody>';
        (res.logs || []).slice(0, 50).forEach(log => {
          html += \`<tr>
            <td>\${log.userId}</td>
            <td>\${log.action}</td>
            <td><small>\${new Date(log.timestamp).toLocaleString()}</small></td>
            <td><span class="badge \${log.success ? 'badge-active' : 'badge-queued'}">\${log.success ? '✓' : '✗'}</span></td>
          </tr>\`;
        });
        html += '</tbody></table>';
        document.getElementById('logsList').innerHTML = html;
      } catch (e) { }
    }

    function updateUI() {
      const userInfo = document.getElementById('userInfo');
      const logoutBtn = document.getElementById('logoutBtn');
      const loginTab = document.getElementById('loginTab');
      const dashboardTab = document.getElementById('dashboardTab');
      const usersBtn = document.getElementById('usersBtn');
      const logsBtn = document.getElementById('logsBtn');

      if (token) {
        userInfo.textContent = \`\${user} ✓\`;
        logoutBtn.style.display = 'block';
        loginTab.style.display = 'none';
        loginTab.classList.remove('active');
        dashboardTab.style.display = 'block';
        dashboardTab.classList.add('active');
        usersBtn.style.display = role === 'admin' ? 'block' : 'none';
        logsBtn.style.display = role === 'admin' ? 'block' : 'none';
        loadJobs();
        setInterval(loadJobs, 10000);
      } else {
        userInfo.textContent = 'Not logged in';
        logoutBtn.style.display = 'none';
        loginTab.style.display = 'block';
        loginTab.classList.add('active');
        dashboardTab.style.display = 'none';
        dashboardTab.classList.remove('active');
      }
    }

    window.onload = () => updateUI();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }
  });
}
