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
    const statusRef = useRef(status);

    // Sync ref with state
    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    // Health check function
   const checkConnection = async () => {
  const startTime = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const PUBLIC_PING_URL = 'https://cloudflare.com/cdn-cgi/trace';

  try {
    // 1️⃣ Check public internet FIRST
    const publicResponse = await fetch(PUBLIC_PING_URL, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store'
    });

    if (!publicResponse.ok && publicResponse.status !== 204) {
      throw new Error('Public internet unreachable');
    }

    const internetLatency = Date.now() - startTime;

    handleSuccess(internetLatency);
  } catch (error) {
    if (error.name === 'AbortError') {
      handleFailure('Timeout', null);
    } else {
      handleFailure(error.message, null);
    }
  } finally {
    clearTimeout(timeoutId);
  }
};


    // Handle successful connection check
    const handleSuccess = (responseLatency) => {
        consecutiveFailuresRef.current = 0;
        consecutiveSuccessesRef.current++;

        console.log(`[InternetMonitor] Connection OK - Latency: ${responseLatency}ms`);

        // Determine status based on latency
        let newStatus;
        if (responseLatency > 2000) {
            newStatus = 'offline'; // User requested > 2s to be considered offline
        } else if (responseLatency > 400) {
            newStatus = 'poor'; // User requested > 400ms to be considered poor
        } else {
            newStatus = 'good';
        }

        // Update status immediately if we are good, or if we have sustained 2 successes.
        // The goal is to clear warnings immediately when connection improves.
        
        if (newStatus === 'good' || consecutiveSuccessesRef.current >= 2 || statusRef.current === 'unknown') {
            updateState(newStatus, responseLatency);
        } else {
            // We are in debounce for non-good statuses (though logically newStatus='good' is handled above).
            // If we are consistent with current status, update the latency.
            if (statusRef.current === newStatus) {
                 updateState(newStatus, responseLatency);
            }
        }
    };

    // Handle failed connection check
    const handleFailure = (reason, failedLatency) => {
        consecutiveSuccessesRef.current = 0;
        consecutiveFailuresRef.current++;

        console.warn(`[InternetMonitor] Connection check failed: ${reason} (Failures: ${consecutiveFailuresRef.current})`);

        // Mark as offline after maxRetries consecutive failures
        if (consecutiveFailuresRef.current >= maxRetries) {
            updateState('offline', failedLatency);
        } else if (consecutiveFailuresRef.current === 1) {
            // First failure, mark as poor immediately
            updateState('poor', failedLatency);
        }
    };

    // Update connection status and latency together
    const updateState = (newStatus, newLatency) => {
        // Safe update: ensure we don't set a "good" latency with a "poor" status unless it's a timeout
        
        // If status is poor/offline, and latency is low (<3000) and not null, it's confusing.
        // But failedLatency is passed as null for network errors.
        
        let finalLatency = newLatency;
        
        // If we are setting status to 'poor' or 'offline', and we have no valid latency (null), 
        // make sure we pass null to clear any old "good" latency.
        if ((newStatus === 'poor' || newStatus === 'offline') && newLatency === null) {
            finalLatency = null;
        }

        // Use ref to check current status to avoid closure staleness
        if (statusRef.current !== newStatus || latency !== finalLatency) {
             if (statusRef.current !== newStatus) {
                console.log(`[InternetMonitor] Status changed: ${statusRef.current} → ${newStatus}`);
                setStatus(newStatus);
                setIsOnline(newStatus !== 'offline');
                setIsUnstable(newStatus === 'poor' || newStatus === 'offline');
             }
             
             // Always update latency if passed (and differs)
             if (finalLatency !== undefined) {
                 setLatency(finalLatency);
             }
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
