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
          activityLogs.push({ userId: decoded.userId, action: 'ai_prepare_jobs', timestamp: new Date().toISOString(), success: true });
          return res({ success: true, analysis: aiResult.text }, headers);
        } catch (e) {
          return res({ success: false, message: 'AI analysis failed: ' + e.message }, headers, 500);
        }
      }

      // AI VEHICLE ANALYSIS
      if (path === '/api/ai/analyze-vehicle' && method === 'POST') {
        if (!decoded) return res({ success: false, message: 'Auth required' }, headers, 401);
        const { vehicleData } = await request.json();
        
        try {
          const prompt = `Analyze this vehicle for market insights and recommendations:

Vehicle Details:
${JSON.stringify(vehicleData, null, 2)}

Provide a comprehensive analysis including:
1. Estimated market value range
2. Demand level (high/medium/low) with reasoning
3. Expected time to sell
4. Key selling points to highlight
5. Potential concerns or issues
6. Pricing strategy recommendation
7. Target buyer profile

Format your response as structured JSON with these exact fields: marketValue, demandLevel, timeToSell, sellingPoints (array), concerns (array), pricingStrategy, targetBuyer.`;
          
          const aiResult = await geminiCall(prompt, env);
          activityLogs.push({ userId: decoded.userId, action: 'ai_analyze_vehicle', timestamp: new Date().toISOString(), success: true });
          return res({ success: true, analysis: aiResult.text }, headers);
        } catch (e) {
          return res({ success: false, message: 'AI analysis failed: ' + e.message }, headers, 500);
        }
      }

      // AI GENERATE DESCRIPTION
      if (path === '/api/ai/generate-description' && method === 'POST') {
        if (!decoded) return res({ success: false, message: 'Auth required' }, headers, 401);
        const { vehicleData, style } = await request.json();
        
        const stylePrompts = {
          professional: "Create a professional, detailed listing description",
          casual: "Create a friendly, conversational listing description",
          luxury: "Create an upscale, premium listing description emphasizing exclusivity",
          budget: "Create an approachable, value-focused listing description"
        };
        
        try {
          const prompt = `${stylePrompts[style] || stylePrompts.professional} for this vehicle:

${JSON.stringify(vehicleData, null, 2)}

Requirements:
- 300-500 characters optimal for Facebook Marketplace
- Highlight key features and condition
- Include call-to-action
- Natural, engaging tone
- NO excessive capitalization or emojis
- Focus on facts and benefits

Return ONLY the description text, no JSON wrapper.`;
          
          const aiResult = await geminiCall(prompt, env);
          activityLogs.push({ userId: decoded.userId, action: 'ai_generate_description', timestamp: new Date().toISOString(), success: true });
          return res({ success: true, description: aiResult.text }, headers);
        } catch (e) {
          return res({ success: false, message: 'AI failed: ' + e.message }, headers, 500);
        }
      }

      // AI IMAGE ANALYSIS
      if (path === '/api/ai/analyze-image' && method === 'POST') {
        if (!decoded) return res({ success: false, message: 'Auth required' }, headers, 401);
        const { imageUrl, imageData } = await request.json();
        
        try {
          const prompt = `Analyze this vehicle image and provide detailed recommendations:

Image URL: ${imageUrl || 'base64 data provided'}

Provide analysis for:
1. Image quality score (1-10)
2. Lighting assessment (poor/fair/good/excellent)
3. Angle effectiveness (poor/fair/good/excellent)
4. Background cleanliness (cluttered/acceptable/clean)
5. Key improvements needed (array)
6. Suggested enhancements (cropping, brightness, contrast adjustments)
7. Missing angles/shots recommended

Format as JSON with fields: qualityScore, lighting, angle, background, improvements, enhancements, missingSshots.`;
          
          const aiResult = await geminiCall(prompt, env);
          activityLogs.push({ userId: decoded.userId, action: 'ai_analyze_image', timestamp: new Date().toISOString(), success: true });
          return res({ success: true, analysis: aiResult.text }, headers);
        } catch (e) {
          return res({ success: false, message: 'AI failed: ' + e.message }, headers, 500);
        }
      }

      // AI CONDITION SCORE
      if (path === '/api/ai/condition-score' && method === 'POST') {
        if (!decoded) return res({ success: false, message: 'Auth required' }, headers, 401);
        const { vehicleData, images, description } = await request.json();
        
        try {
          const prompt = `Score the overall condition of this vehicle on a scale of 1-10:

Vehicle: ${JSON.stringify(vehicleData, null, 2)}
Images analyzed: ${images?.length || 0} photos
Description: ${description || 'Not provided'}

Provide:
1. Overall condition score (1-10)
2. Exterior condition (1-10)
3. Interior condition (1-10)
4. Mechanical condition estimate (1-10)
5. Detailed reasoning for each score
6. Red flags or concerns
7. Confidence level in assessment

Format as JSON: { overallScore, exteriorScore, interiorScore, mechanicalScore, reasoning, redFlags, confidence }.`;
          
          const aiResult = await geminiCall(prompt, env);
          activityLogs.push({ userId: decoded.userId, action: 'ai_condition_score', timestamp: new Date().toISOString(), success: true });
          return res({ success: true, scoring: aiResult.text }, headers);
        } catch (e) {
          return res({ success: false, message: 'AI failed: ' + e.message }, headers, 500);
        }
      }

      // AI MARKET COMPARISON
      if (path === '/api/ai/market-comparison' && method === 'POST') {
        if (!decoded) return res({ success: false, message: 'Auth required' }, headers, 401);
        const { vehicleData, comparables } = await request.json();
        
        try {
          const prompt = `Compare this vehicle against market comparables:

Target Vehicle:
${JSON.stringify(vehicleData, null, 2)}

Comparable Listings:
${JSON.stringify(comparables, null, 2)}

Provide:
1. Competitive position (underpriced/fair/overpriced)
2. Key differentiators (better/worse features)
3. Recommended price adjustment
4. Competitive advantages
5. Competitive disadvantages
6. Market positioning strategy

Format as JSON with appropriate fields.`;
          
          const aiResult = await geminiCall(prompt, env);
          activityLogs.push({ userId: decoded.userId, action: 'ai_market_comparison', timestamp: new Date().toISOString(), success: true });
          return res({ success: true, comparison: aiResult.text }, headers);
        } catch (e) {
          return res({ success: false, message: 'AI failed: ' + e.message }, headers, 500);
        }
      }

      // AI TITLE OPTIMIZER
      if (path === '/api/ai/optimize-title' && method === 'POST') {
        if (!decoded) return res({ success: false, message: 'Auth required' }, headers, 401);
        const { vehicleData, currentTitle } = await request.json();
        
        try {
          const prompt = `Optimize this vehicle listing title for maximum visibility:

Current Title: ${currentTitle || 'Not set'}
Vehicle: ${JSON.stringify(vehicleData, null, 2)}

Create 5 optimized title variations that:
- Are 50-80 characters
- Include year, make, model
- Highlight key features (mileage, condition, special features)
- Use searchable keywords
- Are compelling but not clickbait

Return as JSON array: { titles: ["title1", "title2", ...], reasoning: "why these work" }`;
          
          const aiResult = await geminiCall(prompt, env);
          activityLogs.push({ userId: decoded.userId, action: 'ai_optimize_title', timestamp: new Date().toISOString(), success: true });
          return res({ success: true, suggestions: aiResult.text }, headers);
        } catch (e) {
          return res({ success: false, message: 'AI failed: ' + e.message }, headers, 500);
        }
      }

      // AI BATCH ENHANCE
      if (path === '/api/ai/batch-enhance' && method === 'POST') {
        if (!decoded) return res({ success: false, message: 'Auth required' }, headers, 401);
        const { vehicles } = await request.json();
        
        if (!vehicles || vehicles.length === 0) {
          return res({ success: false, message: 'No vehicles provided' }, headers, 400);
        }
        
        try {
          const prompt = `Batch process these ${vehicles.length} vehicles for optimal marketplace listings:

${JSON.stringify(vehicles, null, 2)}

For each vehicle, provide:
1. Optimized title
2. Compelling description (300-400 chars)
3. Suggested price adjustment if needed
4. Priority level for posting (high/medium/low)

Return as JSON array matching input order with enhanced data.`;
          
          const aiResult = await geminiCall(prompt, env);
          activityLogs.push({ userId: decoded.userId, action: 'ai_batch_enhance', timestamp: new Date().toISOString(), metadata: { count: vehicles.length } });
          return res({ success: true, enhanced: aiResult.text }, headers);
        } catch (e) {
          return res({ success: false, message: 'AI failed: ' + e.message }, headers, 500);
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
  
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('Gemini API error: ' + response.status + ' - ' + errorText);
  }
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
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  
  <!-- BEST-IN-CLASS Third Party Libraries -->
  <!-- Charts & Visualizations -->
  <script src="https://cdn.jsdelivr.net/npm/apexcharts@3.45.1"></script>
  
  <!-- Notifications & Alerts -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css">
  <script src="https://cdn.jsdelivr.net/npm/toastify-js"></script>
  
  <!-- Data Tables -->
  <link rel="stylesheet" href="https://cdn.datatables.net/1.13.7/css/jquery.dataTables.min.css">
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
  <script src="https://cdn.datatables.net/1.13.7/js/jquery.dataTables.min.js"></script>
  <script src="https://cdn.datatables.net/buttons/2.4.2/js/dataTables.buttons.min.js"></script>
  <script src="https://cdn.datatables.net/buttons/2.4.2/js/buttons.html5.min.js"></script>
  
  <!-- Date Picker -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
  <script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
  
  <!-- Advanced Selects -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/choices.js/public/assets/styles/choices.min.css">
  <script src="https://cdn.jsdelivr.net/npm/choices.js/public/assets/scripts/choices.min.js"></script>
  
  <!-- Drag & Drop -->
  <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.1/Sortable.min.js"></script>
  
  <!-- Utilities -->
  <script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/moment@2.29.4/moment.min.js"></script>
  
  <!-- Sweet Alert for beautiful modals -->
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  
  <!-- Animate.css for animations -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css">
  
  <!-- Progress Bar -->
  <script src="https://cdn.jsdelivr.net/npm/progressbar.js@1.1.0/dist/progressbar.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    :root {
      --primary: #6366f1;
      --primary-dark: #4f46e5;
      --secondary: #ec4899;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --dark: #0f172a;
      --gray-50: #f8fafc;
      --gray-100: #f1f5f9;
      --gray-200: #e2e8f0;
      --gray-300: #cbd5e1;
      --gray-400: #94a3b8;
      --gray-500: #64748b;
      --gray-600: #475569;
      --gray-700: #334155;
      --gray-800: #1e293b;
      --gray-900: #0f172a;
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
      --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    }
    
    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--gray-50);
      color: var(--gray-900);
      min-height: 100vh;
      line-height: 1.6;
    }

    /* Modern Scrollbar */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: var(--gray-100); }
    ::-webkit-scrollbar-thumb { background: var(--gray-400); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--gray-500); }

    /* Auth Container - Modern Design */
    #authContainer {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
      background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
    }

    .auth-card {
      background: white;
      border-radius: 24px;
      box-shadow: var(--shadow-2xl);
      width: 100%;
      max-width: 480px;
      overflow: hidden;
      animation: slideUp 0.5s ease;
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(40px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .auth-hero {
      background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
      color: white;
      padding: 48px 32px;
      text-align: center;
    }

    .auth-hero h1 {
      font-size: 36px;
      font-weight: 800;
      margin-bottom: 12px;
      letter-spacing: -0.02em;
    }

    .auth-hero p {
      font-size: 16px;
      opacity: 0.95;
      font-weight: 400;
    }

    .auth-tabs {
      display: flex;
      border-bottom: 2px solid var(--gray-200);
      background: var(--gray-50);
    }

    .auth-tab {
      flex: 1;
      padding: 20px;
      text-align: center;
      cursor: pointer;
      font-weight: 600;
      color: var(--gray-600);
      transition: all 0.3s;
      border-bottom: 3px solid transparent;
      font-size: 15px;
    }

    .auth-tab.active {
      color: var(--primary);
      border-bottom-color: var(--primary);
      background: white;
    }

    .auth-form {
      padding: 40px 32px;
      display: none;
    }

    .auth-form.active {
      display: block;
      animation: fadeIn 0.3s;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .form-group {
      margin-bottom: 24px;
    }

    .form-group label {
      display: block;
      margin-bottom: 10px;
      font-weight: 600;
      color: var(--gray-700);
      font-size: 14px;
    }

    .form-group input, .form-group select, .form-group textarea {
      width: 100%;
      padding: 14px 16px;
      border: 2px solid var(--gray-200);
      border-radius: 12px;
      font-size: 15px;
      font-family: 'Inter', sans-serif;
      transition: all 0.3s;
      background: white;
    }

    .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
    }

    .btn {
      width: 100%;
      padding: 16px 24px;
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      font-family: 'Inter', sans-serif;
      box-shadow: var(--shadow-md);
    }

    .btn:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-lg);
    }

    .btn:active {
      transform: translateY(0);
    }

    .btn-primary {
      background: var(--primary);
      padding: 10px 20px;
      border-radius: 8px;
      display: inline-block;
    }

    .btn-primary:hover {
      background: var(--primary-dark);
    }

    .alert {
      padding: 16px 20px;
      border-radius: 12px;
      margin-bottom: 20px;
      font-size: 14px;
      font-weight: 500;
      display: none;
    }

    .alert.error {
      background: #fef2f2;
      color: var(--danger);
      border: 1px solid #fecaca;
    }

    .alert.success {
      background: #f0fdf4;
      color: var(--success);
      border: 1px solid #bbf7d0;
    }

    /* Modern App Layout */
    #appContainer {
      display: none;
      min-height: 100vh;
      background: var(--gray-50);
    }

    .app-grid {
      display: grid;
      grid-template-columns: 280px 1fr;
      min-height: 100vh;
    }

    /* Modern Sidebar */
    .sidebar {
      background: white;
      border-right: 1px solid var(--gray-200);
      padding: 24px 0;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
    }

    .sidebar-header {
      padding: 0 24px 24px;
      border-bottom: 1px solid var(--gray-200);
    }

    .sidebar-header h2 {
      font-size: 24px;
      font-weight: 800;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 4px;
    }

    .sidebar-header p {
      font-size: 13px;
      color: var(--gray-500);
      font-weight: 500;
    }

    .sidebar-menu {
      list-style: none;
      padding: 16px 12px;
    }

    .menu-item {
      padding: 12px 16px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 600;
      border-radius: 10px;
      margin-bottom: 4px;
      color: var(--gray-700);
      font-size: 14px;
    }

    .menu-item:hover {
      background: var(--gray-100);
      color: var(--primary);
    }

    .menu-item.active {
      background: linear-gradient(135deg, var(--primary), var(--primary-dark));
      color: white;
      box-shadow: var(--shadow-md);
    }

    .menu-item i {
      width: 20px;
      text-align: center;
      font-size: 16px;
    }

    .sidebar-footer {
      padding: 20px 24px;
      border-top: 1px solid var(--gray-200);
      margin-top: auto;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding: 12px;
      background: var(--gray-50);
      border-radius: 12px;
    }

    .user-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 18px;
      color: white;
      box-shadow: var(--shadow-md);
    }

    .user-details {
      flex: 1;
    }

    .user-details .name {
      font-weight: 700;
      font-size: 14px;
      color: var(--gray-900);
    }

    .user-details .role {
      font-size: 12px;
      color: var(--gray-500);
      text-transform: capitalize;
    }

    .logout-btn {
      width: 100%;
      padding: 12px;
      background: var(--gray-100);
      border: 1px solid var(--gray-200);
      color: var(--gray-700);
      border-radius: 10px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
      font-size: 14px;
    }

    .logout-btn:hover {
      background: var(--gray-200);
      color: var(--danger);
    }

    /* Main Content Area */
    .main-content {
      background: var(--gray-50);
      padding: 32px;
      overflow-y: auto;
      max-height: 100vh;
    }

    .page-content {
      display: none;
    }

    .page-content.active {
      display: block;
      animation: fadeIn 0.4s;
    }

    .page-header {
      margin-bottom: 32px;
    }

    .page-header h1 {
      font-size: 32px;
      font-weight: 800;
      color: var(--gray-900);
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }

    .page-header p {
      color: var(--gray-600);
      font-size: 16px;
      font-weight: 500;
    }

    .card {
      background: white;
      border-radius: 16px;
      padding: 28px;
      box-shadow: var(--shadow);
      margin-bottom: 24px;
      border: 1px solid var(--gray-200);
    }

    .card h2 {
      font-size: 20px;
      font-weight: 700;
      color: var(--gray-900);
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .card h2 i {
      color: var(--primary);
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 20px;
      margin-bottom: 32px;
    }

    .stat-card {
      background: white;
      border-radius: 16px;
      padding: 24px;
      box-shadow: var(--shadow);
      border: 1px solid var(--gray-200);
      transition: all 0.3s;
    }

    .stat-card:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-lg);
    }

    .stat-label {
      font-size: 14px;
      font-weight: 600;
      color: var(--gray-600);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .stat-value {
      font-size: 36px;
      font-weight: 800;
      color: var(--gray-900);
      line-height: 1;
    }

    .stat-change {
      font-size: 14px;
      font-weight: 600;
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .stat-change.positive {
      color: var(--success);
    }

    .stat-change.negative {
      color: var(--danger);
    }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .badge-success {
      background: #d1fae5;
      color: #065f46;
    }

    .badge-warning {
      background: #fed7aa;
      color: #92400e;
    }

    .badge-error, .badge-danger {
      background: #fecaca;
      color: #991b1b;
    }

    .badge-info {
      background: #dbeafe;
      color: #1e40af;
    }

    .badge-primary {
      background: #e0e7ff;
      color: #3730a3;
    }

    /* Tables - Modern Style */
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 14px;
    }

    table thead {
      background: var(--gray-50);
    }

    table th {
      padding: 14px 16px;
      text-align: left;
      font-weight: 700;
      color: var(--gray-700);
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 2px solid var(--gray-200);
    }

    table td {
      padding: 14px 16px;
      border-bottom: 1px solid var(--gray-200);
      color: var(--gray-700);
    }

    table tbody tr {
      transition: all 0.2s;
    }

    table tbody tr:hover {
      background: var(--gray-50);
    }

    .btn-danger {
      background: var(--danger);
      padding: 8px 16px;
      border-radius: 8px;
      color: white;
      border: none;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
      font-size: 13px;
    }

    .btn-danger:hover {
      background: #dc2626;
      transform: translateY(-2px);
    }

    .empty-state {
      text-align: center;
      padding: 80px 20px;
      color: var(--gray-400);
    }

    .empty-state i {
      font-size: 72px;
      margin-bottom: 24px;
      opacity: 0.3;
    }

    .empty-state p {
      font-size: 18px;
      font-weight: 600;
      color: var(--gray-600);
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
      background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
      color: white;
      padding: 30px 0;
      box-shadow: 4px 0 24px rgba(0,0,0,0.12);
      position: relative;
      z-index: 10;
    }
    
    .sidebar::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 200px;
      background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
      opacity: 0.1;
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
      margin: 4px 12px;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 500;
      border-radius: 12px;
      position: relative;
      overflow: hidden;
    }

    .menu-item::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: var(--primary);
      transform: scaleY(0);
      transition: transform 0.3s;
    }

    .menu-item:hover {
      background: rgba(99, 102, 241, 0.1);
      transform: translateX(4px);
    }

    .menu-item:hover::before {
      transform: scaleY(1);
    }

    .menu-item.active {
      background: linear-gradient(90deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2));
      box-shadow: 0 0 20px rgba(99, 102, 241, 0.3);
    }
    
    .menu-item.active::before {
      transform: scaleY(1);
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

    /* Advanced Data Table Styles */
    .data-table-container {
      margin-top: 20px;
      overflow-x: auto;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .data-table thead {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .data-table th {
      padding: 16px;
      text-align: left;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      user-select: none;
    }

    .data-table th:hover {
      background: rgba(255,255,255,0.1);
    }

    .data-table th i {
      margin-left: 8px;
      font-size: 12px;
    }

    .data-table td {
      padding: 14px 16px;
      border-bottom: 1px solid #f0f0f0;
    }

    .data-table tbody tr:hover {
      background: #f8f9ff;
    }

    /* Filter Controls */
    .filter-bar {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
      flex-wrap: wrap;
      align-items: center;
    }

    .filter-input {
      padding: 10px 16px;
      border: 2px solid #e0e6ed;
      border-radius: 8px;
      font-size: 14px;
      flex: 1;
      min-width: 200px;
    }

    .filter-select {
      padding: 10px 16px;
      border: 2px solid #e0e6ed;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      background: white;
    }

    /* File Upload Dropzone */
    .dropzone {
      border: 3px dashed #e0e6ed;
      border-radius: 12px;
      padding: 40px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s;
      background: #f8fafc;
    }

    .dropzone:hover {
      border-color: #667eea;
      background: #f0f4ff;
    }

    .dropzone.dragover {
      border-color: #667eea;
      background: #e8f0ff;
      transform: scale(1.02);
    }

    .dropzone i {
      font-size: 48px;
      color: #667eea;
      margin-bottom: 16px;
    }

    /* Image Preview Grid */
    .image-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 12px;
      margin-top: 20px;
    }

    .image-item {
      position: relative;
      aspect-ratio: 1;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .image-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .image-item .remove-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: rgba(239, 68, 68, 0.9);
      color: white;
      border: none;
      border-radius: 50%;
      width: 28px;
      height: 28px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .image-item:hover .remove-btn {
      opacity: 1;
    }

    /* Progress Bar */
    .progress-bar {
      height: 8px;
      background: #e0e6ed;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 12px;
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea, #764ba2);
      transition: width 0.3s ease;
    }

    /* Loading Spinner */
    .spinner {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #667eea;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 0.8s linear infinite;
      margin: 20px auto;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    /* Charts Container */
    .chart-container {
      margin: 20px 0;
      padding: 20px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    /* Export Button */
    .btn-export {
      background: #10b981;
      padding: 10px 20px;
      border-radius: 8px;
      color: white;
      border: none;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.3s;
    }

    .btn-export:hover {
      background: #059669;
      transform: translateY(-2px);
    }

    /* Pagination */
    .pagination {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-top: 24px;
      align-items: center;
    }

    .pagination button {
      padding: 8px 16px;
      border: 1px solid #e0e6ed;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }

    .pagination button:hover:not(:disabled) {
      background: #667eea;
      color: white;
      border-color: #667eea;
    }

    .pagination button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .pagination button.active {
      background: #667eea;
      color: white;
      border-color: #667eea;
    }

    /* Tooltips */
    .tooltip {
      position: relative;
      display: inline-block;
    }

    .tooltip .tooltiptext {
      visibility: hidden;
      background-color: #1e293b;
      color: white;
      text-align: center;
      border-radius: 6px;
      padding: 8px 12px;
      position: absolute;
      z-index: 1;
      bottom: 125%;
      left: 50%;
      transform: translateX(-50%);
      opacity: 0;
      transition: opacity 0.3s;
      font-size: 12px;
      white-space: nowrap;
    }

    .tooltip:hover .tooltiptext {
      visibility: visible;
      opacity: 1;
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
        <li class="menu-item" onclick="switchPage('ai-tools')">
          <i class="fas fa-brain"></i>
          <span>AI Tools</span>
        </li>
        <li class="menu-item" onclick="switchPage('vehicle-analyzer')">
          <i class="fas fa-car"></i>
          <span>Vehicle Analysis</span>
        </li>
        <li class="menu-item" onclick="switchPage('inventory')">
          <i class="fas fa-warehouse"></i>
          <span>Inventory Manager</span>
        </li>
        <li class="menu-item" onclick="switchPage('analytics')">
          <i class="fas fa-chart-bar"></i>
          <span>Analytics</span>
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

      <!-- Users Page - COMPREHENSIVE USER MANAGEMENT -->
      <div id="users" class="page-content">
        <div class="page-header">
          <h1>👥 User Management</h1>
          <p>Complete user administration and permission control</p>
        </div>

        <!-- Quick Stats -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Users</div>
            <div class="stat-value" id="userStatsTotal">0</div>
            <div class="stat-change positive"><i class="fas fa-arrow-up"></i> 12% this month</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Active Users</div>
            <div class="stat-value" id="userStatsActive">0</div>
            <div class="stat-change positive"><i class="fas fa-check-circle"></i> Online now</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Admin Users</div>
            <div class="stat-value" id="userStatsAdmin">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Pending Approval</div>
            <div class="stat-value" id="userStatsPending">0</div>
          </div>
        </div>

        <!-- Create New User - Enhanced -->
        <div class="card">
          <h2><i class="fas fa-user-plus"></i> Create New User</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px;margin-bottom:20px;">
            <div class="form-group">
              <label><i class="fas fa-user"></i> User ID *</label>
              <input type="text" id="newUserId" placeholder="johndoe" required>
            </div>
            <div class="form-group">
              <label><i class="fas fa-envelope"></i> Email Address *</label>
              <input type="email" id="newUserEmail" placeholder="john@example.com" required>
            </div>
            <div class="form-group">
              <label><i class="fas fa-lock"></i> Password *</label>
              <input type="password" id="newUserPassword" placeholder="••••••••" required>
            </div>
            <div class="form-group">
              <label><i class="fas fa-shield-alt"></i> Role</label>
              <select id="newUserRole" class="choices-select">
                <option value="user">User - Standard Access</option>
                <option value="admin">Admin - Full Control</option>
                <option value="agent">Agent - Limited Access</option>
                <option value="viewer">Viewer - Read Only</option>
              </select>
            </div>
          </div>
          
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px;margin-bottom:20px;">
            <div class="form-group">
              <label><i class="fas fa-building"></i> Department</label>
              <input type="text" id="newUserDept" placeholder="Sales, Marketing, etc.">
            </div>
            <div class="form-group">
              <label><i class="fas fa-phone"></i> Phone Number</label>
              <input type="tel" id="newUserPhone" placeholder="+1 (555) 123-4567">
            </div>
            <div class="form-group">
              <label><i class="fas fa-toggle-on"></i> Status</label>
              <select id="newUserStatus">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div class="form-group">
              <label><i class="fas fa-calendar"></i> Expiry Date</label>
              <input type="text" id="newUserExpiry" class="flatpickr" placeholder="Select date">
            </div>
          </div>

          <div class="form-group">
            <label><i class="fas fa-sticky-note"></i> Notes</label>
            <textarea id="newUserNotes" rows="2" placeholder="Additional notes about this user..."></textarea>
          </div>

          <div style="display:flex;gap:12px;">
            <button class="btn" onclick="createUserEnhanced()" style="width:auto;">
              <i class="fas fa-user-plus"></i> Create User
            </button>
            <button class="btn-secondary" onclick="clearUserForm()" style="padding:12px 24px;width:auto;">
              <i class="fas fa-times"></i> Clear
            </button>
            <button class="btn-secondary" onclick="importUsersCSV()" style="padding:12px 24px;width:auto;">
              <i class="fas fa-file-import"></i> Import CSV
            </button>
          </div>
        </div>

        <!-- User List with Advanced DataTable -->
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
            <h2><i class="fas fa-users"></i> All Users (<span id="usersTableCount">0</span>)</h2>
            <div style="display:flex;gap:12px;">
              <button class="btn-secondary" onclick="exportUsersCSV()" style="padding:10px 20px;">
                <i class="fas fa-download"></i> Export CSV
              </button>
              <button class="btn-secondary" onclick="refreshUserTable()" style="padding:10px 20px;">
                <i class="fas fa-sync"></i> Refresh
              </button>
            </div>
          </div>

          <!-- Advanced Filters -->
          <div class="filter-bar" style="margin-bottom:20px;">
            <input type="text" id="userSearchInput" class="filter-input" placeholder="🔍 Search users...">
            <select id="userRoleFilter" class="filter-select">
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
              <option value="agent">Agent</option>
              <option value="viewer">Viewer</option>
            </select>
            <select id="userStatusFilter" class="filter-select">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </select>
            <button class="btn-secondary" onclick="resetUserFilters()" style="padding:10px 20px;">
              <i class="fas fa-filter-circle-xmark"></i> Reset
            </button>
          </div>

          <div id="usersList" class="data-table-container">
            <table id="usersDataTable" class="display" style="width:100%">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Department</th>
                  <th>Created</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>

        <!-- User Details Modal (Will be created dynamically) -->
        <div id="userDetailsModal" style="display:none;"></div>
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

      <!-- AI Tools Page -->
      <div id="ai-tools" class="page-content">
        <div class="page-header">
          <h1>🤖 AI Tools</h1>
          <p>Intelligent automation powered by Gemini AI</p>
        </div>

        <!-- Description Generator -->
        <div class="card">
          <h2><i class="fas fa-file-alt"></i> Generate Listing Description</h2>
          <div class="form-group">
            <label>Vehicle Data (JSON)</label>
            <textarea id="aiDescVehicle" rows="4" style="width:100%;padding:12px;border:2px solid #e0e6ed;border-radius:10px;font-family:monospace;" placeholder='{"make":"Honda","model":"Civic","year":2022,"mileage":45000}'></textarea>
          </div>
          <div class="form-group">
            <label>Style</label>
            <select id="aiDescStyle" style="width:100%;padding:12px;border:2px solid #e0e6ed;border-radius:10px;">
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="luxury">Luxury</option>
              <option value="budget">Budget-Friendly</option>
            </select>
          </div>
          <button class="btn" onclick="generateDescription()">
            <i class="fas fa-magic"></i> Generate Description
          </button>
          <div id="aiDescResult" style="margin-top:20px;padding:15px;background:#f1f5f9;border-radius:10px;display:none;"></div>
        </div>

        <!-- Title Optimizer -->
        <div class="card">
          <h2><i class="fas fa-heading"></i> Optimize Title</h2>
          <div class="form-group">
            <label>Current Title</label>
            <input type="text" id="aiTitleCurrent" placeholder="2022 Honda Civic">
          </div>
          <div class="form-group">
            <label>Vehicle Data (JSON)</label>
            <textarea id="aiTitleVehicle" rows="3" style="width:100%;padding:12px;border:2px solid #e0e6ed;border-radius:10px;font-family:monospace;"></textarea>
          </div>
          <button class="btn" onclick="optimizeTitle()">
            <i class="fas fa-lightbulb"></i> Get Suggestions
          </button>
          <div id="aiTitleResult" style="margin-top:20px;display:none;"></div>
        </div>

        <!-- Batch Enhance -->
        <div class="card">
          <h2><i class="fas fa-layer-group"></i> Batch Enhance Vehicles</h2>
          <div class="form-group">
            <label>Vehicles Array (JSON)</label>
            <textarea id="aiBatchVehicles" rows="6" style="width:100%;padding:12px;border:2px solid #e0e6ed;border-radius:10px;font-family:monospace;" placeholder='[{"make":"Honda","model":"Civic"},{"make":"Toyota","model":"Camry"}]'></textarea>
          </div>
          <button class="btn" onclick="batchEnhance()">
            <i class="fas fa-rocket"></i> Enhance All
          </button>
          <div id="aiBatchResult" style="margin-top:20px;display:none;"></div>
        </div>
      </div>

      <!-- Vehicle Analyzer Page -->
      <div id="vehicle-analyzer" class="page-content">
        <div class="page-header">
          <h1>🔍 Vehicle Analysis</h1>
          <p>Deep market insights and condition scoring</p>
        </div>

        <!-- Market Analysis -->
        <div class="card">
          <h2><i class="fas fa-chart-line"></i> Market Analysis</h2>
          <div class="form-group">
            <label>Vehicle Data (JSON)</label>
            <textarea id="analyzeVehicleData" rows="5" style="width:100%;padding:12px;border:2px solid #e0e6ed;border-radius:10px;font-family:monospace;" placeholder='{"make":"Honda","model":"Civic","year":2022,"price":18500,"mileage":45000}'></textarea>
          </div>
          <button class="btn" onclick="analyzeVehicle()">
            <i class="fas fa-search-dollar"></i> Analyze Market
          </button>
          <div id="analyzeResult" style="margin-top:20px;display:none;"></div>
        </div>

        <!-- Condition Scoring -->
        <div class="card">
          <h2><i class="fas fa-star"></i> Condition Score</h2>
          <div class="form-group">
            <label>Vehicle Data (JSON)</label>
            <textarea id="conditionVehicle" rows="3" style="width:100%;padding:12px;border:2px solid #e0e6ed;border-radius:10px;font-family:monospace;"></textarea>
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea id="conditionDesc" rows="2" style="width:100%;padding:12px;border:2px solid #e0e6ed;border-radius:10px;"></textarea>
          </div>
          <div class="form-group">
            <label>Number of Images</label>
            <input type="number" id="conditionImages" value="0" style="width:100%;padding:12px;border:2px solid #e0e6ed;border-radius:10px;">
          </div>
          <button class="btn" onclick="scoreCondition()">
            <i class="fas fa-clipboard-check"></i> Score Condition
          </button>
          <div id="conditionResult" style="margin-top:20px;display:none;"></div>
        </div>

        <!-- Image Analysis -->
        <div class="card">
          <h2><i class="fas fa-image"></i> Image Analysis</h2>
          <div class="form-group">
            <label>Image URL</label>
            <input type="text" id="imageUrl" placeholder="https://example.com/car.jpg">
          </div>
          <button class="btn" onclick="analyzeImage()">
            <i class="fas fa-eye"></i> Analyze Image
          </button>
          <div id="imageResult" style="margin-top:20px;display:none;"></div>
        </div>
      </div>

      <!-- Inventory Manager Page -->
      <div id="inventory" class="page-content">
        <div class="page-header">
          <h1>📦 Inventory Manager</h1>
          <p>Manage your vehicle inventory with advanced tools</p>
        </div>

        <!-- Filters and Search -->
        <div class="card">
          <div class="filter-bar">
            <input type="text" id="inventorySearch" class="filter-input" placeholder="🔍 Search by make, model, VIN...">
            <select id="statusFilter" class="filter-select">
              <option value="">All Status</option>
              <option value="available">Available</option>
              <option value="pending">Pending</option>
              <option value="sold">Sold</option>
            </select>
            <select id="makeFilter" class="filter-select">
              <option value="">All Makes</option>
            </select>
            <button class="btn-export" onclick="exportInventory()">
              <i class="fas fa-download"></i> Export CSV
            </button>
          </div>
        </div>

        <!-- Add Vehicle -->
        <div class="card">
          <h2><i class="fas fa-plus-circle"></i> Add New Vehicle</h2>
          
          <!-- Image Upload Dropzone -->
          <div class="dropzone" id="vehicleDropzone" onclick="document.getElementById('vehicleImages').click()">
            <i class="fas fa-cloud-upload-alt"></i>
            <h3>Drag & Drop Images Here</h3>
            <p>or click to browse (max 20 images)</p>
            <input type="file" id="vehicleImages" multiple accept="image/*" style="display:none;" onchange="handleVehicleImages(this.files)">
          </div>
          
          <div class="image-grid" id="imagePreviewGrid"></div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;margin-top:20px;">
            <div class="form-group">
              <label>Year</label>
              <input type="number" id="invYear" placeholder="2023">
            </div>
            <div class="form-group">
              <label>Make</label>
              <input type="text" id="invMake" placeholder="Honda">
            </div>
            <div class="form-group">
              <label>Model</label>
              <input type="text" id="invModel" placeholder="Civic">
            </div>
            <div class="form-group">
              <label>VIN</label>
              <input type="text" id="invVin" placeholder="1HGBH41JXMN109186">
            </div>
            <div class="form-group">
              <label>Price</label>
              <input type="number" id="invPrice" placeholder="18500">
            </div>
            <div class="form-group">
              <label>Mileage</label>
              <input type="number" id="invMileage" placeholder="45000">
            </div>
            <div class="form-group">
              <label>Color</label>
              <input type="text" id="invColor" placeholder="Silver">
            </div>
            <div class="form-group">
              <label>Status</label>
              <select id="invStatus" style="width:100%;padding:14px;border:2px solid #e0e6ed;border-radius:10px;">
                <option value="available">Available</option>
                <option value="pending">Pending</option>
                <option value="sold">Sold</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Description</label>
            <textarea id="invDescription" rows="3" style="width:100%;padding:12px;border:2px solid #e0e6ed;border-radius:10px;"></textarea>
          </div>

          <button class="btn" onclick="addVehicleToInventory()">
            <i class="fas fa-save"></i> Add Vehicle
          </button>
        </div>

        <!-- Inventory Table -->
        <div class="card">
          <h2>Current Inventory (<span id="inventoryCount">0</span> vehicles)</h2>
          <div class="data-table-container">
            <table class="data-table" id="inventoryTable">
              <thead>
                <tr>
                  <th onclick="sortInventory('year')">Year <i class="fas fa-sort"></i></th>
                  <th onclick="sortInventory('make')">Make <i class="fas fa-sort"></i></th>
                  <th onclick="sortInventory('model')">Model <i class="fas fa-sort"></i></th>
                  <th onclick="sortInventory('price')">Price <i class="fas fa-sort"></i></th>
                  <th onclick="sortInventory('mileage')">Mileage <i class="fas fa-sort"></i></th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="inventoryTableBody">
                <tr>
                  <td colspan="7" style="text-align:center;padding:40px;color:#94a3b8;">
                    No vehicles in inventory. Add one above!
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="pagination" id="inventoryPagination"></div>
        </div>
      </div>

      <!-- Analytics Page -->
      <div id="analytics" class="page-content">
        <div class="page-header">
          <h1>📊 Analytics Dashboard</h1>
          <p>Insights and performance metrics</p>
        </div>

        <!-- Key Metrics -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Revenue</div>
            <div class="stat-value" id="totalRevenue">$0</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Avg. Sale Price</div>
            <div class="stat-value" id="avgSalePrice">$0</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Avg. Days to Sell</div>
            <div class="stat-value" id="avgDaysToSell">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Conversion Rate</div>
            <div class="stat-value" id="conversionRate">0%</div>
          </div>
        </div>

        <!-- Charts -->
        <div class="card">
          <h2><i class="fas fa-chart-line"></i> Activity Trends</h2>
          <div id="activityChart" class="chart-container"></div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:20px;">
          <div class="card">
            <h2><i class="fas fa-pie-chart"></i> Jobs by Status</h2>
            <div id="statusChart" class="chart-container"></div>
          </div>
          
          <div class="card">
            <h2><i class="fas fa-chart-bar"></i> Top Vehicle Makes</h2>
            <div id="makesChart" class="chart-container"></div>
          </div>
        </div>

        <div class="card">
          <h2><i class="fas fa-fire"></i> Hot Listings</h2>
          <p style="color:#64748b;margin-bottom:20px;">Most viewed and fastest-selling vehicles</p>
          <div id="hotListings"></div>
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

  // AI Functions
  async function generateDescription() {
    const vehicleData = document.getElementById('aiDescVehicle').value;
    const style = document.getElementById('aiDescStyle').value;
    const resultDiv = document.getElementById('aiDescResult');
    
    if (!vehicleData) {
      alert('Please provide vehicle data');
      return;
    }
    
    try {
      const vehicle = JSON.parse(vehicleData);
      resultDiv.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Generating description...</p>';
      resultDiv.style.display = 'block';
      
      const res = await call('/ai/generate-description', 'POST', { vehicleData: vehicle, style });
      resultDiv.innerHTML = '<strong>Generated Description:</strong><br><br>' + res.description;
    } catch (e) {
      resultDiv.innerHTML = '<p style="color:#ef4444;">Error: ' + e.message + '</p>';
    }
  }

  async function optimizeTitle() {
    const currentTitle = document.getElementById('aiTitleCurrent').value;
    const vehicleData = document.getElementById('aiTitleVehicle').value;
    const resultDiv = document.getElementById('aiTitleResult');
    
    if (!vehicleData) {
      alert('Please provide vehicle data');
      return;
    }
    
    try {
      const vehicle = JSON.parse(vehicleData);
      resultDiv.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Optimizing titles...</p>';
      resultDiv.style.display = 'block';
      
      const res = await call('/ai/optimize-title', 'POST', { vehicleData: vehicle, currentTitle });
      resultDiv.innerHTML = '<strong>Optimized Titles:</strong><br><pre style="background:#fff;padding:15px;border-radius:8px;overflow:auto;">' + res.suggestions + '</pre>';
    } catch (e) {
      resultDiv.innerHTML = '<p style="color:#ef4444;">Error: ' + e.message + '</p>';
    }
  }

  async function batchEnhance() {
    const vehiclesData = document.getElementById('aiBatchVehicles').value;
    const resultDiv = document.getElementById('aiBatchResult');
    
    if (!vehiclesData) {
      alert('Please provide vehicles array');
      return;
    }
    
    try {
      const vehicles = JSON.parse(vehiclesData);
      resultDiv.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Enhancing ' + vehicles.length + ' vehicles...</p>';
      resultDiv.style.display = 'block';
      
      const res = await call('/ai/batch-enhance', 'POST', { vehicles });
      resultDiv.innerHTML = '<strong>Enhanced Results:</strong><br><pre style="background:#fff;padding:15px;border-radius:8px;overflow:auto;max-height:400px;">' + res.enhanced + '</pre>';
    } catch (e) {
      resultDiv.innerHTML = '<p style="color:#ef4444;">Error: ' + e.message + '</p>';
    }
  }

  async function analyzeVehicle() {
    const vehicleData = document.getElementById('analyzeVehicleData').value;
    const resultDiv = document.getElementById('analyzeResult');
    
    if (!vehicleData) {
      alert('Please provide vehicle data');
      return;
    }
    
    try {
      const vehicle = JSON.parse(vehicleData);
      resultDiv.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Analyzing vehicle market data...</p>';
      resultDiv.style.display = 'block';
      
      const res = await call('/ai/analyze-vehicle', 'POST', { vehicleData: vehicle });
      resultDiv.innerHTML = '<strong>Market Analysis:</strong><br><pre style="background:#fff;padding:15px;border-radius:8px;overflow:auto;max-height:400px;">' + res.analysis + '</pre>';
    } catch (e) {
      resultDiv.innerHTML = '<p style="color:#ef4444;">Error: ' + e.message + '</p>';
    }
  }

  async function scoreCondition() {
    const vehicleData = document.getElementById('conditionVehicle').value;
    const description = document.getElementById('conditionDesc').value;
    const imageCount = parseInt(document.getElementById('conditionImages').value) || 0;
    const resultDiv = document.getElementById('conditionResult');
    
    if (!vehicleData) {
      alert('Please provide vehicle data');
      return;
    }
    
    try {
      const vehicle = JSON.parse(vehicleData);
      resultDiv.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Scoring condition...</p>';
      resultDiv.style.display = 'block';
      
      const res = await call('/ai/condition-score', 'POST', { 
        vehicleData: vehicle, 
        description, 
        images: Array(imageCount).fill('image.jpg') 
      });
      resultDiv.innerHTML = '<strong>Condition Score:</strong><br><pre style="background:#fff;padding:15px;border-radius:8px;overflow:auto;">' + res.scoring + '</pre>';
    } catch (e) {
      resultDiv.innerHTML = '<p style="color:#ef4444;">Error: ' + e.message + '</p>';
    }
  }

  async function analyzeImage() {
    const imageUrl = document.getElementById('imageUrl').value;
    const resultDiv = document.getElementById('imageResult');
    
    if (!imageUrl) {
      alert('Please provide image URL');
      return;
    }
    
    try {
      resultDiv.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Analyzing image...</p>';
      resultDiv.style.display = 'block';
      
      const res = await call('/ai/analyze-image', 'POST', { imageUrl });
      resultDiv.innerHTML = '<strong>Image Analysis:</strong><br><pre style="background:#fff;padding:15px;border-radius:8px;overflow:auto;">' + res.analysis + '</pre>';
    } catch (e) {
      resultDiv.innerHTML = '<p style="color:#ef4444;">Error: ' + e.message + '</p>';
    }
  }

  // Inventory Management
  let inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
  let uploadedImages = [];
  let sortColumn = '';
  let sortDirection = 'asc';
  let currentPage = 1;
  const itemsPerPage = 10;

  function showToast(message, type = 'success') {
    Toastify({
      text: message,
      duration: 3000,
      gravity: "top",
      position: "right",
      backgroundColor: type === 'success' ? '#10b981' : '#ef4444',
      stopOnFocus: true
    }).showToast();
  }

  function handleVehicleImages(files) {
    const arr = Array.from(files);
    const remaining = 20 - uploadedImages.length;
    const toAdd = arr.slice(0, remaining);
    
    toAdd.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        uploadedImages.push({ url: e.target.result, file });
        renderImagePreviews();
      };
      reader.readAsDataURL(file);
    });

    showToast(\`Added \${toAdd.length} image(s)\`);
  }

  function renderImagePreviews() {
    const grid = document.getElementById('imagePreviewGrid');
    grid.innerHTML = uploadedImages.map((img, idx) => \`
      <div class="image-item">
        <img src="\${img.url}" alt="Vehicle \${idx + 1}">
        <button class="remove-btn" onclick="removeImage(\${idx})">
          <i class="fas fa-times"></i>
        </button>
      </div>
    \`).join('');
  }

  function removeImage(idx) {
    uploadedImages.splice(idx, 1);
    renderImagePreviews();
    showToast('Image removed');
  }

  // Dropzone handlers
  const dropzone = document.getElementById('vehicleDropzone');
  if (dropzone) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'));
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'));
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      handleVehicleImages(files);
    });
  }

  async function addVehicleToInventory() {
    const vehicle = {
      id: Date.now(),
      year: document.getElementById('invYear').value,
      make: document.getElementById('invMake').value,
      model: document.getElementById('invModel').value,
      vin: document.getElementById('invVin').value,
      price: parseFloat(document.getElementById('invPrice').value) || 0,
      mileage: parseInt(document.getElementById('invMileage').value) || 0,
      color: document.getElementById('invColor').value,
      status: document.getElementById('invStatus').value,
      description: document.getElementById('invDescription').value,
      images: uploadedImages.map(img => img.url),
      createdAt: new Date().toISOString()
    };

    if (!vehicle.year || !vehicle.make || !vehicle.model) {
      showToast('Please fill year, make, and model', 'error');
      return;
    }

    inventory.push(vehicle);
    localStorage.setItem('inventory', JSON.stringify(inventory));
    
    // Clear form
    ['invYear', 'invMake', 'invModel', 'invVin', 'invPrice', 'invMileage', 'invColor', 'invDescription'].forEach(id => {
      document.getElementById(id).value = '';
    });
    uploadedImages = [];
    renderImagePreviews();

    showToast('Vehicle added to inventory!');
    renderInventoryTable();
    updateMakeFilter();
  }

  function renderInventoryTable() {
    const tbody = document.getElementById('inventoryTableBody');
    const filteredInventory = filterInventory();
    
    document.getElementById('inventoryCount').textContent = filteredInventory.length;

    if (filteredInventory.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#94a3b8;">No vehicles match your filters</td></tr>';
      return;
    }

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageItems = filteredInventory.slice(start, end);

    tbody.innerHTML = pageItems.map(v => \`
      <tr>
        <td>\${v.year}</td>
        <td>\${v.make}</td>
        <td>\${v.model}</td>
        <td>$\${v.price.toLocaleString()}</td>
        <td>\${v.mileage.toLocaleString()} mi</td>
        <td><span class="badge badge-\${v.status === 'available' ? 'success' : v.status === 'pending' ? 'warning' : 'info'}">\${v.status}</span></td>
        <td>
          <button class="btn-primary" style="padding:6px 12px;margin-right:4px;" onclick="editVehicle(\${v.id})">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn-danger" style="padding:6px 12px;" onclick="deleteVehicle(\${v.id})">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    \`).join('');

    renderPagination(filteredInventory.length);
  }

  function filterInventory() {
    const search = document.getElementById('inventorySearch')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    const makeFilter = document.getElementById('makeFilter')?.value || '';

    let filtered = inventory.filter(v => {
      const matchSearch = !search || 
        v.make.toLowerCase().includes(search) ||
        v.model.toLowerCase().includes(search) ||
        v.vin.toLowerCase().includes(search);
      const matchStatus = !statusFilter || v.status === statusFilter;
      const matchMake = !makeFilter || v.make === makeFilter;
      return matchSearch && matchStatus && matchMake;
    });

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        let aVal = a[sortColumn];
        let bVal = b[sortColumn];
        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }
        if (sortDirection === 'asc') {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });
    }

    return filtered;
  }

  function sortInventory(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
    renderInventoryTable();
  }

  function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const pagination = document.getElementById('inventoryPagination');
    
    if (totalPages <= 1) {
      pagination.innerHTML = '';
      return;
    }

    let html = \`
      <button onclick="changePage(\${currentPage - 1})" \${currentPage === 1 ? 'disabled' : ''}>
        <i class="fas fa-chevron-left"></i>
      </button>
    \`;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        html += \`<button class="\${i === currentPage ? 'active' : ''}" onclick="changePage(\${i})">\${i}</button>\`;
      } else if (i === currentPage - 2 || i === currentPage + 2) {
        html += '<button disabled>...</button>';
      }
    }

    html += \`
      <button onclick="changePage(\${currentPage + 1})" \${currentPage === totalPages ? 'disabled' : ''}>
        <i class="fas fa-chevron-right"></i>
      </button>
    \`;

    pagination.innerHTML = html;
  }

  function changePage(page) {
    currentPage = page;
    renderInventoryTable();
  }

  function updateMakeFilter() {
    const makes = [...new Set(inventory.map(v => v.make))].sort();
    const select = document.getElementById('makeFilter');
    if (select) {
      select.innerHTML = '<option value="">All Makes</option>' + makes.map(m => \`<option value="\${m}">\${m}</option>\`).join('');
    }
  }

  function deleteVehicle(id) {
    if (confirm('Delete this vehicle from inventory?')) {
      inventory = inventory.filter(v => v.id !== id);
      localStorage.setItem('inventory', JSON.stringify(inventory));
      showToast('Vehicle deleted');
      renderInventoryTable();
      updateMakeFilter();
    }
  }

  function exportInventory() {
    const csv = [
      ['Year', 'Make', 'Model', 'VIN', 'Price', 'Mileage', 'Color', 'Status', 'Description'].join(','),
      ...inventory.map(v => [
        v.year, v.make, v.model, v.vin, v.price, v.mileage, v.color, v.status, \`"\${v.description}"\`
      ].join(','))
    ].join('\\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = \`inventory_\${new Date().toISOString().split('T')[0]}.csv\`;
    a.click();
    showToast('Inventory exported!');
  }

  // Analytics Functions
  function renderAnalytics() {
    // Calculate metrics
    const soldVehicles = inventory.filter(v => v.status === 'sold');
    const totalRevenue = soldVehicles.reduce((sum, v) => sum + v.price, 0);
    const avgPrice = soldVehicles.length > 0 ? totalRevenue / soldVehicles.length : 0;

    document.getElementById('totalRevenue').textContent = '$' + totalRevenue.toLocaleString();
    document.getElementById('avgSalePrice').textContent = '$' + Math.round(avgPrice).toLocaleString();
    document.getElementById('conversionRate').textContent = 
      inventory.length > 0 ? Math.round((soldVehicles.length / inventory.length) * 100) + '%' : '0%';

    // Activity Chart
    renderActivityChart();
    
    // Status Chart
    renderStatusChart();
    
    // Makes Chart
    renderMakesChart();
  }

  function renderActivityChart() {
    const last7Days = [...Array(7)].map((_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: Math.floor(Math.random() * 10) + 5 // Demo data
      };
    });

    const options = {
      chart: { type: 'area', height: 300, toolbar: { show: false } },
      series: [{ name: 'Activity', data: last7Days.map(d => d.count) }],
      xaxis: { categories: last7Days.map(d => d.date) },
      colors: ['#667eea'],
      fill: { type: 'gradient', gradient: { shade: 'light', type: 'vertical', opacityFrom: 0.7, opacityTo: 0.3 } },
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 3 }
    };

    new ApexCharts(document.getElementById('activityChart'), options).render();
  }

  function renderStatusChart() {
    const statusCounts = {
      available: inventory.filter(v => v.status === 'available').length,
      pending: inventory.filter(v => v.status === 'pending').length,
      sold: inventory.filter(v => v.status === 'sold').length
    };

    const options = {
      chart: { type: 'donut', height: 300 },
      series: Object.values(statusCounts),
      labels: ['Available', 'Pending', 'Sold'],
      colors: ['#10b981', '#f59e0b', '#667eea'],
      legend: { position: 'bottom' }
    };

    new ApexCharts(document.getElementById('statusChart'), options).render();
  }

  function renderMakesChart() {
    const makeCounts = inventory.reduce((acc, v) => {
      acc[v.make] = (acc[v.make] || 0) + 1;
      return acc;
    }, {});

    const sorted = Object.entries(makeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const options = {
      chart: { type: 'bar', height: 300, toolbar: { show: false } },
      series: [{ name: 'Vehicles', data: sorted.map(([, count]) => count) }],
      xaxis: { categories: sorted.map(([make]) => make) },
      colors: ['#764ba2'],
      plotOptions: { bar: { borderRadius: 4, horizontal: false } },
      dataLabels: { enabled: false }
    };

    new ApexCharts(document.getElementById('makesChart'), options).render();
  }

  // Page switch handler enhancement
  const originalSwitchPage = switchPage;
  switchPage = function(page) {
    originalSwitchPage(page);
    
    if (page === 'inventory') {
      renderInventoryTable();
      updateMakeFilter();
      
      // Setup event listeners
      setTimeout(() => {
        document.getElementById('inventorySearch')?.addEventListener('input', _.debounce(renderInventoryTable, 300));
        document.getElementById('statusFilter')?.addEventListener('change', renderInventoryTable);
        document.getElementById('makeFilter')?.addEventListener('change', renderInventoryTable);
      }, 100);
    }
    
    if (page === 'analytics') {
      renderAnalytics();
    }
  };

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
