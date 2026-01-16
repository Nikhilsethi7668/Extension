const { ipcRenderer } = require('electron');

// DOM Elements


const logoutBtn = document.getElementById('logoutBtn');

// Chrome Profile Elements
const forceSyncBtn = document.getElementById('forceSyncBtn');
// DB Profile Elements
const refreshDbProfilesBtn = document.getElementById('refreshDbProfilesBtn');
const dbProfilesList = document.getElementById('dbProfilesList');


const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const socketDot = document.getElementById('socketDot');
const socketText = document.getElementById('socketText');

const activityLog = document.getElementById('activityLog');

let isRunning = false;

// Check authentication on load
async function checkAuth() {
  const isAuthenticated = await ipcRenderer.invoke('check-auth');
  if (!isAuthenticated) {
    // Will be redirected by main process
    return false;
  }
  return true;
}

// Initialize
async function init() {
  // Check authentication first
  const authenticated = await checkAuth();
  if (!authenticated) return;

  const config = await ipcRenderer.invoke('get-config');
  

  
  // Load initial status
  await updateStatus();
  
  // Start status polling
  setInterval(updateStatus, 5000);
}

// Update status display
// Update status display
async function updateStatus() {
  const status = await ipcRenderer.invoke('get-status');
  
  isRunning = status.running;
  
  // Update UI (simplified, no buttons)
  if (isRunning) {
    statusDot.classList.add('active');
    statusText.textContent = 'Active';
  } else {
    statusDot.classList.remove('active');
    statusText.textContent = 'Inactive';
  }
}







// Force Sync
if (forceSyncBtn) {
  forceSyncBtn.addEventListener('click', async () => {
    addLogEntry('Uploading profiles to cloud...', 'info');
    forceSyncBtn.disabled = true;
    try {
        await ipcRenderer.invoke('force-sync-profiles');
        addLogEntry('Profiles uploaded successfully', 'success');
        // Refresh the list after sync
        await loadDbProfiles();
    } catch (error) {
        addLogEntry(`Upload failed: ${error.message}`, 'error');
    } finally {
        forceSyncBtn.disabled = false;
    }
  });
}

// DB Profile Logic
async function loadDbProfiles() {
  if (!dbProfilesList) return;
  
  dbProfilesList.innerHTML = '<div class="empty-state">Loading synced profiles...</div>';
  
  if (refreshDbProfilesBtn) refreshDbProfilesBtn.disabled = true;

  try {
    const profiles = await ipcRenderer.invoke('get-db-profiles');
    if (profiles && profiles.length > 0) {
      renderProfiles(profiles, dbProfilesList);
    } else {
      dbProfilesList.innerHTML = '<div class="empty-state">No synced profiles found in database.</div>';
    }
  } catch (error) {
    console.error('Error fetching DB profiles:', error);
    dbProfilesList.innerHTML = '<div class="empty-state error">Failed to load profiles</div>';
  } finally {
    if (refreshDbProfilesBtn) refreshDbProfilesBtn.disabled = false;
  }
}

if (refreshDbProfilesBtn) {
  refreshDbProfilesBtn.addEventListener('click', () => {
    loadDbProfiles();
  });
}

// Modify global init to load DB profiles too
const originalInit = init;
init = async function() {
    await originalInit(); // Call original init
    await loadDbProfiles(); // Fetch DB profiles
};

// Also reuse renderProfiles for both lists if possible
function renderProfiles(profiles, targetElement) {
  targetElement.innerHTML = '';
  
  profiles.forEach(profile => {
    const card = document.createElement('div');
    card.className = 'profile-card';

    const avatar = document.createElement('div');
    avatar.className = 'profile-avatar';
    avatar.textContent = (profile.name || '?').charAt(0).toUpperCase();
    
    const name = document.createElement('div');
    name.className = 'profile-name';
    name.textContent = profile.name;
    
    // For DB profiles, ID might be different, but we mapped it in main.js
    const dir = document.createElement('div');
    dir.className = 'profile-dir';
    dir.textContent = profile.id; 

    const launchBtn = document.createElement('button');
    launchBtn.className = 'btn-launch';
    launchBtn.textContent = '🚀 Launch';
    launchBtn.onclick = async (e) => {
      e.stopPropagation(); 
      addLogEntry(`Launching Chrome profile: ${profile.name}...`, 'info');
      
      const result = await ipcRenderer.invoke('launch-chrome-profile', profile.id);
      if (result.success) {
        addLogEntry(`Launched ${profile.name}`, 'success');
      } else {
        addLogEntry(`Failed to launch ${profile.name}: ${result.message}`, 'error');
      }
    };

    card.appendChild(avatar);
    card.appendChild(name);
    card.appendChild(dir);
    card.appendChild(launchBtn);
    
    targetElement.appendChild(card);
  });
}

// Initialize when DOM is ready (but note we overwrote init above)
// We need to make sure we don't double call or break existing call at line 206
// The simplest way is to just call our logic at the end or inside init.
// Since init() was called at line 206, and we are replacing the CONTENT of the file logic...
// Wait, replacing 'init();' at the bottom is safer.



// Logout
logoutBtn.addEventListener('click', async () => {
  const confirmed = confirm('Are you sure you want to logout?');
  if (confirmed) {
    await ipcRenderer.invoke('logout');
    // Main process will handle navigation to login page
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

// Socket status updates
ipcRenderer.on('socket-status', (event, status) => {
  if (status.connected) {
    socketDot.classList.add('active');
    socketText.textContent = 'Socket: Connected';
    addLogEntry('Socket connected', 'success');
  } else {
    socketDot.classList.remove('active');
    socketText.textContent = 'Socket: Disconnected';
    addLogEntry('Socket disconnected', 'warning');
    if (status.error) {
      addLogEntry(`Socket Error: ${status.error}`, 'error');
    }
  }
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
init().then(() => {
    // After init, also load DB profiles
    loadDbProfiles();
});
