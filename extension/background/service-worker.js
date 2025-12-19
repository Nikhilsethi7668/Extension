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

  return true;
});

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

    await fetch(`${BACKEND_URL}/logs/activity`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(logData)
    });
  } catch (error) {
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

        if (!response.ok) {
          await chrome.storage.local.remove('userSession');
          showNotification('Session Expired', 'Please log in again');
        }
      } catch (error) {
        console.error('Session validation error:', error);
      }
    }
  }
});
