import React, { useState } from 'react';
import {
    Box,
    TextField,
    Button,
    Typography,
    Paper,
    Alert,
    Fade,
} from '@mui/material';
import { Lock } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import apiClient from '../config/axios';
import { useAuth } from '../context/AuthContext';

const UpdatePassword = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { logout } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);

        try {
            await apiClient.put('/auth/update-password', { password });
            setSuccess('Password updated successfully! Redirecting to dashboard...');
            setTimeout(() => {
                navigate('/');
            }, 1500);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%)',
                p: 2
            }}
        >
            <Fade in={true}>
                <Paper
                    elevation={24}
                    sx={{
                        p: 4,
                        width: '100%',
                        maxWidth: '450px',
                        background: 'rgba(22, 22, 22, 0.95)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 3,
                    }}
                >
                    <Box sx={{ textAlign: 'center', mb: 3 }}>
                        <Lock sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                        <Typography variant="h5" fontWeight="bold" gutterBottom>
                            Update Password
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Please set a new password for your account.
                        </Typography>
                    </Box>

                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                    <form onSubmit={handleSubmit}>
                        <TextField
                            fullWidth
                            label="New Password"
                            type="password"
                            margin="normal"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <TextField
                            fullWidth
                            label="Confirm New Password"
                            type="password"
                            margin="normal"
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                        <Button
                            fullWidth
                            variant="contained"
                            size="large"
                            type="submit"
                            disabled={loading}
                            sx={{ mt: 3, mb: 1 }}
                        >
                            {loading ? 'Updating...' : 'Update Password'}
                        </Button>
                        <Button
                            fullWidth
                            color="inherit"
                            onClick={logout}
                            disabled={loading}
                        >
                            Cancel & Logout
                        </Button>
                    </form>
                </Paper>
            </Fade>
        </Box>
    );
};

export default UpdatePassword;
