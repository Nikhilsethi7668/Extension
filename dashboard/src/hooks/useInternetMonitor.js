import { useState, useEffect, useRef } from 'react';

const useInternetMonitor = (config = {}) => {
    const {
        checkInterval = 5000,  // Check every 5 seconds
        timeout = 3000,        // 3 second timeout
        maxRetries = 3,        // Mark offline after 3 failures
        enabled = true         // Allow disabling the monitor
    } = config;

    const [status, setStatus] = useState('good'); // 'good', 'poor', 'offline', 'unknown'
    const [latency, setLatency] = useState(null);
    const [isOnline, setIsOnline] = useState(true);
    const [isUnstable, setIsUnstable] = useState(false);

    const consecutiveFailuresRef = useRef(0);
    const consecutiveSuccessesRef = useRef(0);
    const intervalIdRef = useRef(null);

    // Health check function
    const checkConnection = async () => {
        const startTime = Date.now();

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            // Use environment variable or default to /api/health
            const healthUrl = import.meta.env.VITE_API_URL
                ? `${import.meta.env.VITE_API_URL}/health`
                : '/api/health';

            const response = await fetch(healthUrl, {
                method: 'GET',
                signal: controller.signal,
                cache: 'no-cache'
            });

            clearTimeout(timeoutId);

            const responseLatency = Date.now() - startTime;
            setLatency(responseLatency);

            if (response.ok) {
                // Success
                handleSuccess(responseLatency);
            } else {
                // Server error
                handleFailure('Server error: ' + response.status);
            }
        } catch (error) {
            // Network error or timeout
            const responseLatency = Date.now() - startTime;
            setLatency(responseLatency);

            if (error.name === 'AbortError') {
                handleFailure('Timeout after ' + timeout + 'ms');
            } else {
                handleFailure('Network error: ' + error.message);
            }
        }
    };

    // Handle successful connection check
    const handleSuccess = (responseLatency) => {
        consecutiveFailuresRef.current = 0;
        consecutiveSuccessesRef.current++;

        console.log(`[InternetMonitor] Connection OK - Latency: ${responseLatency}ms`);

        // Determine status based on latency
        let newStatus;
        if (responseLatency < 3000) {
            newStatus = 'good';
        } else {
            newStatus = 'poor'; // Slow but working
        }

        // Only update status if we have 2 consecutive successes (to avoid flickering)
        if (consecutiveSuccessesRef.current >= 2 || status === 'unknown') {
            updateStatus(newStatus);
        }
    };

    // Handle failed connection check
    const handleFailure = (reason) => {
        consecutiveSuccessesRef.current = 0;
        consecutiveFailuresRef.current++;

        console.warn(`[InternetMonitor] Connection check failed: ${reason} (Failures: ${consecutiveFailuresRef.current})`);

        // Mark as offline after maxRetries consecutive failures
        if (consecutiveFailuresRef.current >= maxRetries) {
            updateStatus('offline');
        } else if (consecutiveFailuresRef.current === 1) {
            // First failure, mark as poor immediately
            updateStatus('poor');
        }
    };

    // Update connection status
    const updateStatus = (newStatus) => {
        if (status !== newStatus) {
            console.log(`[InternetMonitor] Status changed: ${status} → ${newStatus}`);
            setStatus(newStatus);
            setIsOnline(newStatus !== 'offline');
            setIsUnstable(newStatus === 'poor' || newStatus === 'offline');
        }
    };

    // Start monitoring
    useEffect(() => {
        if (!enabled) {
            return;
        }

        console.log('[InternetMonitor] Starting monitor...');

        // Run initial check immediately
        checkConnection();

        // Then check at regular intervals
        intervalIdRef.current = setInterval(() => {
            checkConnection();
        }, checkInterval);

        // Cleanup on unmount
        return () => {
            if (intervalIdRef.current) {
                console.log('[InternetMonitor] Stopping monitor...');
                clearInterval(intervalIdRef.current);
                intervalIdRef.current = null;
            }
        };
    }, [enabled, checkInterval, timeout]);

    return {
        status,
        latency,
        isOnline,
        isUnstable
    };
};

export default useInternetMonitor;
