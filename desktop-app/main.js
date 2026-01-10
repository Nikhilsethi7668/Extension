const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const AutomationEngine = require('./automation-engine');

// Keep a global reference to prevent garbage collection
let mainWindow = null;
let tray = null;
let automationEngine = null;
let isQuitting = false;

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// Default configuration
const DEFAULT_CONFIG = {
  apiUrl: 'http://66.94.120.78:5573/api',
  apiToken: '',
  pollingInterval: 5, // minutes
  autoStart: false,
  extensionPath: '',
  runOnStartup: false
};

// Load configuration
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
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
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
}

// Create the main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false
  });

  mainWindow.loadFile('index.html');

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
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
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
  const isRunning = automationEngine && automationEngine.isRunning();
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Flash Fender Auto-Poster',
      enabled: false
    },
    { type: 'separator' },
    {
      label: isRunning ? 'Running' : 'Stopped',
      enabled: false,
      icon: isRunning 
        ? nativeImage.createFromPath(path.join(__dirname, 'assets', 'status-active.png')).resize({ width: 12, height: 12 })
        : nativeImage.createFromPath(path.join(__dirname, 'assets', 'status-inactive.png')).resize({ width: 12, height: 12 })
    },
    { type: 'separator' },
    {
      label: isRunning ? 'Stop Automation' : 'Start Automation',
      click: () => {
        if (isRunning) {
          stopAutomation();
        } else {
          startAutomation();
        }
      }
    },
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

// Start automation
async function startAutomation() {
  const config = loadConfig();
  
  if (!config.apiToken) {
    if (mainWindow) {
      mainWindow.webContents.send('error', 'Please configure API token first');
      mainWindow.show();
    }
    return;
  }
  
  if (!automationEngine) {
    automationEngine = new AutomationEngine(config);
    
    // Setup event listeners
    automationEngine.on('status', (status) => {
      if (mainWindow) {
        mainWindow.webContents.send('automation-status', status);
      }
      updateTrayMenu();
    });
    
    automationEngine.on('vehicle-posted', (vehicle) => {
      if (mainWindow) {
        mainWindow.webContents.send('vehicle-posted', vehicle);
      }
      
      if (Notification.isSupported()) {
        new Notification({
          title: 'Vehicle Posted',
          body: `Successfully posted: ${vehicle.year} ${vehicle.make} ${vehicle.model}`
        }).show();
      }
    });
    
    automationEngine.on('error', (error) => {
      if (mainWindow) {
        mainWindow.webContents.send('automation-error', error.message);
      }
    });
  }
  
  await automationEngine.start();
  updateTrayMenu();
}

// Stop automation
async function stopAutomation() {
  if (automationEngine) {
    await automationEngine.stop();
    updateTrayMenu();
  }
}

// IPC Handlers
ipcMain.handle('get-config', () => {
  return loadConfig();
});

ipcMain.handle('save-config', (event, config) => {
  return saveConfig(config);
});

ipcMain.handle('start-automation', async () => {
  await startAutomation();
  return { success: true };
});

ipcMain.handle('stop-automation', async () => {
  await stopAutomation();
  return { success: true };
});

ipcMain.handle('get-status', () => {
  if (automationEngine) {
    return automationEngine.getStatus();
  }
  return { running: false, lastCheck: null, vehiclesPosted: 0 };
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

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();
  
  // Auto-start if configured
  const config = loadConfig();
  if (config.autoStart) {
    setTimeout(() => startAutomation(), 2000);
  }
});

app.on('window-all-closed', (event) => {
  // Don't quit on window close, keep running in tray
  event.preventDefault();
});

app.on('before-quit', () => {
  isQuitting = true;
  if (automationEngine) {
    automationEngine.stop();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
