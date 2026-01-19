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

// Local Profile Elements
const localProfilesList = document.getElementById('localProfilesList');
const refreshLocalProfilesBtn = document.getElementById('refreshLocalProfilesBtn');
const uploadSelectedBtn = document.getElementById('uploadSelectedBtn');

let isRunning = false;
let currentActiveProfileId = null;
let localProfilesData = [];

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
  await checkSocketStatus(); // Check socket status immediately
  
  // Start status polling
  setInterval(updateStatus, 5000);
}

// Check initial socket status
async function checkSocketStatus() {
    try {
        const status = await ipcRenderer.invoke('get-socket-status');
        if (status.connected) {
            socketDot.classList.add('active');
            socketText.textContent = 'Socket: Connected';
            addLogEntry('Socket status synced: Connected', 'success');
        }
    } catch (e) {
        console.error('Failed to check socket status:', e);
    }
}

// Update status display
async function updateStatus() {
  const status = await ipcRenderer.invoke('get-status');
  
  isRunning = status.running;
  
  // Update UI
  if (isRunning) {
    statusDot.classList.add('active');
    statusText.textContent = 'Active';
  } else {
    statusDot.classList.remove('active');
    statusText.textContent = 'Inactive';
  }
}

// Force Sync (Legacy/Hidden)
if (forceSyncBtn) {
  forceSyncBtn.addEventListener('click', async () => {
    addLogEntry('Uploading profiles to cloud...', 'info');
    forceSyncBtn.disabled = true;
    try {
        await ipcRenderer.invoke('force-sync-profiles');
        addLogEntry('Profiles uploaded successfully', 'success');
        await loadDbProfiles();
    } catch (error) {
        addLogEntry(`Upload failed: ${error.message}`, 'error');
    } finally {
        forceSyncBtn.disabled = false;
    }
  });
}

// DB Profile Logic (Cloud Profiles)
async function loadDbProfiles() {
  if (!dbProfilesList) return;
  
  dbProfilesList.innerHTML = '<div class="empty-state">Loading saved profiles...</div>';
  
  if (refreshDbProfilesBtn) refreshDbProfilesBtn.disabled = true;

  try {
    const [profiles, activeId] = await Promise.all([
      ipcRenderer.invoke('get-db-profiles'),
      ipcRenderer.invoke('get-active-profile')
    ]);

    currentActiveProfileId = activeId;

    if (profiles && profiles.length > 0) {
      renderCloudProfiles(profiles, dbProfilesList);
    } else {
      dbProfilesList.innerHTML = '<div class="empty-state">No saved profiles in cloud. Upload some from Local Profiles.</div>';
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

async function setActiveProfile(profileId) {
    try {
        await ipcRenderer.invoke('set-active-profile', profileId);
        currentActiveProfileId = profileId;
        addLogEntry(`Selected profile: ${profileId}`, 'success');
        
        // Re-render to update UI
        const profiles = await ipcRenderer.invoke('get-db-profiles');
        renderCloudProfiles(profiles, dbProfilesList);
    } catch (error) {
        addLogEntry(`Failed to set active profile: ${error.message}`, 'error');
    }
}

function renderCloudProfiles(profiles, targetElement) {
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
      
      const dir = document.createElement('div');
      dir.className = 'profile-dir';
      dir.textContent = profile.id; 
  
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'profile-actions';

      const launchBtn = document.createElement('button');
      launchBtn.className = 'btn-launch';
      launchBtn.textContent = '🚀 Launch';
      launchBtn.title = 'Launch Chrome with this profile';
      launchBtn.onclick = async (e) => {
        e.stopPropagation(); 
        addLogEntry(`Launching Chrome profile: ${profile.name}...`, 'info');
        showToast(`Launching ${profile.name}...`, 'info');
        
        const result = await ipcRenderer.invoke('launch-chrome-profile', profile.id);
        if (result.success) {
          addLogEntry(`Launched ${profile.name}`, 'success');
        } else {
          addLogEntry(`Failed to launch ${profile.name}: ${result.message}`, 'error');
          showToast(`Launch failed: ${result.message}`, 'error');
        }
      };

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove';
      removeBtn.innerHTML = '🗑️'; // Trash icon
      removeBtn.title = 'Remove from Cloud';
      removeBtn.onclick = async (e) => {
          e.stopPropagation();
          if (confirm(`Are you sure you want to remove "${profile.name}" from your cloud account?`)) {
              try {
                  const res = await ipcRenderer.invoke('delete-db-profile', profile.id);
                  if (res.success) {
                      showToast('Profile removed', 'success');
                      loadDbProfiles(); // Refresh list
                  } else {
                      showToast(`Failed to remove: ${res.message}`, 'error');
                  }
              } catch (err) {
                  showToast(`Error: ${err.message}`, 'error');
              }
          }
      };
      
      actionsDiv.appendChild(launchBtn);
      actionsDiv.appendChild(removeBtn);

      card.appendChild(avatar);
      card.appendChild(name);
      card.appendChild(dir);
      card.appendChild(actionsDiv);
      
      targetElement.appendChild(card);
    });
}

// Local Profile Logic
async function loadLocalProfiles() {
    if (!localProfilesList) return;
    localProfilesList.innerHTML = '<div class="empty-state">Scanning local profiles...</div>';
    
    try {
        const profiles = await ipcRenderer.invoke('get-chrome-profiles');
        localProfilesData = profiles; // Store for lookup
        
        if (profiles && profiles.length > 0) {
            renderLocalProfiles(profiles);
        } else {
            localProfilesList.innerHTML = '<div class="empty-state">No Chrome profiles found on this computer.</div>';
        }
    } catch (error) {
        console.error('Error loading local profiles:', error);
        localProfilesList.innerHTML = '<div class="empty-state error">Failed to scan profiles</div>';
        showToast('Failed to scan local profiles', 'error');
    }
}

function renderLocalProfiles(profiles) {
    localProfilesList.innerHTML = '';
    profiles.forEach(profile => {
        const card = document.createElement('div');
        card.className = 'profile-card';
        
        // Avatar
        const avatar = document.createElement('div');
        avatar.className = 'profile-avatar';
        avatar.textContent = (profile.name || '?').charAt(0).toUpperCase();

        // Details
        const name = document.createElement('div');
        name.className = 'profile-name';
        name.textContent = profile.name;

        const dir = document.createElement('div');
        dir.className = 'profile-dir';
        dir.textContent = profile.id;

        // Actions
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'profile-actions';

        const uploadBtn = document.createElement('button');
        uploadBtn.className = 'btn-launch';
        uploadBtn.textContent = '☁️ Upload';
        uploadBtn.title = 'Upload this profile to cloud';
        uploadBtn.onclick = async (e) => {
            e.stopPropagation();
            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Uploading...';
            
            try {
                await ipcRenderer.invoke('upload-profiles', [profile]);
                showToast(`Successfully uploaded ${profile.name}`, 'success');
                await loadDbProfiles(); // Refresh cloud profiles
            } catch (error) {
                showToast(`Upload failed: ${error.message}`, 'error');
            } finally {
                uploadBtn.disabled = false;
                uploadBtn.textContent = '☁️ Upload';
            }
        };

        actionsDiv.appendChild(uploadBtn);

        card.appendChild(avatar);
        card.appendChild(name);
        card.appendChild(dir);
        card.appendChild(actionsDiv);

        localProfilesList.appendChild(card);
    });
}

if (refreshLocalProfilesBtn) {
    refreshLocalProfilesBtn.addEventListener('click', async () => {
        await loadLocalProfiles();
        showToast('Local profiles refreshed', 'info');
    });
}


// Logout
logoutBtn.addEventListener('click', async () => {
  const confirmed = confirm('Are you sure you want to logout?');
  if (confirmed) {
    await ipcRenderer.invoke('logout');
  }
});

// Toast Notifications
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return; // Guard

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) container.removeChild(toast);
        }, 300);
    }, 3000);
}

// IPC Listeners
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
  showToast(message, 'error');
});

ipcRenderer.on('socket-status', (event, status) => {
  if (status.connected) {
    socketDot.classList.add('active');
    socketText.textContent = 'Connected';
    addLogEntry('Socket connected', 'success');
  } else {
    socketDot.classList.remove('active');
    socketText.textContent = 'Disconnected';
    addLogEntry('Socket disconnected', 'warning');
    if (status.error) {
      addLogEntry(`Socket Error: ${status.error}`, 'error');
    }
  }
});

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
  
  activityLog.insertBefore(entry, activityLog.firstChild);
  
  while (activityLog.children.length > 50) {
    activityLog.removeChild(activityLog.lastChild);
  }
}

// Start
init().then(() => {
    loadDbProfiles();
    loadLocalProfiles();
});
