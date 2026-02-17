import React, { useState, useEffect } from 'react';
import { Alert, Snackbar, Box } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import WifiOffIcon from '@mui/icons-material/WifiOff';

/**
 * Lightweight connection warning using only navigator.onLine and a simple check.
 * Does not use useInternetMonitor to avoid "Invalid hook call" from multiple React copies.
 */
const InternetWarning = () => {
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        const handleOffline = () => setIsOffline(true);
        const handleOnline = () => setIsOffline(false);
        setIsOffline(!navigator.onLine);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);
        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
        };
    }, []);

    if (!isOffline) return null;

    return (
        <Snackbar
            open
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            sx={{ mt: 2 }}
        >
            <Alert
                severity="error"
                icon={<WifiOffIcon />}
                sx={{ minWidth: '320px', boxShadow: 3 }}
            >
                <Box sx={{ fontWeight: 600 }}>
                    No Internet Connection — Please check your network
                </Box>
            </Alert>
        </Snackbar>
    );
};

export default InternetWarning;
