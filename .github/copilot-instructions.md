# Copilot Instructions for AutoBridge

## Project Overview

**AutoBridge** is a vehicle marketplace automation platform with three primary components:

1. **Backend API** (Cloudflare Workers) - Serverless vehicle scraping, job management, and AI analysis
2. **Chrome Extension** - Web scraping and Facebook Marketplace auto-fill agent
3. **Admin Dashboard** - Material Design UI for monitoring, user management, and analytics

The current focus is on the **Cloudflare Workers backend** (`backend/worker.js`) deployed to `https://autobridge-backend.dchatpar.workers.dev/`.

## Architecture & Key Patterns

### Backend Structure (worker.js)

The backend is a **single-file Cloudflare Worker** using:
- **ES6 modules** with JWT authentication (jsonwebtoken library)
- **In-memory storage** (arrays: `users[]`, `scrapeJobs[]`, `activityLogs[]`)
- **Fetch-based routing** (no Express; manual path/method matching)
- **No database** - all data lost on redeployment (development only)

```javascript
// Route pattern:
if (path === '/api/endpoint' && method === 'POST') {
  // Verify token first if protected
  if (!decoded || decoded.role !== 'admin') return res({...}, headers, 403);
  // Process logic
  return res({ success: true, data }, headers);
}
```

**Critical:** All endpoints must include proper token verification and role-based access control.

### API Endpoints (Current)

**Auth:**
- `POST /api/auth/login` - Returns JWT token + role
- `POST /api/auth/register` - Create user (admin only)
- `POST /api/auth/validate` - Verify token validity

**User Management:**
- `GET /api/users` - List users (admin only)
- `DELETE /api/users/{id}` - Delete user (admin only)

**Scraping:**
- `POST /api/scrape/queue` - Queue new jobs (returns job IDs)
- `GET /api/scrape/jobs` - List jobs with optional status filter
- `PATCH /api/scrape/jobs/{id}` - Update job status/results

**Analytics:**
- `GET /api/logs/activity` - Activity logs (admin sees all, users see own)
- `GET /api/stats/dashboard` - Dashboard statistics (admin only)
- `GET /api/health` - Health check

### Frontend Dashboard Architecture

Located in `serveDashboard()` function (returns embedded HTML):

**UI Framework:** Vanilla JavaScript + inline Material Design CSS (no npm build)

**Key Features:**
- **Sidebar Navigation** - Menu items as separate `.menu-item` elements
- **Page System** - Pages identified by `id` attribute (e.g., `id="dashboard"`), toggled via `classList.add/remove('active')`
- **API Caller** - `call(endpoint, method, body)` function uses Bearer tokens from `localStorage`

**Page Structure Pattern:**
```html
<!-- Navigation -->
<li class="menu-item" onclick="switchPage('jobs')">
  <i class="fas fa-tasks"></i>
  <span>Job Queue</span>
</li>

<!-- Content Page -->
<div id="jobs" class="page-content">
  <!-- Form and table content -->
</div>
```

**JavaScript Pattern:**
```javascript
function switchPage(page) {
  document.querySelectorAll('.page-content').forEach(el => el.classList.remove('active'));
  document.getElementById(page).classList.add('active');
  if (page === 'jobs-list') loadJobsList(); // Load data
}

async function loadJobsList() {
  try {
    const res = await call('/scrape/jobs');
    // Populate table/UI
  } catch (e) { showAlert('Error: ' + e.message); }
}
```

## Development Workflow

### Deployment Process

1. **Update `backend/worker.js`** with new features
2. **Deploy to Cloudflare:**
   ```bash
   cd backend
   npx wrangler deploy worker.js
   ```
3. **Commit changes:**
   ```bash
   git add . && git commit -m "Feature: description"
   ```

### Adding New API Endpoints

**Step 1:** Add route handler in worker.js (after token verification if needed):
```javascript
if (path === '/api/feature/analyze' && method === 'POST') {
  if (!decoded) return res({ success: false, message: 'No token' }, headers, 401);
  const { vehicleData } = await request.json();
  // Process logic
  activityLogs.push({ userId: decoded.userId, action: 'analyze', timestamp: new Date().toISOString(), success: true });
  return res({ success: true, result: analysis }, headers);
}
```

**Step 2:** Add frontend function in dashboard:
```javascript
async function analyzeVehicle(vehicleData) {
  try {
    const res = await call('/feature/analyze', 'POST', vehicleData);
    showAlert('Analysis complete!', 'success');
  } catch (e) {
    showAlert('Failed: ' + e.message);
  }
}
```

**Step 3:** Add form/button in corresponding page (`<div id="feature">`):
```html
<button class="btn btn-primary" onclick="analyzeVehicle(data)">
  <i class="fas fa-brain"></i> Analyze
</button>
```

### Adding New Pages

**Step 1:** Create sidebar menu item:
```html
<li class="menu-item" onclick="switchPage('new-page')">
  <i class="fas fa-icon"></i>
  <span>New Feature</span>
</li>
```

**Step 2:** Create page content div:
```html
<div id="new-page" class="page-content">
  <div class="card">
    <h2>Feature Title</h2>
    <!-- Forms and content -->
  </div>
</div>
```

**Step 3:** Add load function (if async data needed):
```javascript
function switchPage(page) {
  // ... existing code ...
  if (page === 'new-page') loadNewPageData();
}

async function loadNewPageData() {
  try {
    const res = await call('/api/feature');
    // Update DOM
  } catch (e) { }
}
```

## Integration with Gemini API (AI Features)

### Current Setup
- Gemini API key stored in Cloudflare env variable: `env.GEMINI_API_KEY`
- Package: `@google/generative-ai` (in package.json)

### Adding AI Features

**Pattern for Vehicle Analysis:**
```javascript
if (path === '/api/ai/analyze-vehicle' && method === 'POST') {
  if (!decoded) return res({ success: false, message: 'No token' }, headers, 401);
  
  const { vehicleData } = await request.json();
  const GEMINI_API_KEY = env.GEMINI_API_KEY || 'sk-...';
  
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: \`Analyze this vehicle: \${JSON.stringify(vehicleData)}\`
          }]
        }]
      })
    });
    
    const aiResult = await response.json();
    activityLogs.push({ userId: decoded.userId, action: 'ai_analyze', timestamp: new Date().toISOString(), success: true });
    return res({ success: true, analysis: aiResult }, headers);
  } catch (e) {
    return res({ success: false, message: e.message }, headers, 500);
  }
}
```

**Testing AI Endpoint:**
```bash
curl -X POST https://autobridge-backend.dchatpar.workers.dev/api/ai/analyze-vehicle \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"vehicleData":{"make":"Honda","model":"Civic","year":2022}}'
```

## Testing & Validation

### Quick Validation After Deployment

```bash
# Health check
curl https://autobridge-backend.dchatpar.workers.dev/api/health

# Login test
curl -X POST https://autobridge-backend.dchatpar.workers.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userId":"admin","password":"admin"}'

# Verify token works
TOKEN="<from_login>" 
curl https://autobridge-backend.dchatpar.workers.dev/api/stats/dashboard \
  -H "Authorization: Bearer $TOKEN"
```

### Frontend Testing Checklist
- [ ] New page shows in sidebar
- [ ] Menu item switches pages (active class visible)
- [ ] API calls complete and show data
- [ ] Error alerts display on failure
- [ ] Token persists in localStorage
- [ ] Admin-only pages hidden for non-admin users

## Key Files & Their Purposes

| File | Purpose |
|------|---------|
| `backend/worker.js` | Main API + embedded dashboard UI (1000+ lines) |
| `wrangler.toml` | Cloudflare Workers config |
| `package.json` | Dependencies (jsonwebtoken, @google/generative-ai) |
| `.env` | Secrets (JWT_SECRET, GEMINI_API_KEY) |

## Common Pitfalls & Solutions

**Problem:** Changes deployed but not reflected  
**Solution:** Check version ID from deploy output; clear browser cache (Ctrl+Shift+Delete)

**Problem:** Token validation failing  
**Solution:** Ensure `Authorization: Bearer <token>` header is exactly formatted; tokens expire in 24h

**Problem:** AI API returning errors  
**Solution:** Verify GEMINI_API_KEY is set in `.env` and valid; check API rate limits

**Problem:** In-memory data lost  
**Solution:** This is expected—use persistent storage (Firebase, Supabase) for production

**Problem:** Sidebar menu items not appearing  
**Solution:** Ensure `role === 'admin'` for admin-only items; check that visibility is set via JavaScript

## Conventions This Project Uses

1. **Naming:** camelCase for JS, snake_case for API response fields
2. **Error Handling:** Always return `{ success: false, message: "..." }` JSON
3. **Logging:** Use `activityLogs.push({ userId, action, timestamp, metadata })` pattern
4. **Token:** Extract via `request.headers.get('Authorization')?.split(' ')[1]`
5. **Admin-only:** Check `decoded.role === 'admin'` before sensitive operations
6. **Alerts:** Use `showAlert(msg, 'success'|'error')` for user feedback
7. **API Calls:** Use `call(endpoint, method, body)` helper function in dashboard

## Next Steps for Feature Development

1. **AI-Powered Vehicle Analysis** - Integrate Gemini for market value, condition scoring, recommendation engine
2. **Wider Layouts** - Update CSS grid to use `grid-template-columns: repeat(auto-fit, minmax(350px, 1fr))` for larger cards
3. **Real-time Updates** - Replace 15s polling with WebSocket subscriptions
4. **Persistent Storage** - Migrate from in-memory to Supabase + Auth
5. **Batch Operations** - Add bulk job queueing and analysis
