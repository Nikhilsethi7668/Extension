/**
 * Internet Monitor
 * Monitors internet connectivity by checking public internet (Cloudflare)
 * Emits events when connection quality changes
 */

class InternetMonitor {
    constructor(config = {}) {
        // Note: We check public internet (cloudflare.com) for reliability
        // This ensures we detect actual internet problems, not just API downtime
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
     * Check connection by pinging public internet first
     */
    async checkConnection() {
        const startTime = Date.now();
        const PUBLIC_PING_URL = 'https://cloudflare.com/cdn-cgi/trace';

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            // 1️⃣ Check public internet FIRST
            const publicResponse = await fetch(PUBLIC_PING_URL, {
                method: 'GET',
                signal: controller.signal,
                cache: 'no-store'
            });

            clearTimeout(timeoutId);

            if (!publicResponse.ok && publicResponse.status !== 204) {
                throw new Error('Public internet unreachable');
            }

            const latency = Date.now() - startTime;
            this.lastLatency = latency;
            this.handleSuccess(latency);
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

        // Determine status based on latency thresholds
        let newStatus;
        if (latency > 2000) {
            newStatus = 'offline'; // > 2s considered offline
        } else if (latency > 400) {
            newStatus = 'poor';    // > 400ms considered poor
        } else {
            newStatus = 'good';    // < 400ms is good
        }

        // Update status immediately if good, or if we have sustained 2 successes.
        // The goal is to clear warnings immediately when connection improves.
        if (newStatus === 'good' || this.consecutiveSuccesses >= 2 || this.currentStatus === 'unknown') {
            this.updateStatus(newStatus, latency);
        } else {
            // We are in debounce for non-good statuses
            // If we are consistent with current status, update the latency
            if (this.currentStatus === newStatus) {
                this.lastLatency = latency;
            }
        }
    }

    /**
     * Handle failed connection check
     */
    handleFailure(reason) {
        this.consecutiveSuccesses = 0;
        this.consecutiveFailures++;

        console.warn(`[InternetMonitor] Connection check failed: ${reason} (Failures: ${this.consecutiveFailures})`);

        // Mark as offline after maxRetries consecutive failures
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

        // Safe state update: ensure we don't set confusing state/latency combinations
        let finalLatency = latency;
        
        // If we are setting status to 'poor' or 'offline', and we have no valid latency (null), 
        // make sure we pass null to clear any old "good" latency.
        if ((newStatus === 'poor' || newStatus === 'offline') && latency === null) {
            finalLatency = null;
        }

        // Only emit events if status actually changed
        if (oldStatus !== newStatus) {
            console.log(`[InternetMonitor] Status changed: ${oldStatus} → ${newStatus}`);
            this.currentStatus = newStatus;
            
            if (finalLatency !== undefined) {
                this.lastLatency = finalLatency;
            }

            // Emit status change event
            this.emit('status-change', {
                oldStatus,
                newStatus,
                latency: this.lastLatency,
                timestamp: Date.now()
            });

            // Emit specific event based on new status
            switch (newStatus) {
                case 'good':
                    this.emit('connection-good', { latency: this.lastLatency });
                    break;
                case 'poor':
                    this.emit('connection-poor', { latency: this.lastLatency });
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
