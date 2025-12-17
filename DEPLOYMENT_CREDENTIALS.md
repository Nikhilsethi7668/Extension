# 🚀 AUTOBRIDGE — DEPLOYMENT CREDENTIALS

## Your 4 GitHub Secrets (Ready to Add)

Copy and paste these into GitHub repository secrets:

### Secret 1: CLOUDFLARE_API_TOKEN
```
VgYdYdCg7U9EG6wnycIF8fqJeumNX0oCfktBrAMd
```

### Secret 2: CLOUDFLARE_ACCOUNT_ID
```
9269f304c042e14181e08bf8ee7aa4f9
```

### Secret 3: GEMINI_API_KEY
```
AIzaSyDIppAEzjWBwutpPYN243xVsRPjywERoa8
```

### Secret 4: JWT_SECRET
```
GHTcRcPG5CJwQH5vUxrffHeZhlwYWGj+QEQPdalhOlU=
```

---

## 📋 Steps to Deploy

### Step 1: Create GitHub Repo
```
→ https://github.com/new
→ Name: autobridge-marketplace
→ Make it Public
→ Create
```

### Step 2: Get HTTPS URL
Copy the HTTPS URL from GitHub repo page

### Step 3: Push Code
```powershell
cd c:\Users\dchat\Documents\facebookmark
git remote add origin https://github.com/YOUR_USERNAME/autobridge-marketplace.git
git branch -M main
git push -u origin main
```

### Step 4: Add GitHub Secrets
Go to: GitHub Repo → Settings → Secrets and variables → Actions

Add these 4 secrets:
1. `CLOUDFLARE_API_TOKEN` = VgYdYdCg7U9EG6wnycIF8fqJeumNX0oCfktBrAMd
2. `CLOUDFLARE_ACCOUNT_ID` = 9269f304c042e14181e08bf8ee7aa4f9
3. `GEMINI_API_KEY` = AIzaSyDIppAEzjWBwutpPYN243xVsRPjywERoa8
4. `JWT_SECRET` = GHTcRcPG5CJwQH5vUxrffHeZhlwYWGj+QEQPdalhOlU=

---

## ✅ After Deployment

**API URL**: `https://autobridge-backend.workers.dev/api`

**Default Login**:
- Username: `admin`
- Password: `admin`

---

## 🎯 Test Endpoints

```powershell
# 1. Check health
curl https://autobridge-backend.workers.dev/api/health

# 2. Login (get token)
curl -X POST https://autobridge-backend.workers.dev/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"userId":"admin","password":"admin"}'

# 3. Validate token
curl -X POST https://autobridge-backend.workers.dev/api/auth/validate `
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## 📝 Configuration Files Ready

- ✅ `.github/workflows/deploy.yml` — Auto-deploy on push
- ✅ `backend/worker.js` — Cloudflare API handler
- ✅ `backend/wrangler.toml` — Cloudflare config
- ✅ `backend/package.json` — Dependencies

---

**Ready to deploy! Push to GitHub and watch it go live. ✨**
