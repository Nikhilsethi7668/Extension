const { ipcRenderer } = require('electron');

// DOM Elements
const apiUrlInput = document.getElementById('apiUrl');
const apiTokenInput = document.getElementById('apiToken');
const pollingIntervalInput = document.getElementById('pollingInterval');
const extensionPathInput = document.getElementById('extensionPath');
const autoStartCheckbox = document.getElementById('autoStart');

const saveConfigBtn = document.getElementById('saveConfig');
const testConnectionBtn = document.getElementById('testConnection');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const lastCheckSpan = document.getElementById('lastCheck');
const vehiclesPostedSpan = document.getElementById('vehiclesPosted');
const errorsSpan = document.getElementById('errors');
const activityLog = document.getElementById('activityLog');

let isRunning = false;

// Initialize
async function init() {
  const config = await ipcRenderer.invoke('get-config');
  
  // Load config into form
  apiUrlInput.value = config.apiUrl || '';
  apiTokenInput.value = config.apiToken || '';
  pollingIntervalInput.value = config.pollingInterval || 5;
  extensionPathInput.value = config.extensionPath || '';
  autoStartCheckbox.checked = config.autoStart || false;
  
  // Load initial status
  await updateStatus();
  
  // Start status polling
  setInterval(updateStatus, 5000);
}

// Update status display
async function updateStatus() {
  const status = await ipcRenderer.invoke('get-status');
  
  isRunning = status.running;
  
  // Update UI
  if (isRunning) {
    statusDot.classList.add('active');
    statusText.textContent = 'Running';
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    statusDot.classList.remove('active');
    statusText.textContent = 'Stopped';
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
  
  // Update stats
  if (status.lastCheck) {
    const date = new Date(status.lastCheck);
    lastCheckSpan.textContent = date.toLocaleTimeString();
  }
  
  vehiclesPostedSpan.textContent = status.vehiclesPosted || 0;
  errorsSpan.textContent = status.errors || 0;
}

// Save configuration
saveConfigBtn.addEventListener('click', async () => {
  const config = {
    apiUrl: apiUrlInput.value,
    apiToken: apiTokenInput.value,
    pollingInterval: parseInt(pollingIntervalInput.value),
    extensionPath: extensionPathInput.value,
    autoStart: autoStartCheckbox.checked
  };
  
  const success = await ipcRenderer.invoke('save-config', config);
  
  if (success) {
    addLogEntry('Configuration saved successfully', 'success');
  } else {
    addLogEntry('Failed to save configuration', 'error');
  }
});

// Test connection
testConnectionBtn.addEventListener('click', async () => {
  addLogEntry('Testing API connection...', 'info');
  testConnectionBtn.disabled = true;
  
  const result = await ipcRenderer.invoke('test-connection');
  
  if (result.success) {
    addLogEntry(result.message, 'success');
  } else {
    addLogEntry(`Connection failed: ${result.message}`, 'error');
  }
  
  testConnectionBtn.disabled = false;
});

// Start automation
startBtn.addEventListener('click', async () => {
  addLogEntry('Starting automation...', 'info');
  startBtn.disabled = true;
  
  try {
    await ipcRenderer.invoke('start-automation');
    addLogEntry('Automation started', 'success');
  } catch (error) {
    addLogEntry(`Failed to start: ${error.message}`, 'error');
    startBtn.disabled = false;
  }
});

// Stop automation
stopBtn.addEventListener('click', async () => {
  addLogEntry('Stopping automation...', 'info');
  stopBtn.disabled = true;
  
  try {
    await ipcRenderer.invoke('stop-automation');
    addLogEntry('Automation stopped', 'info');
  } catch (error) {
    addLogEntry(`Failed to stop: ${error.message}`, 'error');
    stopBtn.disabled = false;
  }
});

// Listen for status updates from main process
ipcRenderer.on('automation-status', (event, status) => {
  addLogEntry(status.message, 'info');
  updateStatus();
});

ipcRenderer.on('vehicle-posted', (event, vehicle) => {
  const message = `Posted: ${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  addLogEntry(message, 'success');
  updateStatus();
});

ipcRenderer.on('automation-error', (event, error) => {
  addLogEntry(`Error: ${error}`, 'error');
  updateStatus();
});

ipcRenderer.on('error', (event, message) => {
  addLogEntry(message, 'error');
});

// Add log entry
function addLogEntry(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  
  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = new Date().toLocaleTimeString();
  
  const msg = document.createElement('span');
  msg.className = 'log-message';
  msg.textContent = message;
  
  entry.appendChild(time);
  entry.appendChild(msg);
  
  // Add to top of log
  activityLog.insertBefore(entry, activityLog.firstChild);
  
  // Keep only last 50 entries
  while (activityLog.children.length > 50) {
    activityLog.removeChild(activityLog.lastChild);
  }
}

// Initialize when DOM is ready
init();
