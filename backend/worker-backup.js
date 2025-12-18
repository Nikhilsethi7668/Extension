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
        const uid = (userId || '').trim().toLowerCase();
        const user = users.find(u => u.userId.toLowerCase() === uid && u.password === password && u.status === 'active');
        if (!user) return res({ success: false, message: 'Invalid credentials' }, headers, 401);
        
        const t = jwt.sign({ userId: user.userId, role: user.role }, env.JWT_SECRET || JWT_SECRET, { expiresIn: '24h' });
        activityLogs.push({ userId: uid, action: 'login', timestamp: new Date().toISOString(), success: true });
        return res({ success: true, token: t, userId: user.userId, role: user.role, email: user.email }, headers);
      }

      if (path === '/api/auth/signup' && method === 'POST') {
        const { userId, email, password } = await request.json();
        const uid = (userId || '').trim().toLowerCase();
        if (!uid || !email || !password) return res({ success: false, message: 'Missing fields' }, headers, 400);
        if (users.find(u => u.userId.toLowerCase() === uid)) return res({ success: false, message: 'User exists' }, headers, 400);
        
        const newUser = { userId: uid, email, password, role: 'user', status: 'active', createdAt: new Date().toISOString() };
        activityLogs.push({ userId: newUser.userId, action: 'signup', timestamp: new Date().toISOString(), success: true });
        return res({ success: true, token: t, userId: newUser.userId, role: newUser.role, email: newUser.email }, headers);
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
            assignedTo: options?.assignedTo || null,
            options: options || {}
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

      // AI Smart Prep for Jobs: parses raw input/search to propose URLs & options
      if (path === '/api/ai/prepare-jobs' && method === 'POST') {
        if (!decoded) return res({ success: false, message: 'No token' }, headers, 401);
        const { source, mode, searchQuery, rawInputText, urls } = await request.json();
        const prompt = `You are assisting with vehicle scraping job preparation.\n` +
          `Source: ${source || 'unknown'}\nMode: ${mode || 'list'}\nSearchQuery: ${searchQuery || ''}\n` +
          `RawInput: ${rawInputText || ''}\nURLs: ${(urls || []).join(', ')}\n` +
          `Task: Return a JSON object with fields: { suggestions: [{ url, source, tags: string[] }], recommendedOptions: { priority: 'low|normal|high|urgent', aiNormalize: boolean, aiDescription: boolean, aiMarketEstimate: boolean, aiConditionScore: boolean } }. ` +
          `Ensure URLs are valid and deduplicated. Prefer up to 20 items.`;
        try {
          const ai = await geminiCall(prompt, env);
          let output = {};
          try { output = JSON.parse(ai.text || JSON.stringify(ai)); } catch (e) {
            output = { suggestions: [], recommendedOptions: { priority: 'normal', aiNormalize: true, aiDescription: true, aiMarketEstimate: true, aiConditionScore: false } };
          }
          activityLogs.push({ userId: decoded.userId, action: 'ai_prepare_jobs', timestamp: new Date().toISOString(), success: true, metadata: { count: output?.suggestions?.length || 0 } });
          return res({ success: true, ...output }, headers);
        } catch (e) {
          return res({ success: false, message: e.message }, headers, 500);
        }
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

async function geminiCall(prompt, env) {
  const GEMINI_KEY = env?.GEMINI_API_KEY;
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
  const part = data?.candidates?.[0]?.content?.parts?.[0];
  return part || { text: '' };
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
    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    body {
      font-family: 'Manrope', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: radial-gradient(circle at 20% 20%, rgba(102, 126, 234, 0.12), transparent 30%),
                  radial-gradient(circle at 80% 0%, rgba(118, 75, 162, 0.12), transparent 28%),
                  linear-gradient(180deg, #f7f9fb 0%, #eef1f7 100%);
      color: #1f2937;
      letter-spacing: -0.01em;
    }

    /* Login & Signup */
    .login-container {
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 2.5rem;
      align-items: stretch;
      justify-content: center;
      min-height: 100vh;
      padding: 4rem 5vw;
      position: relative;
    }
    .login-container::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 10% 20%, rgba(102, 126, 234, 0.12), transparent 30%),
                  radial-gradient(circle at 90% 10%, rgba(118, 75, 162, 0.12), transparent 25%);
      z-index: 0;
    }
    .auth-hero {
      position: relative;
      z-index: 1;
      background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #a855f7 100%);
      border-radius: 20px;
      padding: 2.75rem;
      color: white;
      box-shadow: 0 25px 60px rgba(99, 102, 241, 0.35);
      overflow: hidden;
    }
    .auth-hero::after {
      content: '';
      position: absolute;
      top: -40px;
      right: -60px;
      width: 260px;
      height: 260px;
      background: radial-gradient(circle, rgba(255,255,255,0.18), transparent 55%);
      filter: blur(2px);
    }
    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: white;
      padding: 0.55rem 0.85rem;
      border-radius: 999px;
      font-weight: 700;
      letter-spacing: 0.01em;
      margin-bottom: 1.25rem;
    }
    .auth-hero h1 {
      font-size: 2.4rem;
      margin-bottom: 0.75rem;
      letter-spacing: -0.02em;
    }
    .auth-hero p {
      color: rgba(255, 255, 255, 0.82);
      line-height: 1.65;
      margin-bottom: 1.75rem;
      max-width: 540px;
      font-size: 1.05rem;
    }
    .hero-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
      margin-bottom: 1.75rem;
    }
    .hero-stat {
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 1rem 1.2rem;
      border-radius: 12px;
      backdrop-filter: blur(4px);
    }
    .hero-stat strong {
      display: block;
      font-size: 1.6rem;
      margin-bottom: 0.35rem;
    }
    .hero-bullets {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.85rem;
      margin-top: 0.5rem;
    }
    .hero-bullets div {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.9);
    }
    .login-card {
      position: relative;
      z-index: 1;
      background: white;
      padding: 2.5rem;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
      width: 100%;
      max-width: 520px;
      border: 1px solid #eef1f7;
    }
    .login-logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }
    .login-logo .logo-icon {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%);
      display: grid;
      place-items: center;
      color: white;
      font-weight: 800;
      font-size: 1.2rem;
    }
    .login-logo h1 {
      font-size: 1.45rem;
      color: #111827;
      letter-spacing: -0.02em;
    }
    .auth-tabs {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      background: #f3f4f6;
      padding: 0.35rem;
      border-radius: 14px;
      gap: 0.35rem;
      margin-bottom: 1.5rem;
    }
    .auth-tab {
      border: none;
      background: transparent;
      padding: 0.85rem 1rem;
      border-radius: 12px;
      font-weight: 700;
      cursor: pointer;
      color: #6b7280;
      transition: all 0.25s ease;
    }
    .auth-tab.active {
      background: white;
      color: #111827;
      box-shadow: 0 8px 24px rgba(0,0,0,0.08);
    }
    .auth-subtitle {
      color: #6b7280;
      margin-bottom: 1rem;
    }
    .auth-alert {
      padding: 0.85rem 1rem;
      border-radius: 12px;
      background: #fef3c7;
      border: 1px solid #f59e0b;
      color: #92400e;
      margin-bottom: 1rem;
      display: none;
      font-weight: 700;
    }
    .auth-alert.show { display: block; }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .helper-text {
      color: #6b7280;
      font-size: 0.9rem;
      margin-top: 0.25rem;
    }
    .btn-login {
      width: 100%;
      padding: 1.05rem;
      background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #a855f7 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.3s;
      font-size: 1rem;
      letter-spacing: 0.01em;
      box-shadow: 0 16px 40px rgba(99, 102, 241, 0.25);
    }
    .btn-login:hover {
      transform: translateY(-2px);
      box-shadow: 0 18px 45px rgba(99, 102, 241, 0.32);
    }
    .login-hint {
      text-align: center;
      margin-top: 1.25rem;
      color: #6b7280;
      font-size: 0.95rem;
    }

    /* Main Layout */
    .app-wrapper {
      display: flex;
      height: 100vh;
      background: linear-gradient(180deg, #f7f9fb 0%, #f1f5f9 100%);
    }
    .sidebar {
      width: 310px;
      background: #111827;
      color: white;
      overflow-y: auto;
      padding-top: 2rem;
      box-shadow: 8px 0 24px rgba(0, 0, 0, 0.12);
      position: relative;
      z-index: 2;
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
      padding: 1rem 1.75rem;
      cursor: pointer;
      transition: all 0.25s;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.98rem;
      color: #e5e7eb;
    }
    .menu-item:hover {
      background: rgba(255, 255, 255, 0.06);
      border-left-color: #06b6d4;
      color: white;
    }
    .menu-item.active {
      background: linear-gradient(90deg, rgba(14, 165, 233, 0.18), rgba(99, 102, 241, 0.18));
      border-left-color: #22d3ee;
      color: white;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
    }
    .menu-item i {
      width: 22px;
    }

    /* Main Content */
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
      width: calc(100vw - 310px);
      max-width: none;
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
      padding: 2rem 2.5rem;
      width: 100%;
      max-width: none;
      margin: 0;
    }
    .page-content { display: none; }
    .page-content.active { display: block; }

    /* Cards & Components */
    .card {
      background: white;
      border-radius: 12px;
      padding: 2.5rem;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
      border: 1px solid #eef1f7;
      margin-bottom: 2rem;
    }
    .card h2 {
      font-size: 1.35rem;
      margin-bottom: 1.75rem;
      color: #2c3e50;
    }

    /* Grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 2rem;
      margin-bottom: 2.5rem;
    }
    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
      border-left: 4px solid #667eea;
    }
    .stat-label {
      color: #95a5a6;
      font-size: 1rem;
      margin-bottom: 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .stat-value {
      font-size: 2.75rem;
      font-weight: 800;
      color: #667eea;
    }

    /* Forms */
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
      margin-bottom: 1.75rem;
    }
    .form-row.full {
      grid-template-columns: 1fr;
    }
    .form-group {
      margin-bottom: 1.75rem;
    }
    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 600;
      color: #2c3e50;
    }
    .form-group input, .form-group textarea, .form-group select {
      width: 100%;
      padding: 1rem 1.1rem;
      border: 2px solid #e8eef5;
      border-radius: 10px;
      font-size: 1rem;
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
      padding: 1rem 1.85rem;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 700;
      transition: all 0.3s;
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 1rem;
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
      padding: 0.65rem 1.05rem;
      font-size: 0.9rem;
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
      padding: 1.15rem 1.25rem;
      text-align: left;
      font-weight: 700;
      color: #2c3e50;
      border-bottom: 2px solid #e8eef5;
    }
    td {
      padding: 1.05rem 1.25rem;
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

    @media (max-width: 1180px) {
      .login-container { grid-template-columns: 1fr; padding: 2.5rem 7vw; }
      .auth-hero { order: 2; }
      .login-card { order: 1; }
      .grid { grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); }
      .form-row { grid-template-columns: 1fr; }
      .sidebar { width: 260px; }
    }
    .debug-panel {
      position: fixed;
      bottom: 70px;
      right: 20px;
      background: rgba(0,0,0,0.95);
      color: #0f0;
      padding: 1rem;
      border-radius: 8px;
      max-width: 600px;
      max-height: 400px;
      overflow-y: auto;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      z-index: 9999;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      display: none;
      border: 2px solid #0f0;
    }
    .debug-panel.show { display: block !important; }
    .debug-panel pre { margin: 0; white-space: pre-wrap; }
    .debug-toggle {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #e74c3c;
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
      z-index: 10000;
      font-size: 11px;
      border: 2px solid white;
    }
    .debug-toggle:hover {
      background: #c0392b;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>
  <div class="debug-toggle" id="debugToggle">🐛 DEBUG</div>
  <div class="debug-panel" id="debugPanel"><pre id="debugLog">Debug Log:
</pre></div>
  <!-- Login Page -->
  <div id="loginPage">
    <div class="login-container">
        <div class="auth-hero">
          <div class="hero-badge"><i class="fas fa-wand-magic-sparkles"></i> AI-Powered Marketplace Control</div>
          <h1>AutoBridge Command Center</h1>
          <p>Manage scrapes, monitor activity, and unlock Gemini-powered intelligence in one modern workspace.</p>
          <div class="hero-stats">
            <div class="hero-stat"><strong>99.9%</strong><span>Uptime</span></div>
            <div class="hero-stat"><strong>15s</strong><span>Live refresh cadence</span></div>
            <div class="hero-stat"><strong>AI</strong><span>Gemini insights ready</span></div>
          </div>
          <div class="hero-bullets">
            <div><i class="fas fa-shield-halved"></i> JWT-secured roles</div>
            <div><i class="fas fa-bolt"></i> Serverless Cloudflare edge</div>
            <div><i class="fas fa-chart-bar"></i> Dashboard-grade visuals</div>
            <div><i class="fas fa-brain"></i> AI-ready workflows</div>
          </div>
        </div>

        <div class="login-card">
          <div class="login-logo">
            <div class="logo-icon">AB</div>
            <div>
              <h1>AutoBridge</h1>
              <div class="auth-subtitle">Secure access to scraping orchestration</div>
            </div>
          </div>

          <div class="auth-tabs">
            <button class="auth-tab active" id="tabLogin" onclick="switchAuthTab('login')">Sign In</button>
            <button class="auth-tab" id="tabSignup" onclick="switchAuthTab('signup')">Sign Up</button>
          </div>

          <div id="authAlert" class="auth-alert"></div>

          <div id="loginForm">
            <div class="form-grid">
              <div class="form-group">
                <label>User ID</label>
                <input type="text" id="loginUserId" placeholder="e.g. admin">
              </div>
              <div class="form-group">
                <label>Password</label>
                <input type="password" id="loginPassword" placeholder="Your password">
              </div>
            </div>
            <button class="btn-login" onclick="handleLogin()">Enter Workspace</button>
            <div class="login-hint">
              Demo accounts: admin/admin or demo/demo
            </div>
          </div>

          <div id="signupForm" style="display:none;">
            <div class="form-grid">
              <div class="form-group">
                <label>Full Name / Handle</label>
                <input type="text" id="signupUserId" placeholder="Choose a unique username">
              </div>
              <div class="form-group">
                <label>Email</label>
                <input type="email" id="signupEmail" placeholder="you@example.com">
              </div>
              <div class="form-group">
                <label>Password</label>
                <input type="password" id="signupPassword" placeholder="Create a password">
                <div class="helper-text">Accounts start with user access. Admins can elevate roles later.</div>
              </div>
              <div class="form-group">
                <label>Confirm Password</label>
                <input type="password" id="signupConfirm" placeholder="Re-enter password">
              </div>
            </div>
            <button class="btn-login" onclick="handleSignup()">Create Account</button>
            <div class="login-hint">Securely provisioned; JWT issued on success.</div>
          </div>
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
              <h2><i class="fas fa-chart-bar"></i> Job Metrics</h2>
              <div style="height: 300px;">
                <canvas id="jobsChartCanvas"></canvas>
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

              <div class="form-row full">
                <p class="helper-text">Paste vehicle listing URLs or use Smart Prep to generate URLs automatically from a search/query. Configure AI features to normalize data, generate descriptions, and estimate market value.</p>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Source</label>
                  <select id="jobSource">
                    <option value="autotrader">AutoTrader</option>
                    <option value="cars.com">Cars.com</option>
                    <option value="cargurus">CarGurus</option>
                    <option value="facebook">Facebook Marketplace</option>
                    <option value="other">Other</option>
                  </select>
                  <div class="helper-text">Select the primary platform for the links you provide.</div>
                </div>
                <div class="form-group">
                  <label>Scraping Mode</label>
                  <select id="jobMode" onchange="onModeChange()">
                    <option value="list">List of URLs</option>
                    <option value="discovery">Discovery by Search Query</option>
                    <option value="profile">Profile Scan</option>
                  </select>
                  <div class="helper-text">Choose how to define jobs: paste URLs directly, search-driven discovery, or profile-based scan.</div>
                </div>
                <div class="form-group">
                  <label>Assign To</label>
                  <input type="text" id="jobAssignTo" placeholder="Username (optional)">
                  <div class="helper-text">Route jobs to a specific user; leave blank for unassigned.</div>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group" id="urlsGroup">
                  <label>URLs</label>
                  <textarea id="jobUrls" placeholder="One per line&#10;https://www.autotrader.com/cars-for-sale/vehicledetails.xhtml?listingId=12345&#10;https://www.cars.com/vehicledetail/abc"></textarea>
                  <div class="helper-text">Provide full listing URLs. Duplicates will be removed.</div>
                </div>
                <div class="form-group" id="searchGroup" style="display:none;">
                  <label>Search Query</label>
                  <input type="text" id="jobSearchQuery" placeholder="e.g., Honda Civic 2018 low mileage">
                  <div class="helper-text">AI will generate likely listing URLs for this query on the selected source.</div>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Priority</label>
                  <select id="jobPriority">
                    <option value="normal" selected>Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Schedule (Optional)</label>
                  <input type="datetime-local" id="jobScheduleAt">
                  <div class="helper-text">Set a scheduled time to start scraping; otherwise starts immediately.</div>
                </div>
                <div class="form-group">
                  <label>Tags</label>
                  <input type="text" id="jobTags" placeholder="Comma-separated (e.g., civic, 2018, low-mileage)">
                </div>
              </div>

              <div class="form-row full">
                <div class="form-group">
                  <label>AI Options</label>
                  <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .75rem;">
                    <label><input type="checkbox" id="optNormalize" checked> Normalize vehicle data</label>
                    <label><input type="checkbox" id="optDescription" checked> Generate listing description</label>
                    <label><input type="checkbox" id="optMarket" checked> Estimate market price</label>
                    <label><input type="checkbox" id="optCondition"> Condition score images</label>
                  </div>
                  <div class="helper-text">Gemini will assist with data cleaning, descriptions, valuation, and optional image condition scoring.</div>
                </div>
              </div>

              <div class="form-row">
                <button class="btn btn-secondary" onclick="smartPrep()"><i class="fas fa-wand-magic-sparkles"></i> AI Prepare URLs</button>
                <button class="btn btn-primary" onclick="queueJobs()"><i class="fas fa-check"></i> Queue Jobs</button>
              </div>

              <div class="card" style="margin-top:1rem;">
                <h2><i class="fas fa-lightbulb"></i> AI Suggestions</h2>
                <div class="table-responsive">
                  <table>
                    <thead>
                      <tr><th>URL</th><th>Source</th><th>Tags</th></tr>
                    </thead>
                    <tbody id="prepSuggestions">
                      <tr><td colspan="3" style="text-align:center; color:#95a5a6;">Run AI Prepare to see suggested URLs</td></tr>
                    </tbody>
                  </table>
                </div>
                <div class="form-row full">
                  <button class="btn btn-secondary" onclick="applyPrepSuggestions()"><i class="fas fa-arrow-down"></i> Apply Suggestions to URLs</button>
                </div>
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
    const API = (typeof location !== 'undefined' ? location.origin : 'https://autobridge-backend.dchatpar.workers.dev') + '/api';
    let token = localStorage.getItem('token');
    let user = localStorage.getItem('user');
    let role = localStorage.getItem('role');
    let debugLogs = [];

    function debugLog(msg, data) {
      const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
      const log = '[' + timestamp + '] ' + msg;
      console.log(log, data || '');
      debugLogs.push(log + (data ? '\\n' + JSON.stringify(data, null, 2) : ''));
      const el = document.getElementById('debugLog');
      if (el) el.textContent = 'Debug Log:\\n' + debugLogs.slice(-20).join('\\n\\n');
    }

    function toggleDebug() {
      const panel = document.getElementById('debugPanel');
      panel.classList.toggle('show');
    }

    function showAlert(msg, type = 'error') {
      debugLog('showAlert: ' + type, msg);
      const alertBox = document.getElementById('alertBox');
      alertBox.innerHTML = \`<div class="alert alert-\${type} show">\${msg}</div>\`;
      setTimeout(() => alertBox.innerHTML = '', 4000);
    }

    function showAuthAlert(msg, type = 'warn') {
      debugLog('showAuthAlert: ' + type, msg);
      const box = document.getElementById('authAlert');
      if (!box) return;
      box.textContent = msg;
      box.classList.add('show');
      box.style.background = type === 'success' ? '#dcfce7' : '#fef3c7';
      box.style.borderColor = type === 'success' ? '#16a34a' : '#f59e0b';
      box.style.color = type === 'success' ? '#166534' : '#92400e';
      setTimeout(() => box.classList.remove('show'), 4000);
    }

    async function call(endpoint, method = 'GET', body = null) {
      debugLog('API Call: ' + method + ' ' + endpoint, body);
      const url = API + endpoint;
      debugLog('Full URL', url);
      const opts = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': \`Bearer \${token}\` })
        },
        ...(body && { body: JSON.stringify(body) })
      };
      debugLog('Request opts', opts);
      let res, data;
      try {
        res = await fetch(url, opts);
        debugLog('Response status: ' + res.status, { ok: res.ok, statusText: res.statusText });
      } catch (networkErr) {
        debugLog('Network error', networkErr.message);
        throw new Error('Network error: unable to reach API');
      }
      try { 
        const text = await res.text();
        debugLog('Response text', text);
        data = JSON.parse(text); 
        debugLog('Parsed response', data);
      } catch (parseErr) { 
        debugLog('Parse error', parseErr.message);
        throw new Error('Invalid response from API'); 
      }
      if (!res.ok) {
        debugLog('API Error', data);
        throw new Error(data.message || 'API Error');
      }
      return data;
    }

    function switchAuthTab(mode) {
      const isLogin = mode === 'login';
      document.getElementById('loginForm').style.display = isLogin ? 'block' : 'none';
      document.getElementById('signupForm').style.display = isLogin ? 'none' : 'block';
      document.getElementById('tabLogin').classList.toggle('active', isLogin);
      document.getElementById('tabSignup').classList.toggle('active', !isLogin);
      document.getElementById('authAlert')?.classList.remove('show');
    }

    async function handleSignup() {
      const userId = document.getElementById('signupUserId').value.trim();
      const email = document.getElementById('signupEmail').value.trim();
      const password = document.getElementById('signupPassword').value;
      const confirm = document.getElementById('signupConfirm').value;

      if (!userId || !email || !password) { showAuthAlert('All fields are required'); return; }
      if (password !== confirm) { showAuthAlert('Passwords do not match'); return; }

      try {
        const res = await call('/auth/signup', 'POST', { userId, email, password });
        if (!res.success || !res.token) throw new Error('Invalid response from server');
        token = res.token;
        user = res.userId;
        role = res.role;
        localStorage.setItem('token', token);
        localStorage.setItem('user', user);
        localStorage.setItem('role', role);
        showAuthAlert('Account created! Redirecting...', 'success');
        setTimeout(() => initializeApp(), 800);
      } catch (e) {
        showAuthAlert('Signup failed: ' + e.message);
      }
    }

    async function handleLogin() {
      debugLog('=== LOGIN ATTEMPT ===');
      const userId = (document.getElementById('loginUserId').value || '').trim();
      const password = (document.getElementById('loginPassword').value || '').trim();
      debugLog('Credentials', { userId, passwordLength: password.length });
      if (!userId || !password) { 
        showAuthAlert('Please enter username and password'); 
        return; 
      }
      const btns = document.querySelectorAll('.btn-login');
      btns.forEach(b => { b.disabled = true; b.style.opacity = 0.7; });
      try {
        debugLog('Calling login API...');
        const res = await call('/auth/login', 'POST', { userId, password });
        debugLog('Login response received', res);
        if (!res.success || !res.token) {
          debugLog('Invalid response structure', res);
          throw new Error('Invalid response from server');
        }
        token = res.token;
        user = res.userId;
        role = res.role;
        debugLog('Saving to localStorage', { user, role, tokenLength: token.length });
        localStorage.setItem('token', token);
        localStorage.setItem('user', user);
        localStorage.setItem('role', role);
        debugLog('Initializing app...');
        initializeApp();
      } catch (e) {
        debugLog('Login error', { message: e.message, stack: e.stack });
        showAuthAlert('Login failed: ' + e.message);
      }
      finally {
        btns.forEach(b => { b.disabled = false; b.style.opacity = 1; });
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
          renderJobsChart(stats.stats);
        }
      } catch (e) { }
    }

    function renderJobsChart(s) {
      const el = document.getElementById('jobsChartCanvas');
      if (!el || !window.Chart) return;
      const ctx = el.getContext('2d');
      // Destroy previous chart if present
      if (el._chartInstance) { el._chartInstance.destroy(); }
      const data = {
        labels: ['Total', 'Queued', 'Ready'],
        datasets: [{
          label: 'Jobs',
          data: [s.totalJobs || 0, s.queuedJobs || 0, s.readyJobs || 0],
          backgroundColor: ['#6366f1', '#0ea5e9', '#22c55e'],
          borderRadius: 6,
        }]
      };
      const options = {
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#eef1f7' } },
          x: { grid: { display: false } }
        }
      };
      el._chartInstance = new Chart(ctx, { type: 'bar', data, options });
    }

    async function queueJobs() {
      const urls = document.getElementById('jobUrls').value.trim().split('\n').map(u => u.trim()).filter(u => u);
      const mode = document.getElementById('jobMode')?.value || 'list';
      const searchQuery = document.getElementById('jobSearchQuery')?.value || '';
      if (mode === 'list' && !urls.length) { showAlert('Please enter at least one URL'); return; }
      try {
        await call('/scrape/queue', 'POST', {
          urls,
          source: document.getElementById('jobSource').value || 'unknown',
          options: {
            assignedTo: document.getElementById('jobAssignTo').value || null,
            mode,
            searchQuery,
            priority: document.getElementById('jobPriority').value || 'normal',
            scheduleAt: document.getElementById('jobScheduleAt').value || null,
            tags: (document.getElementById('jobTags').value || '').split(',').map(x => x.trim()).filter(Boolean),
            aiNormalize: document.getElementById('optNormalize').checked,
            aiDescription: document.getElementById('optDescription').checked,
            aiMarketEstimate: document.getElementById('optMarket').checked,
            aiConditionScore: document.getElementById('optCondition').checked
          }
        });
        showAlert('Jobs queued successfully!', 'success');
        document.getElementById('jobUrls').value = '';
        loadJobsList();
      } catch (e) {
        showAlert('Queue failed: ' + e.message);
      }
    }

    function onModeChange() {
      const mode = document.getElementById('jobMode').value;
      document.getElementById('urlsGroup').style.display = mode === 'list' ? 'block' : 'none';
      document.getElementById('searchGroup').style.display = mode !== 'list' ? 'block' : 'none';
    }

    async function smartPrep() {
      try {
        const payload = {
          source: document.getElementById('jobSource').value,
          mode: document.getElementById('jobMode').value,
          searchQuery: document.getElementById('jobSearchQuery').value,
          rawInputText: document.getElementById('jobUrls').value,
          urls: document.getElementById('jobUrls').value.trim().split('\n').map(u => u.trim()).filter(Boolean)
        };
        const res = await call('/ai/prepare-jobs', 'POST', payload);
        const suggestions = (res.suggestions || []).slice(0, 50);
        const html = suggestions.length ? suggestions.map(s => \`
          <tr>
            <td><a href="\${s.url}" target="_blank">\${s.url}</a></td>
            <td>\${s.source || '-'} </td>
            <td>\${(s.tags || []).join(', ')} </td>
          </tr>
        \`).join('') : '<tr><td colspan="3" style="text-align:center;">No suggestions</td></tr>';
        document.getElementById('prepSuggestions').innerHTML = html;
        // apply recommended options to checkboxes and priority
        const ro = res.recommendedOptions || {};
        if (ro.priority) document.getElementById('jobPriority').value = ro.priority;
        if (typeof ro.aiNormalize !== 'undefined') document.getElementById('optNormalize').checked = !!ro.aiNormalize;
        if (typeof ro.aiDescription !== 'undefined') document.getElementById('optDescription').checked = !!ro.aiDescription;
        if (typeof ro.aiMarketEstimate !== 'undefined') document.getElementById('optMarket').checked = !!ro.aiMarketEstimate;
        if (typeof ro.aiConditionScore !== 'undefined') document.getElementById('optCondition').checked = !!ro.aiConditionScore;
      } catch (e) {
        showAlert('Smart Prep failed: ' + e.message);
      }
    }

    function applyPrepSuggestions() {
      const rows = Array.from(document.querySelectorAll('#prepSuggestions tr'));
      const urls = rows.map(r => r.querySelector('td a')?.getAttribute('href')).filter(Boolean);
      if (!urls.length) { showAlert('No suggestions to apply'); return; }
      document.getElementById('jobUrls').value = urls.join('\n');
      showAlert('Applied AI suggestions to URLs', 'success');
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
      debugLog('=== PAGE LOADED ===');
      debugLog('Current API base', API);
      debugLog('localStorage', { token: !!token, user, role });
      
      // Attach debug toggle handler
      const debugBtn = document.getElementById('debugToggle');
      if (debugBtn) {
        debugBtn.addEventListener('click', function() {
          debugLog('Debug toggle clicked');
          toggleDebug();
        });
        debugLog('Debug button attached');
      }
      
      if (token && user && role) {
        debugLog('Found existing session, initializing app');
        initializeApp();
      } else {
        debugLog('No existing session, showing login page');
      }
      // Enter to login convenience
      const pw = document.getElementById('loginPassword');
      if (pw) pw.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') handleLogin(); });
    };
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }
  });
}
