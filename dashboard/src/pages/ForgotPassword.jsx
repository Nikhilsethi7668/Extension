import React, { useState } from 'react';
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
import { Email, ArrowBack } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import apiClient from '../config/axios';
import { useTheme } from '@mui/material/styles';

const ForgotPassword = () => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await apiClient.post('/auth/forgot-password', { email });
            setSuccess(true);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to send reset email. Please try again.');
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
                position: 'relative',
                overflow: 'hidden',
                padding: { xs: 2, sm: 3 },
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    background: isDark
                        ? 'radial-gradient(circle at 20% 50%, rgba(15, 98, 254, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(15, 98, 254, 0.1) 0%, transparent 50%)'
                        : 'radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.05) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(59, 130, 246, 0.05) 0%, transparent 50%)',
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
                        background: isDark ? 'rgba(22, 22, 22, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(10px)',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(15, 23, 42, 0.08)',
                        borderRadius: 3,
                        boxShadow: isDark ? '0 8px 32px rgba(0, 0, 0, 0.4)' : '0 8px 32px rgba(15, 23, 42, 0.08)',
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
                                background: 'linear-gradient(135deg, #0f62fe 0%, #0043ce 100%)',
                                mb: 2,
                                boxShadow: '0 4px 20px rgba(15, 98, 254, 0.4)',
                            }}
                        >
                            <Email sx={{ fontSize: 32, color: 'white' }} />
                        </Box>
                        <Typography
                            variant="h4"
                            sx={{
                                fontWeight: 700,
                                background: isDark 
                                    ? 'linear-gradient(135deg, #ffffff 0%, #b0b0b0 100%)' 
                                    : 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
                                backgroundClip: 'text',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                mb: 1,
                            }}
                        >
                            Forgot Password?
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Enter your email to receive a password reset link
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
                                    If an account with that email exists, a password reset link has been sent.
                                    Please check your inbox.
                                </Alert>
                                <Button
                                    component={Link}
                                    to="/login"
                                    fullWidth
                                    variant="outlined"
                                    startIcon={<ArrowBack />}
                                    sx={{ mt: 2 }}
                                >
                                    Back to Login
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
                                    label="Email Address"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={loading}
                                    required
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <Email sx={{ color: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.54)', fontSize: 20 }} />
                                            </InputAdornment>
                                        ),
                                    }}
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
                                    disabled={loading || !email}
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
                                            <span>Sending...</span>
                                        </Box>
                                    ) : (
                                        'Send Reset Link'
                                    )}
                                </Button>
                            </form>

                            <Box sx={{ mt: 3, textAlign: 'center' }}>
                                <Button
                                    component={Link}
                                    to="/login"
                                    startIcon={<ArrowBack />}
                                    sx={{ color: '#0f62fe', textTransform: 'none' }}
                                >
                                    Back to Login
                                </Button>
                            </Box>
                        </>
                    )}
                </Paper>
            </Fade>
        </Box>
    );
};

export default ForgotPassword;
