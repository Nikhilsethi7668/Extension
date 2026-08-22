import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

const ThemeContext = createContext();

export const useThemeMode = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useThemeMode must be used within ThemeProvider');
    }
    return context;
};

export const ThemeModeProvider = ({ children }) => {
    // Initialize from localStorage or default to dark
    const [mode, setMode] = useState(() => {
        const savedMode = localStorage.getItem('themeMode');
        const initialMode = savedMode || 'dark';
        document.documentElement.setAttribute('data-theme', initialMode);
        document.documentElement.style.colorScheme = initialMode;
        return initialMode;
    });

    // Save to localStorage whenever mode changes
    useEffect(() => {
        localStorage.setItem('themeMode', mode);
        document.documentElement.setAttribute('data-theme', mode);
        document.documentElement.style.colorScheme = mode;
    }, [mode]);

    const toggleTheme = () => {
        setMode((prevMode) => (prevMode === 'dark' ? 'light' : 'dark'));
    };

    const value = useMemo(
        () => ({
            mode,
            toggleTheme,
            isDark: mode === 'dark',
        }),
        [mode]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
