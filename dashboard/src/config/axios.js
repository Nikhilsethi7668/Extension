import axios from 'axios';

// Base URL: always exactly one /api (strip any trailing /api from env then add once)
let base = (import.meta.env.VITE_API_BASE_URL || 'https://api.flashfender.com').replace(/\/+$/, '');
while (base.endsWith('/api')) base = base.slice(0, -4);
const API_BASE_URL = base ? `${base}/api` : 'https://api.flashfender.com/api';

// Create axios instance with base URL
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
    (config) => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                if (user.token) {
                    config.headers.Authorization = `Bearer ${user.token}`;
                    console.log('Axios Interceptor: Token attached to request to', config.url);
                } else {
                    console.error('Axios Interceptor: User object found but token is missing', user);
                }
            } catch (error) {
                console.error('Error parsing user from localStorage:', error);
            }
        } else {
            console.warn('Axios Interceptor: No user found in localStorage');
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        // Handle 401 unauthorized - clear user and redirect to login
        if (error.response?.status === 401) {
            localStorage.removeItem('user');
            // Only redirect if not already on login page
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default apiClient;
