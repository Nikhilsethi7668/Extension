# 🚀 AutoBridge Chrome Extension - Plasmo Setup

## Prerequisites

- Node.js 18+ installed
- Chrome browser
- AutoBridge backend running at: https://autobridge-backend.dchatpar.workers.dev

## Installation Steps

### 1. Install Dependencies

```bash
cd ext
npm install
```

This will install:
- **Plasmo Framework** - Extension build system
- **React + TypeScript** - UI framework
- **Material-UI** - Modern design components
- **Axios** - API communication
- **Google Generative AI** - Image processing

### 2. Configure Environment

Edit `.env` file:

```env
PLASMO_PUBLIC_API_URL=https://autobridge-backend.dchatpar.workers.dev/api
PLASMO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Development Mode

```bash
npm run dev
```

This will:
- Start Plasmo dev server
- Watch for file changes
- Generate `build/chrome-mv3-dev` folder
- Auto-reload extension on changes

### 4. Load Extension in Chrome

1. Open Chrome and navigate to: `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select folder: `ext/build/chrome-mv3-dev`

### 5. Test the Extension

1. Click the AutoBridge icon in Chrome toolbar
2. Side panel opens on the right
3. Login with credentials:
   - **User ID:** admin
   - **Password:** admin
4. Navigate to Facebook Marketplace: https://www.facebook.com/marketplace/create/vehicle
5. Select a vehicle in the side panel
6. Click "Post to Facebook"
7. Extension will fill the form with human-like typing!

## Project Structure

```
ext/
├── sidepanel.tsx              # Main side panel UI (Material UI)
├── background.ts              # Service worker (API routing)
├── contents/
│   └── facebook-marketplace-filler.ts  # Human-mimicry form filler
├── package.json               # Dependencies & Plasmo config
├── tsconfig.json              # TypeScript configuration
├── .env                       # Environment variables
└── README.md                  # This file
```

## Key Features

### 1. **Side Panel UI (Material Design 3.0)**
- Clean, modern interface with gradient backgrounds
- Real-time vehicle inventory from backend
- Three tabs: Ready to Post, Posted, AI Tools
- Toast notifications for user feedback
- Color-coded status indicators

### 2. **Human-Mimicry Form Filler**
- Randomized typing speed (50-200ms per character)
- Simulates occasional typos with corrections
- Natural pauses between fields (500-1500ms)
- Mouse movement simulation
- Proper React event triggering (Facebook's SPA)
- Visual indicator when active

### 3. **AI Image Enhancement**
- Remove backgrounds with Gemini
- Adjust lighting and colors
- Add watermarks
- Batch processing support

### 4. **Backend Integration**
- Secure JWT authentication
- Real-time vehicle sync
- Activity logging
- Status updates (ready → posting → posted)

## API Endpoints Used

```typescript
POST /api/auth/login           // Authentication
GET  /api/vehicles?status=ready // Get vehicles
POST /api/ai/enhance-image     // Image processing
PATCH /api/vehicles/:id/status // Update status
```

## Human-Mimicry Algorithm

```typescript
async function humanType(element, text) {
  for (let char of text) {
    // Random delay: 50-200ms
    const delay = Math.random() * 150 + 50
    
    // 2% chance of typo
    if (Math.random() < 0.02) {
      // Type wrong char, wait, backspace, correct
      element.value += wrongChar
      await sleep(150)
      element.value = element.value.slice(0, -1)
      await sleep(80)
    }
    
    // Type correct character
    element.value += char
    element.dispatchEvent(new Event('input', { bubbles: true }))
    
    await sleep(delay)
  }
}
```

## Building for Production

```bash
npm run build
```

Output: `ext/build/chrome-mv3-prod`

Then:
1. Go to `chrome://extensions`
2. Click **Pack extension**
3. Select `build/chrome-mv3-prod` folder
4. Creates `.crx` file for distribution

## Troubleshooting

### Extension Not Loading
- Check Developer mode is enabled
- Verify folder path is correct (`build/chrome-mv3-dev`)
- Check browser console for errors

### Side Panel Not Opening
- Ensure `sidePanel` permission in manifest
- Try right-clicking extension icon → "Open side panel"
- Check `chrome.sidePanel` API availability (Chrome 114+)

### Form Filler Not Working
- Navigate to Facebook Marketplace create page first
- Check if "AutoBridge Ready" indicator appears
- Open DevTools → Console for error messages
- Verify content script is injected

### API Connection Errors
- Verify backend URL in `.env`
- Check CORS settings on backend
- Ensure token is stored in `chrome.storage.local`
- Test API directly: `curl https://autobridge-backend.dchatpar.workers.dev/api/health`

## Development Tips

### Hot Reload
Plasmo automatically reloads the extension when you save files. If it doesn't:
```bash
# Stop dev server (Ctrl+C)
# Clear build folder
rm -rf build/
# Restart
npm run dev
```

### Debugging
- **Side Panel:** Right-click panel → Inspect
- **Background:** chrome://extensions → Service worker → Inspect
- **Content Script:** F12 on Facebook page → Console

### Testing Without Facebook
Use the test page in `test/marketplace-mock.html`:
```bash
cd test
npx serve .
# Open http://localhost:3000/marketplace-mock.html
```

## Next Steps

1. **Phase 8:** Integrate centralized scraper hub
2. **Phase 9:** Add Chrome profile launcher
3. **Phase 10:** Implement multi-tenant RLS with Supabase

## Support

- Backend API: https://autobridge-backend.dchatpar.workers.dev
- Documentation: `/ENTERPRISE_ARCHITECTURE.md`
- Issues: Check browser console and service worker logs
