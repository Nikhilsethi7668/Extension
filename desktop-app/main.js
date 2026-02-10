const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification } = require('electron');
const { spawn, exec } = require('child_process');
const io = require('socket.io-client');
const path = require('path');
const fs = require('fs');


// Keep a global reference to prevent garbage collection
let mainWindow = null;
let tray = null;
let socket = null;
let isQuitting = false;

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const SESSION_PATH = path.join(app.getPath('userData'), 'session.json');

const AutomationEngine = require('./automation-engine');

// Default configuration
const DEFAULT_CONFIG = {
  apiUrl: 'https://api.flashfender.com/api',
  apiToken: '',
  pollingInterval: 5, // minutes
  autoStart: false,
  extensionPath: '',
  runOnStartup: false,
  rememberMe: false,
  activeProfileId: null // Store selected Chrome profile ID
};

// Update startup settings
// Helper for debug logging
function logToFile(message) {
  try {
    const logPath = path.join(app.getPath('userData'), 'debug_startup.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

ipcMain.handle('log-to-file', (event, message) => {
  logToFile(`[Renderer] ${message}`);
  return true;
});

// Update startup settings (Cross-platform)
function updateStartupSettings(config) {
  const appPath = app.isPackaged ? app.getPath('exe') : process.execPath;

  logToFile(`[Startup] Updating Startup (Cross-platform)`);
  logToFile(`[Startup] Platform: ${process.platform}`);
  logToFile(`[Startup] Mode: ${app.isPackaged ? 'Packaged' : 'Development'}`);
  logToFile(`[Startup] Target State: ${config.runOnStartup}`);
  logToFile(`[Startup] Exe Path: ${appPath}`);

  // Only enable/disable on Windows and macOS (when packaged)
  if (!app.isPackaged) {
    logToFile('[Startup] Skipping startup settings in development mode');
    return;
  }

  if (config.runOnStartup) {
    enableAutoStart(appPath);
  } else {
    disableAutoStart();
  }
}

function enableAutoStart(exePath) {
  try {
    if (process.platform === 'win32') {
      // Windows: Use PowerShell
      const shortcutName = "FlashFenderAutoPoster.lnk";
      const psCommand = `
        $exePath = "${exePath}"
        $shortcutName = "${shortcutName}"
        $startupFolder = "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"
        $shortcutPath = Join-Path $startupFolder $shortcutName
        
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $exePath
        $shortcut.WorkingDirectory = Split-Path $exePath
        $shortcut.Save()
      `;

      logToFile('[Startup] Executing Enable PowerShell script...');
      const ps = spawn('powershell.exe', ['-Command', psCommand]);

      ps.stdout.on('data', (data) => {
        logToFile(`[Startup-PS] ${data.toString()}`);
      });

      ps.stderr.on('data', (data) => {
        logToFile(`[Startup-PS-ERR] ${data.toString()}`);
      });

      ps.on('close', (code) => {
        logToFile(`[Startup] Enable script finished with code ${code}`);
      });
    } else if (process.platform === 'darwin') {
      // macOS: Use Login Items (Electron app.setLoginItemSettings)
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: false
      });
      logToFile('[Startup] Enabled auto-start on macOS');
    } else {
      logToFile('[Startup] Auto-start not supported on this platform');
    }
  } catch (error) {
    logToFile(`[Startup] Error enabling auto-start: ${error.message}`);
    console.error('[Startup] Error enabling auto-start:', error);
  }
}

function disableAutoStart() {
  try {
    if (process.platform === 'win32') {
      // Windows: Use PowerShell
      const shortcutName = "FlashFenderAutoPoster.lnk";
      const psCommand = `
        $shortcutName = "${shortcutName}"
        $startupFolder = "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"
        $shortcutPath = Join-Path $startupFolder $shortcutName
        
        if (Test-Path $shortcutPath) {
          Remove-Item $shortcutPath -Force
          Write-Host "Shortcut removed."
        } else {
          Write-Host "Shortcut not found, nothing to remove."
        }
      `;

      logToFile('[Startup] Executing Disable PowerShell script...');
      const ps = spawn('powershell.exe', ['-Command', psCommand]);

      ps.stdout.on('data', (data) => {
        logToFile(`[Startup-PS] ${data.toString()}`);
      });

      ps.stderr.on('data', (data) => {
        logToFile(`[Startup-PS-ERR] ${data.toString()}`);
      });

      ps.on('close', (code) => {
        logToFile(`[Startup] Disable script finished with code ${code}`);
      });
    } else if (process.platform === 'darwin') {
      // macOS: Use Login Items
      app.setLoginItemSettings({
        openAtLogin: false
      });
      logToFile('[Startup] Disabled auto-start on macOS');
    } else {
      logToFile('[Startup] Auto-start not supported on this platform');
    }
  } catch (error) {
    logToFile(`[Startup] Error disabling auto-start: ${error.message}`);
    console.error('[Startup] Error disabling auto-start:', error);
  }
}

// Load configuration
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      const savedConfig = JSON.parse(data);

      // Check if saved API URL matches default - if not, force reset
      if (savedConfig.apiUrl !== DEFAULT_CONFIG.apiUrl) {
        console.log('API URL changed, resetting config and session...');
        clearSession();
        fs.unlinkSync(CONFIG_PATH);
        return DEFAULT_CONFIG;
      }

      const finalConfig = { ...DEFAULT_CONFIG, ...savedConfig };

      // Apply startup settings
      updateStartupSettings(finalConfig);

      return finalConfig;
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return DEFAULT_CONFIG;
}

// Save configuration
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

    // Update automation engine config if it exists
    if (automationEngine) {
      automationEngine.updateConfig(config);
    }

    // Update startup settings
    updateStartupSettings(config);

    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
}

// Load session
function loadSession() {
  try {
    if (fs.existsSync(SESSION_PATH)) {
      const data = fs.readFileSync(SESSION_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading session:', error);
  }
  return null;
}

// Save session
function saveSession(session) {
  try {
    fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving session:', error);
    return false;
  }
}

// Clear session
function clearSession() {
  try {
    if (fs.existsSync(SESSION_PATH)) {
      fs.unlinkSync(SESSION_PATH);
    }
    return true;
  } catch (error) {
    console.error('Error clearing session:', error);
    return false;
  }
}

// Check if user is authenticated
function isAuthenticated() {
  const session = loadSession();
  return session && session.isAuthenticated;
}

// Create the main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false
  });

  // Load login or dashboard based on authentication
  const authenticated = isAuthenticated();
  if (authenticated) {
    mainWindow.loadFile('dashboard.html');
  } else {
    mainWindow.loadFile('login.html');
  }

  // Handle window close
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();

      // Show notification on first minimize
      if (Notification.isSupported()) {
        new Notification({
          title: 'Flash Fender Auto-Poster',
          body: 'App is running in the background. Click the tray icon to open.'
        }).show();
      }
    }
    return false;
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });
}

// Create system tray
function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);

  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  tray.setToolTip('Flash Fender Auto-Poster');
}

// Update tray menu based on automation status
function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Flash Fender Auto-Poster',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => {
        mainWindow.show();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}



// IPC Handlers

// Authentication handlers
ipcMain.handle('validate-login', async (event, credentials) => {
  const axios = require('axios');

  console.log('=== LOGIN VALIDATION ===');
  console.log('API URL:', credentials.apiUrl);
  console.log('API Key provided:', credentials.apiToken ? 'Yes' : 'No');

  try {
    // Use the same endpoint as the extension: /auth/dashboard-api-login
    console.log('Testing connection to:', `${credentials.apiUrl}/auth/dashboard-api-login`);

    const response = await axios.post(`${credentials.apiUrl}/auth/dashboard-api-login`, {
      apiKey: credentials.apiToken  // Send as apiKey in body, like the extension does
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });

    console.log('Login successful! Response status:', response.status);
    console.log('Received JWT token:', response.data.token ? 'Yes' : 'No');

    // If successful, save session and config with the JWT token
    const session = {
      isAuthenticated: true,
      loginTime: new Date().toISOString()
    };

    const config = loadConfig();
    const newConfig = {
      ...config,
      apiUrl: credentials.apiUrl,
      apiToken: response.data.token,  // Store the JWT token, not the API key
      apiKey: credentials.apiToken,   // Also store the API key for reference
      rememberMe: credentials.rememberMe
    };

    saveSession(session);
    saveConfig(newConfig);

    // Initialize socket connection
    startSync();

    // Navigate to dashboard
    if (mainWindow) {
      mainWindow.loadFile('dashboard.html');
    }

    return { success: true };
  } catch (error) {
    console.error('Login failed!');
    console.error('Error message:', error.message);
    console.error('Response status:', error.response?.status);
    console.error('Response data:', error.response?.data);

    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Invalid API key'
    };
  }
});

ipcMain.handle('check-auth', () => {
  return isAuthenticated();
});

ipcMain.handle('logout', () => {
  clearSession();
  stopSync();

  // Stop automation on logout
  if (automationEngine) {
    automationEngine.stop();
  }

  // Navigate to login page
  if (mainWindow) {
    mainWindow.loadFile('login.html');
  }

  return { success: true };
});

ipcMain.handle('get-saved-credentials', () => {
  const config = loadConfig();
  if (config.rememberMe) {
    return {
      apiUrl: config.apiUrl,
      apiToken: config.apiKey || config.apiToken, // Return original API key if possible
      rememberMe: true
    };
  }
  return {
    apiUrl: config.apiUrl,
    apiToken: '',
    rememberMe: false
  };
});

// Configuration handlers
ipcMain.handle('get-config', () => {
  return loadConfig();
});

ipcMain.handle('save-config', (event, config) => {
  logToFile(`[IPC] save-config called. runOnStartup=${config.runOnStartup}`);
  return saveConfig(config);
});

// Profile Selection Handlers
ipcMain.handle('set-active-profile', async (event, profileId) => {
  const config = loadConfig();
  config.activeProfileId = profileId;
  saveConfig(config);

  if (automationEngine && automationEngine.isRunning()) {
    // Maybe restart logic if needed, or just update config (which we did in saveConfig)
    // automationEngine.updateConfig(config) was called in saveConfig
  }

  return { success: true };
});

ipcMain.handle('get-active-profile', () => {
  const config = loadConfig();
  return config.activeProfileId;
});

ipcMain.handle('test-connection', async () => {
  const config = loadConfig();
  const axios = require('axios');

  try {
    const response = await axios.get(`${config.apiUrl}/vehicles`, {
      headers: {
        'Authorization': `Bearer ${config.apiToken}`
      },
      timeout: 5000
    });
    return { success: true, message: 'Connection successful!' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// Automation State
let automationEngine = null;

// Automation Handlers
ipcMain.handle('get-status', () => {
  if (automationEngine) {
    return automationEngine.getStatus();
  }
  return { running: false, lastCheck: null, vehiclesPosted: 0, errors: 0 };
});

ipcMain.handle('start-automation', () => {
  console.log('Starting automation...');
  const config = loadConfig();

  if (!automationEngine) {
    automationEngine = new AutomationEngine(config);

    // Relay events to renderer
    automationEngine.on('status', (status) => {
      if (mainWindow) mainWindow.webContents.send('automation-status', status);
    });

    automationEngine.on('vehicle-posted', (vehicle) => {
      if (mainWindow) mainWindow.webContents.send('vehicle-posted', vehicle);
    });

    automationEngine.on('error', (error) => {
      if (mainWindow) mainWindow.webContents.send('automation-error', error);
    });
  }

  automationEngine.start();
  return { success: true };
});

ipcMain.handle('stop-automation', () => {
  console.log('Stopping automation...');
  if (automationEngine) {
    automationEngine.stop();
  }
  return { success: true };
});

ipcMain.handle('get-socket-status', () => {
  return {
    connected: socket && socket.connected,
    error: null
  };
});

// Chrome Profile Management
function getChromeProfiles() {
  try {
    let userDataPath;

    // Determine Chrome user data path based on platform
    if (process.platform === 'win32') {
      userDataPath = path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data');
    } else if (process.platform === 'darwin') {
      userDataPath = path.join(process.env.HOME, 'Library', 'Application Support', 'Google', 'Chrome');
    } else if (process.platform === 'linux') {
      userDataPath = path.join(process.env.HOME, '.config', 'google-chrome');
    } else {
      console.error('Unsupported platform for Chrome profiles');
      return [];
    }

    const localStatePath = path.join(userDataPath, 'Local State');

    if (!fs.existsSync(localStatePath)) {
      console.error('Chrome Local State file not found at:', localStatePath);
      console.log('Searched in:', userDataPath);
      return [];
    }

    const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
    const profiles = localState.profile.info_cache;

    const profileList = [];
    for (const [key, value] of Object.entries(profiles)) {
      profileList.push({
        id: key, // e.g., "Profile 1" or "Default"
        name: value.name, // e.g., "Person 1"
        shortcut_name: value.shortcut_name,
        avatar_icon: value.avatar_icon
      });
    }

    console.log(`Found ${profileList.length} Chrome profiles on ${process.platform}`);
    return profileList;
  } catch (error) {
    console.error('Error getting Chrome profiles:', error);
    return [];
  }
}

ipcMain.handle('get-chrome-profiles', () => {
  return getChromeProfiles();
});



const launchedProfiles = new Map();

function launchChromeProfile(profileDir) {
  try {
    console.log(`Launching Chrome profile: ${profileDir} on ${process.platform}`);

    let executable;

    // Find Chrome executable based on platform
    if (process.platform === 'win32') {
      const chromePath = path.join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe');
      const chromePath86 = path.join(process.env["ProgramFiles(x86)"], 'Google', 'Chrome', 'Application', 'chrome.exe');

      if (fs.existsSync(chromePath)) {
        executable = chromePath;
      } else if (fs.existsSync(chromePath86)) {
        executable = chromePath86;
      } else {
        throw new Error('Chrome executable not found on Windows');
      }
    } else if (process.platform === 'darwin') {
      // macOS Chrome path
      executable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

      if (!fs.existsSync(executable)) {
        throw new Error('Chrome not found. Please install Google Chrome.');
      }
    } else if (process.platform === 'linux') {
      // Linux - try common locations
      const linuxPaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser'
      ];

      for (const chromePath of linuxPaths) {
        if (fs.existsSync(chromePath)) {
          executable = chromePath;
          break;
        }
      }

      if (!executable) {
        throw new Error('Chrome/Chromium not found on Linux');
      }
    } else {
      throw new Error(`Unsupported platform: ${process.platform}`);
    }

    console.log(`Using Chrome executable: ${executable}`);

    const child = spawn(executable, [`--profile-directory=${profileDir}`], {
      detached: true,
      stdio: 'ignore'
    });

    // Track the process
    launchedProfiles.set(profileDir, child);

    child.on('exit', (code) => {
      console.log(`Profile ${profileDir} exited with code ${code}`);
      launchedProfiles.delete(profileDir);
    });

    child.unref(); // Allow the app to keep running independently

    return { success: true };
  } catch (error) {
    console.error('Error launching Chrome:', error);
    throw error;
  }
}

ipcMain.handle('launch-chrome-profile', (event, profileDir) => {
  try {
    return launchChromeProfile(profileDir);
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-db-profiles', async () => {
  const config = loadConfig();
  if (!config.apiToken) return [];

  const axios = require('axios');
  try {
    // Get local profiles to filter the request
    const localProfiles = getChromeProfiles();
    const localIds = localProfiles.map(p => p.id).join(',');

    const response = await axios.get(`${config.apiUrl}/chrome-profiles`, {
      params: { ids: localIds },
      headers: {
        'Authorization': `Bearer ${config.apiToken}`
      },
      timeout: 5000
    });

    // Transform DB format to dashboard format if needed
    // DB: { uniqueId, name, ... } -> Dashboard: { id, name, ... }
    return response.data.map(p => ({
      id: p.uniqueId,
      name: p.name,
      shortcut_name: p.shortcutName,
      avatar_icon: p.avatarIcon
    }));
  } catch (error) {
    console.error('Error fetching DB profiles:', error.message);
    return [];
  }
});


ipcMain.handle('upload-profiles', async (event, profiles) => {
  await uploadProfiles(profiles);
  return { success: true };
});

ipcMain.handle('delete-db-profile', async (event, profileId) => {
  const config = loadConfig();
  if (!config.apiToken) return { success: false, message: 'Not authenticated' };

  const axios = require('axios');
  try {
    await axios.delete(`${config.apiUrl}/chrome-profiles/${profileId}`, {
      headers: {
        'Authorization': `Bearer ${config.apiToken}`
      },
      timeout: 5000
    });
    return { success: true };
  } catch (error) {
    console.error('Error deleting profile:', error.message);
    return { success: false, message: error.message };
  }
});

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // App lifecycle
  app.whenReady().then(() => {
    createWindow();
    createTray();

    // Auto-start if configured
    const config = loadConfig();

    // Re-enable socket connection on startup if authenticated
    if (isAuthenticated()) {
      console.log('User authenticated on startup, connecting socket...');
      startSync();
    }
  });

  app.on('window-all-closed', (event) => {
    // Don't quit on window close, keep running in tray
    event.preventDefault();
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

// Socket.IO Logic
let socketListenersAttached = false; // Flag to prevent duplicate listeners

function connectSocket() {
  const config = loadConfig();
  const session = loadSession();

  if (!config.apiToken || !session || !session.isAuthenticated) return;
  if (socket && socket.connected) {
    console.log('[Socket] Already connected, skipping...');
    return;
  }

  // Dynamic socket URL from config
  const apiUrl = new URL(config.apiUrl);
  // Socket.IO usually connects to the root, not /api
  const socketUrl = `${apiUrl.protocol}//${apiUrl.hostname}${apiUrl.port ? ':' + apiUrl.port : ''}`;
  console.log('DEBUG: connectSocket socketUrl:', socketUrl);

  try {
    const debugPath = path.join(app.getPath('userData'), 'debug.txt');
    fs.appendFileSync(debugPath, `${new Date().toISOString()} - Socket URL (HARDCODED): ${socketUrl}\n`);
    console.log('Debug log written to:', debugPath);
  } catch (e) {
    console.error('Failed to write debug log:', e);
  }

  // Disconnect old socket if exists to prevent duplicate connections
  if (socket) {
    console.log('[Socket] Disconnecting old socket before creating new one...');
    socket.removeAllListeners(); // Remove all old listeners
    socket.disconnect();
    socket = null;
    socketListenersAttached = false;
  }

  socket = io(socketUrl, { // Hardcoded URL
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 10000,
    reconnectionDelayMax: 10000,
    auth: {
      clientType: 'desktop'
    },
    extraHeaders: {
      'Authorization': `Bearer ${config.apiToken}`
    }
  });

  // Only attach listeners once
  if (!socketListenersAttached) {
    console.log('[Socket] Attaching event listeners...');
    socketListenersAttached = true;

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection Error:', error);
      if (mainWindow) {
        mainWindow.webContents.send('socket-status', { connected: false, error: error.message });
      }
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected to server');
      if (mainWindow) {
        mainWindow.webContents.send('socket-status', { connected: true });
      }

      // We need to join the organization room.
      // Since we don't have the org ID readily available in config/session, 
      // we can either fetch it or just emit an event that the server uses `req.user` to handle.
      // The server code: `socket.on('join-organization', (orgId) => ...)`
      // We need the orgId.

      // Quick fetch of user details to get Org ID
      const axios = require('axios');
      const apiUrl = config.apiUrl;
      axios.get(`${apiUrl}/auth/validate-key`, {
        headers: { 'Authorization': `Bearer ${config.apiToken}` }
      }).then(response => {
        const user = response.data; // validate-key returns user object directly, not wrapped in data.data usually?
        // Let's check auth.routes.js: res.json({ _id, ... }) -> yes, direct object.
        // But axios response structure is data: { ...user }
        // Wait, previous code used response.data.data?
        // auth.routes.js: res.json({ ... })
        // Axios: response.data = object

        const orgId = user.organization?._id || user.organization;
        if (orgId) {
          // Register as desktop client
          socket.emit('register-client', { orgId, userId: user._id, clientType: 'desktop' });
          console.log(`[Socket] Registered as desktop client for org: ${orgId}, user: ${user._id}`);
        }
      }).catch(err => console.error('[Socket] Failed to fetch user details for room join:', err.message));
    });

    socket.on('image-generation-complete', (data) => {
      console.log('[Socket] Image Generation Complete:', data);

      // System Notification
      if (Notification.isSupported()) {
        const title = data.success ? 'Image Generation Successful' : 'Image Generation Failed';
        const body = data.success ? 'Your vehicle image is ready.' : (data.error || 'Unknown error');

        new Notification({ title, body }).show();
      }

      // Forward to renderer
      if (mainWindow) {
        mainWindow.webContents.send('image-generation-complete', data);
      }
    });

    socket.on('launch-browser-profile', async (data) => {
      console.log('[Socket] Received launch-browser-profile event:', data);
      const { profileId } = data;

      if (!profileId) {
        console.error('[Socket] Invalid profile data received');
        return;
      }

      // Show notification
      if (Notification.isSupported()) {
        new Notification({
          title: 'Browser Launch Triggered',
          body: `Opening Chrome Profile: ${profileId}`
        }).show();
      }

      try {
        launchChromeProfile(profileId);
      } catch (error) {
        console.error('[Socket] Launch failed:', error);
        if (Notification.isSupported()) {
          new Notification({
            title: 'Launch Failed',
            body: error.message
          }).show();
        }
      }
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected');
      if (mainWindow) {
        mainWindow.webContents.send('socket-status', { connected: false });
      }
      socketListenersAttached = false; // Reset flag on disconnect
    });
  } else {
    console.log('[Socket] Listeners already attached, skipping...');
  }
}

function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    socketListenersAttached = false; // Reset flag
    console.log('[Socket] Disconnected and listeners removed');
  }
}

// Profile Sync Logic
// Profile Upload Logic (Explicit)
async function uploadProfiles(profiles) {
  const config = loadConfig();
  if (!config.apiToken) return;

  if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
    console.error('[Upload] No profiles provided for upload.');
    return;
  }

  console.log(`[Upload] Uploading ${profiles.length} profiles:`, profiles.map(p => p.name).join(', '));

  const axios = require('axios');
  const apiUrl = config.apiUrl;

  try {
    // Backend now accepts ONLY one profile at a time at /add
    // We must loop and send individually
    for (const profile of profiles) {
      await axios.post(`${apiUrl}/chrome-profiles/add`, profile, {
        headers: {
          'Authorization': `Bearer ${config.apiToken}`
        }
      });
      console.log(`[Upload] Successfully uploaded: ${profile.name}`);
    }
  } catch (error) {
    console.error('[Upload] Failed to upload profiles:', error.message);
  }
}

// Sync Interval (5 minutes)
let syncInterval = null;

// Start sync when app is ready or login status changes
// Start sync when app is ready or login status changes
function startSync() {
  if (syncInterval) clearInterval(syncInterval);
  connectSocket();
}

// Stop sync
function stopSync() {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = null;
  disconnectSocket();
}

// Hook into app lifecycle and auth
// REMOVED: Automatic startSync() triggers to prevent auto-upload
// All sync/upload operations must now be explicitly triggered by user action
/*
const originalCreateWindow = createWindow;
createWindow = function () {
  originalCreateWindow();
  if (isAuthenticated()) {
    startSync();
  }
}

const originalSaveSession = saveSession;
saveSession = function (session) {
  const res = originalSaveSession(session);
  if (session.isAuthenticated) {
    startSync();
  }
  return res;
};

const originalClearSession = clearSession;
clearSession = function () {
  const res = originalClearSession();
  stopSync();
  return res;
};

app.on('ready', () => {
  if (isAuthenticated()) {
    startSync();
  }
});
*/
