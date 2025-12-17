# 🚀 AutoBridge: Cloudflare-Only Live Deployment

## Quick Start (5 Steps)

You stated: **"Deploy to Cloudflare itself only - I hope the app gets updated on the fly live."**

This guide shows you how to set up **automatic deployment** so that every code push goes live instantly to Cloudflare Workers.

---

## Step 1: Create GitHub Repository

If you haven't already:

```powershell
# Navigate to your workspace
cd c:\Users\dchat\Documents\facebookmark

# Initialize git (if not already done)
git init
git config user.email "your@email.com"
git config user.name "Your Name"

# Stage all files
git add .

# Commit
git commit -m "Initial commit: AutoBridge with Cloudflare Workers"
```

Then on GitHub:
1. Go to [github.com/new](https://github.com/new)
2. Create a repository (e.g., `autobridge-marketplace`)
3. Copy the HTTPS URL
4. In PowerShell:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/autobridge-marketplace.git
git branch -M main
git push -u origin main
```

✅ **Code is now on GitHub** — GitHub Actions will auto-trigger!

---

## Step 2: Add GitHub Repository Secrets

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these 4 secrets:

### Secret 1: `CLOUDFLARE_API_TOKEN`
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Profile icon (top right) → **API Tokens**
3. Click **Create Token**
4. Use template: **Edit Cloudflare Workers**
5. Copy the token and paste it as `CLOUDFLARE_API_TOKEN`

### Secret 2: `CLOUDFLARE_ACCOUNT_ID`
1. In your PowerShell:
```powershell
cd c:\Users\dchat\Documents\facebookmark\backend
wrangler whoami
```
2. Copy your Account ID
3. Add as `CLOUDFLARE_ACCOUNT_ID` secret

### Secret 3: `GEMINI_API_KEY`
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click **Create API Key**
3. Copy and paste as `GEMINI_API_KEY` secret

### Secret 4: `JWT_SECRET`
Generate a random secret:
```powershell
# PowerShell (generates random string)
$randomSecret = [convert]::ToBase64String((1..32 | ForEach-Object {[byte](Get-Random -Max 256)}))
Write-Host $randomSecret
```
Add this as `JWT_SECRET` secret

✅ **All 4 secrets added** — GitHub Actions can now deploy!

---

## Step 3: Verify Deployment Triggered

After pushing, check GitHub:
1. Go to your repo
2. Click **Actions** tab
3. You should see a workflow named **"Deploy to Cloudflare Workers"** running
4. Wait for it to complete (usually ~1-2 minutes)
5. On success, you'll see ✅ and message: **"✅ Deployed to https://autobridge-backend.workers.dev"**

✅ **Your API is now LIVE on Cloudflare!**

---

## Step 4: Test Live API

Verify the API is running:

```powershell
# Test health endpoint
$response = Invoke-WebRequest -Uri "https://autobridge-backend.workers.dev/api/health" -Method GET
$response.Content | ConvertFrom-Json | ConvertTo-Json

# Expected output:
# {
#   "status": "ok",
#   "message": "Cloudflare Workers API running",
#   "timestamp": "2024-..."
# }
```

✅ **API is responding!**

---

## Step 5: Update Dashboard & Extension

### Update Dashboard

In `admin-dashboard/.env.local` (or create it):

```env
REACT_APP_API_URL=https://autobridge-backend.workers.dev/api
```

Or when running:
```powershell
cd admin-dashboard
$env:REACT_APP_API_URL="https://autobridge-backend.workers.dev/api"
npm start
```

### Update Extension

In `ext/popup/popup.js`, update API candidates to prioritize Cloudflare:

```javascript
const API_CANDIDATES = [
  'https://autobridge-backend.workers.dev/api',
  'http://localhost:3001/api',
  'http://127.0.0.1:3001/api'
];
```

✅ **Dashboard and Extension now use live Cloudflare API!**

---

## 🔄 Continuous Live Deployment Workflow

Now every time you make changes:

1. **Edit code** (e.g., `backend/server-simple.js`, `admin-dashboard/src/AdminDashboard.jsx`)
2. **Commit & push**:
   ```powershell
   git add .
   git commit -m "Your change description"
   git push
   ```
3. **GitHub Actions automatically**:
   - Runs tests (if configured)
   - Deploys to Cloudflare Workers
   - **API is live within 30-60 seconds**
4. **Dashboard & Extension** immediately use the new version (no restart needed!)

✅ **Zero-downtime live updates!**

---

## 📊 Monitoring & Troubleshooting

### Check Deployment Status
```powershell
# View GitHub Actions logs in browser:
# https://github.com/YOUR_USERNAME/autobridge-marketplace/actions

# Or via Cloudflare Wrangler tail (view live logs):
cd backend
wrangler tail
```

### View Live Worker Logs
```powershell
cd backend
wrangler tail --follow
```

### Manual Deploy (if needed)
```powershell
cd backend
wrangler deploy worker.js
```

### Common Issues

| Issue | Solution |
|-------|----------|
| "403 Unauthorized" | Check CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID secrets |
| "Deployment failed" | View GitHub Actions logs; check `backend/package.json` syntax |
| API returns 404 | Verify URL is `https://autobridge-backend.workers.dev/api` (note: `/api` path) |
| Old data after deploy | In-memory storage resets; create KV namespace for persistence (see below) |

---

## 🗄️ Optional: Persistent Storage with KV

By default, jobs are stored in memory and reset on deploy. For persistence:

```powershell
cd backend

# Create KV namespace
wrangler kv:namespace create "DB"
wrangler kv:namespace create "DB" --preview

# You'll get output like:
# ✅ Successfully created kv namespace with binding name "DB"
# { binding = "DB", id = "abc123xyz", preview_id = "def456uvw" }
```

Update `backend/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "DB"
id = "abc123xyz"           # Replace with your id
preview_id = "def456uvw"   # Replace with your preview_id
```

Commit and push:
```powershell
git add backend/wrangler.toml
git commit -m "Add KV namespace for persistent storage"
git push
```

✅ **Jobs now persist across deployments!**

---

## 🎯 Summary

| What | Where | How Often |
|------|-------|-----------|
| **API** | https://autobridge-backend.workers.dev/api | ✅ Live 24/7 |
| **Dashboard** | localhost:3002 (dev) | ✅ Auto-connects to live API |
| **Extension** | Chrome/Edge | ✅ Probes live API first |
| **Deployment** | GitHub Actions | ✅ Auto on every push |
| **Logs** | `wrangler tail` | ✅ Real-time streaming |

---

## 🚀 You're Done!

**From now on:**
- ✅ Edit code anywhere
- ✅ `git push`
- ✅ Automatically deployed to Cloudflare (live within 1 minute)
- ✅ No local server to run
- ✅ No manual deploy steps
- ✅ Dashboard & Extension always use latest version

**Your app is now fully serverless with live auto-deploy! 🎉**

---

## Questions?

Check these files for more details:
- [DEPLOY_CLOUDFLARE.md](./DEPLOY_CLOUDFLARE.md) — Manual deployment steps
- [CLOUDFLARE_AUTO_DEPLOY.md](./CLOUDFLARE_AUTO_DEPLOY.md) — Auto-deploy workflow details
- [backend/worker.js](./backend/worker.js) — Live API implementation
- [backend/wrangler.toml](./backend/wrangler.toml) — Cloudflare config
