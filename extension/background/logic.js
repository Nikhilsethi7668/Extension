
console.log('Service Worker Logic Starting...');

// Logic from service-worker.js, assuming CONFIG and io are already loaded globally

const BACKEND_URL = (typeof CONFIG !== 'undefined' && CONFIG.backendUrl) ? CONFIG.backendUrl : 'https://api.flashfender.com/api';
// Socket.IO Setup
let socket = null;

function initializeSocket(token = null, apiKey = null) {
  if (socket && socket.connected) return;

  const authData = {};
  if (token) authData.token = token;
  if (apiKey) authData.apiKey = apiKey;

  // No auth data? Can't connect properly usually, but let's try or return
  if (!token && !apiKey) return;

  // Remove /api from BACKEND_URL for socket connection
  const socketUrl = BACKEND_URL.replace('/api', '');

  console.log('Initializing Socket.IO connection to:', socketUrl);

  // Check for io availability (should be bundled now)
  if (typeof io === 'undefined') {
      console.error('Socket.IO library STILL not loaded. Bundling failed?');
      return;
  }

  try {
      // @ts-ignore
      socket = io(socketUrl, {
          transports: ['websocket', 'polling'],
          auth: authData,
          reconnection: true,
          reconnectionDelay: 5000
      });

      socket.on('connect', () => {
          console.log('[Extension] Socket connected:', socket.id);
      });

      socket.on('disconnect', () => {
          console.log('[Extension] Socket disconnected');
      });

      // Listen for 'start-posting-vehicle' event
      socket.on('start-posting-vehicle', (data) => {
          console.log('[Extension] Received start-posting-vehicle:', data);
          
          showNotification('Auto-Posting Started', `Posting vehicle: ${data.vehicleId}`);

          chrome.tabs.query({ url: "https://www.facebook.com/marketplace/create/vehicle*" }, (tabs) => {
              if (tabs && tabs.length > 0) {
                  const tabId = tabs[0].id;
                  chrome.tabs.update(tabId, { active: true });
                  
                  if (data.vehicleData) {
                    handleFillFormWithTestData(data.vehicleData, tabId);
                  } else {
                    handleFillFormWithTestData(data, tabId); 
                  }
              } else {
                 chrome.tabs.create({ url: "https://www.facebook.com/marketplace/create/vehicle" }, (tab) => {
                     setTimeout(() => {
                         if (data.vehicleData) {
                             handleFillFormWithTestData(data.vehicleData, tab.id);
                         } else {
                             handleFillFormWithTestData(data, tab.id);
                         }
                     }, 5000);
                 });
              }
          });
      });

  } catch (err) {
      console.error('Socket initialization error:', err);
  }
}

chrome.storage.local.get(['userSession'], (result) => {
    if (result.userSession) {
        initializeSocket(result.userSession.token, result.userSession.apiKey);
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.userSession) {
        const newSession = changes.userSession.newValue;
        if (newSession) {
            initializeSocket(newSession.token, newSession.apiKey);
        } else {
            if (socket) {
                socket.disconnect();
                socket = null;
            }
        }
    }
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(error => console.error('Error setting side panel:', error));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);

  if (request.action === 'scrape_complete') {
    handleScrapeComplete(request.data);
    sendResponse({ success: true });
  }

  if (request.action === 'logActivity') {
    logToBackend(request.data);
    sendResponse({ success: true });
  }

  if (request.action === 'post_complete') {
    handlePostComplete(request.data);
    sendResponse({ success: true });
  }

  if (request.action === 'api_fillFormWithTestData') {
    handleFillFormWithTestData(request.data, request.tabId)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; 
  }

  if (request.action === 'api_fillFormWithTestDataFromAPI') {
    handleFillFormWithTestDataFromAPI(request.customData, request.tabId)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; 
  }

  if (request.action === 'postActionConfirmed') {
    console.log('Received post verification for vehicle:', request.vehicleId);
    markVehicleAsPosted(request.vehicleId, request.listingUrl)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; 
  }

  return true;
});

const recentlyPosted = new Map();

async function markVehicleAsPosted(vehicleId, listingUrl) {
  const now = Date.now();
  if (recentlyPosted.has(vehicleId)) {
    const lastTime = recentlyPosted.get(vehicleId);
    if (now - lastTime < 10000) { 
      console.log('Duplicate post request ignored for:', vehicleId);
      return { success: true, duplicated: true };
    }
  }

  recentlyPosted.set(vehicleId, now);

  if (recentlyPosted.size > 100) {
    for (const [key, time] of recentlyPosted) {
      if (now - time > 60000) recentlyPosted.delete(key);
    }
  }

  try {

    const stored = await chrome.storage.local.get(['userSession']);
    if (!stored.userSession) {
      console.error('No session found for marking post');
      return { success: false, error: 'No session' };
    }

    const headers = { 'Content-Type': 'application/json' };
    if (stored.userSession.apiKey) {
      headers['x-api-key'] = stored.userSession.apiKey;
    }

    const response = await fetch(`${BACKEND_URL}/vehicles/${vehicleId}/posted`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        platform: 'facebook_marketplace',
        action: 'post',
        listingUrl: listingUrl || ''
      })
    });

    if (!response.ok) throw new Error('Failed to update status');

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Vehicle Posted!',
      message: 'Vehicle status updated to "Posted" in dashboard.',
      priority: 2
    });

    return { success: true };
  } catch (error) {
    console.error('Error marking as posted:', error);
    return { success: false, error: error.message };
  }
}

async function handleFillFormWithTestData(testData, tabId = null) {
  try {
    let targetTabId = tabId;
    if (!targetTabId) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0) {
        targetTabId = tabs[0].id;
      } else {
        throw new Error('No active tab found');
      }
    }

    const response = await chrome.tabs.sendMessage(targetTabId, {
      action: 'fillFormWithData',
      data: testData
    });

    return response || { success: true, message: 'Test data sent to content script' };
  } catch (error) {
    console.error('Error in handleFillFormWithTestData:', error);
    throw error;
  }
}

async function handleFillFormWithTestDataFromAPI(customData = null, tabId = null) {
  try {
    const API_BASE_URL = 'https://api.flashfender.com/api';
    const url = `${API_BASE_URL}/test-data`;
    const options = {
      method: customData ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (customData) {
      options.body = JSON.stringify(customData);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to get test data from API');
    }

    let targetTabId = tabId;
    if (!targetTabId) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0) {
        targetTabId = tabs[0].id;
      } else {
        throw new Error('No active tab found');
      }
    }

    const contentResponse = await chrome.tabs.sendMessage(targetTabId, {
      action: 'fillFormWithData',
      data: result.data
    });

    return contentResponse || { success: true, message: 'Test data fetched from API and sent to content script' };
  } catch (error) {
    console.error('Error in handleFillFormWithTestDataFromAPI:', error);
    throw error;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Shifty Auto Lister installed');

  chrome.contextMenus.create({
    id: 'openSidePanel',
    title: 'Open AutoBridge Panel',
    contexts: ['all']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'openSidePanel') {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

function handleScrapeComplete(data) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Vehicle Data Scraped',
    message: `Successfully scraped: ${data.year || ''} ${data.make || ''} ${data.model || ''}`.trim()
  });
}

function handlePostComplete(data) {
  console.log('Post completed:', data);

  if (data.success) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Listing Posted Successfully!',
      message: `Your listing for ${data.vehicleName || 'vehicle'} has been posted to Facebook Marketplace`,
      priority: 2
    });
  } else {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Posting Failed',
      message: data.error || 'An error occurred while posting'
    });
  }
}

function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message
  });
}

async function logToBackend(logData) {
  try {
    const stored = await chrome.storage.local.get(['userSession']);
    if (!stored.userSession) return;

    const headers = {
      'Content-Type': 'application/json'
    };

    if (stored.userSession.apiKey) {
      headers['x-api-key'] = stored.userSession.apiKey;
    } else if (stored.userSession.token) {
      headers['Authorization'] = `Bearer ${stored.userSession.token}`;
    } else {
      return; 
    }

    const response = await fetch(`${BACKEND_URL}/logs/activity`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(logData)
    });

    if (!response.ok && response.status !== 0) {
      console.warn('Failed to log activity:', response.status, response.statusText);
    }
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return;
    }
    console.error('Error logging to backend:', error);
  }
}

chrome.alarms.create('validateSession', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'validateSession') {
    const stored = await chrome.storage.local.get(['userSession']);
    if (stored.userSession && stored.userSession.apiKey) {
      try {
        const response = await fetch(`${BACKEND_URL}/auth/validate-key`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': stored.userSession.apiKey
          }
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            await chrome.storage.local.remove('userSession');
            showNotification('Session Expired', 'Please log in again');
          }
          return;
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          await response.json();
        }
      } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          console.warn('Session validation: Backend unavailable', error.message);
        } else {
          console.error('Session validation error:', error);
        }
      }
    }
  }
});
