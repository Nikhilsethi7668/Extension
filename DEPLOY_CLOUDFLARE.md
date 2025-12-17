# Deploy AutoBridge to Cloudflare Workers

## Prerequisites

1. **Cloudflare Account** - Sign up at https://dash.cloudflare.com
2. **Node.js** - v18+ installed
3. **Wrangler CLI** - Cloudflare's deployment tool

## Setup Steps

### 1. Install Wrangler
```powershell
npm install -g wrangler
```

### 2. Authenticate with Cloudflare
```powershell
wrangler login
```
This opens a browser to authorize the CLI with your Cloudflare account.

### 3. Create KV Namespace (for persistent data storage)
```powershell
wrangler kv:namespace create "DB"
wrangler kv:namespace create "DB" --preview
```
Copy the namespace IDs output and add them to `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "DB"
id = "YOUR_KV_NAMESPACE_ID"
preview_id = "YOUR_KV_PREVIEW_ID"
```

### 4. Set Environment Variables
```powershell
# Development
wrangler secret put GEMINI_API_KEY
# Paste your Gemini API key

wrangler secret put JWT_SECRET
# Enter: dev-secret-key-change-in-production
```

### 5. Install Dependencies
```powershell
cd c:\Users\dchat\Documents\facebookmark\backend
npm install
```

### 6. Test Locally
```powershell
npm run dev
```
Visit: `http://localhost:8787/api/health`

### 7. Deploy to Cloudflare
```powershell
npm run deploy
```

Your API is now live at: `https://autobridge-backend.workers.dev`

## Dashboard Configuration

Update the admin dashboard to point to the Cloudflare Workers URL:

```powershell
# Terminal
cd c:\Users\dchat\Documents\facebookmark\admin-dashboard
$env:REACT_APP_API_URL="https://autobridge-backend.workers.dev/api"
npm start
```

Or in `.env.local`:
```
REACT_APP_API_URL=https://autobridge-backend.workers.dev/api
```

## Extension Configuration

Update the extension popup to probe the Cloudflare URL. Edit `ext/popup/popup.js`:

```javascript
const API_CANDIDATES = [
  'https://autobridge-backend.workers.dev/api',
  'http://localhost:3001/api',
  'http://localhost:3000/api'
];
```

## Storage Notes

- **In-memory storage**: Data resets on deployment (suitable for demo/testing)
- **Persistent storage**: Use KV namespace (included in `worker.js`)
- **Database**: Upgrade to use Cloudflare D1 (SQLite) for production

## Monitoring

View logs:
```powershell
wrangler tail
```

View dashboard:
```
https://dash.cloudflare.com/ → Workers → autobridge-backend
```

## Limitations & Considerations

| Feature | Status | Notes |
|---------|--------|-------|
| **Request Timeout** | 30 seconds | Some heavy scrapes may timeout |
| **Memory** | ~128 MB | Sufficient for API + scraping |
| **Requests/month** | 10M free | Generous free tier |
| **Scaling** | Automatic | Serverless autoscaling |
| **WebSockets** | Not supported | Use webhooks/polling instead |
| **File Upload** | Limited to 100 MB | Works for image uploads |

## Troubleshooting

### "Error: Not authenticated"
- Ensure you ran `wrangler login`
- Check your Cloudflare account permissions

### "KV namespace not found"
- Run `wrangler kv:namespace create "DB"`
- Update `wrangler.toml` with correct IDs

### "Request timeout"
- Cloudflare Workers has 30-second limit
- Optimize scraping or use background jobs (Durable Objects)

## Production Checklist

- [ ] Set strong `JWT_SECRET` in wrangler secrets
- [ ] Add custom domain (e.g., `api.yourdomain.com`)
- [ ] Enable KV namespace for persistence
- [ ] Setup error monitoring (Sentry, Axiom, etc.)
- [ ] Test all scraping endpoints
- [ ] Configure CORS for production domain
- [ ] Add rate limiting middleware
- [ ] Monitor costs on Cloudflare dashboard
