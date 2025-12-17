# Cloudflare Workers Auto-Deploy Setup

## 🔧 One-Time Setup (GitHub Actions)

### Step 1: Get Cloudflare Credentials
```powershell
# Get your Cloudflare Account ID
wrangler whoami

# Create API Token
# Go to: https://dash.cloudflare.com/profile/api-tokens
# Create token with "Edit Cloudflare Workers" scope
```

### Step 2: Add GitHub Secrets
In your GitHub repository:
1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add these secrets:

| Secret | Value |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | Your API token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Your Account ID from step 1 |
| `GEMINI_API_KEY` | Your Gemini API key |
| `JWT_SECRET` | A strong random secret (e.g., `$(openssl rand -base64 32)`) |

### Step 3: Push to Deploy
```powershell
# Make a change and push
git add .
git commit -m "Update: add feature X"
git push origin main
```

✅ GitHub Actions automatically deploys to Cloudflare!

---

## 📍 Live API URL
```
https://autobridge-backend.workers.dev/api
```

## ✨ What Happens on Push

1. **GitHub Actions** detects push to `backend/`
2. **Builds** the worker
3. **Deploys** to Cloudflare Workers instantly
4. **Live immediately** — no downtime!

## 🔄 Live Reload Feature

The worker supports:
- ✅ Automatic redeployment on code changes
- ✅ Zero downtime updates
- ✅ Real-time config changes via Wrangler secrets
- ✅ KV namespace persistence (data survives deploys)

## 📊 Monitor Live Deployments

```powershell
# Watch live logs
wrangler tail

# Or visit dashboard
https://dash.cloudflare.com → Workers → autobridge-backend
```

## 🆘 Troubleshooting

### "Permission denied" error
→ Regenerate API token with correct scopes

### Changes not appearing
→ Check GitHub Actions tab for failed runs

### Need to deploy manually
```powershell
cd backend
npm run deploy
```

## 🔐 Security Notes

- Never commit `.env` files (they're in `.gitignore`)
- Secrets are stored in GitHub, not in code
- API token has limited scopes (Workers only)
- Consider rotating API token quarterly

---

**From now on:** Just edit, commit, and push — Cloudflare handles the rest! 🚀
