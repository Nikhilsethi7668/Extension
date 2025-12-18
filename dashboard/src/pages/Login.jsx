import React, { useState } from 'react';
import { Box, TextField, Button, Typography, Paper, Container, Alert } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await login(email, password);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed');
        }
    };

    return (
        <Container maxWidth="xs">
            <Box sx={{ mt: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Paper sx={{ p: 4, width: '100%' }}>
                    <Typography variant="h5" align="center" gutterBottom>
                        FacebookMark Login
                    </Typography>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    <form onSubmit={handleSubmit}>
                        <TextField
                            fullWidth
                            label="Email"
                            margin="normal"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        <TextField
                            fullWidth
                            label="Password"
                            type="password"
                            margin="normal"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <Button
                            fullWidth
                            variant="contained"
                            color="primary"
                            size="large"
                            sx={{ mt: 3 }}
                            type="submit"
                        >
                            Sign In
                        </Button>
                    </form>
                </Paper>
            </Box>
        </Container>
    );
};

export default Login;
