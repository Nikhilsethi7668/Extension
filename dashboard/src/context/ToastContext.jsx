import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Snackbar, Alert } from '@mui/material';
import { useSocket } from './SocketContext';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState('info'); // 'success', 'error', 'info', 'warning'
    
    const socket = useSocket();

    const showToast = useCallback((msg, type = 'info') => {
        setMessage(msg);
        setSeverity(type);
        setOpen(true);
    }, []);

    const handleClose = (event, reason) => {
        if (reason === 'clickaway') return;
        setOpen(false);
    };

    // System Notification Helper
    const showSystemNotification = (title, body) => {
        if (!("Notification" in window)) return;
        
        if (Notification.permission === "granted") {
            new Notification(title, { body });
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    new Notification(title, { body });
                }
            });
        }
    };

    // Global Socket Listeners for Notifications
    useEffect(() => {
        if (!socket) return;

        const handleImageGenComplete = (data) => {
            console.log('[ToastContext] Image Generation Complete:', data);
            if (data.success) {
                showToast(`Image processed successfully!`, 'success');
                showSystemNotification('Image Ready', 'Your vehicle image has been processed successfully.');
            } else {
                showToast(`Image processing failed: ${data.error || 'Unknown error'}`, 'error');
                showSystemNotification('Image Processing Failed', data.error || 'Unknown error');
            }
        };

        socket.on('image-generation-complete', handleImageGenComplete);

        return () => {
            socket.off('image-generation-complete', handleImageGenComplete);
        };
    }, [socket, showToast]);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <Snackbar 
                open={open} 
                autoHideDuration={6000} 
                onClose={handleClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert onClose={handleClose} severity={severity} sx={{ width: '100%' }} variant="filled">
                    {message}
                </Alert>
            </Snackbar>
        </ToastContext.Provider>
    );
};
