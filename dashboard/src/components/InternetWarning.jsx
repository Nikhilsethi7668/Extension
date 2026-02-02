import React from 'react';
import { Alert, Snackbar, Box } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import useInternetMonitor from '../hooks/useInternetMonitor';

const InternetWarning = () => {
    const { isUnstable, status, latency } = useInternetMonitor();

    // Determine message based on status
    const getMessage = () => {
        if (status === 'offline') {
            return 'No Internet Connection - Please check your network';
        } else if (status === 'poor') {
            if (latency) {
                return `Slow Internet (${latency}ms) - Please use a stable connection`;
            }
            return 'Unstable Internet - Please use a stable connection';
        }
        return '';
    };

    // Determine severity and icon
    const getSeverity = () => {
        return status === 'offline' ? 'error' : 'warning';
    };

    const getIcon = () => {
        return status === 'offline' ? <WifiOffIcon /> : <WarningAmberIcon />;
    };

    return (
        <Snackbar
            open={isUnstable}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            sx={{ mt: 2 }}
        >
            <Alert
                severity={getSeverity()}
                icon={getIcon()}
                sx={{
                    minWidth: '320px',
                    boxShadow: 3,
                    '& .MuiAlert-icon': {
                        fontSize: '24px',
                        animation: status === 'offline' ? 'none' : 'pulse 2s infinite'
                    },
                    '@keyframes pulse': {
                        '0%, 100%': {
                            transform: 'scale(1)',
                            opacity: 1
                        },
                        '50%': {
                            transform: 'scale(1.1)',
                            opacity: 0.8
                        }
                    }
                }}
            >
                <Box sx={{ fontWeight: 600 }}>
                    {getMessage()}
                </Box>
            </Alert>
        </Snackbar>
    );
};

export default InternetWarning;
