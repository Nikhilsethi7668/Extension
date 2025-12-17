# 🎯 AutoBridge Live Deployment — Quick Reference Card

## You're Here Now ✅
- ✅ Git repository initialized
- ✅ Initial commit made
- ✅ GitHub Actions workflow ready (`.github/workflows/deploy.yml`)
- ✅ Cloudflare Workers handler ready (`backend/worker.js`)
- ✅ Cloudflare config ready (`backend/wrangler.toml`)

## 3 Steps to Live Auto-Deploy

### Step 1️⃣: Create GitHub Repository
```bash
# Create new repo at https://github.com/new
# Then in PowerShell:
git remote add origin https://github.com/YOUR_USERNAME/autobridge-marketplace.git
git push -u origin main
```

### Step 2️⃣: Add 4 GitHub Secrets
Go to: **GitHub Repo** → **Settings** → **Secrets and variables** → **Actions**

| Secret Name | Get From | Command |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | https://dash.cloudflare.com/profile/api-tokens | Create token: "Edit Cloudflare Workers" |
| `CLOUDFLARE_ACCOUNT_ID` | PowerShell | `cd backend; wrangler whoami` |
| `GEMINI_API_KEY` | https://aistudio.google.com/app/apikey | Create API key |
| `JWT_SECRET` | Generate random | `[convert]::ToBase64String((1..32 \| % {[byte](Get-Random -Max 256)}))` |

### Step 3️⃣: Verify Deployment
After secrets are added and you push code:
1. Go to GitHub repo → **Actions** tab
2. Wait for workflow to complete (usually 1-2 min)
3. Test API: `curl https://autobridge-backend.workers.dev/api/health`
4. Response: `{"status":"ok","message":"Cloudflare Workers API running"}`

---

## Live Deployment Workflow

### Every Time You Make Changes:
```powershell
# 1. Edit code anywhere in the project
# 2. Commit and push
git add .
git commit -m "Your change description"
git push

# 3. GitHub Actions automatically:
#    - Installs dependencies
#    - Deploys to Cloudflare
#    - ✅ API is LIVE within 60 seconds
```

### Monitor Deployment:
```powershell
# View GitHub Actions logs
# https://github.com/YOUR_USERNAME/autobridge-marketplace/actions

# Or view live worker logs in real-time:
cd backend
wrangler tail --follow
```

---

## API Endpoints (Live on Cloudflare)

All endpoints live at: **`https://autobridge-backend.workers.dev/api`**

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Check API status |
| `/auth/login` | POST | Login (email + password) |
| `/auth/validate` | POST | Verify JWT token |
| `/scrape/queue` | POST | Submit URLs to scrape |
| `/scrape/jobs` | GET | Get all scrape jobs |
| `/scrape/jobs/:id` | PATCH | Update job / assign to user |

---

## Dashboard & Extension Config

### Dashboard (React)
```bash
cd admin-dashboard
$env:REACT_APP_API_URL="https://autobridge-backend.workers.dev/api"
npm start
```

### Extension (Chrome)
In `ext/popup/popup.js`, update:
```javascript
const API_CANDIDATES = [
  'https://autobridge-backend.workers.dev/api',  // Cloudflare (primary)
  'http://localhost:3001/api'                    // Fallback
];
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| GitHub Actions fails | Check repository secrets are added (4 of them) |
| 403 Cloudflare error | Verify CLOUDFLARE_API_TOKEN has "Edit Workers" scope |
| API returns 404 | Make sure URL ends with `/api` (e.g., `/api/health`) |
| Workers shows "quota exceeded" | You have free tier limits; check Cloudflare dashboard |
| In-memory data resets on deploy | Create KV namespace for persistence (see CLOUDFLARE_LIVE_SETUP.md) |

---

## Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/deploy.yml` | GitHub Actions auto-deploy workflow |
| `backend/worker.js` | Cloudflare Workers API handler |
| `backend/wrangler.toml` | Cloudflare configuration |
| `CLOUDFLARE_LIVE_SETUP.md` | Detailed setup guide |
| `validate-deployment.ps1` | Check deployment prerequisites |

---

## Commands You'll Use

```powershell
# Daily workflow
git add .
git commit -m "Change description"
git push                    # ← This triggers auto-deploy!

# Monitor deployment
wrangler tail              # View live logs

# Manual deploy (rare)
wrangler deploy worker.js  # Deploy to Cloudflare

# Validate everything is ready
.\validate-deployment.ps1
```

---

## Your API is Live! 🚀

- **URL**: https://autobridge-backend.workers.dev
- **Auto-deploy**: On every `git push`
- **Uptime**: 24/7 (Cloudflare infrastructure)
- **Latency**: <100ms globally
- **Scaling**: Automatic (serverless)

**No manual deployment. No local server. Just push code. Live in 60 seconds.** ✨

---

**Questions?** See [CLOUDFLARE_LIVE_SETUP.md](./CLOUDFLARE_LIVE_SETUP.md)
