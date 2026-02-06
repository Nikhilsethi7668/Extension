import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => {
    return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const { user } = useAuth();

    useEffect(() => {
        if (!user) {
            if (socket) {
                socket.disconnect();
                setSocket(null);
            }
            return;
        }

        const organizationId = user.organization?._id || user.organization;
        if (!organizationId) return;

        // Initialize Socket
        const newSocket = io(import.meta.env.VITE_API_BASE_URL || 'https://api.flashfender.com', {
            withCredentials: true,
            transports: ['websocket', 'polling'],
            auth: {
                clientType: 'dashboard'
            }
        });

        newSocket.on('connect', () => {
            console.log('[SocketContext] Connected:', newSocket.id);
            newSocket.emit('register-client', { 
                orgId: organizationId, 
                userId: user._id, 
                clientType: 'dashboard' 
            });
        });

        newSocket.on('disconnect', () => {
            console.log('[SocketContext] Disconnected');
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, [user]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};
