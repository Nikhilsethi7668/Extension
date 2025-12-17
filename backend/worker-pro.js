/**
 * AutoBridge - Professional Material Design Dashboard
 * Cloudflare Workers Deployment
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = 'dev-secret-key-change-in-production';

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
  <title>AutoBridge - Professional Dashboard</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #fafbfc;
      color: #2c3e50;
    }

    /* Login Page */
    .login-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .login-card {
      background: white;
      padding: 3rem;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      width: 100%;
      max-width: 420px;
    }
    .login-logo {
      text-align: center;
      margin-bottom: 2rem;
    }
    .login-logo h1 {
      font-size: 2rem;
      color: #667eea;
      margin-bottom: 0.5rem;
    }
    .login-logo p {
      color: #95a5a6;
      font-size: 0.95rem;
    }
    .form-group {
      margin-bottom: 1.5rem;
    }
    .form-group label {
      display: block;
      margin-bottom: 0.75rem;
      font-weight: 600;
      color: #2c3e50;
    }
    .form-group input {
      width: 100%;
      padding: 0.875rem;
      border: 2px solid #e8eef5;
      border-radius: 8px;
      font-size: 0.95rem;
      transition: all 0.3s;
    }
    .form-group input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    .btn-login {
      width: 100%;
      padding: 1rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      font-size: 1rem;
    }
    .btn-login:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
    }
    .login-hint {
      text-align: center;
      margin-top: 1.5rem;
      color: #95a5a6;
      font-size: 0.9rem;
    }

    /* Main Layout */
    .app-wrapper {
      display: flex;
      height: 100vh;
    }
    .sidebar {
      width: 280px;
      background: #2c3e50;
      color: white;
      overflow-y: auto;
      padding-top: 2rem;
      box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
    }
    .sidebar-header {
      padding: 0 1.5rem 2rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      margin-bottom: 1.5rem;
    }
    .sidebar-logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 1.5rem;
      font-weight: 700;
    }
    .sidebar-menu {
      list-style: none;
    }
    .menu-item {
      border-left: 4px solid transparent;
      padding: 1rem 1.5rem;
      cursor: pointer;
      transition: all 0.3s;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.95rem;
    }
    .menu-item:hover {
      background: rgba(255, 255, 255, 0.05);
      border-left-color: #667eea;
    }
    .menu-item.active {
      background: rgba(102, 126, 234, 0.2);
      border-left-color: #667eea;
      color: #667eea;
    }
    .menu-item i {
      width: 20px;
    }

    /* Main Content */
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .topbar {
      background: white;
      padding: 1.5rem 2rem;
      border-bottom: 1px solid #e8eef5;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }
    .topbar-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: #2c3e50;
    }
    .topbar-right {
      display: flex;
      align-items: center;
      gap: 2rem;
    }
    .user-info {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .user-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
    }
    .btn-logout {
      padding: 0.5rem 1.5rem;
      background: #e74c3c;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.3s;
    }
    .btn-logout:hover {
      background: #c0392b;
      transform: translateY(-1px);
    }

    /* Content Area */
    .content-wrapper {
      flex: 1;
      overflow-y: auto;
      padding: 2rem;
    }
    .page-content { display: none; }
    .page-content.active { display: block; }

    /* Cards & Components */
    .card {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      margin-bottom: 1.5rem;
    }
    .card h2 {
      font-size: 1.3rem;
      margin-bottom: 1.5rem;
      color: #2c3e50;
    }

    /* Grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      border-left: 4px solid #667eea;
    }
    .stat-label {
      color: #95a5a6;
      font-size: 0.9rem;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .stat-value {
      font-size: 2.5rem;
      font-weight: 700;
      color: #667eea;
    }

    /* Forms */
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .form-row.full {
      grid-template-columns: 1fr;
    }
    .form-group {
      margin-bottom: 1.5rem;
    }
    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 600;
      color: #2c3e50;
    }
    .form-group input, .form-group textarea, .form-group select {
      width: 100%;
      padding: 0.875rem;
      border: 2px solid #e8eef5;
      border-radius: 8px;
      font-size: 0.95rem;
      transition: all 0.3s;
      font-family: inherit;
    }
    .form-group input:focus, .form-group textarea:focus, .form-group select:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    textarea {
      resize: vertical;
      min-height: 100px;
    }

    /* Buttons */
    .btn {
      padding: 0.875rem 1.75rem;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.3s;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.95rem;
    }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
    }
    .btn-secondary {
      background: #ecf0f1;
      color: #2c3e50;
    }
    .btn-secondary:hover {
      background: #d5dbdb;
    }
    .btn-danger {
      background: #e74c3c;
      color: white;
    }
    .btn-danger:hover {
      background: #c0392b;
    }
    .btn-sm {
      padding: 0.5rem 1rem;
      font-size: 0.85rem;
    }

    /* Tables */
    .table-responsive {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead {
      background: #f8f9fa;
    }
    th {
      padding: 1rem;
      text-align: left;
      font-weight: 600;
      color: #2c3e50;
      border-bottom: 2px solid #e8eef5;
    }
    td {
      padding: 1rem;
      border-bottom: 1px solid #e8eef5;
    }
    tbody tr:hover {
      background: #f8f9fa;
    }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 0.375rem 1rem;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .badge-success {
      background: #d5f4e6;
      color: #27ae60;
    }
    .badge-warning {
      background: #fdebd0;
      color: #e67e22;
    }
    .badge-info {
      background: #d6eaf8;
      color: #2980b9;
    }
    .badge-danger {
      background: #fadbd8;
      color: #e74c3c;
    }

    /* Alerts */
    .alert {
      padding: 1rem 1.5rem;
      border-radius: 8px;
      margin-bottom: 1.5rem;
      display: none;
    }
    .alert.show { display: block; }
    .alert-success {
      background: #d5f4e6;
      color: #27ae60;
      border-left: 4px solid #27ae60;
    }
    .alert-error {
      background: #fadbd8;
      color: #e74c3c;
      border-left: 4px solid #e74c3c;
    }

    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: #d5dbdb;
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #95a5a6;
    }
  </style>
</head>
<body>
  <!-- Login Page -->
  <div id="loginPage">
    <div class="login-container">
      <div class="login-card">
        <div class="login-logo">
          <h1>🚗 AutoBridge</h1>
          <p>Professional Vehicle Scraping Platform</p>
        </div>
        <div class="form-group">
          <label>User ID</label>
          <input type="text" id="loginUserId" placeholder="Enter your username">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="loginPassword" placeholder="Enter your password">
        </div>
        <button class="btn-login" onclick="handleLogin()">Sign In</button>
        <div class="login-hint">
          <strong>Demo:</strong> admin/admin or demo/demo
        </div>
      </div>
    </div>
  </div>

  <!-- Main Application -->
  <div id="mainApp" style="display: none;">
    <div class="app-wrapper">
      <!-- Sidebar -->
      <div class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-logo">
            <i class="fas fa-car"></i>
            AutoBridge
          </div>
        </div>
        <ul class="sidebar-menu">
          <li class="menu-item active" onclick="switchPage('dashboard')">
            <i class="fas fa-chart-line"></i>
            <span>Dashboard</span>
          </li>
          <li class="menu-item" onclick="switchPage('jobs')">
            <i class="fas fa-tasks"></i>
            <span>Job Queue</span>
          </li>
          <li class="menu-item" onclick="switchPage('jobs-list')">
            <i class="fas fa-list"></i>
            <span>All Jobs</span>
          </li>
          <li class="menu-item" id="usersMenu" style="display: none;" onclick="switchPage('users')">
            <i class="fas fa-users"></i>
            <span>User Management</span>
          </li>
          <li class="menu-item" id="logsMenu" style="display: none;" onclick="switchPage('logs')">
            <i class="fas fa-history"></i>
            <span>Activity Logs</span>
          </li>
          <li class="menu-item" id="settingsMenu" style="display: none;" onclick="switchPage('settings')">
            <i class="fas fa-cog"></i>
            <span>Settings</span>
          </li>
        </ul>
      </div>

      <!-- Main Content -->
      <div class="main-content">
        <!-- Topbar -->
        <div class="topbar">
          <div class="topbar-title" id="pageTitle">Dashboard</div>
          <div class="topbar-right">
            <div class="user-info">
              <div class="user-avatar" id="userAvatar">A</div>
              <div>
                <div style="font-weight: 600;" id="userName">Admin</div>
                <div style="font-size: 0.85rem; color: #95a5a6;" id="userRole">Administrator</div>
              </div>
            </div>
            <button class="btn-logout" onclick="handleLogout()">Logout</button>
          </div>
        </div>

        <!-- Content -->
        <div class="content-wrapper">
          <div id="alertBox"></div>

          <!-- Dashboard Page -->
          <div id="dashboard" class="page-content active">
            <div class="grid">
              <div class="stat-card">
                <div class="stat-label"><i class="fas fa-briefcase"></i> Total Jobs</div>
                <div class="stat-value" id="totalJobsCount">0</div>
              </div>
              <div class="stat-card">
                <div class="stat-label"><i class="fas fa-hourglass-half"></i> Queued</div>
                <div class="stat-value" id="queuedJobsCount">0</div>
              </div>
              <div class="stat-card">
                <div class="stat-label"><i class="fas fa-check"></i> Ready</div>
                <div class="stat-value" id="readyJobsCount">0</div>
              </div>
              <div class="stat-card">
                <div class="stat-label"><i class="fas fa-users"></i> Users</div>
                <div class="stat-value" id="totalUsersCount">0</div>
              </div>
            </div>

            <div class="card">
              <h2><i class="fas fa-chart-bar"></i> System Overview</h2>
              <div class="form-row full">
                <p>Welcome to AutoBridge Admin Dashboard. Use the sidebar to navigate through different features.</p>
              </div>
            </div>
          </div>

          <!-- Job Queue Page -->
          <div id="jobs" class="page-content">
            <div class="card">
              <h2><i class="fas fa-plus-circle"></i> Queue New Scraping Job</h2>
              
              <div class="form-row">
                <div class="form-group">
                  <label>URLs to Scrape</label>
                  <textarea id="jobUrls" placeholder="Enter URLs, one per line&#10;https://example.com&#10;https://another-url.com"></textarea>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Source Type</label>
                  <input type="text" id="jobSource" placeholder="e.g., autotrader, cars.com, cargurus">
                </div>
                <div class="form-group">
                  <label>Assign To (Optional)</label>
                  <input type="text" id="jobAssignTo" placeholder="Username">
                </div>
              </div>

              <div class="form-row full">
                <button class="btn btn-primary" onclick="queueJobs()">
                  <i class="fas fa-check"></i> Queue Jobs
                </button>
              </div>
            </div>
          </div>

          <!-- Jobs List Page -->
          <div id="jobs-list" class="page-content">
            <div class="card">
              <h2><i class="fas fa-list"></i> All Scraping Jobs</h2>
              <div class="table-responsive" id="jobsTable">
                <table>
                  <thead>
                    <tr>
                      <th>Job ID</th>
                      <th>URL</th>
                      <th>Source</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody id="jobsTableBody">
                    <tr><td colspan="6" style="text-align: center; color: #95a5a6;">Loading jobs...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Users Page -->
          <div id="users" class="page-content">
            <div class="card">
              <h2><i class="fas fa-user-plus"></i> Register New User</h2>
              
              <div class="form-row">
                <div class="form-group">
                  <label>Username</label>
                  <input type="text" id="newUsername" placeholder="Enter username">
                </div>
                <div class="form-group">
                  <label>Email</label>
                  <input type="email" id="newEmail" placeholder="Enter email address">
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Password</label>
                  <input type="password" id="newPassword" placeholder="Enter password">
                </div>
                <div class="form-group">
                  <label>Role</label>
                  <select id="newRole">
                    <option value="user">User</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>

              <div class="form-row full">
                <button class="btn btn-primary" onclick="createUser()">
                  <i class="fas fa-user-check"></i> Create User
                </button>
              </div>
            </div>

            <div class="card">
              <h2><i class="fas fa-users"></i> All Users</h2>
              <div class="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody id="usersTableBody">
                    <tr><td colspan="6" style="text-align: center; color: #95a5a6;">Loading users...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Logs Page -->
          <div id="logs" class="page-content">
            <div class="card">
              <h2><i class="fas fa-history"></i> Activity Logs</h2>
              <div class="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Action</th>
                      <th>Timestamp</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody id="logsTableBody">
                    <tr><td colspan="4" style="text-align: center; color: #95a5a6;">Loading logs...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Settings Page -->
          <div id="settings" class="page-content">
            <div class="card">
              <h2><i class="fas fa-sliders-h"></i> System Settings</h2>
              <div class="form-row full">
                <p><strong>API Endpoint:</strong> https://autobridge-backend.dchatpar.workers.dev/api</p>
                <p><strong>Version:</strong> 2.0.0 (Professional Material UI)</p>
                <p><strong>Status:</strong> <span class="badge badge-success">Operational</span></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const API = 'https://autobridge-backend.dchatpar.workers.dev/api';
    let token = localStorage.getItem('token');
    let user = localStorage.getItem('user');
    let role = localStorage.getItem('role');

    function showAlert(msg, type = 'error') {
      const alertBox = document.getElementById('alertBox');
      alertBox.innerHTML = \`<div class="alert alert-\${type} show">\${msg}</div>\`;
      setTimeout(() => alertBox.innerHTML = '', 4000);
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

    async function handleLogin() {
      const userId = document.getElementById('loginUserId').value;
      const password = document.getElementById('loginPassword').value;
      try {
        const res = await call('/auth/login', 'POST', { userId, password });
        token = res.token;
        user = userId;
        role = res.role;
        localStorage.setItem('token', token);
        localStorage.setItem('user', user);
        localStorage.setItem('role', role);
        initializeApp();
      } catch (e) {
        showAlert('Login failed: ' + e.message);
      }
    }

    function handleLogout() {
      token = user = role = null;
      localStorage.clear();
      location.reload();
    }

    function initializeApp() {
      document.getElementById('loginPage').style.display = 'none';
      document.getElementById('mainApp').style.display = 'flex';
      
      const firstLetter = user.charAt(0).toUpperCase();
      document.getElementById('userAvatar').textContent = firstLetter;
      document.getElementById('userName').textContent = user;
      document.getElementById('userRole').textContent = role === 'admin' ? 'Administrator' : 'User';

      if (role === 'admin') {
        document.getElementById('usersMenu').style.display = 'flex';
        document.getElementById('logsMenu').style.display = 'flex';
        document.getElementById('settingsMenu').style.display = 'flex';
      }

      loadDashboard();
      setInterval(loadDashboard, 15000);
    }

    function switchPage(page) {
      document.querySelectorAll('.page-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
      document.getElementById(page).classList.add('active');
      event.target.closest('.menu-item').classList.add('active');

      const titles = {
        'dashboard': 'Dashboard',
        'jobs': 'Queue New Job',
        'jobs-list': 'All Jobs',
        'users': 'User Management',
        'logs': 'Activity Logs',
        'settings': 'Settings'
      };
      document.getElementById('pageTitle').textContent = titles[page];

      if (page === 'jobs-list') loadJobsList();
      if (page === 'users') { loadUsersList(); }
      if (page === 'logs') loadLogsList();
    }

    async function loadDashboard() {
      try {
        if (role === 'admin') {
          const stats = await call('/stats/dashboard');
          document.getElementById('totalJobsCount').textContent = stats.stats.totalJobs;
          document.getElementById('queuedJobsCount').textContent = stats.stats.queuedJobs;
          document.getElementById('readyJobsCount').textContent = stats.stats.readyJobs;
          document.getElementById('totalUsersCount').textContent = stats.stats.totalUsers;
        }
      } catch (e) { }
    }

    async function queueJobs() {
      const urls = document.getElementById('jobUrls').value.trim().split('\\n').filter(u => u.trim());
      if (!urls.length) { showAlert('Please enter at least one URL'); return; }
      try {
        await call('/scrape/queue', 'POST', {
          urls,
          source: document.getElementById('jobSource').value || 'unknown',
          options: { assignedTo: document.getElementById('jobAssignTo').value || null }
        });
        showAlert('Jobs queued successfully!', 'success');
        document.getElementById('jobUrls').value = '';
        loadJobsList();
      } catch (e) {
        showAlert('Queue failed: ' + e.message);
      }
    }

    async function loadJobsList() {
      try {
        const res = await call('/scrape/jobs');
        const html = (res.jobs || []).slice(0, 50).map(job => \`
          <tr>
            <td><code style="background: #f0f0f0; padding: 0.25rem 0.5rem; border-radius: 4px;">\${job.id.slice(0, 8)}...</code></td>
            <td>\${new URL(job.url).hostname}</td>
            <td>\${job.source}</td>
            <td><span class="badge badge-info">\${job.status}</span></td>
            <td>\${new Date(job.createdAt).toLocaleDateString()}</td>
            <td><a href="\${job.url}" target="_blank" class="btn btn-sm btn-secondary">View</a></td>
          </tr>
        \`).join('');
        document.getElementById('jobsTableBody').innerHTML = html || '<tr><td colspan="6" style="text-align: center;">No jobs found</td></tr>';
      } catch (e) { }
    }

    async function createUser() {
      try {
        await call('/auth/register', 'POST', {
          userId: document.getElementById('newUsername').value,
          email: document.getElementById('newEmail').value,
          password: document.getElementById('newPassword').value,
          role: document.getElementById('newRole').value
        });
        showAlert('User created successfully!', 'success');
        document.getElementById('newUsername').value = '';
        document.getElementById('newEmail').value = '';
        document.getElementById('newPassword').value = '';
        loadUsersList();
      } catch (e) {
        showAlert('Failed: ' + e.message);
      }
    }

    async function loadUsersList() {
      if (role !== 'admin') return;
      try {
        const res = await call('/users');
        const html = (res.users || []).map(u => \`
          <tr>
            <td><strong>\${u.userId}</strong></td>
            <td>\${u.email}</td>
            <td><span class="badge \${u.role === 'admin' ? 'badge-danger' : 'badge-info'}">\${u.role}</span></td>
            <td><span class="badge badge-success">\${u.status}</span></td>
            <td>\${new Date(u.createdAt).toLocaleDateString()}</td>
            <td>\${u.userId !== user ? \`<button class="btn btn-sm btn-danger" onclick="deleteUser('\${u.userId}')">Delete</button>\` : '-'}</td>
          </tr>
        \`).join('');
        document.getElementById('usersTableBody').innerHTML = html;
      } catch (e) { }
    }

    async function deleteUser(userId) {
      if (!confirm('Delete this user?')) return;
      try {
        await call(\`/users/\${userId}\`, 'DELETE');
        showAlert('User deleted!', 'success');
        loadUsersList();
      } catch (e) {
        showAlert('Failed: ' + e.message);
      }
    }

    async function loadLogsList() {
      if (role !== 'admin') return;
      try {
        const res = await call('/logs/activity');
        const html = (res.logs || []).slice(0, 100).map(log => \`
          <tr>
            <td>\${log.userId}</td>
            <td>\${log.action}</td>
            <td>\${new Date(log.timestamp).toLocaleString()}</td>
            <td><span class="badge \${log.success ? 'badge-success' : 'badge-danger'}">\${log.success ? 'Success' : 'Failed'}</span></td>
          </tr>
        \`).join('');
        document.getElementById('logsTableBody').innerHTML = html;
      } catch (e) { }
    }

    window.onload = () => {
      if (token && user && role) {
        initializeApp();
      }
    };
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }
  });
}
