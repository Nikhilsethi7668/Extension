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
    Fade,
    Tabs,
    Tab
} from '@mui/material';
import { Email, Lock, Login as LoginIcon, Key } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';

const Login = () => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    
    const [loginMethod, setLoginMethod] = useState(0); // 0: Email/Pass, 1: API Key
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, loginWithApiKey } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            let userData;
            if (loginMethod === 0) {
                userData = await login(email, password);
            } else {
                userData = await loginWithApiKey(apiKey);
            }

            if (userData.needsPasswordChange) {
                navigate('/update-password');
                return;
            }
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
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
                        position: 'relative',
                        zIndex: 1,
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
                            <LoginIcon sx={{ fontSize: 32, color: 'white' }} />
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
                            Welcome Back
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.95rem' }}>
                            Sign in to your Flash Fender account
                        </Typography>
                    </Box>

                    <Tabs
                        value={loginMethod}
                        onChange={(e, val) => setLoginMethod(val)}
                        variant="fullWidth"
                        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
                    >
                        <Tab label="Credential Login" />
                        <Tab label="API Key Login" />
                    </Tabs>

                    {error && (
                        <Fade in={!!error}>
                            <Alert
                                severity="error"
                                sx={{
                                    mb: 3,
                                    borderRadius: 2,
                                    backgroundColor: 'rgba(211, 47, 47, 0.1)',
                                    border: '1px solid rgba(211, 47, 47, 0.3)',
                                    '& .MuiAlert-icon': {
                                        color: '#ef5350',
                                    },
                                }}
                            >
                                {error}
                            </Alert>
                        </Fade>
                    )}

                    <form onSubmit={handleSubmit}>
                        {loginMethod === 0 ? (
                            <>
                                <TextField
                                    fullWidth
                                    label="Email Address"
                                    type="email"
                                    margin="normal"
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
                                <TextField
                                    fullWidth
                                    label="Password"
                                    type="password"
                                    margin="normal"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
                                    required
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <Lock sx={{ color: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.54)', fontSize: 20 }} />
                                            </InputAdornment>
                                        ),
                                    }}
                                    sx={{
                                        mt: 2,
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
                                <Box sx={{ textAlign: 'right', mt: 1 }}>
                                    <Link 
                                        to="/forgot-password" 
                                        style={{ 
                                            color: '#0f62fe', 
                                            textDecoration: 'none', 
                                            fontSize: '0.875rem'
                                        }}
                                    >
                                        Forgot Password?
                                    </Link>
                                </Box>
                            </>
                        ) : (
                            <TextField
                                fullWidth
                                label="Organization or User API Key"
                                margin="normal"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                disabled={loading}
                                required
                                placeholder="sk-..."
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <Key sx={{ color: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.54)', fontSize: 20 }} />
                                        </InputAdornment>
                                    ),
                                }}
                                sx={{
                                    mt: 2,
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
                        )}

                        <Button
                            fullWidth
                            variant="contained"
                            size="large"
                            type="submit"
                            disabled={loading || (loginMethod === 0 ? (!email || !password) : !apiKey)}
                            sx={{
                                mt: 4,
                                mb: 2,
                                py: 1.5,
                                borderRadius: 2,
                                fontSize: '1rem',
                                fontWeight: 600,
                                textTransform: 'none',
                                background: 'linear-gradient(135deg, #0f62fe 0%, #0043ce 100%)',
                                boxShadow: '0 4px 15px rgba(15, 98, 254, 0.4)',
                                transition: 'all 0.3s ease',
                                '&:hover': {
                                    background: 'linear-gradient(135deg, #0043ce 0%, #0f62fe 100%)',
                                    boxShadow: '0 6px 20px rgba(15, 98, 254, 0.6)',
                                },
                            }}
                        >
                            {loading ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <CircularProgress size={20} sx={{ color: 'white' }} />
                                    <span>Signing in...</span>
                                </Box>
                            ) : (
                                'Sign In'
                            )}
                        </Button>
                    </form>

                    <Box sx={{ mt: 3, textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                            Secure login powered by Flash Fender
                        </Typography>
                    </Box>
                </Paper>
            </Fade>
        </Box>
    );
};

export default Login;
