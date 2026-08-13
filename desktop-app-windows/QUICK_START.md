# Flash Fender Auto-Poster - Quick Start Guide

## Installation

1. **Navigate to the app directory:**
   ```bash
   cd desktop-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   This will install Electron, Puppeteer, and other required packages.

3. **Run the app:**
   ```bash
   npm start
   ```

## First-Time Setup

1. When the app launches, configure your settings:
   - **API URL**: `http://66.94.120.78:5573/api` (default)
   - **API Token**: Your authentication token from Flash Fender
   - **Check Interval**: 5 minutes (recommended)
   - **Extension Path**: Leave empty to use default (`../extension`)

2. Click **"Save Configuration"**

3. Click **"Test Connection"** to verify your API is accessible

4. Click **"Start Automation"** to begin monitoring

## Daily Usage

- The app will minimize to your system tray (bottom-right corner)
- Right-click the tray icon to start/stop automation or open the dashboard
- Desktop notifications will appear when vehicles are posted
- Keep the app running in the background for continuous automation

## Building Installer (Optional)

To create a Windows installer for distribution:

```bash
npm run build
```

The installer will be created in `desktop-app/dist/`

## Troubleshooting

**"Chrome not found"**: Install Google Chrome in the default location

**"Extension not found"**: Verify the extension folder is at `c:\Users\itsad\Desktop\PlexDubai\Extension\extension`

**Connection failed**: Check API URL and token, ensure API server is running

## Support

Check the activity log in the app for detailed error messages.
