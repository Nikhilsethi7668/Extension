# 🎯 AUTOBRIDGE LIVE — QUICK ACCESS CARD

## 🌐 Your Live API

**URL**: https://autobridge-backend.dchatpar.workers.dev/api

**Status**: 🟢 ONLINE & TESTED ✅

---

## 🔑 Login Credentials

| User | Password |
|------|----------|
| admin | admin |
| demo | demo |

---

## ⚡ Quick Test Commands

### Health Check
```powershell
curl https://autobridge-backend.dchatpar.workers.dev/api/health
```

### Get Auth Token
```powershell
curl -X POST https://autobridge-backend.dchatpar.workers.dev/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"userId":"admin","password":"admin"}'
```

### List Jobs (requires token)
```powershell
curl -H "Authorization: Bearer YOUR_TOKEN" `
  https://autobridge-backend.dchatpar.workers.dev/api/scrape/jobs
```

---

## 🎨 Dashboard Setup

```powershell
cd admin-dashboard
$env:REACT_APP_API_URL="https://autobridge-backend.dchatpar.workers.dev/api"
npm start
```

Then open: http://localhost:3002

---

## 📱 Extension Setup

Update `ext/popup/popup.js`:
```javascript
const API_CANDIDATES = [
  'https://autobridge-backend.dchatpar.workers.dev/api',
  'http://localhost:3001/api'
];
```

---

## 📚 API Endpoints

- GET `/health` → Status
- POST `/auth/login` → Get token
- POST `/auth/validate` → Verify token
- POST `/scrape/queue` → Queue URLs
- GET `/scrape/jobs` → List jobs
- PATCH `/scrape/jobs/:id` → Update job
- GET `/users` → List users

---

## 🚀 Auto-Deploy Setup (Optional)

Push code to GitHub for automatic deployment on every push:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/autobridge-marketplace.git
git push -u origin main
```

Add 4 secrets to GitHub for auto-deploy.

---

## 📊 Deployment Info

- **Version**: a081ab43-36b1-44eb-8585-84d869935b1b
- **Startup Time**: 29 ms
- **Upload Size**: 224.94 KiB (gzip: 38.62 KiB)
- **Environment**: Production ✅
- **Status**: Active 🟢

---

**API IS LIVE AND READY! 🎉**
