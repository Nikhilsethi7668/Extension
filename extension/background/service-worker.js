// service-worker.js - Background Service Worker
console.log('Service Worker Loaded');

const BACKEND_URL = 'http://localhost:5001/api';

// Enable side panel behavior: open side panel when the extension icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(error => console.error('Error setting side panel:', error));

// Handle messages from content scripts and popup/sidepanel
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

  // API: Fill form with test data
  if (request.action === 'api_fillFormWithTestData') {
    handleFillFormWithTestData(request.data, request.tabId)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  // API: Fill form with test data from API endpoint
  if (request.action === 'api_fillFormWithTestDataFromAPI') {
    handleFillFormWithTestDataFromAPI(request.customData, request.tabId)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  return true;
});

// Handle API call to fill form with test data
async function handleFillFormWithTestData(testData, tabId = null) {
  try {
    // Get active tab if tabId not provided
    let targetTabId = tabId;
    if (!targetTabId) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0) {
        targetTabId = tabs[0].id;
      } else {
        throw new Error('No active tab found');
      }
    }

    // Send test data directly to content script
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

// Handle API call to fill form with test data from API endpoint
async function handleFillFormWithTestDataFromAPI(customData = null, tabId = null) {
  try {
    // Fetch test data from API
    const API_BASE_URL = 'http://localhost:5001/api';
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

    // Get active tab if tabId not provided
    let targetTabId = tabId;
    if (!targetTabId) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0) {
        targetTabId = tabs[0].id;
      } else {
        throw new Error('No active tab found');
      }
    }

    // Send test data directly to content script
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

// On install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Shifty Auto Lister installed');

  // Set up context menus for quick access
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

// Handle scrape completion
function handleScrapeComplete(data) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Vehicle Data Scraped',
    message: `Successfully scraped: ${data.year || ''} ${data.make || ''} ${data.model || ''}`.trim()
  });
}

// Handle post completion
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

// Show notification helper
function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message
  });
}

// Log activity to backend
async function logToBackend(logData) {
  try {
    const stored = await chrome.storage.local.get(['userSession']);
    if (!stored.userSession) return;

    const headers = {
      'Content-Type': 'application/json'
    };

    // Use API key if available, otherwise use JWT token
    if (stored.userSession.apiKey) {
      headers['x-api-key'] = stored.userSession.apiKey;
    } else if (stored.userSession.token) {
      headers['Authorization'] = `Bearer ${stored.userSession.token}`;
    } else {
      return; // No authentication available
    }

    const response = await fetch(`${BACKEND_URL}/logs/activity`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(logData)
    });

    // Only log errors if response is not OK and it's not a network error
    if (!response.ok && response.status !== 0) {
      console.warn('Failed to log activity:', response.status, response.statusText);
    }
  } catch (error) {
    // Silently handle network errors (backend might be offline)
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      // Backend unavailable - don't spam console
      return;
    }
    console.error('Error logging to backend:', error);
  }
}

// Periodic session validation (every 30 minutes)
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

        // Check if response is OK and is JSON
        if (!response.ok) {
          // If unauthorized, clear session
          if (response.status === 401 || response.status === 403) {
            await chrome.storage.local.remove('userSession');
            showNotification('Session Expired', 'Please log in again');
          }
          return;
        }

        // Check if response is actually JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          await response.json();
        }
      } catch (error) {
        // Only log network errors, don't clear session for connection issues
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          console.warn('Session validation: Backend unavailable', error.message);
        } else {
          console.error('Session validation error:', error);
        }
        // Don't clear session on network errors - might just be offline
      }
    }
  }
});
