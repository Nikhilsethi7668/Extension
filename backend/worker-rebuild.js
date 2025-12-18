/**
 * AutoBridge - Clean Rebuild
 * Working authentication + Material Design Dashboard
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = 'dev-secret-key-change-in-production';

// In-memory storage
let users = [
  { userId: 'admin', email: 'admin@shifty.com', password: 'admin', role: 'admin', status: 'active', createdAt: new Date().toISOString() },
  { userId: 'demo', email: 'demo@shifty.com', password: 'demo', role: 'user', status: 'active', createdAt: new Date().toISOString() }
];
let activityLogs = [];
let scrapeJobs = [];

const res = (data, headers, status = 200) => new Response(JSON.stringify(data), { status, headers });

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
      // Serve dashboard
      if ((path === '/' || path === '' || !path.startsWith('/api')) && method === 'GET') {
        return serveDashboard(headers);
      }

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
        return res({ status: 'ok', timestamp: new Date().toISOString() }, headers);
      }

      // LOGIN
      if (path === '/api/auth/login' && method === 'POST') {
        const { userId, password } = await request.json();
        const uid = (userId || '').trim().toLowerCase();
        const user = users.find(u => u.userId.toLowerCase() === uid && u.password === password);
        
        if (!user) {
          return res({ success: false, message: 'Invalid credentials' }, headers, 401);
        }
        
        const t = jwt.sign({ userId: user.userId, role: user.role }, env.JWT_SECRET || JWT_SECRET, { expiresIn: '24h' });
        activityLogs.push({ userId: user.userId, action: 'login', timestamp: new Date().toISOString(), success: true });
        
        return res({ 
          success: true, 
          token: t, 
          userId: user.userId, 
          role: user.role, 
          email: user.email 
        }, headers);
      }

      // SIGNUP
      if (path === '/api/auth/signup' && method === 'POST') {
        const { userId, email, password } = await request.json();
        const uid = (userId || '').trim().toLowerCase();
        
        if (!uid || !email || !password) {
          return res({ success: false, message: 'All fields required' }, headers, 400);
        }
        
        if (users.find(u => u.userId.toLowerCase() === uid)) {
          return res({ success: false, message: 'User already exists' }, headers, 400);
        }
        
        const newUser = { 
          userId: uid, 
          email, 
          password, 
          role: 'user', 
          status: 'active', 
          createdAt: new Date().toISOString() 
        };
        users.push(newUser);
        
        const t = jwt.sign({ userId: newUser.userId, role: newUser.role }, env.JWT_SECRET || JWT_SECRET, { expiresIn: '24h' });
        activityLogs.push({ userId: newUser.userId, action: 'signup', timestamp: new Date().toISOString(), success: true });
        
        return res({ 
          success: true, 
          token: t, 
          userId: newUser.userId, 
          role: newUser.role, 
          email: newUser.email 
        }, headers);
      }

      // VALIDATE TOKEN
      if (path === '/api/auth/validate' && method === 'POST') {
        if (!decoded) return res({ success: false, message: 'No token' }, headers, 401);
        return res({ success: true, userId: decoded.userId, role: decoded.role }, headers);
      }

      // USERS LIST (admin only)
      if (path === '/api/users' && method === 'GET') {
        if (!decoded || decoded.role !== 'admin') return res({ success: false, message: 'Admin required' }, headers, 403);
        const userList = users.map(u => ({ userId: u.userId, email: u.email, role: u.role, status: u.status, createdAt: u.createdAt }));
        return res({ success: true, users: userList }, headers);
      }

      // CREATE USER (admin only)
      if (path === '/api/auth/register' && method === 'POST') {
        if (!decoded || decoded.role !== 'admin') return res({ success: false, message: 'Admin required' }, headers, 403);
        const { userId, email, password, role } = await request.json();
        const uid = (userId || '').trim().toLowerCase();
        
        if (users.find(u => u.userId.toLowerCase() === uid)) {
          return res({ success: false, message: 'User exists' }, headers, 400);
        }
        
        const newUser = { userId: uid, email, password, role: role || 'user', status: 'active', createdAt: new Date().toISOString() };
        users.push(newUser);
        activityLogs.push({ userId: decoded.userId, action: 'create_user', timestamp: new Date().toISOString(), metadata: { targetUser: uid } });
        
        return res({ success: true, message: 'User created', user: newUser }, headers);
      }

      // DELETE USER (admin only)
      if (path.match(/^\/api\/users\/[\w]+$/) && method === 'DELETE') {
        if (!decoded || decoded.role !== 'admin') return res({ success: false, message: 'Admin required' }, headers, 403);
        const userId = path.split('/').pop();
        if (userId === decoded.userId) return res({ success: false, message: 'Cannot delete self' }, headers, 400);
        
        users = users.filter(u => u.userId !== userId);
        activityLogs.push({ userId: decoded.userId, action: 'delete_user', timestamp: new Date().toISOString(), metadata: { targetUser: userId } });
        return res({ success: true, message: 'User deleted' }, headers);
      }

      // QUEUE JOB
      if (path === '/api/scrape/queue' && method === 'POST') {
        if (!decoded) return res({ success: false, message: 'Auth required' }, headers, 401);
        const body = await request.json();
        
        const job = {
          id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId: decoded.userId,
          status: 'queued',
          createdAt: new Date().toISOString(),
          ...body
        };
        
        scrapeJobs.push(job);
        activityLogs.push({ userId: decoded.userId, action: 'queue_job', timestamp: new Date().toISOString(), metadata: { jobId: job.id } });
        
        return res({ success: true, job }, headers);
      }

      // LIST JOBS
      if (path === '/api/scrape/jobs' && method === 'GET') {
        if (!decoded) return res({ success: false, message: 'Auth required' }, headers, 401);
        
        const status = url.searchParams.get('status');
        let jobs = decoded.role === 'admin' ? scrapeJobs : scrapeJobs.filter(j => j.userId === decoded.userId);
        if (status) jobs = jobs.filter(j => j.status === status);
        
        return res({ success: true, jobs }, headers);
      }

      // UPDATE JOB
      if (path.match(/^\/api\/scrape\/jobs\/[\w]+$/) && method === 'PATCH') {
        if (!decoded) return res({ success: false, message: 'Auth required' }, headers, 401);
        const jobId = path.split('/').pop();
        const updates = await request.json();
        
        const job = scrapeJobs.find(j => j.id === jobId);
        if (!job) return res({ success: false, message: 'Job not found' }, headers, 404);
        if (job.userId !== decoded.userId && decoded.role !== 'admin') {
          return res({ success: false, message: 'Access denied' }, headers, 403);
        }
        
        Object.assign(job, updates, { updatedAt: new Date().toISOString() });
        return res({ success: true, job }, headers);
      }

      // ACTIVITY LOGS
      if (path === '/api/logs/activity' && method === 'GET') {
        if (!decoded) return res({ success: false, message: 'Auth required' }, headers, 401);
        const logs = decoded.role === 'admin' ? activityLogs : activityLogs.filter(l => l.userId === decoded.userId);
        return res({ success: true, logs }, headers);
      }

      // DASHBOARD STATS (admin only)
      if (path === '/api/stats/dashboard' && method === 'GET') {
        if (!decoded || decoded.role !== 'admin') return res({ success: false, message: 'Admin required' }, headers, 403);
        
        const stats = {
          totalJobs: scrapeJobs.length,
          queuedJobs: scrapeJobs.filter(j => j.status === 'queued').length,
          completedJobs: scrapeJobs.filter(j => j.status === 'completed').length,
          failedJobs: scrapeJobs.filter(j => j.status === 'failed').length,
          totalUsers: users.length,
          activeUsers: users.filter(u => u.status === 'active').length,
          recentActivity: activityLogs.slice(-20).reverse()
        };
        
        return res({ success: true, stats }, headers);
      }

      // AI PREPARE JOBS (Gemini)
      if (path === '/api/ai/prepare-jobs' && method === 'POST') {
        if (!decoded) return res({ success: false, message: 'Auth required' }, headers, 401);
        const { urls } = await request.json();
        
        if (!urls || urls.length === 0) {
          return res({ success: false, message: 'No URLs provided' }, headers, 400);
        }
        
        try {
          const prompt = `Analyze these vehicle listing URLs and provide intelligent scraping recommendations:
${urls.map((u, i) => `${i + 1}. ${u}`).join('\n')}

For each URL, provide:
1. Source website (autotrader, cars.com, cargurus, etc)
2. Recommended scraping mode (single/batch/search)
3. Priority level (high/medium/low)
4. Any special considerations

Respond in JSON format: { "recommendations": [{ "url": "...", "source": "...", "mode": "...", "priority": "...", "notes": "..." }] }`;
          
          const aiResult = await geminiCall(prompt, env);
          return res({ success: true, analysis: aiResult.text }, headers);
        } catch (e) {
          return res({ success: false, message: 'AI analysis failed: ' + e.message }, headers, 500);
        }
      }

      return res({ success: false, message: 'Not found' }, headers, 404);

    } catch (error) {
      return res({ success: false, message: error.message }, headers, 500);
    }
  }
};

// Gemini API helper
async function geminiCall(prompt, env) {
  const GEMINI_KEY = env.GEMINI_API_KEY || '';
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');
  
  const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=' + GEMINI_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });
  
  if (!response.ok) throw new Error('Gemini API error: ' + response.status);
  const data = await response.json();
  return data.candidates[0].content.parts[0];
}

// Dashboard UI
function serveDashboard(headers) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AutoBridge Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Manrope', sans-serif; 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #2c3e50;
      min-height: 100vh;
    }

    /* Auth Container */
    #authContainer {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }

    .auth-card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      width: 100%;
      max-width: 450px;
      overflow: hidden;
      animation: slideUp 0.5s ease;
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(30px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .auth-hero {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }

    .auth-hero h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .auth-hero p {
      font-size: 16px;
      opacity: 0.95;
    }

    .auth-tabs {
      display: flex;
      border-bottom: 2px solid #f0f0f0;
    }

    .auth-tab {
      flex: 1;
      padding: 18px;
      text-align: center;
      cursor: pointer;
      font-weight: 600;
      color: #7f8c8d;
      transition: all 0.3s;
      border-bottom: 3px solid transparent;
    }

    .auth-tab.active {
      color: #667eea;
      border-bottom-color: #667eea;
      background: #f8f9ff;
    }

    .auth-form {
      padding: 35px 30px;
      display: none;
    }

    .auth-form.active {
      display: block;
    }

    .form-group {
      margin-bottom: 22px;
    }

    .form-group label {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
      color: #2c3e50;
      font-size: 14px;
    }

    .form-group input {
      width: 100%;
      padding: 14px 16px;
      border: 2px solid #e0e6ed;
      border-radius: 10px;
      font-size: 15px;
      font-family: 'Manrope', sans-serif;
      transition: all 0.3s;
    }

    .form-group input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
    }

    .btn {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      font-family: 'Manrope', sans-serif;
    }

    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
    }

    .btn:active {
      transform: translateY(0);
    }

    .alert {
      padding: 14px 18px;
      border-radius: 10px;
      margin-bottom: 20px;
      font-size: 14px;
      font-weight: 500;
      display: none;
    }

    .alert.error {
      background: #fee;
      color: #c33;
      border: 1px solid #fcc;
    }

    .alert.success {
      background: #efe;
      color: #3c3;
      border: 1px solid #cfc;
    }

    /* App Layout */
    #appContainer {
      display: none;
      min-height: 100vh;
    }

    .app-grid {
      display: grid;
      grid-template-columns: 280px 1fr;
      min-height: 100vh;
    }

    /* Sidebar */
    .sidebar {
      background: #1e293b;
      color: white;
      padding: 30px 0;
    }

    .sidebar-header {
      padding: 0 25px 30px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .sidebar-header h2 {
      font-size: 24px;
      font-weight: 700;
      background: linear-gradient(135deg, #667eea, #764ba2);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .sidebar-menu {
      list-style: none;
      padding: 20px 0;
    }

    .menu-item {
      padding: 14px 25px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 500;
    }

    .menu-item:hover {
      background: rgba(255,255,255,0.05);
    }

    .menu-item.active {
      background: linear-gradient(90deg, #667eea, #764ba2);
      border-left: 4px solid white;
    }

    .menu-item i {
      width: 20px;
      text-align: center;
    }

    .sidebar-footer {
      padding: 20px 25px;
      border-top: 1px solid rgba(255,255,255,0.1);
      margin-top: auto;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 15px;
    }

    .user-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea, #764ba2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 16px;
    }

    .logout-btn {
      width: 100%;
      padding: 12px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: white;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }

    .logout-btn:hover {
      background: rgba(255,255,255,0.15);
    }

    /* Main Content */
    .main-content {
      background: #f8fafc;
      padding: 30px;
      overflow-y: auto;
      max-height: 100vh;
    }

    .page-content {
      display: none;
    }

    .page-content.active {
      display: block;
      animation: fadeIn 0.3s;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .page-header {
      margin-bottom: 30px;
    }

    .page-header h1 {
      font-size: 32px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 8px;
    }

    .page-header p {
      color: #64748b;
      font-size: 16px;
    }

    .card {
      background: white;
      border-radius: 12px;
      padding: 25px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }

    .card h2 {
      font-size: 20px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 20px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .stat-card {
      background: white;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .stat-value {
      font-size: 36px;
      font-weight: 700;
      color: #667eea;
      margin: 10px 0;
    }

    .stat-label {
      color: #64748b;
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      text-align: left;
      padding: 14px;
      border-bottom: 1px solid #e2e8f0;
    }

    th {
      background: #f8fafc;
      font-weight: 600;
      color: #475569;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    tr:hover {
      background: #f8fafc;
    }

    .badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }

    .badge-success { background: #d1fae5; color: #065f46; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .badge-error { background: #fee2e2; color: #991b1b; }
    .badge-info { background: #dbeafe; color: #1e40af; }

    .btn-secondary {
      padding: 10px 20px;
      background: #e2e8f0;
      color: #475569;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }

    .btn-secondary:hover {
      background: #cbd5e1;
    }

    .btn-danger {
      padding: 10px 20px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }

    .btn-danger:hover {
      background: #dc2626;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #94a3b8;
    }

    .empty-state i {
      font-size: 64px;
      margin-bottom: 20px;
      opacity: 0.3;
    }

    .empty-state p {
      font-size: 18px;
      font-weight: 600;
    }
  </style>
</head>
<body>

<!-- Auth Container -->
<div id="authContainer">
  <div class="auth-card">
    <div class="auth-hero">
      <h1>🚗 AutoBridge</h1>
      <p>Vehicle Marketplace Automation</p>
    </div>
    
    <div class="auth-tabs">
      <div class="auth-tab active" onclick="switchAuthTab('signin')">Sign In</div>
      <div class="auth-tab" onclick="switchAuthTab('signup')">Sign Up</div>
    </div>

    <!-- Sign In Form -->
    <div id="signinForm" class="auth-form active">
      <div id="loginAlert" class="alert"></div>
      
      <div class="form-group">
        <label>User ID</label>
        <input type="text" id="loginUserId" placeholder="Enter your user ID" autocomplete="username">
      </div>
      
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="loginPassword" placeholder="Enter your password" autocomplete="current-password">
      </div>
      
      <button class="btn" onclick="handleLogin()">
        <i class="fas fa-sign-in-alt"></i> Sign In
      </button>
    </div>

    <!-- Sign Up Form -->
    <div id="signupForm" class="auth-form">
      <div id="signupAlert" class="alert"></div>
      
      <div class="form-group">
        <label>User ID</label>
        <input type="text" id="signupUserId" placeholder="Choose a user ID" autocomplete="username">
      </div>
      
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="signupEmail" placeholder="your@email.com" autocomplete="email">
      </div>
      
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="signupPassword" placeholder="Choose a password" autocomplete="new-password">
      </div>
      
      <button class="btn" onclick="handleSignup()">
        <i class="fas fa-user-plus"></i> Create Account
      </button>
    </div>
  </div>
</div>

<!-- App Container -->
<div id="appContainer">
  <div class="app-grid">
    <!-- Sidebar -->
    <div class="sidebar">
      <div class="sidebar-header">
        <h2>AutoBridge</h2>
      </div>
      
      <ul class="sidebar-menu">
        <li class="menu-item active" onclick="switchPage('dashboard')">
          <i class="fas fa-home"></i>
          <span>Dashboard</span>
        </li>
        <li class="menu-item" onclick="switchPage('jobs')">
          <i class="fas fa-tasks"></i>
          <span>Job Queue</span>
        </li>
        <li class="menu-item" onclick="switchPage('users')" id="usersMenuItem" style="display:none;">
          <i class="fas fa-users"></i>
          <span>Users</span>
        </li>
        <li class="menu-item" onclick="switchPage('logs')">
          <i class="fas fa-history"></i>
          <span>Activity Logs</span>
        </li>
      </ul>
      
      <div class="sidebar-footer">
        <div class="user-info">
          <div class="user-avatar" id="userAvatar">A</div>
          <div>
            <div id="userName" style="font-weight:600;font-size:14px;"></div>
            <div id="userRole" style="font-size:12px;opacity:0.7;"></div>
          </div>
        </div>
        <button class="logout-btn" onclick="logout()">
          <i class="fas fa-sign-out-alt"></i> Logout
        </button>
      </div>
    </div>

    <!-- Main Content -->
    <div class="main-content">
      <!-- Dashboard Page -->
      <div id="dashboard" class="page-content active">
        <div class="page-header">
          <h1>Dashboard</h1>
          <p>Overview of your AutoBridge activity</p>
        </div>

        <div class="stats-grid" id="statsGrid">
          <div class="stat-card">
            <div class="stat-label">Total Jobs</div>
            <div class="stat-value" id="totalJobs">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Queued</div>
            <div class="stat-value" id="queuedJobs">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Completed</div>
            <div class="stat-value" id="completedJobs">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Failed</div>
            <div class="stat-value" id="failedJobs">0</div>
          </div>
        </div>

        <div class="card">
          <h2>Recent Activity</h2>
          <div id="recentActivity"></div>
        </div>
      </div>

      <!-- Jobs Page -->
      <div id="jobs" class="page-content">
        <div class="page-header">
          <h1>Job Queue</h1>
          <p>Manage your scraping jobs</p>
        </div>

        <div class="card">
          <h2>Queue New Job</h2>
          <div class="form-group">
            <label>Source</label>
            <input type="text" id="jobSource" placeholder="autotrader, cars.com, etc">
          </div>
          <div class="form-group">
            <label>URLs (one per line)</label>
            <textarea id="jobUrls" rows="4" style="width:100%;padding:12px;border:2px solid #e0e6ed;border-radius:10px;font-family:inherit;"></textarea>
          </div>
          <button class="btn" onclick="queueJob()">
            <i class="fas fa-plus"></i> Queue Job
          </button>
        </div>

        <div class="card">
          <h2>All Jobs</h2>
          <div id="jobsList"></div>
        </div>
      </div>

      <!-- Users Page -->
      <div id="users" class="page-content">
        <div class="page-header">
          <h1>User Management</h1>
          <p>Manage system users</p>
        </div>

        <div class="card">
          <h2>Create New User</h2>
          <div class="form-group">
            <label>User ID</label>
            <input type="text" id="newUserId">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="newUserEmail">
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="newUserPassword">
          </div>
          <div class="form-group">
            <label>Role</label>
            <select id="newUserRole" style="width:100%;padding:12px;border:2px solid #e0e6ed;border-radius:10px;">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button class="btn" onclick="createUser()">
            <i class="fas fa-user-plus"></i> Create User
          </button>
        </div>

        <div class="card">
          <h2>All Users</h2>
          <div id="usersList"></div>
        </div>
      </div>

      <!-- Logs Page -->
      <div id="logs" class="page-content">
        <div class="page-header">
          <h1>Activity Logs</h1>
          <p>System activity history</p>
        </div>

        <div class="card">
          <div id="logsList"></div>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
  const API = window.location.origin;
  let token = localStorage.getItem('token');
  let user = localStorage.getItem('user');
  let role = localStorage.getItem('role');

  // API helper
  async function call(endpoint, method = 'GET', body = null) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    };
    if (body) opts.body = JSON.stringify(body);
    
    const response = await fetch(API + '/api' + endpoint, opts);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Request failed');
    }
    
    return data;
  }

  // Show alert
  function showAlert(msg, type = 'error', containerId = 'loginAlert') {
    const alert = document.getElementById(containerId);
    alert.textContent = msg;
    alert.className = 'alert ' + type;
    alert.style.display = 'block';
    setTimeout(() => alert.style.display = 'none', 5000);
  }

  // Auth tab switching
  function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    
    if (tab === 'signin') {
      document.querySelectorAll('.auth-tab')[0].classList.add('active');
      document.getElementById('signinForm').classList.add('active');
    } else {
      document.querySelectorAll('.auth-tab')[1].classList.add('active');
      document.getElementById('signupForm').classList.add('active');
    }
  }

  // Login
  async function handleLogin() {
    const userId = document.getElementById('loginUserId').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!userId || !password) {
      showAlert('Please fill all fields', 'error', 'loginAlert');
      return;
    }
    
    try {
      const response = await fetch(API + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password })
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        showAlert(data.message || 'Login failed', 'error', 'loginAlert');
        return;
      }
      
      // Save credentials
      token = data.token;
      user = data.userId;
      role = data.role;
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', user);
      localStorage.setItem('role', role);
      
      // Show app
      document.getElementById('authContainer').style.display = 'none';
      document.getElementById('appContainer').style.display = 'block';
      
      initializeApp();
      
    } catch (error) {
      showAlert('Network error: ' + error.message, 'error', 'loginAlert');
    }
  }

  // Signup
  async function handleSignup() {
    const userId = document.getElementById('signupUserId').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    
    if (!userId || !email || !password) {
      showAlert('Please fill all fields', 'error', 'signupAlert');
      return;
    }
    
    try {
      const response = await fetch(API + '/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email, password })
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        showAlert(data.message || 'Signup failed', 'error', 'signupAlert');
        return;
      }
      
      // Save credentials
      token = data.token;
      user = data.userId;
      role = data.role;
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', user);
      localStorage.setItem('role', role);
      
      // Show app
      document.getElementById('authContainer').style.display = 'none';
      document.getElementById('appContainer').style.display = 'block';
      
      initializeApp();
      
    } catch (error) {
      showAlert('Network error: ' + error.message, 'error', 'signupAlert');
    }
  }

  // Logout
  function logout() {
    localStorage.clear();
    location.reload();
  }

  // Initialize app
  function initializeApp() {
    // Set user info
    document.getElementById('userName').textContent = user;
    document.getElementById('userRole').textContent = role;
    document.getElementById('userAvatar').textContent = user.charAt(0).toUpperCase();
    
    // Show admin menu if admin
    if (role === 'admin') {
      document.getElementById('usersMenuItem').style.display = 'flex';
    }
    
    // Load dashboard
    loadDashboard();
  }

  // Page switching
  function switchPage(page) {
    document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    
    document.getElementById(page).classList.add('active');
    event.target.closest('.menu-item').classList.add('active');
    
    if (page === 'dashboard') loadDashboard();
    if (page === 'jobs') loadJobs();
    if (page === 'users') loadUsers();
    if (page === 'logs') loadLogs();
  }

  // Load dashboard
  async function loadDashboard() {
    try {
      if (role === 'admin') {
        const res = await call('/stats/dashboard');
        document.getElementById('totalJobs').textContent = res.stats.totalJobs;
        document.getElementById('queuedJobs').textContent = res.stats.queuedJobs;
        document.getElementById('completedJobs').textContent = res.stats.completedJobs;
        document.getElementById('failedJobs').textContent = res.stats.failedJobs;
        
        const activityHtml = res.stats.recentActivity.length > 0
          ? '<table><tr><th>User</th><th>Action</th><th>Time</th></tr>' +
            res.stats.recentActivity.map(a => 
              \`<tr><td>\${a.userId}</td><td>\${a.action}</td><td>\${new Date(a.timestamp).toLocaleString()}</td></tr>\`
            ).join('') + '</table>'
          : '<div class="empty-state"><i class="fas fa-inbox"></i><p>No activity yet</p></div>';
        
        document.getElementById('recentActivity').innerHTML = activityHtml;
      } else {
        const jobs = await call('/scrape/jobs');
        document.getElementById('totalJobs').textContent = jobs.jobs.length;
        document.getElementById('queuedJobs').textContent = jobs.jobs.filter(j => j.status === 'queued').length;
        document.getElementById('completedJobs').textContent = jobs.jobs.filter(j => j.status === 'completed').length;
        document.getElementById('failedJobs').textContent = jobs.jobs.filter(j => j.status === 'failed').length;
        document.getElementById('recentActivity').innerHTML = '<div class="empty-state"><i class="fas fa-info-circle"></i><p>Activity logs available for admins</p></div>';
      }
    } catch (e) {
      console.error('Failed to load dashboard:', e);
    }
  }

  // Load jobs
  async function loadJobs() {
    try {
      const res = await call('/scrape/jobs');
      const html = res.jobs.length > 0
        ? '<table><tr><th>ID</th><th>Source</th><th>Status</th><th>Created</th></tr>' +
          res.jobs.map(j => {
            let badge = 'badge-info';
            if (j.status === 'completed') badge = 'badge-success';
            if (j.status === 'failed') badge = 'badge-error';
            if (j.status === 'queued') badge = 'badge-warning';
            return \`<tr><td>\${j.id}</td><td>\${j.source || 'N/A'}</td><td><span class="badge \${badge}">\${j.status}</span></td><td>\${new Date(j.createdAt).toLocaleString()}</td></tr>\`;
          }).join('') + '</table>'
        : '<div class="empty-state"><i class="fas fa-tasks"></i><p>No jobs yet</p></div>';
      
      document.getElementById('jobsList').innerHTML = html;
    } catch (e) {
      document.getElementById('jobsList').innerHTML = '<p style="color:#ef4444;">Failed to load jobs</p>';
    }
  }

  // Queue job
  async function queueJob() {
    const source = document.getElementById('jobSource').value.trim();
    const urls = document.getElementById('jobUrls').value.trim().split('\\n').filter(u => u);
    
    if (!source || urls.length === 0) {
      alert('Please provide source and URLs');
      return;
    }
    
    try {
      await call('/scrape/queue', 'POST', { source, urls });
      alert('Job queued successfully!');
      document.getElementById('jobSource').value = '';
      document.getElementById('jobUrls').value = '';
      loadJobs();
    } catch (e) {
      alert('Failed to queue job: ' + e.message);
    }
  }

  // Load users
  async function loadUsers() {
    try {
      const res = await call('/users');
      const html = '<table><tr><th>User ID</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr>' +
        res.users.map(u => 
          \`<tr><td>\${u.userId}</td><td>\${u.email}</td><td>\${u.role}</td><td><span class="badge badge-success">\${u.status}</span></td><td>\${u.userId !== user ? \`<button class="btn-danger" onclick="deleteUser('\${u.userId}')">Delete</button>\` : '-'}</td></tr>\`
        ).join('') + '</table>';
      
      document.getElementById('usersList').innerHTML = html;
    } catch (e) {
      document.getElementById('usersList').innerHTML = '<p style="color:#ef4444;">Failed to load users</p>';
    }
  }

  // Create user
  async function createUser() {
    const userId = document.getElementById('newUserId').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const userRole = document.getElementById('newUserRole').value;
    
    if (!userId || !email || !password) {
      alert('Please fill all fields');
      return;
    }
    
    try {
      await call('/auth/register', 'POST', { userId, email, password, role: userRole });
      alert('User created successfully!');
      document.getElementById('newUserId').value = '';
      document.getElementById('newUserEmail').value = '';
      document.getElementById('newUserPassword').value = '';
      loadUsers();
    } catch (e) {
      alert('Failed to create user: ' + e.message);
    }
  }

  // Delete user
  async function deleteUser(userId) {
    if (!confirm(\`Delete user \${userId}?\`)) return;
    
    try {
      await call(\`/users/\${userId}\`, 'DELETE');
      alert('User deleted');
      loadUsers();
    } catch (e) {
      alert('Failed to delete user: ' + e.message);
    }
  }

  // Load logs
  async function loadLogs() {
    try {
      const res = await call('/logs/activity');
      const html = res.logs.length > 0
        ? '<table><tr><th>User</th><th>Action</th><th>Time</th></tr>' +
          res.logs.slice(-50).reverse().map(l => 
            \`<tr><td>\${l.userId}</td><td>\${l.action}</td><td>\${new Date(l.timestamp).toLocaleString()}</td></tr>\`
          ).join('') + '</table>'
        : '<div class="empty-state"><i class="fas fa-history"></i><p>No activity logs</p></div>';
      
      document.getElementById('logsList').innerHTML = html;
    } catch (e) {
      document.getElementById('logsList').innerHTML = '<p style="color:#ef4444;">Failed to load logs</p>';
    }
  }

  // Initialize
  window.onload = () => {
    if (token && user && role) {
      document.getElementById('authContainer').style.display = 'none';
      document.getElementById('appContainer').style.display = 'block';
      initializeApp();
    }
    
    // Enter key handlers
    document.getElementById('loginPassword').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });
    document.getElementById('signupPassword').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSignup();
    });
  };
</script>

</body>
</html>`;

  return new Response(html, { status: 200, headers: { ...headers, 'Content-Type': 'text/html' } });
}
