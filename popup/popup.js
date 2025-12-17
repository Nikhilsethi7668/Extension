// popup.js - Main popup controller
const API_CONFIG = {
  baseUrl: 'http://localhost:3001/api',
  endpoints: {
    login: '/auth/login',
    logout: '/auth/logout',
    validateSession: '/auth/validate',
    logActivity: '/logs/activity'
  }
};

let currentUser = null;
let sessionId = generateSessionId();

function generateSessionId() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await loadUserSession();
  attachEventListeners();
});

// Load existing session
async function loadUserSession() {
  try {
    const stored = await chrome.storage.local.get(['userSession']);
    if (stored.userSession) {
      const isValid = await validateSession(stored.userSession);
      if (isValid) {
        currentUser = stored.userSession;
        showMainControls();
      } else {
        currentUser = null;
        await chrome.storage.local.remove('userSession');
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

// Login function
async function login() {
  const userId = document.getElementById('userId').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!userId || !password) {
    showNotification('Please enter both User ID and Password', 'error');
    return;
  }

  // DEMO MODE
  if (userId === 'demo' && password === 'demo') {
    currentUser = {
      userId: 'demo',
      token: 'demo-token',
      role: 'user'
    };
    await chrome.storage.local.set({ userSession: currentUser });
    showMainControls();
    showNotification('Demo mode activated!', 'success');
    return;
  }

  try {
    const response = await fetch(API_CONFIG.baseUrl + API_CONFIG.endpoints.login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password })
    });

    const data = await response.json();

    if (response.ok && data.token) {
      currentUser = {
        userId: data.userId || userId,
        token: data.token,
        role: data.role || 'user'
      };
      await chrome.storage.local.set({ userSession: currentUser });
      showMainControls();
      showNotification('Logged in!', 'success');
    } else {
      showNotification(data.message || 'Login failed', 'error');
    }
  } catch (error) {
    console.error('Login error:', error);
    showNotification('Backend unavailable. Try demo/demo', 'error');
  }
}

// Logout function
async function logout() {
  currentUser = null;
  await chrome.storage.local.remove('userSession');
  showLoginSection();
  document.getElementById('userId').value = '';
  document.getElementById('password').value = '';
  showNotification('Logged out', 'success');
}

// Validate session
async function validateSession(session) {
  try {
    if (!session || !session.token) return false;
    const response = await fetch(API_CONFIG.baseUrl + API_CONFIG.endpoints.validateSession, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`
      }
    });
    const data = await response.json();
    return response.ok && data.success === true;
  } catch (error) {
    return false;
  }
}

// UI Functions
function showLoginSection() {
  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('mainControls').style.display = 'none';
}

function showMainControls() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('mainControls').style.display = 'block';
  updateStatusText();
}

function updateStatusText() {
  if (currentUser) {
    document.getElementById('statusText').textContent = `Logged in as: ${currentUser.userId}`;
  }
}

function showNotification(message, type) {
  console.log(`[${type.toUpperCase()}] ${message}`);
  // Could add toast notifications here
}

// Event listeners
function attachEventListeners() {
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userIdInput = document.getElementById('userId');
  const passwordInput = document.getElementById('password');
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
  if (userIdInput && passwordInput) {
    userIdInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') login();
    });
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') login();
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
}

// Test backend connection
async function testConnection() {
  const statusDiv = document.getElementById('connectionStatus');
  statusDiv.innerHTML = '⏳ Testing connection...';
  statusDiv.style.color = '#666';

  try {
    const response = await fetch(API_CONFIG.baseUrl + '/health', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    if (response.ok && data.status === 'ok') {
      statusDiv.innerHTML = '✅ Backend connected successfully!';
      statusDiv.style.color = '#28a745';
      showNotification('Backend connection successful', 'success');
    } else {
      statusDiv.innerHTML = '⚠️ Backend responded but status unclear';
      statusDiv.style.color = '#ffc107';
    }
  } catch (error) {
    statusDiv.innerHTML = '❌ Cannot connect to backend';
    statusDiv.style.color = '#dc3545';
    showNotification('Backend connection failed. Make sure server is running on http://localhost:3001', 'error');
  }
}
    console.error('Scraping error:', error);
    showNotification('Error scraping data: ' + error.message, 'error');
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
        userId: currentUser.userId,
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
  const stored = await chrome.storage.local.get(['postingQueue']);
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
    
    // Store data for the Facebook autofill script
    await chrome.storage.local.set({ 
      pendingPost: {
        ...dataToPost,
        description: document.getElementById('generatedDesc').value,
        config: {
          category: document.getElementById('vehicleCategory').value,
          emoji: document.getElementById('emojiStyle').value,
          whereToPost: document.getElementById('whereToPost').value,
          distance: document.getElementById('distance').value,
          groups: document.getElementById('fbGroups').value.split('\n').filter(g => g.trim())
        }
      }
    });
    
    // Open Facebook Marketplace create listing page
    const marketplaceUrl = 'https://www.facebook.com/marketplace/create/vehicle';
    await chrome.tabs.create({ url: marketplaceUrl });
    
    showNotification('Navigate through the form. Auto-fill will activate automatically.', 'success');
    
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
        currentUser?.userId || 'anonymous',
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
        userId: currentUser?.userId || 'anonymous',
        action,
        details,
        timestamp: new Date().toISOString(),
        sessionId: sessionId
      };
    }
    
    // Send to backend
    const response = await fetch(API_CONFIG.baseUrl + API_CONFIG.endpoints.logActivity, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': currentUser ? `Bearer ${currentUser.token}` : ''
      },
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

function showNotification(message, type = 'info') {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: '../icons/icon128.png',
    title: 'Vehicle Auto-Lister',
    message: message
  });
  
  // Also log to console
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// ============ Event Listeners ============

function attachEventListeners() {
  // Authentication
  document.getElementById('loginBtn').addEventListener('click', login);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  
  // Scraping
  document.getElementById('scrapeBtn').addEventListener('click', scrapeCurrentPage);
  
  // AI Description
  document.getElementById('generateDescBtn').addEventListener('click', generateDescription);
  
  // Queue Management
  document.getElementById('addToQueueBtn').addEventListener('click', addToQueue);
  document.getElementById('clearQueueBtn').addEventListener('click', clearQueue);
  document.getElementById('postAllBtn').addEventListener('click', postAllInQueue);
  
  // Posting
  document.getElementById('postNowBtn').addEventListener('click', () => postToFacebook());
  
  // Image editing
  document.getElementById('batchEditBtn').addEventListener('click', batchEditImages);
  document.getElementById('clearEditsBtn').addEventListener('click', clearAllEdits);
  document.getElementById('cropResizeBtn').addEventListener('click', () => {
    showNotification('Image crop/resize feature coming soon!', 'info');
  });
  
  // Enter key for login
  document.getElementById('password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
  });
}

// ============ Utility Functions ============

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
