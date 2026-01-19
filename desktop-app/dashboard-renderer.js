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
  await loadProfiles(); // Load Unified Profiles
  
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
// Force Sync (Legacy/Hidden) - DISABLED
/*
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
*/

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

// Profile Elements
const refreshProfilesBtn = document.getElementById('refreshProfilesBtn');
const profilesList = document.getElementById('profilesList');
const profileCountBadge = document.getElementById('profileCountBadge');
const showAllProfilesCheckbox = document.getElementById('showAllProfilesCheckbox');

let allLocalProfiles = [];
let dbProfilesMap = new Map(); // Map ID -> Profile Data

// Load all profiles (Local + Cloud status)
async function loadProfiles() {
    if (!profilesList) return;
    
    // Only show loading state if regular refresh (not silent update)
    // profilesList.innerHTML = '<div class="empty-state">Loading profiles...</div>'; 
    // ^ Maybe keep existing content and just overlay specific updates? For now, simple reload.
    if (profilesList.children.length === 0 || profilesList.querySelector('.empty-state')) {
         profilesList.innerHTML = '<div class="empty-state">Scanning profiles...</div>';
    }
    
    if (refreshProfilesBtn) refreshProfilesBtn.disabled = true;

    try {
        const [localProfiles, dbProfiles] = await Promise.all([
            ipcRenderer.invoke('get-chrome-profiles'),
            ipcRenderer.invoke('get-db-profiles')
        ]);
        
        allLocalProfiles = localProfiles || [];
        
        // Create a map for fast lookup of synced profiles
        dbProfilesMap = new Map();
        if (dbProfiles && Array.isArray(dbProfiles)) {
            dbProfiles.forEach(p => dbProfilesMap.set(p.id, p));
        }

        renderProfiles();

    } catch (error) {
        console.error('Error loading profiles:', error);
        profilesList.innerHTML = '<div class="empty-state error">Failed to load profiles</div>';
        showToast('Failed to load profiles', 'error');
    } finally {
        if (refreshProfilesBtn) refreshProfilesBtn.disabled = false;
    }
}

function renderProfiles() {
    if (!profilesList) return;
    
    const showAll = showAllProfilesCheckbox ? showAllProfilesCheckbox.checked : false;
    
    // Filter logic:
    // If showAll is true: Show ALL local profiles.
    // If showAll is false: Show ONLY profiles that Match DB (Synced) OR we could default to showing all?
    // User originally asked for filtered view. 
    // "keep only 1 profile section and in it give upload option..." implies showing unsynced ones so they CAN be uploaded.
    // So default should probably be "Show All" or at least "Show All Local" creates the list.
    // The previous logic was: "Local Profiles" (filtered by checkbox) and "Cloud Profiles".
    // Now we have one list. 
    // If I hide unsynced profiles, I can't upload them!
    // So "Show All" might mean "Show profiles even if they are not in the main subset?"
    // Actually, usually "Local Profiles" means ALL valid Chrome profiles found.
    // Let's assume we show ALL local profiles by default, and maybe "Show All" means something else? 
    // Or maybe the checkbox is no longer needed if we have one unified clean list?
    // User: "in it give upload option". This means I MUST see unsynced profiles.
    // So I will render `allLocalProfiles`.
    // What if there are cloud profiles NOT on this machine? They won't show up here if I iterate `allLocalProfiles`.
    // But this is "Desktop App" managing "Local Chrome". Cloud profiles are useful for syncing TO other machines.
    // If I want to "Download" a profile? That's complex (can't easily create Chrome profile from data).
    // So highlighting "Synced" is the key.
    
    // Checkbox logic: Previous user request was "filtered view for local profiles" (Show All vs Synced Only).
    // I will keep that logic: Unchecked = Show only Synced. Checked = Show All.
    // BUT! If I uncheck it, I can't upload new ones. 
    // Defaulting to CHECKED (Show All) might be better, or just removing the checkbox if the user wants single section.
    // I'll keep the checkbox but default it to true? Or just implement logic.
    
    let profilesToShow = allLocalProfiles;
    
    // Optional: Filter if checkbox is unchecked? 
    if (!showAll) {
         // If unchecked, maybe show only Synced ones? 
         // But then how do I find new ones? 
         // Let's respect the visual toggle:
         // If user wants to see "Synced Only", they uncheck.
         // If they want to "Upload", they check "Show All".
         profilesToShow = allLocalProfiles.filter(p => dbProfilesMap.has(p.id));
    } else {
        profilesToShow = allLocalProfiles;
    }
    
    // Update count
    if (profileCountBadge) {
        profileCountBadge.textContent = `${dbProfilesMap.size} Synced / ${allLocalProfiles.length} Local`;
    }

    profilesList.innerHTML = '';
    
    if (profilesToShow.length === 0) {
        profilesList.innerHTML = '<div class="empty-state">No profiles found. Try "Show All" or Refresh.</div>';
        return;
    }

    profilesToShow.forEach(profile => {
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

        const isSynced = dbProfilesMap.has(profile.id);

        if (isSynced) {
             // Synced State
            const syncedBadge = document.createElement('span');
            syncedBadge.className = 'badge-synced';
            syncedBadge.textContent = '✅ Synced';
            syncedBadge.style.marginRight = '10px';
            syncedBadge.style.color = '#4CAF50';
            syncedBadge.style.fontWeight = 'bold';
            syncedBadge.style.fontSize = '0.9em';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-remove';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'Remove from Cloud (Un-sync)';
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm(`Remove "${profile.name}" from Cloud? This will un-sync it.`)) {
                    try {
                        const res = await ipcRenderer.invoke('delete-db-profile', profile.id);
                        if (res.success) {
                            showToast('Profile un-synced', 'success');
                            loadProfiles(); // Refresh
                        } else {
                            showToast(`Failed: ${res.message}`, 'error');
                        }
                    } catch (err) {
                        showToast(`Error: ${err.message}`, 'error');
                    }
                }
            };

            actionsDiv.appendChild(syncedBadge);
            actionsDiv.appendChild(deleteBtn);

        } else {
            // Unsynced State
            const uploadBtn = document.createElement('button');
            uploadBtn.className = 'btn-launch'; // Reusing style
            uploadBtn.textContent = '☁️ Upload';
            uploadBtn.title = 'Upload to Cloud';
            uploadBtn.onclick = async (e) => {
                e.stopPropagation();
                uploadBtn.disabled = true;
                uploadBtn.textContent = '...';
                
                try {
                    await ipcRenderer.invoke('upload-profiles', [profile]);
                    showToast(`Uploaded ${profile.name}`, 'success');
                    loadProfiles(); // Refresh
                } catch (error) {
                    showToast(`Upload failed: ${error.message}`, 'error');
                    uploadBtn.disabled = false;
                    uploadBtn.textContent = '☁️ Upload';
                }
            };
            
            actionsDiv.appendChild(uploadBtn);
        }

        card.appendChild(avatar);
        card.appendChild(name);
        card.appendChild(dir);
        card.appendChild(actionsDiv);

        profilesList.appendChild(card);
    });
}

// Event Listeners
if (refreshProfilesBtn) {
    refreshProfilesBtn.addEventListener('click', () => {
        loadProfiles();
        showToast('Refreshing profiles...', 'info');
    });
}

if (showAllProfilesCheckbox) {
    showAllProfilesCheckbox.addEventListener('change', () => {
        renderProfiles();
    });
}

// Update init to use new function
const originalInit = init;
init = async function() {
    // We can't easily hook init if it's defined in scope.
    // But we are replacing the code block.
    // Let's just redefine init() or ensure we call loadProfiles inside the replacement if we replaced init.
    // Wait, I am NOT replacing init() in this block.
    // I am replacing lines 225-355 (Local Profile Logic).
    // I need to make sure `loadProfiles` is called instead of `loadLocalProfiles`.
    // `init` calls `loadLocalProfiles`? No, `init` isn't shown in range 225-355.
    // `init` was at the top of the file.
    // I'll need to update `init` separately or assume it calls `loadLocalProfiles` which I've removed?
    // If I remove `loadLocalProfiles`, `init` (lines 40-53) will crash.
    // So I must define `loadLocalProfiles` as an alias or update `init`.
    // I will add the alias for backward compatibility or update `init` in another pass.
    // Better: redefine `loadLocalProfiles` to call `loadProfiles` as a shim?
    // Or just search/replace `loadLocalProfiles` with `loadProfiles` in `init`?
    // Let's add the alias here to be safe:
    loadLocalProfiles = loadProfiles; 
    loadDbProfiles = loadProfiles;
};

// ... Wait, I can't assign to const/function declarartion if it was hoisted?
// Functions are hoisted.
// If valid JS, I can just leave the function `loadProfiles` and then...
// Actually, I should just rename `loadProfiles` to `loadLocalProfiles` (or `initProfiles`) 
// and handle everything there, to avoid changing `init`.
// BUT `init` calls `checkSocketStatus` and `updateStatus`. It doesn't seem to call `loadLocalProfiles` in the snippet I saw earlier? 
// Checking snippet lines 40-53... `await updateStatus(); await checkSocketStatus(); ... setInterval...`
// Beep. `init` DOES NOT call `loadLocalProfiles` in the code I viewed earlier (Step 146).
// Where is it called? 
// Maybe it wasn't called on init? 
// Ah, `loadLocalProfiles` was likely called manually or by something I missed.
// Wait, looking at Step 146, `init` function (lines 40-53) DOES NOT call `loadLocalProfiles`.
// So it must be called elsewhere? Or maybe I added it in a previous turn and missed it?
// Step 4 in history: "Updated `loadLocalProfiles` to fetch both..."
// But when is it called? 
// Ah, I see `refreshLocalProfilesBtn` click handler.
// Is it called on load?
// Maybe I should add a call to `loadProfiles()` at the end of the file or in `init`.
// I will verify `init` again.

// Regardless, I will add `loadProfiles()` call to `init` or just run it.
// I will keep the function name `loadProfiles`.

// Let's check `init` again.



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
init();
