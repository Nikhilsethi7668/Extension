
// ============ Global Loader Functions ============

// Global variables for loader state
let lastBatchParams = null;

function showGlobalLoader(title = 'Processing', message = 'Please wait...') {
    const overlay = document.getElementById('globalLoaderOverlay');
    const titleEl = overlay.querySelector('.loader-title');
    const messageEl = overlay.querySelector('.loader-message');
    const statusList = document.getElementById('loaderStatusList');
    const errorState = document.getElementById('loaderErrorState');

    // Set content
    titleEl.textContent = title;
    messageEl.textContent = message;

    // Reset state
    statusList.innerHTML = '';
    errorState.style.display = 'none';

    // Show overlay
    overlay.classList.add('active');

    // Ensure controls container exists
    let controls = overlay.querySelector('.loader-controls');
    if (!controls) {
        controls = document.createElement('div');
        controls.className = 'loader-controls';
        controls.style.cssText = 'display: flex; gap: 10px; justify-content: center; margin-top: 15px;';
        controls.innerHTML = `
            <button id="loaderPauseBtn" class="btn btn-secondary" style="background: #f59e0b; color: white;">⏸️ Pause</button>
            <button id="loaderStopBtn" class="btn btn-danger">⏹️ Stop</button>
        `;
        // Insert after progress
        const progress = overlay.querySelector('.loader-progress');
        progress.parentNode.insertBefore(controls, progress.nextSibling);
    }

    // Reset buttons
    const pauseBtn = document.getElementById('loaderPauseBtn');
    if (pauseBtn) {
        pauseBtn.innerHTML = '⏸️ Pause';
        pauseBtn.onclick = null; // Clear previous handlers
    }
    const stopBtn = document.getElementById('loaderStopBtn');
    if (stopBtn) {
        stopBtn.onclick = null; // Clear previous handlers
    }
}

function hideGlobalLoader() {
    const overlay = document.getElementById('globalLoaderOverlay');
    overlay.classList.remove('active');
}

function updateLoaderProgress(current, total) {
    const progressFill = document.querySelector('.loader-progress-fill');
    const progressText = document.querySelector('.loader-progress-text');

    const percentage = total > 0 ? (current / total) * 100 : 0;
    progressFill.style.width = `${percentage}%`;
    progressText.textContent = `${current} of ${total} complete`;
}

function addLoaderStatus(id, text, status = 'processing') {
    const statusList = document.getElementById('loaderStatusList');

    const statusItem = document.createElement('div');
    statusItem.className = `loader-status-item ${status}`;
    statusItem.id = `loader-status-${id.replace(/[^a-zA-Z0-9]/g, '-')}`;

    const iconMap = {
        processing: '⏳',
        success: '✅',
        error: '❌',
        pending: '⏸️'
    };

    statusItem.innerHTML = `
    <span class="loader-status-icon">${iconMap[status] || '📄'}</span>
    <span class="loader-status-text">${text}</span>
  `;

    statusList.appendChild(statusItem);
}

function updateLoaderStatus(id, status, text) {
    const statusId = `loader-status-${id.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const statusItem = document.getElementById(statusId);

    if (!statusItem) return;

    // Remove old status classes
    statusItem.classList.remove('pending', 'processing', 'success', 'error');
    statusItem.classList.add(status);

    const iconMap = {
        processing: '⏳',
        success: '✅',
        error: '❌',
        pending: '⏸️'
    };

    statusItem.innerHTML = `
    <span class="loader-status-icon">${iconMap[status] || '📄'}</span>
    <span class="loader-status-text">${text}</span>
  `;
}

function showLoaderError(message) {
    const errorState = document.getElementById('loaderErrorState');
    const errorMessage = document.getElementById('loaderErrorMessage');

    errorMessage.textContent = message;
    errorState.style.display = 'block';
}

function retryBatchProcessing() {
    // Hide error state
    const errorState = document.getElementById('loaderErrorState');
    errorState.style.display = 'none';

    // Close loader
    hideGlobalLoader();

    // Show notification to retry
    showNotification('Please try processing the images again', 'info');
}

// Expose loader functions globally
if (typeof window !== 'undefined') {
    window.showGlobalLoader = showGlobalLoader;
    window.hideGlobalLoader = hideGlobalLoader;
    window.updateLoaderProgress = updateLoaderProgress;
    window.addLoaderStatus = addLoaderStatus;
    window.updateLoaderStatus = updateLoaderStatus;
    window.showLoaderError = showLoaderError;
    window.retryBatchProcessing = retryBatchProcessing;
}
