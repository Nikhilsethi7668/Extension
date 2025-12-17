// service-worker.js - Background Service Worker
console.log('Service Worker Loaded');

// Enable side panel
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(error => console.error('Error setting side panel:', error));

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);

  if (request.action === 'scrape') {
    sendResponse({ success: true });
  }

  if (request.action === 'logActivity') {
    console.log('Activity:', request.data);
    sendResponse({ success: true });
  }

  return true;
});

// On install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Shifty Auto Lister installed');
});
    title: 'Vehicle Data Scraped',
    message: `Successfully scraped: ${data.year} ${data.make} ${data.model}`
  });
}

// Handle post completion
function handlePostComplete(data) {
  console.log('Post completed:', data);
  
  if (data.success) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../icons/icon128.png',
      title: 'Listing Posted Successfully!',
      message: `Your ${data.vin} has been posted to Facebook Marketplace`,
      buttons: [
        { title: 'View Listing' }
      ]
    });
  } else {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../icons/icon128.png',
      title: 'Posting Failed',
      message: data.error || 'An error occurred while posting'
    });
  }
}

// Show notification helper
function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: '../icons/icon128.png',
    title: title,
    message: message
  });
}

// Log activity to backend
async function logToBackend(logData) {
  try {
    const stored = await chrome.storage.local.get(['userSession']);
    if (!stored.userSession) return;

    await fetch('https://your-backend-url.com/api/logs/activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stored.userSession.token}`
      },
      body: JSON.stringify(logData)
    });
  } catch (error) {
    console.error('Error logging to backend:', error);
  }
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    // "View Listing" button clicked
    chrome.tabs.create({
      url: 'https://www.facebook.com/marketplace/you/selling'
    });
  }
});

// Periodic session validation (every 30 minutes)
chrome.alarms.create('validateSession', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'validateSession') {
    const stored = await chrome.storage.local.get(['userSession']);
    if (stored.userSession) {
      try {
        const response = await fetch('https://your-backend-url.com/api/auth/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${stored.userSession.token}`
          }
        });
        
        const data = await response.json();
        
        if (!data.valid) {
          // Session expired, clear storage
          await chrome.storage.local.remove('userSession');
          showNotification('Session Expired', 'Please log in again');
        }
      } catch (error) {
        console.error('Session validation error:', error);
      }
    }
  }
});

// Context menu integration (optional)
chrome.contextMenus.create({
  id: 'scrapeVehicle',
  title: 'Scrape Vehicle Data',
  contexts: ['page'],
  documentUrlPatterns: [
    'https://www.autotrader.com/*',
    'https://www.cars.com/*',
    'https://www.cargurus.com/*'
  ]
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'scrapeVehicle') {
    // Trigger scraping on the current tab
    chrome.tabs.sendMessage(tab.id, { action: 'scrape' });
  }
});
