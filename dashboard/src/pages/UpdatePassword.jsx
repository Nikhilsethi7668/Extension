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
import { useTheme } from '@mui/material/styles';

const UpdatePassword = () => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

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
                height: '100vh',
                display: 'flex',
                width: '100vw',
                alignItems: 'center',
                justifyContent: 'center',
                background: isDark
                    ? 'linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%)'
                    : 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
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
                        background: isDark ? 'rgba(22, 22, 22, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(10px)',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(15, 23, 42, 0.08)',
                        borderRadius: 3,
                        boxShadow: isDark ? '0 8px 32px rgba(0, 0, 0, 0.4)' : '0 8px 32px rgba(15, 23, 42, 0.08)',
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
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                                    transition: 'all 0.3s ease',
                                    '&:hover': {
                                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                                    },
                                    '&.Mui-focused': {
                                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                                    },
                                    '& fieldset': {
                                        borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
                                    },
                                    '&:hover fieldset': {
                                        borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)',
                                    },
                                    '&.Mui-focused fieldset': {
                                        borderColor: theme.palette.primary.main,
                                    }
                                },
                                '& .MuiInputBase-input': {
                                    color: isDark ? '#ffffff' : '#000000',
                                },
                                '& .MuiInputLabel-root': {
                                    color: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
                                }
                            }}
                        />
                        <TextField
                            fullWidth
                            label="Confirm New Password"
                            type="password"
                            margin="normal"
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                                    transition: 'all 0.3s ease',
                                    '&:hover': {
                                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                                    },
                                    '&.Mui-focused': {
                                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                                    },
                                    '& fieldset': {
                                        borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
                                    },
                                    '&:hover fieldset': {
                                        borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)',
                                    },
                                    '&.Mui-focused fieldset': {
                                        borderColor: theme.palette.primary.main,
                                    }
                                },
                                '& .MuiInputBase-input': {
                                    color: isDark ? '#ffffff' : '#000000',
                                },
                                '& .MuiInputLabel-root': {
                                    color: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
                                }
                            }}
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
