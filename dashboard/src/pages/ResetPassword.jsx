import React, { useState, useEffect } from 'react';
import {
    Box,
    TextField,
    Button,
    Typography,
    Paper,
    Alert,
    InputAdornment,
    CircularProgress,
    Fade
} from '@mui/material';
import { Lock, CheckCircle } from '@mui/icons-material';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import apiClient from '../config/axios';

const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [token, setToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [newApiKey, setNewApiKey] = useState(null);

    useEffect(() => {
        const tokenParam = searchParams.get('token');
        if (!tokenParam) {
            setError('Invalid reset link. Please request a new password reset.');
        } else {
            setToken(tokenParam);
        }
    }, [searchParams]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters long');
            return;
        }

        setLoading(true);

        try {
            const { data } = await apiClient.post('/auth/reset-password', {
                token,
                newPassword
            });
            setSuccess(true);
            if (data.newApiKey) {
                setNewApiKey(data.newApiKey);
            }
            setTimeout(() => {
                navigate('/login');
            }, newApiKey ? 8000 : 3000); // Extended time if API key shown
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to reset password. Please try again.');
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
                position: 'relative',
                overflow: 'hidden',
                padding: { xs: 2, sm: 3 },
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    background: 'radial-gradient(circle at 20% 50%, rgba(15, 98, 254, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(15, 98, 254, 0.1) 0%, transparent 50%)',
                    pointerEvents: 'none',
                },
            }}
        >
            <Fade in={true} timeout={800}>
                <Paper
                    elevation={24}
                    sx={{
                        p: { xs: 3, sm: 5 },
                        width: '100%',
                        maxWidth: '500px',
                        background: 'rgba(22, 22, 22, 0.95)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 3,
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                    }}
                >
                    <Box sx={{ textAlign: 'center', mb: 4 }}>
                        <Box
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 64,
                                height: 64,
                                borderRadius: '50%',
                                background: success 
                                    ? 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)'
                                    : 'linear-gradient(135deg, #0f62fe 0%, #0043ce 100%)',
                                mb: 2,
                                boxShadow: success 
                                    ? '0 4px 20px rgba(76, 175, 80, 0.4)'
                                    : '0 4px 20px rgba(15, 98, 254, 0.4)',
                            }}
                        >
                            {success ? (
                                <CheckCircle sx={{ fontSize: 32, color: 'white' }} />
                            ) : (
                                <Lock sx={{ fontSize: 32, color: 'white' }} />
                            )}
                        </Box>
                        <Typography
                            variant="h4"
                            sx={{
                                fontWeight: 700,
                                background: 'linear-gradient(135deg, #ffffff 0%, #b0b0b0 100%)',
                                backgroundClip: 'text',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                mb: 1,
                            }}
                        >
                            {success ? 'Password Reset!' : 'Reset Password'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {success 
                                ? 'Your password has been changed successfully'
                                : 'Enter your new password below'}
                        </Typography>
                    </Box>

                    {success ? (
                        <Fade in={success}>
                            <Box>
                                <Alert
                                    severity="success"
                                    sx={{
                                        mb: 3,
                                        borderRadius: 2,
                                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                                        border: '1px solid rgba(76, 175, 80, 0.3)',
                                    }}
                                >
                                    Password reset successfully!{newApiKey ? ' Redirecting in 8 seconds...' : ' Redirecting to login...'}
                                </Alert>
                                
                                {newApiKey && (
                                    <Alert
                                        severity="warning"
                                        sx={{
                                            mb: 3,
                                            borderRadius: 2,
                                            backgroundColor: 'rgba(255, 152, 0, 0.1)',
                                            border: '1px solid rgba(255, 152, 0, 0.3)',
                                        }}
                                    >
                                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                                            🔑 Your API Key has been regenerated for security
                                        </Typography>
                                        <Typography variant="caption" sx={{ display: 'block', mb: 2 }}>
                                            Please save this key now. You won't be able to see it again.
                                        </Typography>
                                        <Box
                                            sx={{
                                                p: 1.5,
                                                bgcolor: 'rgba(0, 0, 0, 0.2)',
                                                borderRadius: 1,
                                                fontFamily: 'monospace',
                                                fontSize: '0.875rem',
                                                wordBreak: 'break-all',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 1
                                            }}
                                        >
                                            <span>{newApiKey}</span>
                                            <Button
                                                size="small"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(newApiKey);
                                                }}
                                                sx={{ minWidth: 'auto', ml: 1 }}
                                            >
                                                Copy
                                            </Button>
                                        </Box>
                                    </Alert>
                                )}
                                
                                <Button
                                    component={Link}
                                    to="/login"
                                    fullWidth
                                    variant="contained"
                                    sx={{
                                        background: 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)',
                                    }}
                                >
                                    Go to Login
                                </Button>
                            </Box>
                        </Fade>
                    ) : (
                        <>
                            {error && (
                                <Fade in={!!error}>
                                    <Alert
                                        severity="error"
                                        sx={{
                                            mb: 3,
                                            borderRadius: 2,
                                            backgroundColor: 'rgba(211, 47, 47, 0.1)',
                                            border: '1px solid rgba(211, 47, 47, 0.3)',
                                        }}
                                    >
                                        {error}
                                    </Alert>
                                </Fade>
                            )}

                            <form onSubmit={handleSubmit}>
                                <TextField
                                    fullWidth
                                    label="New Password"
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    disabled={loading || !token}
                                    required
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <Lock sx={{ color: 'text.secondary', fontSize: 20 }} />
                                            </InputAdornment>
                                        ),
                                    }}
                                    sx={{
                                        mb: 2,
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: 2,
                                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                        }
                                    }}
                                />

                                <TextField
                                    fullWidth
                                    label="Confirm New Password"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    disabled={loading || !token}
                                    required
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <Lock sx={{ color: 'text.secondary', fontSize: 20 }} />
                                            </InputAdornment>
                                        ),
                                    }}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: 2,
                                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                        }
                                    }}
                                />

                                <Button
                                    fullWidth
                                    variant="contained"
                                    size="large"
                                    type="submit"
                                    disabled={loading || !token || !newPassword || !confirmPassword}
                                    sx={{
                                        mt: 3,
                                        py: 1.5,
                                        borderRadius: 2,
                                        fontSize: '1rem',
                                        fontWeight: 600,
                                        textTransform: 'none',
                                        background: 'linear-gradient(135deg, #0f62fe 0%, #0043ce 100%)',
                                        boxShadow: '0 4px 15px rgba(15, 98, 254, 0.4)',
                                        '&:hover': {
                                            background: 'linear-gradient(135deg, #0043ce 0%, #0f62fe 100%)',
                                            boxShadow: '0 6px 20px rgba(15, 98, 254, 0.6)',
                                        },
                                    }}
                                >
                                    {loading ? (
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <CircularProgress size={20} sx={{ color: 'white' }} />
                                            <span>Resetting...</span>
                                        </Box>
                                    ) : (
                                        'Reset Password'
                                    )}
                                </Button>
                            </form>
                        </>
                    )}
                </Paper>
            </Fade>
        </Box>
    );
};

export default ResetPassword;
