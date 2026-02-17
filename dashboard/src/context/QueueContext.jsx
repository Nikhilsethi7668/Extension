import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const QueueContext = createContext();

export const useQueue = () => {
    const context = useContext(QueueContext);
    if (!context) {
        throw new Error('useQueue must be used within a QueueProvider');
    }
    return context;
};

import { io } from 'socket.io-client';

// Single source for API URLs (avoid double /api)
const getApiOrigin = () => {
    const raw = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfender.com';
    return raw.replace(/\/api\/?$/, '').replace(/\/+$/, '') || 'https://api.flashfender.com';
};
const getApiBaseUrl = () => getApiOrigin() + '/api';

export const QueueProvider = ({ children }) => {
    const [queueProgress, setQueueProgress] = useState({
        active: false,
        message: '',
        percent: 0,
        completed: false,
        error: false
    });

    const [socket, setSocket] = useState(null);

    // Initialize Socket
    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (!storedUser) return;
        
        const user = JSON.parse(storedUser);
        if (!user || !user._id || !user.organization) return;

        const newSocket = io(getApiOrigin(), {
             auth: {
                 clientType: 'dashboard',
                 token: user.token
             },
             query: {
                 clientType: 'dashboard',
                 userId: user._id, 
                 orgId: user.organization._id || user.organization
             }
        });

        newSocket.on('connect', () => {
             console.log('[Dashboard Socket] Connected:', newSocket.id);
             // Join rooms explicitly if needed, but backend handles it on 'register-client' usually?
             // Backend index.js handles 'register-client' event. Let's emit it.
             newSocket.emit('register-client', {
                 orgId: user.organization._id || user.organization,
                 userId: user._id,
                 clientType: 'dashboard'
             });
        });

        newSocket.on('queue-progress', (data) => {
             console.log('[Dashboard Socket] Progress:', data);
             if (data.type === 'progress') {
                     setQueueProgress(prev => ({
                     ...prev,
                     active: true,
                     message: data.message,
                     // If adding new jobs, percent might change, so we trust backend calculation usually.
                     // But if it jumps to 0 inappropriately, we can guard it?
                     // Backend now re-emits correct global percent immediately. 
                     // Let's just trust data.percent but ensure we don't accidentally hide it.
                     percent: data.percent,
                     completed: false,
                     error: false
                 }));
             } else if (data.type === 'complete') {
                 setQueueProgress({
                     active: true,
                     message: data.message,
                     percent: 100,
                     completed: true,
                     error: false
                 });
                 // Minimize after delay
                 setTimeout(() => {
                    setQueueProgress(prev => ({ ...prev, active: false }));
                 }, 5000);
             } else if (data.type === 'error') {
                 setQueueProgress({
                     active: true, 
                     message: data.message, 
                     percent: 0, 
                     error: true,
                     completed: false,
                 });
             }
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, []);

    const queuePosting = useCallback(async (payload, token, onSuccess) => {
        // Initialize progress UI immediately
        if (queueProgress.active) {
            // If already active, don't reset percent to 0, just update message
            setQueueProgress(prev => ({
                ...prev,
                message: 'Adding to queue...'
            }));
        } else {
            // Fresh start
            setQueueProgress({
                active: true,
                message: 'Initializing queue...',
                percent: 0,
                completed: false,
                error: false
            });
        }

        try {
            // We use simple FETCH now, because socket will handle updates!
            // No need to read stream anymore if backend uses queue.
            // But IF backend sends stream for "initial" progress, we can keep it.
            // QueueManager "addJob" returns immediately.
            
            const response = await fetch(`${getApiBaseUrl()}/vehicles/queue-posting`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Queue failed');
            }
            
            const data = await response.json();
            // Response is 202 Accepted { success: true, message: ... }
            
            // We rely on socket for further updates.
            setQueueProgress(prev => ({
                ...prev,
                message: data.message || 'Request queued. Waiting for processor...',
                // Don't reset percent here either if we were already active
                // if it was 0, it stays 0. If it was 50, it stays 50 until backend emits new total.
            }));

        } catch (error) {
            console.error('Queue Error:', error);
            setQueueProgress({ 
                active: true, 
                message: 'Error: ' + error.message, 
                percent: 0, 
                error: true,
                completed: false
            });
            setTimeout(() => {
                setQueueProgress(prev => ({ ...prev, active: false }));
            }, 8000);
        }
    }, []);

    const postNow = useCallback(async (payload, token, onSuccess) => {
        setQueueProgress({
            active: true,
            message: 'Initiating immediate post...',
            percent: 0,
            completed: false,
            error: false
        });

        try {
            const response = await fetch(`${getApiBaseUrl()}/vehicles/post-now`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Post Now failed');
            }
            
            const data = await response.json();
            
            setQueueProgress(prev => ({
                ...prev,
                message: data.message || 'Posting started.',
                percent: 0
            }));
            
            if (onSuccess) onSuccess(data);

        } catch (error) {
            console.error('Post Now Error:', error);
            setQueueProgress({ 
                active: true, 
                message: 'Error: ' + error.message, 
                percent: 0, 
                error: true,
                completed: false
            });
            setTimeout(() => {
                setQueueProgress(prev => ({ ...prev, active: false }));
            }, 8000);
        }
    }, []);

    const dismissProgress = useCallback(() => {
        setQueueProgress(prev => ({ ...prev, active: false }));
    }, []);

    const [aiProgress, setAiProgress] = useState({
        active: false,
        message: '',
        percent: 0,
        completed: false
    });

    const aiEditing = useCallback(async (vehicleId, payload, token, onSuccess) => {
        // Initialize progress
        setAiProgress({
            active: true,
            message: 'Initializing AI enhancements...',
            percent: 0,
            completed: false
        });

        try {
            const response = await fetch(`${getApiBaseUrl()}/vehicles/${vehicleId}/batch-edit-images`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'AI Edit failed');
            }

            // Stream Reader
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);
                        
                        if (data.type === 'progress') {
                            setAiProgress(prev => ({
                                ...prev,
                                active: true,
                                message: data.message,
                                percent: data.percent
                            }));
                        } else if (data.type === 'complete') {
                            setAiProgress({
                                active: true,
                                message: data.message,
                                percent: 100,
                                completed: true
                            });
                            
                            // Call success callback (e.g., refresh vehicle)
                            if (onSuccess) onSuccess(data.data);

                            // Auto-dismiss after 5 seconds
                            setTimeout(() => {
                                setAiProgress(prev => ({ ...prev, active: false }));
                            }, 3000); 
                        } else if (data.type === 'error') {
                            throw new Error(data.message);
                        }
                    } catch (err) {
                        console.error('Stream parse error:', err);
                    }
                }
            }

        } catch (error) {
            console.error('AI Edit Error:', error);
            setAiProgress({ 
                active: true, 
                message: 'Error: ' + error.message, 
                percent: 0, 
                error: true 
            });
            // Auto hide error after delay
            setTimeout(() => {
                setAiProgress(prev => ({ ...prev, active: false }));
            }, 8000);
        }
    }, []);

    const dismissAiProgress = useCallback(() => {
        setAiProgress(prev => ({ ...prev, active: false }));
    }, []);

    return (
        <QueueContext.Provider value={{ 
            queueProgress, queuePosting, postNow, dismissProgress,
            aiProgress, aiEditing, dismissAiProgress
        }}>
            {children}
        </QueueContext.Provider>
    );
};
