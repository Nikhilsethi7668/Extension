/**
 * Internet Monitor
 * Monitors internet connectivity by pinging the backend health endpoint
 * Emits events when connection quality changes
 */

class InternetMonitor {
    constructor(config = {}) {
        this.apiUrl = config.apiUrl || CONFIG.backendUrl.replace('/api', '') + '/api/health';
        this.checkInterval = config.checkInterval || 5000; // 5 seconds
        this.timeout = config.timeout || 3000; // 3 seconds
        this.maxRetries = config.maxRetries || 3;

        this.intervalId = null;
        this.isRunning = false;
        this.currentStatus = 'unknown'; // 'good', 'poor', 'offline', 'unknown'
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
        this.lastLatency = null;

        // Event listeners
        this.listeners = {
            'status-change': [],
            'connection-good': [],
            'connection-poor': [],
            'connection-offline': []
        };
    }

    /**
     * Start monitoring internet connectivity
     */
    start() {
        if (this.isRunning) {
            console.log('[InternetMonitor] Already running');
            return;
        }

        console.log('[InternetMonitor] Starting monitor');
        this.isRunning = true;

        // Run initial check immediately
        this.checkConnection();

        // Then check at regular intervals
        this.intervalId = setInterval(() => {
            this.checkConnection();
        }, this.checkInterval);
    }

    /**
     * Stop monitoring
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('[InternetMonitor] Stopping monitor');
        this.isRunning = false;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Check connection by pinging health endpoint
     */
    async checkConnection() {
        const startTime = Date.now();

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            const response = await fetch(this.apiUrl, {
                method: 'GET',
                signal: controller.signal,
                cache: 'no-cache'
            });

            clearTimeout(timeoutId);

            const latency = Date.now() - startTime;
            this.lastLatency = latency;

            if (response.ok) {
                // Success
                this.handleSuccess(latency);
            } else {
                // Server error
                this.handleFailure('Server error: ' + response.status);
            }
        } catch (error) {
            // Network error or timeout
            const latency = Date.now() - startTime;
            this.lastLatency = latency;

            if (error.name === 'AbortError') {
                this.handleFailure('Timeout after ' + this.timeout + 'ms');
            } else {
                this.handleFailure('Network error: ' + error.message);
            }
        }
    }

    /**
     * Handle successful connection check
     */
    handleSuccess(latency) {
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses++;

        console.log(`[InternetMonitor] Connection OK - Latency: ${latency}ms`);

        // Determine status based on latency
        let newStatus;
        if (latency < 3000) {
            newStatus = 'good';
        } else {
            newStatus = 'poor'; // Slow but working
        }

        // Only update status if we have 2 consecutive successes (to avoid flickering)
        if (this.consecutiveSuccesses >= 2 || this.currentStatus === 'unknown') {
            this.updateStatus(newStatus, latency);
        }
    }

    /**
     * Handle failed connection check
     */
    handleFailure(reason) {
        this.consecutiveSuccesses = 0;
        this.consecutiveFailures++;

        console.warn(`[InternetMonitor] Connection check failed: ${reason} (Failures: ${this.consecutiveFailures})`);

        // Mark as offline after 3 consecutive failures
        if (this.consecutiveFailures >= this.maxRetries) {
            this.updateStatus('offline', null);
        } else if (this.consecutiveFailures === 1) {
            // First failure, mark as poor immediately
            this.updateStatus('poor', null);
        }
    }

    /**
     * Update connection status and emit events
     */
    updateStatus(newStatus, latency) {
        const oldStatus = this.currentStatus;

        if (oldStatus !== newStatus) {
            console.log(`[InternetMonitor] Status changed: ${oldStatus} → ${newStatus}`);
            this.currentStatus = newStatus;

            // Emit status change event
            this.emit('status-change', {
                oldStatus,
                newStatus,
                latency,
                timestamp: Date.now()
            });

            // Emit specific event
            switch (newStatus) {
                case 'good':
                    this.emit('connection-good', { latency });
                    break;
                case 'poor':
                    this.emit('connection-poor', { latency });
                    break;
                case 'offline':
                    this.emit('connection-offline', {});
                    break;
            }
        }
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            status: this.currentStatus,
            latency: this.lastLatency,
            isOnline: this.currentStatus !== 'offline',
            isUnstable: this.currentStatus === 'poor' || this.currentStatus === 'offline'
        };
    }

    /**
     * Register event listener
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            console.warn(`[InternetMonitor] Unknown event: ${event}`);
            return;
        }

        this.listeners[event].push(callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (!this.listeners[event]) {
            return;
        }

        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    /**
     * Emit event to all listeners
     */
    emit(event, data) {
        if (!this.listeners[event]) {
            return;
        }

        this.listeners[event].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`[InternetMonitor] Error in ${event} listener:`, error);
            }
        });
    }

    /**
     * Reset monitor state
     */
    reset() {
        this.currentStatus = 'unknown';
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
        this.lastLatency = null;
    }
}

// Export for use in popup.js
if (typeof window !== 'undefined') {
    window.InternetMonitor = InternetMonitor;
}
