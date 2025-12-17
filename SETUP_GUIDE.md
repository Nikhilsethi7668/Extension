# How to Load & Use Shifty Auto Lister Extension

## Step 1: Load Extension in Developer Mode

1. Open Chrome and go to **chrome://extensions**
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Navigate to: `C:\Users\dchat\Documents\chromeext\chrome-extension`
5. Click **Select Folder**

✅ Extension will appear in your extensions list

## Step 2: Pin Extension to Toolbar

1. Look for the extension icon in your toolbar (puzzle piece icon)
2. Click the pin icon next to "Shifty Auto Lister"
3. Extension icon now appears in your toolbar

## Step 3: Open Side Panel

**Method 1 - Click Extension Icon:**
- Click the Shifty Auto Lister extension icon in toolbar
- A side panel will open on the right side of your browser

**Method 2 - Keyboard Shortcut:**
- Go to chrome://extensions/shortcuts
- Find "Shifty Auto Lister"
- Set a keyboard shortcut to toggle side panel

## Step 4: Use the Extension

### Login:
- Side panel shows login form
- Enter: `demo` / `demo` to test with demo mode
- Or enter your credentials (requires backend running)

### After Login:
You'll see the control panel with:
- **Vehicle Category** dropdown (Car, Truck, SUV, Van, Motorcycle, Other)
- **Emoji** selector (None, Sparkle, Fire, Star)
- **Distance** radius (20/40/60/100 miles)
- **Where to Post** (FB Marketplace / Groups / Both)
- **A.I. Instructions** with checkboxes
- **Stock Number** field
- **API Key** field
- **Sales Consultant Name** field
- **Load Vehicles** button
- **Posted Vehicles** button
- **Queue** section showing pending posts
- **Activity** log showing recent actions

### Features:
✅ **Login/Logout** - Secure session management
✅ **Right-side Panel** - Persistent browser side panel
✅ **Demo Mode** - Test without backend
✅ **Responsive** - Works on any screen size
✅ **Clean UI** - Modern, organized layout

## Troubleshooting

### Extension won't load?
- Check manifest.json is in the root directory
- Verify all script files exist
- Check Chrome console for errors (F12 → Console)

### Side panel won't open?
- Reload extension (refresh button in extensions page)
- Try clicking extension icon again
- Check if popup.html exists

### Login not working?
- Use `demo` / `demo` for demo mode
- If using real credentials, backend must be running on http://localhost:3001
- Check browser console for error messages

## File Structure:
```
chrome-extension/
├── manifest.json           (Extension configuration)
├── popup/
│   ├── popup.html         (UI layout)
│   ├── popup.css          (Styling)
│   └── popup.js           (Logic & state management)
├── background/
│   └── service-worker.js  (Background tasks)
├── content/
│   ├── facebook-autofill.js
│   ├── facebook-profile-extractor.js
│   └── scrapers/
│       ├── autotrader-scraper.js
│       ├── cars-scraper.js
│       └── cargurus-scraper.js
└── utils/
    └── (utility functions)
```

## Next Steps:
1. ✅ Load extension in developer mode
2. ✅ Open side panel
3. ✅ Test demo login (demo/demo)
4. ✅ Explore all configuration options
5. 🔄 Setup backend (when ready)
6. 🔄 Configure real credentials
7. 🔄 Test vehicle scraping
8. 🔄 Test Facebook posting
