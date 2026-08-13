# Flash Fender Auto-Poster Desktop App

A desktop application for automated vehicle posting to Facebook Marketplace. This app runs continuously on your PC, monitors your Flash Fender API for pending vehicles, and automatically posts them using your browser extension.

## Features

✨ **Continuous Monitoring** - Automatically checks for new vehicles at configurable intervals
🖥️ **System Tray Integration** - Runs quietly in the background
⚡ **Automated Posting** - Uses Puppeteer to control Chrome with your extension
📊 **Real-time Stats** - Track posting activity and status
🔐 **Secure Configuration** - Store your API credentials locally
🎯 **Simple UI** - Easy-to-use configuration interface

## Installation

### Prerequisites

- Windows 10 or later
- Google Chrome installed
- Flash Fender browser extension
- Valid API token from your Flash Fender account

### Setup

1. **Download** the installer from the releases page or build from source
2. **Install** the application by running the installer
3. **Configure** your API settings:
   - Launch the app from the Start Menu
   - Enter your API URL (default: `http://66.94.120.78:5573/api`)
   - Enter your API authentication token
   - (Optional) Set custom extension path if not using default location
   - Click "Save Configuration"
4. **Test Connection** to verify your settings
5. **Start Automation** to begin monitoring

## Usage

### Starting the App

- Launch from Start Menu: `Flash Fender Auto-Poster`
- The app will appear in your system tray (bottom-right corner)

### Configuration

| Setting | Description |
|---------|-------------|
| **API URL** | Your Flash Fender backend API endpoint |
| **API Token** | Authentication token from your account |
| **Check Interval** | How often to poll for new vehicles (1-60 minutes) |
| **Extension Path** | Custom path to extension (leave empty for default) |
| **Auto-start** | Start automation automatically when app launches |

### Managing Automation

**Start/Stop:**
- Click the buttons in the app window, or
- Right-click the system tray icon

**Monitoring:**
- View real-time stats in the dashboard
- Check the activity log for detailed information
- Receive desktop notifications for successful posts

### System Tray

The app runs in your system tray when minimized:

- **Green dot** = Automation running
- **Red dot** = Automation stopped
- **Right-click** tray icon for quick actions

## How It Works

```
1. App polls your API every N minutes
2. Fetches vehicles with status "scraped"
3. Launches Chrome with Flash Fender extension
4. Navigates to Facebook Marketplace
5. Sends vehicle data to extension
6. Extension fills and submits the form
7. App marks vehicle as "posted" in your API
8. Repeats for all pending vehicles
```

## Building from Source

### Install Dependencies

```bash
cd desktop-app
npm install
```

### Development

Run in development mode:
```bash
npm start
```

### Build Installer

Create Windows installer:
```bash
npm run build
```

The installer will be created in `desktop-app/dist/`

## Troubleshooting

### "Chrome not found" error
- Ensure Google Chrome is installed in the default location
- Try specifying a custom Chrome path in the configuration

### "Extension not found" error
- Verify the extension path in settings
- Default path: `../extension` (relative to app location)
- Use absolute path if needed: `C:\path\to\Extension\extension`

### Connection failed
- Verify your API URL is correct
- Check that your API token is valid
- Ensure your API server is running

### Automation not starting
- Make sure you've saved your configuration
- Test the connection first
- Check the activity log for error messages

## FAQ

**Q: Does the app need to stay open?**
A: No, it can run minimized to the system tray.

**Q: Can I run multiple instances?**
A: No, only one instance per PC is recommended.

**Q: Will it work offline?**
A: No, it requires internet connection to communicate with your API and Facebook.

**Q: How do I update the app?**
A: Download and install the latest version - your settings will be preserved.

## Support

For issues or questions:
- Check the activity log for error details
- Review your API server logs
- Ensure Facebook account is logged in when browser launches

## License

This software is part of the Flash Fender ecosystem.

---

**Version:** 1.0.0  
**Last Updated:** January 2026
