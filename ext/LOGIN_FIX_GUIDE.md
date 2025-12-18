# 🔧 Extension Login Fix & Testing Guide

## Issue Identified
The extension wasn't logging in due to:
1. ❌ Using `process.env.PLASMO_PUBLIC_API_URL` which doesn't work in browser context
2. ❌ Insufficient error handling in login flow
3. ❌ Missing console logging for debugging

## ✅ Fixes Applied

### 1. Hardcoded API URL
**Before:**
```typescript
const API_URL = process.env.PLASMO_PUBLIC_API_URL || "..."
```

**After:**
```typescript
const API_URL = "https://autobridge-backend.dchatpar.workers.dev/api"
console.log("AutoBridge Sidepanel - API URL:", API_URL)
```

### 2. Enhanced Error Handling
```typescript
const handleLogin = async () => {
  try {
    console.log("Attempting login to:", `${API_URL}/auth/login`)
    const response = await axios.post(`${API_URL}/auth/login`, {...})
    
    if (response.data.success && response.data.token) {
      // Success flow
    } else {
      throw new Error(response.data.message || "No token received")
    }
  } catch (error: any) {
    console.error("Login error:", error)
    const errorMsg = error.response?.data?.message || error.message
    showSnackbar("Login failed: " + errorMsg, "error")
  }
}
```

### 3. Added Console Logging
- Login attempt URL
- User ID being sent
- Full response data
- Error details

---

## 🧪 Testing Instructions

### Test 1: Backend API (Verified ✅)

```bash
# Health check
curl https://autobridge-backend.dchatpar.workers.dev/api/health
# Result: {"status":"ok","timestamp":"2025-12-18T01:40:32.042Z"}

# Login test
curl -X POST https://autobridge-backend.dchatpar.workers.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userId":"admin","password":"admin"}'
# Result: Token received successfully
```

**Status:** ✅ Backend is working perfectly

---

### Test 2: Standalone Login Page

Open the test file directly in browser:

```bash
cd ext
# Open in browser
start test-login.html
```

**What to check:**
- [ ] API URL displays correctly
- [ ] Click "Sign In" button
- [ ] Should see green success box with token
- [ ] Check browser console (F12) for logs

**Expected Result:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "userId": "admin",
  "role": "admin",
  "email": "admin@shifty.com"
}
```

---

### Test 3: Extension Development Build

**Step 1: Install Dependencies**
```bash
cd ext
npm install
```

This installs:
- plasmo (extension framework)
- react + react-dom
- @mui/material (Material UI)
- axios (HTTP client)
- TypeScript types

**Step 2: Build Extension**
```bash
npm run dev
```

This will:
- Start development server
- Generate `build/chrome-mv3-dev` folder
- Watch for file changes
- Enable hot reload

**Step 3: Load in Chrome**
1. Open Chrome
2. Navigate to: `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select folder: `C:\Users\dchat\Documents\facebookmark\ext\build\chrome-mv3-dev`

**Step 4: Test Login Flow**
1. Click AutoBridge icon in Chrome toolbar
2. Side panel opens on the right
3. Should see login form with:
   - User ID field (prefilled: admin)
   - Password field (prefilled: admin)
   - Blue gradient "Sign In" button
4. Click "Sign In"
5. Check browser console (F12) for logs:
   ```
   AutoBridge Sidepanel - API URL: https://autobridge-backend.dchatpar.workers.dev/api
   Attempting login to: https://autobridge-backend.dchatpar.workers.dev/api/auth/login
   User ID: admin
   Login response: {success: true, token: "...", ...}
   ```
6. Should see green toast: "Login successful!"
7. Should switch to vehicle list view

---

## 🐛 Troubleshooting

### Issue: Extension won't load
**Solution:**
```bash
# Clear build folder
rm -rf build/
# Reinstall dependencies
npm install
# Rebuild
npm run dev
```

### Issue: "net::ERR_BLOCKED_BY_CLIENT"
**Cause:** Ad blocker blocking request  
**Solution:** Disable ad blocker for Chrome extensions

### Issue: CORS error in console
**Cause:** Backend CORS not configured  
**Solution:** Already fixed - backend has:
```javascript
'Access-Control-Allow-Origin': '*'
'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
'Access-Control-Allow-Headers': 'Content-Type, Authorization'
```

### Issue: "Cannot read property 'token' of undefined"
**Cause:** Response structure mismatch  
**Solution:** Already fixed - now checks:
```typescript
if (response.data.success && response.data.token) {
  // Use token
}
```

### Issue: Login button does nothing
**Check:**
1. Open DevTools (F12)
2. Look for console errors
3. Check Network tab for API call
4. Verify response status (should be 200)

---

## 📊 Expected Console Output

### Successful Login:
```
AutoBridge Sidepanel - API URL: https://autobridge-backend.dchatpar.workers.dev/api
Attempting login to: https://autobridge-backend.dchatpar.workers.dev/api/auth/login
User ID: admin
Login response: {
  success: true,
  token: "eyJhbGc...",
  userId: "admin",
  role: "admin",
  email: "admin@shifty.com"
}
```

### Failed Login:
```
AutoBridge Sidepanel - API URL: https://autobridge-backend.dchatpar.workers.dev/api
Attempting login to: https://autobridge-backend.dchatpar.workers.dev/api/auth/login
User ID: wrong_user
Login error: AxiosError: Request failed with status code 401
```

---

## 🚀 Quick Start Commands

```bash
# From project root
cd ext

# Install (first time only)
npm install

# Development (with hot reload)
npm run dev

# Production build
npm run build

# Test standalone login
start test-login.html
```

---

## 📝 Files Modified

1. **ext/sidepanel.tsx**
   - Hardcoded API URL
   - Enhanced error handling
   - Added console logging

2. **ext/background.ts**
   - Hardcoded API URL
   - Added logging

3. **ext/test-login.html** (NEW)
   - Standalone login test
   - No extension needed
   - Tests API directly

---

## ✅ Verification Checklist

- [x] Backend health check working
- [x] Backend login endpoint working
- [x] API URL hardcoded in extension
- [x] Error handling improved
- [x] Console logging added
- [x] CORS headers configured
- [x] Test file created
- [ ] Extension dependencies installed
- [ ] Extension builds successfully
- [ ] Extension loads in Chrome
- [ ] Login works in extension

---

## 🎯 Next Steps

1. **Test standalone login page** - Verify API connection
2. **Build extension** - Run `npm run dev`
3. **Load in Chrome** - Test full login flow
4. **If login works** - Proceed to vehicle list testing
5. **If login fails** - Check console logs and report specific error

---

**Backend Version:** 98f24ee8-ec28-43aa-ad37-8ebaa597ed24  
**Status:** ✅ Ready for testing
