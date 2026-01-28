import React, { createContext, useContext, useState, useCallback } from 'react';

const QueueContext = createContext();

export const useQueue = () => {
    const context = useContext(QueueContext);
    if (!context) {
        throw new Error('useQueue must be used within a QueueProvider');
    }
    return context;
};

export const QueueProvider = ({ children }) => {
    const [queueProgress, setQueueProgress] = useState({
        active: false,
        message: '',
        percent: 0,
        completed: false
    });

    const queuePosting = useCallback(async (payload, token, onSuccess) => {
        // Initialize progress
        setQueueProgress({
            active: true,
            message: 'Initializing queue...',
            percent: 0,
            completed: false
        });

        const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://api-flash.adaptusgroup.ca') + '/api';

        try {
            const response = await fetch(`${API_BASE_URL}/vehicles/queue-posting`, {
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
                            setQueueProgress(prev => ({
                                ...prev,
                                active: true,
                                message: data.message,
                                percent: data.percent
                            }));
                        } else if (data.type === 'complete') {
                            setQueueProgress({
                                active: true,
                                message: data.message,
                                percent: 100,
                                completed: true
                            });
                            
                            // Call success callback (e.g., refresh list)
                            if (onSuccess) onSuccess();

                            // Auto-dismiss after 5 seconds, or keep it until user dismisses?
                            // User request: "won't lost state on page change". 
                            // Let's keep it visible until they dismiss or start new one, 
                            // OR auto-minimize?
                            // For now, let's keep it "Complete" state.
                            setTimeout(() => {
                                setQueueProgress(prev => ({ ...prev, active: false }));
                            }, 5000); 
                        } else if (data.type === 'error') {
                            throw new Error(data.message);
                        }
                    } catch (err) {
                        console.error('Stream parse error:', err);
                    }
                }
            }

        } catch (error) {
            console.error('Queue Error:', error);
            setQueueProgress({ 
                active: true, 
                message: 'Error: ' + error.message, 
                percent: 0, 
                error: true 
            });
            // Auto hide error after delay
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

        const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://api-flash.adaptusgroup.ca') + '/api';

        try {
            const response = await fetch(`${API_BASE_URL}/vehicles/${vehicleId}/batch-edit-images`, {
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
            queueProgress, queuePosting, dismissProgress,
            aiProgress, aiEditing, dismissAiProgress
        }}>
            {children}
        </QueueContext.Provider>
    );
};
