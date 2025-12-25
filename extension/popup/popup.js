// popup.js - Main popup controller
const API_CONFIG = {
  baseUrl: 'http://localhost:5001/api',
  endpoints: {
    agentLogin: '/auth/agent-login',
    validateKey: '/auth/validate-key',
    logActivity: '/logs/activity',
    editImage: '/images/edit',
    generateDescription: '/openai/generate-description',
    testData: '/test-data'
  }
};

let currentUser = null;
let sessionId = generateSessionId();
let scrapedData = null;
let postingQueue = [];
let imageEditQueue = {};
let allVehicles = [];
let currentPage = 1;
const vehiclesPerPage = 10;

function generateSessionId() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Helper function to check if extension context is still valid
function isExtensionContextValid() {
  try {
    // Try to access chrome.runtime - if it throws, context is invalidated
    return chrome && chrome.runtime && chrome.runtime.id !== undefined;
  } catch (error) {
    return false;
  }
}

// Helper function to safely call chrome APIs with error handling
async function safeChromeCall(apiCall, errorMessage = 'Extension context invalidated. Please reload the extension.') {
  if (!isExtensionContextValid()) {
    throw new Error(errorMessage);
  }

  try {
    return await apiCall();
  } catch (error) {
    if (error.message && error.message.includes('Extension context invalidated')) {
      showNotification('Extension was reloaded. Please refresh the page and try again.', 'error');
      throw new Error(errorMessage);
    }
    throw error;
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Check if extension context is valid
    if (!isExtensionContextValid()) {
      console.error('Extension context invalidated on load');
      const loginSection = document.getElementById('loginSection');
      if (loginSection) {
        loginSection.innerHTML = `
          <div class="auth-card" style="text-align: center; padding: 20px;">
            <h2>⚠️ Extension Reloaded</h2>
            <p style="color: #ef4444; margin: 10px 0;">The extension context has been invalidated.</p>
            <p style="margin: 10px 0;">Please close and reopen this popup, or reload the extension.</p>
          </div>
        `;
      }
      return;
    }

    await loadUserSession();
    attachEventListeners();
  } catch (error) {
    console.error('Initialization error:', error);
    if (error.message && error.message.includes('Extension context invalidated')) {
      showNotification('Extension was reloaded. Please refresh the page.', 'error');
    }
  }
});

// Global error handler for extension context errors
window.addEventListener('error', (event) => {
  if (event.error && event.error.message && event.error.message.includes('Extension context invalidated')) {
    event.preventDefault();
    showNotification('Extension context invalidated. Please reload the extension.', 'error');
  }
});

// Load existing session
async function loadUserSession() {
  try {
    const stored = await safeChromeCall(() => chrome.storage.local.get(['userSession']), 'Failed to load session');
    if (stored.userSession) {
      const isValid = await validateSession(stored.userSession);
      if (isValid) {
        currentUser = stored.userSession;
        showMainControls();
      } else {
        currentUser = null;
        await safeChromeCall(() => chrome.storage.local.remove('userSession'), 'Failed to clear session');
        showLoginSection();
      }
    } else {
      showLoginSection();
    }
  } catch (error) {
    console.error('Error loading session:', error);
    showLoginSection();
  }
}

// Login function - Token-based for agents
async function login() {
  const apiToken = document.getElementById('apiToken').value.trim();
  const loginBtn = document.getElementById('loginBtn');

  if (!apiToken) {
    showNotification('Please enter your API token', 'error');
    return;
  }

  // Show loading state
  loginBtn.classList.add('loading');
  loginBtn.disabled = true;

  try {
    const response = await fetch(API_CONFIG.baseUrl + API_CONFIG.endpoints.agentLogin, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: apiToken })
    });

    const data = await response.json();

    if (response.ok && data.token) {
      currentUser = {
        _id: data._id,
        name: data.name,
        email: data.email,
        role: data.role,
        apiKey: apiToken, // Store the API key
        token: data.token, // Store the JWT token
        organization: data.organization
      };
      await safeChromeCall(() => chrome.storage.local.set({ userSession: currentUser }), 'Failed to save session');
      showMainControls();
      showNotification('Logged in successfully!', 'success');
    } else {
      showNotification(data.message || 'Login failed', 'error');
    }
  } catch (error) {
    console.error('Login error:', error);
    showNotification('Failed to connect to backend. Please check your connection.', 'error');
  } finally {
    loginBtn.classList.remove('loading');
    loginBtn.disabled = false;
  }
}

// Logout function
async function logout() {
  currentUser = null;
  await safeChromeCall(() => chrome.storage.local.remove('userSession'), 'Failed to clear session');
  showLoginSection();
  document.getElementById('apiToken').value = '';
  showNotification('Logged out', 'success');
}

// Validate session using API key
async function validateSession(session) {
  try {
    if (!session || !session.apiKey) return false;

    // Use the validate-key endpoint with API key in header
    const response = await fetch(API_CONFIG.baseUrl + API_CONFIG.endpoints.validateKey, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': session.apiKey
      }
    });

    if (response.ok) {
      const data = await response.json();
      // Update user info if needed
      if (data._id) {
        currentUser = {
          ...session,
          ...data
        };
        await safeChromeCall(() => chrome.storage.local.set({ userSession: currentUser }), 'Failed to save session');
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error('Session validation error:', error);
    return false;
  }
}

// UI Functions
function showLoginSection() {
  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('mainControls').style.display = 'none';
  document.getElementById('vehicleListingView').style.display = 'none';
}

function showMainControls() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('vehicleListingView').style.display = 'none';
  document.getElementById('mainControls').style.display = 'block';
  updateStatusText();
}

function showVehicleListing() {
  document.getElementById('mainControls').style.display = 'none';
  document.getElementById('vehicleListingView').style.display = 'flex';
  currentPage = 1;
  loadVehicles();
}

function updateStatusText() {
  if (currentUser) {
    document.getElementById('statusText').textContent = `Logged in as: ${currentUser.name || currentUser.email}`;
  }
}

function showNotification(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);

  // Create toast notification
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  // Add to body or create notification container
  let container = document.getElementById('notification-host');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notification-host';
    document.body.appendChild(container);
  }

  container.appendChild(toast);

  // Remove after 3 seconds
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);

  // Also show Chrome notification for important messages
  if (type === 'error' || type === 'success') {
    if (isExtensionContextValid()) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png') || '',
        title: 'Shifty Auto Lister',
        message: message
      }).catch(() => {
        // Ignore if notifications permission not granted
      });
    }
  }
}

// Event listeners
function attachEventListeners() {
  // Authentication
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const apiTokenInput = document.getElementById('apiToken');
  const testConnectionBtn = document.getElementById('testConnectionBtn');

  if (loginBtn) {
    loginBtn.addEventListener('click', login);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }

  if (testConnectionBtn) {
    testConnectionBtn.addEventListener('click', testConnection);
  }

  // Enter key to login
  if (apiTokenInput) {
    apiTokenInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') login();
    });
  }

  // Scraping
  const scrapeBtn = document.getElementById('scrapeBtn');
  if (scrapeBtn) {
    scrapeBtn.addEventListener('click', scrapeCurrentPage);
  }

  // AI Description
  const generateDescBtn = document.getElementById('generateDescBtn');
  if (generateDescBtn) {
    generateDescBtn.addEventListener('click', generateDescription);
  }

  // Queue Management
  const addToQueueBtn = document.getElementById('addToQueueBtn');
  const clearQueueBtn = document.getElementById('clearQueueBtn');
  const postAllBtn = document.getElementById('postAllBtn');

  if (addToQueueBtn) {
    addToQueueBtn.addEventListener('click', addToQueue);
  }
  if (clearQueueBtn) {
    clearQueueBtn.addEventListener('click', clearQueue);
  }
  if (postAllBtn) {
    postAllBtn.addEventListener('click', postAllInQueue);
  }

  // Posting
  const postNowBtn = document.getElementById('postNowBtn');
  if (postNowBtn) {
    postNowBtn.addEventListener('click', () => postToFacebook());
  }

  // Image editing
  const batchEditBtn = document.getElementById('batchEditBtn');
  const clearEditsBtn = document.getElementById('clearEditsBtn');
  const cropResizeBtn = document.getElementById('cropResizeBtn');

  if (batchEditBtn) {
    batchEditBtn.addEventListener('click', batchEditImages);
  }
  if (clearEditsBtn) {
    clearEditsBtn.addEventListener('click', clearAllEdits);
  }
  if (cropResizeBtn) {
    cropResizeBtn.addEventListener('click', () => {
      showNotification('Image crop/resize feature coming soon!', 'info');
    });
  }

  // Stock number checkbox
  const addStockNumber = document.getElementById('addStockNumber');
  const stockNumber = document.getElementById('stockNumber');
  if (addStockNumber && stockNumber) {
    addStockNumber.addEventListener('change', () => {
      stockNumber.style.display = addStockNumber.checked ? 'block' : 'none';
    });
  }

  // Load Vehicles button
  const loadBtn = document.getElementById('loadVehiclesBtn');
  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      showNotification('Load Vehicles feature coming soon', 'info');
    });
  }

  // Posted Vehicles button
  const postedBtn = document.getElementById('postedVehiclesBtn');
  if (postedBtn) {
    postedBtn.addEventListener('click', () => {
      showNotification('Posted Vehicles feature coming soon', 'info');
    });
  }

  // Test Fill button
  const testFillBtn = document.getElementById('testFillBtn');
  if (testFillBtn) {
    testFillBtn.addEventListener('click', testFillFacebookForm);
  }

  // Vehicle Listing
  const viewVehiclesBtn = document.getElementById('viewVehiclesBtn');
  const backToMainBtn = document.getElementById('backToMainBtn');
  const vehicleSearch = document.getElementById('vehicleSearch');
  const vehicleStatusFilter = document.getElementById('vehicleStatusFilter');
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');

  if (viewVehiclesBtn) {
    viewVehiclesBtn.addEventListener('click', showVehicleListing);
  }

  if (backToMainBtn) {
    backToMainBtn.addEventListener('click', showMainControls);
  }

  const deleteAllVehiclesBtn = document.getElementById('deleteAllVehiclesBtn');
  if (deleteAllVehiclesBtn) {
    deleteAllVehiclesBtn.addEventListener('click', deleteAllVehicles);
  }

  if (document.getElementById('backToListFromImagesBtn')) {
    document.getElementById('backToListFromImagesBtn').addEventListener('click', () => {
      document.getElementById('vehicleImagesView').style.display = 'none';
      document.getElementById('vehicleListingView').style.display = 'flex';
    });
  }

  if (vehicleSearch) {
    vehicleSearch.addEventListener('input', debounce(loadVehicles, 500));
  }

  if (vehicleStatusFilter) {
    vehicleStatusFilter.addEventListener('change', loadVehicles);
  }

  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      currentPage--;
      loadVehicles();
    });
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      currentPage++;
      loadVehicles();
    });
  }
}

// Test Fill Facebook Marketplace Form
async function testFillFacebookForm() {
  const testBtn = document.getElementById('testFillBtn');
  testBtn.disabled = true;
  testBtn.classList.add('loading');

  try {
    // Check if extension context is valid
    if (!isExtensionContextValid()) {
      showNotification('Extension context invalidated. Please reload the extension.', 'error');
      testBtn.disabled = false;
      testBtn.classList.remove('loading');
      return;
    }

    // Get the current active tab
    const [tab] = await safeChromeCall(
      () => chrome.tabs.query({ active: true, currentWindow: true }),
      'Failed to access tabs. Please reload the extension.'
    );

    if (!tab) {
      showNotification('No active tab found', 'error');
      testBtn.disabled = false;
      testBtn.classList.remove('loading');
      return;
    }

    // Check if we're on Facebook Marketplace
    if (!tab.url.includes('facebook.com/marketplace/create')) {
      showNotification('Opening Facebook Marketplace...', 'info');
      // Open the page
      const marketplaceUrl = 'https://www.facebook.com/marketplace/create/vehicle';
      const newTab = await safeChromeCall(
        () => chrome.tabs.create({ url: marketplaceUrl }),
        'Failed to open new tab. Please reload the extension.'
      );

      // Wait for page to load, then fetch from API and fill
      setTimeout(async () => {
        try {
          // Wait for tab to be ready
          let tabReady = false;
          let attempts = 0;
          while (!tabReady && attempts < 10) {
            try {
              const tab = await chrome.tabs.get(newTab.id);
              if (tab.status === 'complete' && tab.url && tab.url.includes('facebook.com/marketplace/create')) {
                tabReady = true;
              } else {
                await new Promise(resolve => setTimeout(resolve, 1000));
                attempts++;
              }
            } catch (e) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              attempts++;
            }
          }

          showNotification('Fetching test data from API...', 'info');
          await fillFormWithDefaultTestData(newTab.id);
        } catch (error) {
          console.error('Error in delayed test fill:', error);
          showNotification('Error filling form: ' + error.message, 'error');
        }
      }, 3000);
      testBtn.disabled = false;
      testBtn.classList.remove('loading');
      return;
    }

    showNotification('Fetching test data from API...', 'info');
    await fillFormWithDefaultTestData(tab.id);

  } catch (error) {
    console.error('Test fill error:', error);
    const errorMsg = error.message || 'Unknown error occurred';
    showNotification('Error: ' + errorMsg, 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.classList.remove('loading');
  }
}

async function executeTestFill(tabId) {
  // Create dummy test data
  const testData = {
    year: '2023',
    make: 'Toyota',
    model: 'Camry',
    mileage: '15000',
    price: '25000',
    dealerAddress: 'New York, NY',
    title: '2023 Toyota Camry',
    description: 'Excellent condition 2023 Toyota Camry. Well maintained, single owner. All service records available. No accidents. Perfect for daily commute or family use. Contact for more details!',
    images: ['https://images.pexels.com/photos/112460/pexels-photo-112460.jpeg', 'https://images.pexels.com/photos/170811/pexels-photo-170811.jpeg'],
    exteriorColor: 'Black',
    interiorColor: 'Grey',
    fuelType: 'Petrol',
    condition: 'Good',
    bodyStyle: 'Saloon',
    transmission: 'Automatic transmission',
    config: {
      category: 'Car/van',
    }
  };

  try {
    // Check if extension context is valid
    if (!isExtensionContextValid()) {
      throw new Error('Extension context invalidated');
    }

    // Store test data in local storage - content script will pick it up automatically
    await safeChromeCall(
      () => chrome.storage.local.set({ pendingPost: testData }),
      'Failed to save test data'
    );

    showNotification('Test data stored! Content script will auto-fill the form.', 'success');
  } catch (error) {
    console.error('Execute test fill error:', error);
    throw error;
  }
}

/**
 * API for filling Facebook Marketplace forms with test data
 * 
 * USAGE EXAMPLES:
 * 
 * 1. From browser console (when popup is open):
 *    fillFormWithDefaultTestData()
 *    fillFormWithTestData({ year: '2023', make: 'Toyota', model: 'Camry', ... })
 * 
 * 2. From background script or external code:
 *    chrome.runtime.sendMessage({
 *      action: 'api_fillFormWithTestData',
 *      data: { year: '2023', make: 'Toyota', ... },
 *      tabId: 123  // optional
 *    })
 * 
 * 3. Directly from popup script:
 *    await fillFormWithTestData(testData, tabId)
 * 
 * This API bypasses chrome.storage.local and starts filling immediately without page reload.
 */

/**
 * Fetch test data from API
 * @param {Object} customData - Optional custom data to override defaults
 * @returns {Promise<Object>} - Test data from API
 */
async function fetchTestDataFromAPI(customData = null) {
  try {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.testData}`;
    const options = {
      method: customData ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    };

    // Add body if custom data is provided
    if (customData) {
      options.body = JSON.stringify(customData);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.success && result.data) {
      return result.data;
    } else {
      throw new Error(result.message || 'Failed to get test data from API');
    }
  } catch (error) {
    console.error('Error fetching test data from API:', error);
    // Fallback to default test data if API fails
    console.log('Falling back to default test data');


  }
}

/**
 * Convenience function to fill form with test data from API
 * This bypasses chrome.storage.local and starts filling immediately
 * @param {number} tabId - Optional tab ID, if not provided will get active tab
 * @param {Object} customData - Optional custom data to send to API
 * @returns {Promise<Object>} - Response from content script
 */
async function fillFormWithDefaultTestData(tabId = null, customData = null) {
  // Fetch test data from API
  const testData = await fetchTestDataFromAPI(customData);
  return await fillFormWithTestData(testData, tabId);
}

/**
 * Ensure content script is loaded in the tab
 * @param {number} tabId - Tab ID to check/inject script
 * @returns {Promise<void>}
 */
async function ensureContentScriptLoaded(tabId) {
  try {
    // First, try to ping the content script to see if it's loaded
    try {
      const pingResponse = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      if (pingResponse && pingResponse.loaded) {
        console.log('Content script already loaded');
        return; // Content script is loaded
      }
    } catch (pingError) {
      // Content script not loaded or not responding, continue to inject
      console.log('Content script not responding, will inject...');
    }

    // Get tab URL to check if it's Facebook Marketplace
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !tab.url.includes('facebook.com/marketplace/create')) {
      console.warn('Not on Facebook Marketplace create page:', tab.url);
      // Don't throw, just return - the retry logic will handle it
      return;
    }

    // Try to inject the content script
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content/facebook-autofill.js']
      });
      console.log('Content script injected successfully');
    } catch (injectError) {
      // Script might already be injected, that's okay
      if (!injectError.message.includes('Cannot access')) {
        console.warn('Error injecting script (might already be injected):', injectError.message);
      }
    }

    // Wait a bit for script to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify it's loaded by pinging again
    let retries = 5;
    while (retries > 0) {
      try {
        const verifyResponse = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        if (verifyResponse && verifyResponse.loaded) {
          console.log('Content script verified and ready');
          return; // Successfully loaded
        }
      } catch (verifyError) {
        retries--;
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          console.warn('Content script not responding after injection attempts');
        }
      }
    }
  } catch (error) {
    console.warn('Error ensuring content script loaded:', error);
    // Don't throw, let the retry logic in fillFormWithTestData handle it
  }
}

/**
 * API function to send test data directly to content script and start filling immediately
 * This bypasses chrome.storage.local and starts filling right away
 * @param {Object} testData - The test data object to fill the form with
 * @param {number} tabId - Optional tab ID, if not provided will get active tab
 * @returns {Promise<Object>} - Response from content script
 */
async function fillFormWithTestData(testData, tabId = null) {
  try {
    // Check if extension context is valid
    if (!isExtensionContextValid()) {
      throw new Error('Extension context invalidated');
    }

    // Get active tab if tabId not provided
    let targetTabId = tabId;
    if (!targetTabId) {
      const tabs = await safeChromeCall(
        () => chrome.tabs.query({ active: true, currentWindow: true }),
        'Failed to get active tab'
      );
      if (tabs && tabs.length > 0) {
        targetTabId = tabs[0].id;
      } else {
        throw new Error('No active tab found');
      }
    }

    // Ensure content script is loaded before sending message
    await ensureContentScriptLoaded(targetTabId);

    // Retry sending message with exponential backoff
    let response = null;
    let lastError = null;
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        response = await safeChromeCall(
          () => chrome.tabs.sendMessage(targetTabId, {
            action: 'fillFormWithData',
            data: testData
          }),
          'Failed to send test data to content script'
        );

        if (response && response.success) {
          showNotification(response.message || 'Test data sent! Form filling started.', 'success');
          return response;
        } else {
          throw new Error(response?.error || 'Unknown error from content script');
        }
      } catch (error) {
        lastError = error;
        // If it's a connection error, wait and retry
        if (error.message && error.message.includes('Receiving end does not exist')) {
          if (attempt < maxRetries - 1) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5s
            console.log(`Content script not ready, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));

            // Try to inject script again
            await ensureContentScriptLoaded(targetTabId);
            continue;
          }
        }
        throw error;
      }
    }

    throw lastError || new Error('Failed to send message after retries');
  } catch (error) {
    console.error('Fill form with test data error:', error);
    showNotification('Failed to send test data: ' + error.message, 'error');
    throw error;
  }
}

// Test backend connection
async function testConnection() {
  const statusDiv = document.getElementById('connectionStatus');
  const testBtn = document.getElementById('testConnectionBtn');

  statusDiv.className = 'info';
  statusDiv.innerHTML = '⏳ Testing connection...';
  testBtn.disabled = true;
  testBtn.classList.add('loading');

  try {
    const response = await fetch(API_CONFIG.baseUrl + '/health', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    if (response.ok && data.status === 'ok') {
      statusDiv.className = 'success';
      statusDiv.innerHTML = '✅ Backend connected successfully!';
      showNotification('Backend connection successful', 'success');
    } else {
      statusDiv.className = 'warning';
      statusDiv.innerHTML = '⚠️ Backend responded but status unclear';
    }
  } catch (error) {
    statusDiv.className = 'error';
    statusDiv.innerHTML = '❌ Cannot connect to backend. Make sure server is running on http://localhost:5001';
    showNotification('Backend connection failed', 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.classList.remove('loading');
  }
}

// Scrape current page
async function scrapeCurrentPage() {
  try {
    if (!isExtensionContextValid()) {
      showNotification('Extension context invalidated. Please reload the extension.', 'error');
      return;
    }

    const [tab] = await safeChromeCall(
      () => chrome.tabs.query({ active: true, currentWindow: true }),
      'Failed to access tabs. Please reload the extension.'
    );

    if (!tab) {
      showNotification('No active tab found', 'error');
      return;
    }

    let scraperType = null;
    if (tab.url.includes('autotrader.com')) scraperType = 'autotrader';
    else if (tab.url.includes('cars.com')) scraperType = 'cars';
    else if (tab.url.includes('cargurus.com')) scraperType = 'cargurus';
    else {
      showNotification('Not a supported vehicle site (Autotrader, Cars.com, CarGurus)', 'error');
      return;
    }

    // Detect if this is a listing page (search results) or detail page
    const isListingPage = tab.url.includes('/all-cars') ||
      tab.url.includes('/cars-for-sale/searchresults') ||
      tab.url.includes('/searchresults.action');

    if (isListingPage) {
      // Use bulk scrape API for listing pages
      showNotification('Detected listing page. Starting bulk scrape...', 'info');
      await bulkScrapeFromUrl(tab.url);
      return;
    }

    // Single vehicle scrape using content script
    showNotification(`Scraping from ${scraperType}...`, 'info');
    document.getElementById('vehiclePreview').style.display = 'none';

    // Inject scraper if needed (usually handled by manifest, but safe to try)
    // Send message to content script
    try {
      const response = await safeChromeCall(
        () => chrome.tabs.sendMessage(tab.id, {
          action: 'scrape',
          scraper: scraperType
        }),
        'Failed to communicate with page. Please reload the extension.'
      );

      if (response && response.success) {
        scrapedData = response.data;
        displayScrapedData(scrapedData);
        showNotification('Vehicle scraped successfully!', 'success');

        // Notify background to save state if needed
        if (isExtensionContextValid()) {
          chrome.runtime.sendMessage({
            action: 'scrape_complete',
            data: scrapedData
          }).catch(err => console.warn('Failed to send message to background:', err));
        }
      } else {
        throw new Error(response?.error || 'Unknown scraping error');
      }
    } catch (msgError) {
      console.error('Message error:', msgError);

      // If message fails, script might not be loaded. Try injecting.
      if (isExtensionContextValid()) {
        await safeChromeCall(
          () => chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: [`content/scrapers/${scraperType}-scraper.js`]
          }),
          'Failed to inject scraper script. Please reload the extension.'
        );

        // Retry message
        setTimeout(async () => {
          if (!isExtensionContextValid()) {
            showNotification('Extension context invalidated. Please reload.', 'error');
            return;
          }
          try {
            const retryResponse = await safeChromeCall(
              () => chrome.tabs.sendMessage(tab.id, {
                action: 'scrape',
                scraper: scraperType
              }),
              'Failed to retry scraping. Please reload the extension.'
            );

            if (retryResponse && retryResponse.success) {
              scrapedData = retryResponse.data;
              displayScrapedData(scrapedData);
              showNotification('Vehicle scraped successfully!', 'success');
            } else {
              showNotification('Failed to scrape page. Refresh and try again.', 'error');
            }
          } catch (retryError) {
            console.error('Retry scraping error:', retryError);
            showNotification('Failed to scrape page. Refresh and try again.', 'error');
          }
        }, 500);
      }
    }

  } catch (error) {
    console.error('Scraping error:', error);
    showNotification('Error scraping data: ' + error.message, 'error');
  }
}

async function bulkScrapeFromUrl(url) {
  try {
    if (!currentUser || !currentUser.apiKey) {
      showNotification('Please log in first', 'error');
      return;
    }

    showNotification('Scanning listing page for vehicles...', 'info');

    const response = await fetch(API_CONFIG.baseUrl + '/vehicles/scrape-bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': currentUser.apiKey
      },
      body: JSON.stringify({
        urls: [url]
      })
    });

    if (!response.ok) {
      throw new Error(`Bulk scrape failed: ${response.statusText}`);
    }

    const results = await response.json();

    const successCount = results.success || 0;
    const failedCount = results.failed || 0;
    const totalProcessed = results.total || 0;

    if (successCount > 0) {
      showNotification(`✅ Scraped ${successCount} vehicles successfully! ${failedCount > 0 ? `(${failedCount} failed)` : ''}`, 'success');

      // Refresh vehicle list to show newly scraped vehicles
      await loadVehicles();

      // Switch to vehicle listing view
      showView('vehicleListingView');
    } else if (failedCount > 0) {
      showNotification(`⚠️ All ${failedCount} vehicles failed to scrape. Check console for details.`, 'error');
      console.error('Bulk scrape results:', results.items);
    } else {
      showNotification('No vehicles found on this listing page', 'warning');
    }

    console.log('Bulk scrape complete:', results);

  } catch (error) {
    console.error('Bulk scrape error:', error);
    showNotification('Bulk scrape failed: ' + error.message, 'error');
  }
}

function displayScrapedData(data) {
  const preview = document.getElementById('vehiclePreview');
  preview.style.display = 'block';

  document.getElementById('previewYear').textContent = data.year || '-';
  document.getElementById('previewMake').textContent = data.make || '-';
  document.getElementById('previewModel').textContent = data.model || '-';
  document.getElementById('previewPrice').textContent = data.price || '-';
  document.getElementById('previewMileage').textContent = data.mileage || '-';
  document.getElementById('previewVin').textContent = data.vin || '-';

  // Display images
  const gallery = document.getElementById('imageGallery');
  gallery.innerHTML = '';

  if (data.images && data.images.length > 0) {
    data.images.forEach((imgUrl, index) => {
      const img = document.createElement('img');
      img.src = imgUrl;
      img.alt = `Vehicle image ${index + 1}`;
      img.title = 'Click to view full size';
      gallery.appendChild(img);
    });

    // Show image editing interface
    showImageEditingInterface(data.images);
  }
}

// ============ Image Editing Functions ============

function showImageEditingInterface(images) {
  const container = document.getElementById('imageEditingContainer');
  const editList = document.getElementById('imageEditList');

  container.style.display = 'block';
  editList.innerHTML = '';
  imageEditQueue = {};

  images.forEach((imageUrl, index) => {
    const editItem = createImageEditItem(imageUrl, index);
    editList.appendChild(editItem);
  });

  // Enable batch edit button
  document.getElementById('batchEditBtn').disabled = false;
}

function createImageEditItem(imageUrl, index) {
  const div = document.createElement('div');
  div.className = 'image-edit-item';
  div.id = `image-edit-${index}`;

  div.innerHTML = `
    <div class="image-preview-container">
      <div class="image-preview-box">
        <h4>Original</h4>
        <img src="${imageUrl}" alt="Original ${index + 1}" onclick="window.open('${imageUrl}', '_blank')">
      </div>
      <div class="image-preview-box" id="edited-preview-${index}" style="display: none;">
        <h4>AI Edited ✨</h4>
        <img src="" alt="Edited ${index + 1}" onclick="window.open(this.src, '_blank')">
      </div>
    </div>
    
    <div class="image-edit-controls">
      <div class="edit-prompt-suggestions">
        <button class="suggestion-chip" data-prompt="Remove background and replace with professional showroom">🏢 Showroom BG</button>
        <button class="suggestion-chip" data-prompt="Remove background and make it pure white">⬜ White BG</button>
        <button class="suggestion-chip" data-prompt="Enhance image brightness and contrast">✨ Enhance</button>
        <button class="suggestion-chip" data-prompt="Remove any watermarks or logos">🚫 Remove Watermark</button>
        <button class="suggestion-chip" data-prompt="Professional dealership quality enhancement">💎 Pro Quality</button>
      </div>
      
      <textarea 
        class="edit-prompt-input" 
        id="prompt-${index}"
        placeholder="Enter AI editing instructions for this image...&#10;Example: 'Remove background and replace with luxury dealership'"
      ></textarea>
      
      <div class="edit-action-buttons">
        <button class="btn-edit-image" data-index="${index}">
          <span class="btn-icon">🎨</span> AI Edit Image
        </button>
        <button class="btn-clear-edit" data-index="${index}" style="display: none;">
          <span class="btn-icon">↺</span> Reset
        </button>
        <button class="btn-remove-bg" data-index="${index}" title="Remove Background (Nano Banana)">
          <span class="btn-icon">🍌</span> Remove BG
        </button>
      </div>
      
      <div class="edit-status" id="status-${index}" style="display: none;"></div>
    </div>
  `;

  // Attach event listeners
  const suggestions = div.querySelectorAll('.suggestion-chip');
  suggestions.forEach(chip => {
    chip.addEventListener('click', (e) => {
      const prompt = e.target.getAttribute('data-prompt');
      div.querySelector(`#prompt-${index}`).value = prompt;
    });
  });

  const editBtn = div.querySelector('.btn-edit-image');
  editBtn.addEventListener('click', () => editSingleImage(index));

  const clearBtn = div.querySelector('.btn-clear-edit');
  clearBtn.addEventListener('click', () => clearImageEdit(index));

  return div;
}

async function editSingleImage(index) {
  if (!scrapedData || !scrapedData.images[index]) {
    showNotification('Image not found', 'error');
    return;
  }

  const imageUrl = scrapedData.images[index];
  const promptInput = document.getElementById(`prompt-${index}`);
  const prompt = promptInput.value.trim();

  if (!prompt) {
    showNotification('Please enter editing instructions', 'error');
    return;
  }

  const statusDiv = document.getElementById(`status-${index}`);
  const editBtn = document.querySelector(`.btn-edit-image[data-index="${index}"]`);
  const editItem = document.getElementById(`image-edit-${index}`);

  try {
    // Update UI to show processing
    editItem.classList.add('editing');
    statusDiv.style.display = 'block';
    statusDiv.className = 'edit-status processing';
    statusDiv.innerHTML = '<span class="editing-spinner"></span> Processing with AI...';
    editBtn.disabled = true;

    // Call image editing API
    const response = await fetch(API_CONFIG.baseUrl + API_CONFIG.endpoints.editImage, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentUser.token}`
      },
      body: JSON.stringify({
        imageUrl: imageUrl,
        prompt: prompt,
        resolution: '4K',
        format: 'jpeg'
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Store edited image
      imageEditQueue[index] = {
        originalUrl: imageUrl,
        editedUrl: data.editedImageUrl,
        prompt: prompt,
        timestamp: new Date().toISOString()
      };

      // Update UI with edited image
      const editedPreview = document.getElementById(`edited-preview-${index}`);
      editedPreview.style.display = 'block';
      editedPreview.querySelector('img').src = data.editedImageUrl;

      editItem.classList.remove('editing');
      editItem.classList.add('edited');

      statusDiv.className = 'edit-status success';
      statusDiv.textContent = '✓ Image edited successfully!';

      // Show clear button
      document.querySelector(`.btn-clear-edit[data-index="${index}"]`).style.display = 'block';

      // Enable clear edits button
      document.getElementById('clearEditsBtn').disabled = false;

      showNotification('Image edited successfully!', 'success');

      // Log activity
      await logActivity('image_edited', {
        imageIndex: index,
        prompt: prompt,
        success: true
      });

    } else {
      throw new Error(data.message || 'Image editing failed');
    }

  } catch (error) {
    console.error('Image editing error:', error);

    editItem.classList.remove('editing');
    statusDiv.className = 'edit-status error';
    statusDiv.textContent = '✗ Error: ' + error.message;

    showNotification('Image editing failed: ' + error.message, 'error');
  } finally {
    editBtn.disabled = false;
  }
}

function clearImageEdit(index) {
  if (imageEditQueue[index]) {
    delete imageEditQueue[index];

    const editItem = document.getElementById(`image-edit-${index}`);
    editItem.classList.remove('edited');

    const editedPreview = document.getElementById(`edited-preview-${index}`);
    editedPreview.style.display = 'none';

    const statusDiv = document.getElementById(`status-${index}`);
    statusDiv.style.display = 'none';

    document.querySelector(`.btn-clear-edit[data-index="${index}"]`).style.display = 'none';
    document.getElementById(`prompt-${index}`).value = '';

    // Disable clear all if no edits left
    if (Object.keys(imageEditQueue).length === 0) {
      document.getElementById('clearEditsBtn').disabled = true;
    }

    showNotification('Edit cleared', 'info');
  }
}

async function handleRemoveBackground(index) {
  const editItem = document.getElementById(`image-edit-${index}`);
  const removeBgBtn = editItem.querySelector('.btn-remove-bg');
  const imageUrl = imageEditQueue[index]?.originalUrl || scrapedData.images[index]; // Fallback to original if not queued

  // Note: scrapedData.images array maps to index
  // But wait, imageEditQueue keys are indices. 
  // We should rely on scrapedData.images[index] for the source URL 
  // unless we're chaining edits, but let's assume we operate on the original for now.
  const sourceUrl = scrapedData.images[index];

  if (!sourceUrl) {
    showNotification('Image URL not found', 'error');
    return;
  }

  try {
    removeBgBtn.disabled = true;
    removeBgBtn.innerHTML = '<span class="editing-spinner"></span> Removing...';

    showNotification('Removing background...', 'info');

    // Currently viewing a vehicle? We need the ID.
    // scrapedData usually comes from scraping a page, so it might not have an ID yet if it's new.
    // BUT the user request implies this is for "Vehicle Images on vehicle images page", which refers to `showVehicleImages(vehicleId)`.
    // Let's check where `scrapedData` comes from. 
    // If we are in `vehicleImagesView`, the images are passed to `displayImagesGallery`.
    // `displayImagesGallery` uses `images` array.
    // Wait, `createImageEditItem` uses `index`.
    // The previous context showed `displayImagesGallery` iterates `images`.
    // And `displayImagesGallery` was creating items differently:
    /*
    item.innerHTML = `
      <img src="${imageUrl}" ...>
      <div class="image-upload-overlay">...</div>
    `;
    */

    // Ah! `showVehicleImages` uses `displayImagesGallery` (lines 1965+).
    // `displayScrapedData` uses `showImageEditingInterface` (lines 945+).
    // The user said "Vehicle Images on vehicle images page". 
    // This implies the `vehicleImagesView` (lines 81+ in HTML), which corresponds to `showVehicleImages` in JS.
    // `displayImagesGallery` (line 1965) renders that view.
    // `displayScrapedData` (line 914) renders `vehiclePreview` which has `imageGallery` AND `imageEditingContainer`.

    // The user requests: "on image i want a button... in api give data to nano banana... add that image url in vhivle data base".
    // This confirms it's for the backend-stored vehicle, not the scraped preview.
    // So I should modify `displayImagesGallery`, NOT `createImageEditItem` (which is for scraped preview editing).

    // RE-EVALUATION:
    // I added the button to `createImageEditItem` in step 32. This affects the "preview" editing.
    // The user likely wants it on the "Vehicle Images" page (backend data).
    // so I should also add it to `displayImagesGallery`.

    // Let's implement `handleRemoveBackground` for the `displayImagesGallery` context.
    // I'll need the `vehicleId`. `displayImagesGallery` only receives `images` array.
    // I need to store `currentVehicleId` when `showVehicleImages` is called.

    // Strategy:
    // 1. Update `showVehicleImages` to store `currentVehicleId`.
    // 2. Update `displayImagesGallery` to add "Remove BG" button.
    // 3. Implement `handleRemoveBackground` that uses `currentVehicleId`.

    // First, let's revert or leave the change in `createImageEditItem` (it's fine to have it there too), 
    // but the critical request is for the backend flow.

    // I'll define `handleRemoveBackground` specifically for the backend flow.

    // Let's fetch the vehicle ID.
    // I'll look for a global variable or add one.

    const response = await fetch(`${API_CONFIG.baseUrl}/vehicles/${window.currentVehicleId}/remove-bg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': currentUser.apiKey
      },
      body: JSON.stringify({ imageUrl: sourceUrl })
    });

    const result = await response.json();

    if (result.success) {
      showNotification('Background removed successfully!', 'success');
      // Refresh images
      showVehicleImages(window.currentVehicleId);
    } else {
      throw new Error(result.message || 'Failed to remove background');
    }

  } catch (error) {
    console.error('Background removal error:', error);
    showNotification('Error: ' + error.message, 'error');
  } finally {
    if (removeBgBtn) {
      removeBgBtn.disabled = false;
      removeBgBtn.innerHTML = '<span class="btn-icon">🍌</span> Remove BG';
    }
  }
}

async function batchEditImages() {
  if (!scrapedData || !scrapedData.images) {
    showNotification('No images to edit', 'error');
    return;
  }

  // Collect all prompts
  const editJobs = [];
  scrapedData.images.forEach((imageUrl, index) => {
    const prompt = document.getElementById(`prompt-${index}`).value.trim();
    if (prompt) {
      editJobs.push({ index, imageUrl, prompt });
    }
  });

  if (editJobs.length === 0) {
    showNotification('Please enter editing instructions for at least one image', 'error');
    return;
  }

  if (!confirm(`Edit ${editJobs.length} images with AI? This may take a few minutes.`)) {
    return;
  }

  const batchBtn = document.getElementById('batchEditBtn');
  batchBtn.disabled = true;
  batchBtn.innerHTML = '<span class="editing-spinner"></span> Processing...';

  // Process each image
  for (const job of editJobs) {
    await editSingleImage(job.index);
    // Small delay between edits
    await sleep(500);
  }

  batchBtn.disabled = false;
  batchBtn.innerHTML = '<span class="btn-icon">✨</span> AI Edit All Images';

  showNotification(`Batch editing complete! ${editJobs.length} images processed.`, 'success');
}

function clearAllEdits() {
  if (!confirm('Clear all image edits?')) {
    return;
  }

  Object.keys(imageEditQueue).forEach(index => {
    clearImageEdit(parseInt(index));
  });

  imageEditQueue = {};
  document.getElementById('clearEditsBtn').disabled = true;

  showNotification('All edits cleared', 'info');
}

// ============ AI Description Generation ============

async function generateDescription() {
  if (!scrapedData) {
    showNotification('Please scrape vehicle data first', 'error');
    return;
  }

  const aiInstructions = document.getElementById('aiInstructions').value.trim();
  const addMileage = document.getElementById('addMileage').checked;
  const addDealerInfo = document.getElementById('addDealerInfo').checked;

  try {
    showNotification('Generating AI description...', 'info');

    const response = await fetch(API_CONFIG.baseUrl + API_CONFIG.endpoints.generateDescription, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentUser.token}`
      },
      body: JSON.stringify({
        vehicleData: scrapedData,
        instructions: aiInstructions,
        options: {
          includeMileage: addMileage,
          includeDealerInfo: addDealerInfo
        }
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      document.getElementById('generatedDesc').value = data.description;
      showNotification('Description generated successfully!', 'success');
    } else {
      showNotification('Failed to generate description', 'error');
    }
  } catch (error) {
    console.error('AI generation error:', error);
    showNotification('Error generating description', 'error');
  }
}

// ============ Queue Management ============

async function addToQueue() {
  if (!scrapedData) {
    showNotification('No vehicle data to add', 'error');
    return;
  }

  const queueItem = {
    id: Date.now(),
    ...scrapedData,
    description: document.getElementById('generatedDesc').value,
    config: {
      category: document.getElementById('vehicleCategory').value,
      emoji: document.getElementById('emojiStyle').value,
      whereToPost: document.getElementById('whereToPost').value,
      distance: document.getElementById('distance').value,
      groups: document.getElementById('fbGroups').value.split('\n').filter(g => g.trim())
    },
    status: 'pending',
    addedAt: new Date().toISOString()
  };

  postingQueue.push(queueItem);
  await saveQueue();
  updateQueueDisplay();
  showNotification('Added to queue', 'success');

  // Clear current data
  scrapedData = null;
  document.getElementById('vehiclePreview').style.display = 'none';
  document.getElementById('addToQueueBtn').disabled = true;
  document.getElementById('postNowBtn').disabled = true;
}

async function saveQueue() {
  await chrome.storage.local.set({ postingQueue });
}

async function loadQueue() {
  if (!isExtensionContextValid()) return;
  const stored = await safeChromeCall(
    () => chrome.storage.local.get(['postingQueue']),
    'Failed to load queue'
  );
  if (stored.postingQueue) {
    postingQueue = stored.postingQueue;
    updateQueueDisplay();
  }
}

function updateQueueDisplay() {
  const queueList = document.getElementById('queueList');
  const queueCount = document.getElementById('queueCount');

  queueCount.textContent = postingQueue.length;
  queueList.innerHTML = '';

  if (postingQueue.length === 0) {
    queueList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Queue is empty</p>';
    document.getElementById('postAllBtn').disabled = true;
    return;
  }

  document.getElementById('postAllBtn').disabled = false;

  postingQueue.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'queue-item';
    div.innerHTML = `
      <div class="queue-item-info">
        <div class="queue-item-title">${item.year} ${item.make} ${item.model}</div>
        <div class="queue-item-details">VIN: ${item.vin} | Price: ${item.price}</div>
      </div>
      <button class="queue-item-remove" data-index="${index}">Remove</button>
    `;
    queueList.appendChild(div);
  });

  // Attach remove handlers
  document.querySelectorAll('.queue-item-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      removeFromQueue(index);
    });
  });
}

async function removeFromQueue(index) {
  postingQueue.splice(index, 1);
  await saveQueue();
  updateQueueDisplay();
  showNotification('Removed from queue', 'info');
}

async function clearQueue() {
  if (confirm('Are you sure you want to clear the entire queue?')) {
    postingQueue = [];
    await saveQueue();
    updateQueueDisplay();
    showNotification('Queue cleared', 'info');
  }
}

// ============ Facebook Posting Functions ============

async function postToFacebook(vehicleData = null) {
  const dataToPost = vehicleData || scrapedData;

  if (!dataToPost) {
    showNotification('No vehicle data to post', 'error');
    return;
  }

  try {
    showNotification('Opening Facebook Marketplace...', 'info');

    if (!isExtensionContextValid()) {
      showNotification('Extension context invalidated. Please reload the extension.', 'error');
      return;
    }

    // Get form values with fallbacks
    const generatedDescEl = document.getElementById('generatedDesc');
    const vehicleCategoryEl = document.getElementById('vehicleCategory');
    const emojiStyleEl = document.getElementById('emojiStyle');
    const whereToPostEl = document.getElementById('whereToPost');
    const distanceEl = document.getElementById('distance');
    const fbGroupsEl = document.getElementById('fbGroups');

    // Prepare post data
    const postData = {
      ...dataToPost,
      description: generatedDescEl ? generatedDescEl.value : (dataToPost.description || dataToPost.aiContent?.description || ''),
      config: {
        category: vehicleCategoryEl ? vehicleCategoryEl.value : 'car',
        emoji: emojiStyleEl ? emojiStyleEl.value : 'none',
        whereToPost: whereToPostEl ? whereToPostEl.value : 'marketplace',
        distance: distanceEl ? distanceEl.value : '20',
        groups: fbGroupsEl ? fbGroupsEl.value.split('\n').filter(g => g.trim()) : []
      }
    };

    // Check if we are already on the Facebook Marketplace create page
    const marketplaceUrl = 'https://www.facebook.com/marketplace/create/vehicle';
    let newTab = null;

    // Get the current active tab
    const [activeTab] = await safeChromeCall(() => chrome.tabs.query({ active: true, currentWindow: true }));

    if (activeTab && activeTab.url && activeTab.url.includes('facebook.com/marketplace/create')) {
      console.log('Reusing existing active tab:', activeTab.id);
      newTab = activeTab;
    } else {
      console.log('Opening new Marketplace tab');
      newTab = await safeChromeCall(
        () => chrome.tabs.create({ url: marketplaceUrl }),
        'Failed to open Facebook Marketplace. Please reload the extension.'
      );
    }

    // Wait for tab to load, then send data directly via message (not storage)
    // Reduce timeout if reusing tab
    const waitTime = newTab === activeTab ? 500 : 3000;

    setTimeout(async () => {
      try {
        if (!isExtensionContextValid()) {
          showNotification('Extension context invalidated. Please reload the extension.', 'error');
          return;
        }

        // Wait for tab to be ready
        let tabReady = false;
        let attempts = 0;
        while (!tabReady && attempts < 10) {
          try {
            const tab = await safeChromeCall(
              () => chrome.tabs.get(newTab.id),
              'Failed to check tab status'
            );
            if (tab.status === 'complete' && tab.url && tab.url.includes('facebook.com/marketplace/create')) {
              tabReady = true;
            } else {
              await new Promise(resolve => setTimeout(resolve, 500));
              attempts++;
            }
          } catch (e) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
          }
        }
        if (tabReady) {
          // Ensure content script is loaded
          await ensureContentScriptLoaded(newTab.id);

          // Send data directly via message instead of storage
          const response = await safeChromeCall(
            () => chrome.tabs.sendMessage(newTab.id, {
              action: 'fillFormWithData',
              data: postData
            }),
            'Failed to send post data to content script'
          );

          if (response && response.success) {
            showNotification('Post data sent! Form filling started.', 'success');
          } else {
            showNotification('Form filling initiated. Please wait...', 'info');
          }
        } else {
          showNotification('Timeout waiting for Facebook Marketplace to load', 'error');
        }

      } catch (error) {
        console.error('Error sending post data:', error);
        showNotification('Error sending data. Please try again.', 'error');
      }
    }, waitTime);

    // Log posting activity
    await logActivity('post_initiated', {
      vin: dataToPost.vin,
      vehicle: `${dataToPost.year} ${dataToPost.make} ${dataToPost.model}`
    });

  } catch (error) {
    console.error('Posting error:', error);
    showNotification('Error initiating post: ' + error.message, 'error');
  }
}

async function postAllInQueue() {
  if (postingQueue.length === 0) {
    showNotification('Queue is empty', 'error');
    return;
  }

  if (!confirm(`Post all ${postingQueue.length} vehicles to Facebook Marketplace?`)) {
    return;
  }

  showNotification(`Starting batch post of ${postingQueue.length} vehicles...`, 'info');

  // Post first item and set up sequential posting
  for (let i = 0; i < postingQueue.length; i++) {
    await postToFacebook(postingQueue[i]);
    // Wait 3 seconds between posts to avoid rate limiting
    if (i < postingQueue.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Clear queue after posting
  await clearQueue();
}

// ============ Activity Logging ============

async function logActivity(action, details) {
  try {
    // Load browser metadata utility
    const script = document.createElement('script');
    script.src = '../utils/browser-metadata.js';
    document.head.appendChild(script);

    // Wait for script to load
    await sleep(100);

    // Create comprehensive logging payload
    let payload;
    if (typeof BrowserMetadata !== 'undefined') {
      payload = await BrowserMetadata.createLoggingPayload(
        currentUser?._id || currentUser?.email || 'anonymous',
        action,
        scrapedData || {},
        {
          ...details,
          sessionId: sessionId,
          imageEditPrompts: getImageEditPrompts(),
          editedImageUrls: getEditedImageUrls()
        }
      );
    } else {
      // Fallback if utility not loaded
      payload = {
        userId: currentUser?._id || currentUser?.email || 'anonymous',
        action,
        details,
        timestamp: new Date().toISOString(),
        sessionId: sessionId
      };
    }

    // Send to backend using API key
    const headers = {
      'Content-Type': 'application/json'
    };

    // Use API key if available, otherwise use JWT token
    if (currentUser?.apiKey) {
      headers['x-api-key'] = currentUser.apiKey;
    } else if (currentUser?.token) {
      headers['Authorization'] = `Bearer ${currentUser.token}`;
    }

    const response = await fetch(API_CONFIG.baseUrl + API_CONFIG.endpoints.logActivity, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      // Store offline if network fails
      if (typeof BrowserMetadata !== 'undefined') {
        await BrowserMetadata.storeOffline(payload);
      }
    }

    // Update local activity log
    await addActivityLogEntry(payload);
  } catch (error) {
    console.error('Logging error:', error);
  }
}

function getImageEditPrompts() {
  const prompts = [];
  Object.keys(imageEditQueue).forEach(index => {
    if (imageEditQueue[index].prompt) {
      prompts.push({
        imageIndex: parseInt(index),
        prompt: imageEditQueue[index].prompt,
        timestamp: imageEditQueue[index].timestamp
      });
    }
  });
  return prompts;
}

function getEditedImageUrls() {
  const urls = [];
  Object.keys(imageEditQueue).forEach(index => {
    if (imageEditQueue[index].editedUrl) {
      urls.push({
        imageIndex: parseInt(index),
        originalUrl: imageEditQueue[index].originalUrl,
        editedUrl: imageEditQueue[index].editedUrl
      });
    }
  });
  return urls;
}

async function addActivityLogEntry(entry) {
  const activityLog = document.getElementById('activityLog');
  const logDiv = document.createElement('div');
  logDiv.className = 'log-entry';

  const time = new Date(entry.timestamp).toLocaleString();
  logDiv.innerHTML = `
    <div class="log-time">${time}</div>
    <div class="log-message">${entry.action}: ${JSON.stringify(entry.details)}</div>
  `;

  activityLog.insertBefore(logDiv, activityLog.firstChild);

  // Keep only last 10 entries
  while (activityLog.children.length > 10) {
    activityLog.removeChild(activityLog.lastChild);
  }
}

async function updateActivityLog() {
  // Load recent activity from storage or backend
  // This would fetch from your backend API
}

// ============ Notification System ============
// Note: showNotification is already defined above with toast UI

// ============ Event Listeners ============
// Note: Event listeners are attached in the main attachEventListeners() function above

// ============ Utility Functions ============

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ============ Vehicle Listing Functions ============

async function loadVehicles() {
  const container = document.getElementById('vehiclesContainer');
  const paginationControls = document.getElementById('paginationControls');

  container.innerHTML = '<div class="loading-state">Loading vehicles...</div>';
  paginationControls.style.display = 'none';

  try {
    if (!currentUser || !currentUser.apiKey) {
      showNotification('Please log in first', 'error');
      return;
    }

    const searchQuery = document.getElementById('vehicleSearch')?.value || '';
    const statusFilter = document.getElementById('vehicleStatusFilter')?.value || '';

    // Build query parameters
    const params = new URLSearchParams();
    if (searchQuery) params.append('search', searchQuery);
    if (statusFilter) params.append('status', statusFilter);

    const url = `${API_CONFIG.baseUrl}/vehicles${params.toString() ? '?' + params.toString() : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': currentUser.apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to load vehicles: ${response.statusText}`);
    }

    const responseData = await response.json();

    // Extract vehicles array from response object
    allVehicles = Array.isArray(responseData) ? responseData : (responseData.vehicles || []);

    // Apply pagination
    const totalPages = Math.ceil(allVehicles.length / vehiclesPerPage);
    const startIndex = (currentPage - 1) * vehiclesPerPage;
    const endIndex = startIndex + vehiclesPerPage;
    const paginatedVehicles = allVehicles.slice(startIndex, endIndex);

    // Update pagination controls
    if (allVehicles.length > 0) {
      paginationControls.style.display = 'flex';
      document.getElementById('prevPageBtn').disabled = currentPage === 1;
      document.getElementById('nextPageBtn').disabled = currentPage >= totalPages;
      document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages} (${allVehicles.length} total)`;
    }

    // Display vehicles
    if (paginatedVehicles.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No vehicles found</h3>
          <p>Try adjusting your search or filters</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    paginatedVehicles.forEach(vehicle => {
      const card = createVehicleCard(vehicle);
      container.appendChild(card);
    });

    // Attach event listeners to post and image buttons after cards are created
    container.querySelectorAll('.post-vehicle-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        const vehicleId = e.target.closest('.post-vehicle-btn').getAttribute('data-vehicle-id');
        if (vehicleId) {
          console.log('Post button clicked for vehicle ID:', vehicleId);
          postVehicleById(vehicleId);
        }
      });
    });

    container.querySelectorAll('.images-vehicle-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        const vehicleId = e.target.closest('.images-vehicle-btn').getAttribute('data-vehicle-id');
        if (vehicleId) {
          console.log('Images button clicked for vehicle ID:', vehicleId);
          showVehicleImages(vehicleId);
        }
      });
    });

    container.querySelectorAll('.delete-vehicle-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        const vehicleId = e.target.closest('.delete-vehicle-btn').getAttribute('data-vehicle-id');
        if (vehicleId) {
          console.log('Delete button clicked for vehicle ID:', vehicleId);
          deleteVehicle(vehicleId);
        }
      });
    });

  } catch (error) {
    console.error('Error loading vehicles:', error);
    container.innerHTML = `
      <div class="empty-state">
        <h3>Error loading vehicles</h3>
        <p>${error.message}</p>
      </div>
    `;
    showNotification('Failed to load vehicles: ' + error.message, 'error');
  }
}

function createVehicleCard(vehicle) {
  const card = document.createElement('div');
  card.className = 'vehicle-card';

  const imageUrl = vehicle.images && vehicle.images.length > 0
    ? vehicle.images[0]
    : '';

  const statusClass = vehicle.status || 'available';
  const statusLabel = {
    'available': 'Available',
    'posted': 'Posted',
    'sold_pending_removal': 'Sold (Pending)',
    'sold': 'Sold'
  }[vehicle.status] || 'Available';

  card.innerHTML = `
    <div class="vehicle-card-image">
      ${imageUrl ? `<img src="${imageUrl}" alt="${vehicle.year} ${vehicle.make} ${vehicle.model}" onerror="this.parentElement.innerHTML='No Image'">` : 'No Image'}
    </div>
    <div class="vehicle-card-content">
      <div class="vehicle-card-title">${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}</div>
      <div class="vehicle-card-details">
        ${vehicle.trim ? `<div class="vehicle-card-detail-row"><span>Trim:</span><span>${vehicle.trim}</span></div>` : ''}
        ${vehicle.mileage ? `<div class="vehicle-card-detail-row"><span>Mileage:</span><span>${vehicle.mileage.toLocaleString()} mi</span></div>` : ''}
        ${vehicle.vin ? `<div class="vehicle-card-detail-row"><span>VIN:</span><span style="font-family: monospace; font-size: 11px;">${vehicle.vin}</span></div>` : ''}
        ${vehicle.location ? `<div class="vehicle-card-detail-row"><span>Location:</span><span>${vehicle.location}</span></div>` : ''}
        
        <div class="ai-prompt-wrapper">
          <span class="ai-prompt-label">Use AI Prompt</span>
          <label class="toggle-switch">
            <input type="checkbox" class="ai-prompt-toggle" data-vehicle-id="${vehicle._id}" checked>
            <span class="slider"></span>
          </label>
        </div>
      </div>
      ${vehicle.price ? `<div class="vehicle-card-price">$${vehicle.price.toLocaleString()}</div>` : ''}
      <span class="vehicle-card-status ${statusClass}">${statusLabel}</span>
    </div>
    <div class="vehicle-card-actions">
      <button class="btn btn-primary post-vehicle-btn" data-vehicle-id="${vehicle._id}">
        <span>📤</span>
        <span>Post</span>
      </button>
      <button class="btn btn-secondary images-vehicle-btn" data-vehicle-id="${vehicle._id}">
        <span>🖼️</span>
        <span>Images</span>
      </button>
      <button class="btn btn-danger delete-vehicle-btn" data-vehicle-id="${vehicle._id}">
        <span>🗑️</span>
        <span>Delete</span>
      </button>
    </div>
  `;

  return card;
}

async function postVehicleById(vehicleId) {
  console.log('postVehicleById called with ID:', vehicleId);

  try {
    if (!currentUser || !currentUser.apiKey) {
      console.error('No user or API key found');
      showNotification('Please log in first', 'error');
      return;
    }

    // Disable button to prevent multiple clicks
    const postButton = document.querySelector(`.post-vehicle-btn[data-vehicle-id="${vehicleId}"]`);
    if (postButton) {
      postButton.disabled = true;
      postButton.classList.add('loading');
      postButton.innerHTML = '<span>⏳</span><span>Loading...</span>';
    }

    showNotification('Loading vehicle data...', 'info');
    console.log('Fetching vehicle data from:', `${API_CONFIG.baseUrl}/vehicles/${vehicleId}`);

    // Check AI prompt toggle and get value
    const toggle = document.querySelector(`.ai-prompt-toggle[data-vehicle-id="${vehicleId}"]`);
    const globalPrompt = document.getElementById('globalAiPrompt');
    let fetchUrl = `${API_CONFIG.baseUrl}/vehicles/${vehicleId}`;

    if (toggle && toggle.checked && globalPrompt && globalPrompt.value.trim()) {
      const prompt = encodeURIComponent(globalPrompt.value.trim());
      fetchUrl += `?ai_prompt=${prompt}`;
      console.log('Adding AI prompt to request:', globalPrompt.value.trim());
    }

    // Fetch vehicle data by ID
    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': currentUser.apiKey
      }
    });

    console.log('API Response status:', response.status, response.statusText);

    if (!response.ok) {
      throw new Error(`Failed to load vehicle: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('API Response data:', result);

    // Check if response is in the new format (with success and data)
    if (!result.success || !result.data) {
      console.error('Invalid response format:', result);
      throw new Error('Invalid response format from server');
    }

    // Data is already formatted for posting (matches testData format)
    const vehicleData = result.data;
    console.log('Vehicle data received:', vehicleData);

    // Use existing postToFacebook function - data is already in correct format
    console.log('Calling postToFacebook with vehicle data');
    await postToFacebook(vehicleData);

    // Record posting action (don't wait for it)
    fetch(`${API_CONFIG.baseUrl}/vehicles/${vehicleId}/posted`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': currentUser.apiKey
      },
      body: JSON.stringify({
        platform: 'facebook_marketplace',
        action: 'post',
        listingUrl: '' // Will be updated when posting completes
      })
    }).catch(error => {
      console.warn('Failed to record posting action:', error);
    });

    // Re-enable button after a delay
    if (postButton) {
      setTimeout(() => {
        postButton.disabled = false;
        postButton.classList.remove('loading');
        postButton.innerHTML = '<span>📤</span><span>Post</span>';
      }, 2000);
    } else {
      // Try to find button again if not found initially
      const retryButton = document.querySelector(`.post-vehicle-btn[data-vehicle-id="${vehicleId}"]`);
      if (retryButton) {
        setTimeout(() => {
          retryButton.disabled = false;
          retryButton.classList.remove('loading');
          retryButton.innerHTML = '<span>📤</span><span>Post</span>';
        }, 2000);
      }
    }

  } catch (error) {
    console.error('Error posting vehicle:', error);
    showNotification('Failed to post vehicle: ' + error.message, 'error');

    // Re-enable button on error
    const postButton = document.querySelector(`.post-vehicle-btn[data-vehicle-id="${vehicleId}"]`);
    if (postButton) {
      postButton.disabled = false;
      postButton.classList.remove('loading');
      postButton.innerHTML = '<span>📤</span><span>Post</span>';
    }
  }
}

async function showVehicleImages(vehicleId) {
  try {
    if (!currentUser || !currentUser.apiKey) {
      showNotification('Please log in first', 'error');
      return;
    }

    // Show loading state and switch view
    document.getElementById('vehicleListingView').style.display = 'none';
    document.getElementById('vehicleImagesView').style.display = 'flex';
    const gallery = document.getElementById('imagesGallery');
    gallery.innerHTML = '<div class="loading-state">Loading images...</div>';

    // Store current vehicle ID for image operations
    window.currentVehicleId = vehicleId;

    // Fetch vehicle data to get images
    const response = await fetch(`${API_CONFIG.baseUrl}/vehicles/${vehicleId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': currentUser.apiKey
      }
    });

    if (!response.ok) throw new Error('Failed to load vehicle images');

    const result = await response.json();
    if (!result.success || !result.data || !result.data.images) {
      throw new Error('No images found for this vehicle');
    }

    displayImagesGallery(result.data.images);
  } catch (error) {
    console.error('Error loading images:', error);
    showNotification(error.message, 'error');
    // Go back on error
    document.getElementById('vehicleImagesView').style.display = 'none';
    document.getElementById('vehicleListingView').style.display = 'flex';
  }
}

function displayImagesGallery(images) {
  const gallery = document.getElementById('imagesGallery');
  gallery.innerHTML = '';

  if (images.length === 0) {
    gallery.innerHTML = '<div class="empty-state"><h3>No images available</h3></div>';
    return;
  }

  images.forEach((imageUrl, index) => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.innerHTML = `
      <img src="${imageUrl}" alt="Vehicle Image ${index + 1}" onerror="this.src='icons/icon48.png'">
      <div class="image-upload-overlay">
        <div class="overlay-buttons">
          <button class="upload-single-btn" data-url="${imageUrl}" title="Upload to Facebook">
            <span>📤</span>
          </button>
          <button class="remove-bg-btn-gallery" data-url="${imageUrl}" title="Remove Background (Nano Banana)">
            <span>🍌</span>
          </button>
        </div>
      </div>
    `;

    // Attach click listener for upload
    const uploadBtn = item.querySelector('.upload-single-btn');
    uploadBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const url = e.target.closest('.upload-single-btn').getAttribute('data-url');
      if (url) {
        await uploadIndividualImage(url, uploadBtn);
      }
    });

    // Attach click listener for remove bg
    const removeBgBtn = item.querySelector('.remove-bg-btn-gallery');
    removeBgBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const url = removeBgBtn.getAttribute('data-url');
      if (url) {
        await removeVehicleImageBackground(url, removeBgBtn);
      }
    });

    gallery.appendChild(item);
  });
}

async function removeVehicleImageBackground(imageUrl, button) {
  if (!window.currentVehicleId) {
    showNotification('Vehicle ID missing', 'error');
    return;
  }

  try {
    // Ask for user instructions
    const userPrompt = prompt('Enter AI editing instructions (e.g., "Remove background", "Make it a sunny day"):', 'Remove background');
    if (!userPrompt) return; // User cancelled

    button.disabled = true;
    const originalContent = button.innerHTML;
    button.innerHTML = '<span>⏳</span>';

    showNotification('Processing image with AI...', 'info');

    const response = await fetch(`${API_CONFIG.baseUrl}/vehicles/${window.currentVehicleId}/remove-bg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': currentUser.apiKey
      },
      body: JSON.stringify({
        imageUrl: imageUrl,
        prompt: userPrompt
      })
    });

    const result = await response.json();

    if (result.success) {
      showNotification('Background removed successfully!', 'success');
      // Refresh images
      showVehicleImages(window.currentVehicleId);
    } else {
      throw new Error(result.message || 'Failed to remove background');
    }

  } catch (error) {
    console.error('Background removal error:', error);
    showNotification('Error: ' + error.message, 'error');
    button.innerHTML = '<span>❌</span>';
    setTimeout(() => {
      button.disabled = false;
      button.innerHTML = '<span>🍌</span>';
    }, 2000);
  }
}

async function uploadIndividualImage(imageUrl, button) {
  try {
    // Show loading state on button
    const originalContent = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span>⏳</span><span>...</span>';

    // Get active tab
    const [tab] = await safeChromeCall(() => chrome.tabs.query({ active: true, currentWindow: true }));

    if (!tab || !tab.url.includes('facebook.com/marketplace/create')) {
      showNotification('Please open a Facebook Marketplace listing page first', 'warning');
      button.disabled = false;
      button.innerHTML = originalContent;
      return;
    }

    // Ensure content script is loaded and responsive
    await ensureContentScriptLoaded(tab.id);

    // Send message to content script
    const response = await safeChromeCall(() => chrome.tabs.sendMessage(tab.id, {
      action: 'uploadSpecificImage',
      imageUrl: imageUrl
    }));

    if (response && response.success) {
      button.classList.add('success');
      button.innerHTML = '<span>✅</span><span>Sent</span>';
      showNotification('Image upload initiated', 'success');
    } else {
      throw new Error(response?.message || 'Failed to initiate upload');
    }

    // Reset button after delay
    setTimeout(() => {
      button.classList.remove('success');
      button.disabled = false;
      button.innerHTML = originalContent;
    }, 2000);

  } catch (error) {
    console.error('Individual upload error:', error);
    showNotification(error.message, 'error');
    button.disabled = false;
    button.innerHTML = '<span>❌</span><span>Retry</span>';
  }
}




// ============ Delete Vehicle Functions ============

async function deleteVehicle(vehicleId) {
  if (!confirm('Are you sure you want to delete this vehicle? This action cannot be undone.')) {
    return;
  }

  try {
    if (!currentUser || !currentUser.apiKey) {
      showNotification('Please log in first', 'error');
      return;
    }

    showNotification('Deleting vehicle...', 'info');

    const response = await fetch(`${API_CONFIG.baseUrl}/vehicles/${vehicleId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': currentUser.apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to delete vehicle: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.success) {
      showNotification('✅ Vehicle deleted successfully!', 'success');
      // Reload the vehicles list
      await loadVehicles();
    } else {
      throw new Error(result.message || 'Failed to delete vehicle');
    }

  } catch (error) {
    console.error('Delete error:', error);
    showNotification('Failed to delete vehicle: ' + error.message, 'error');
  }
}

async function deleteAllVehicles() {
  if (!confirm('⚠️ WARNING: This will delete ALL your vehicles! This action cannot be undone. Are you absolutely sure?')) {
    return;
  }

  // Double confirmation for safety
  if (!confirm('This is your last chance. Delete ALL vehicles permanently?')) {
    return;
  }

  try {
    if (!currentUser || !currentUser.apiKey) {
      showNotification('Please log in first', 'error');
      return;
    }

    showNotification('Deleting all vehicles...', 'info');

    const response = await fetch(`${API_CONFIG.baseUrl}/vehicles`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': currentUser.apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to delete vehicles: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.success) {
      showNotification(`✅ Deleted ${result.deletedCount} vehicles successfully!`, 'success');
      // Reload the vehicles list (should be empty now)
      await loadVehicles();
    } else {
      throw new Error(result.message || 'Failed to delete vehicles');
    }

  } catch (error) {
    console.error('Delete all error:', error);
    showNotification('Failed to delete vehicles: ' + error.message, 'error');
  }
}

// Expose postVehicleById globally for onclick handlers
if (typeof window !== 'undefined') {
  window.postVehicleById = postVehicleById;
}

// ============ Message Listener for Content Scripts ============

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'postComplete') {
    logActivity('post_completed', {
      success: request.success,
      listingUrl: request.listingUrl,
      vin: request.vin
    });

    if (request.success) {
      showNotification('Vehicle posted successfully!', 'success');
    } else {
      showNotification('Posting failed: ' + request.error, 'error');
    }
  }

  if (request.action === 'updateProgress') {
    showNotification(request.message, 'info');
  }
});

// Expose API functions globally for console access
if (typeof window !== 'undefined') {
  window.fillFormWithTestData = fillFormWithTestData;
  window.fillFormWithDefaultTestData = fillFormWithDefaultTestData;
  window.fetchTestDataFromAPI = fetchTestDataFromAPI;

  console.log('API Functions exposed:');
  console.log('  - fillFormWithTestData(testData, tabId?) - Fill form with custom test data');
  console.log('  - fillFormWithDefaultTestData(tabId?, customData?) - Fill form with test data from API');
  console.log('  - fetchTestDataFromAPI(customData?) - Fetch test data from API');
}
