import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Users from './pages/Users';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Setup from './pages/Setup';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#0f62fe',
    },
    background: {
      default: '#0c0c0c',
      paper: '#161616',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
});

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<Setup />} />
            <Route
              path="/*"
              element={
                <PrivateRoute>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/users" element={<Users />} />
                    <Route path="/logs" element={<Logs />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </PrivateRoute>
              }
            />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
