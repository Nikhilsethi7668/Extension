import React, { useState } from 'react';
import { Box, TextField, Button, Typography, Paper, Container, Alert, Stepper, Step, StepLabel } from '@mui/material';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Setup = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        orgName: '',
    });
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.post('/api/auth/setup', formData);
            navigate('/login');
        } catch (err) {
            setError(err.response?.data?.message || 'Setup failed');
        }
    };

    return (
        <Container maxWidth="sm">
            <Box sx={{ mt: 10 }}>
                <Paper sx={{ p: 4 }}>
                    <Typography variant="h4" align="center" gutterBottom>
                        System Setup
                    </Typography>
                    <Typography variant="body1" align="center" color="textSecondary" sx={{ mb: 4 }}>
                        Create your Super Admin account and the first Organization.
                    </Typography>

                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    <form onSubmit={handleSubmit}>
                        <Typography variant="h6" gutterBottom>1. Organization Details</Typography>
                        <TextField
                            fullWidth
                            label="Organization Name"
                            margin="normal"
                            value={formData.orgName}
                            onChange={(e) => setFormData({ ...formData, orgName: e.target.value })}
                        />

                        <Typography variant="h6" sx={{ mt: 3 }} gutterBottom>2. Super Admin Account</Typography>
                        <TextField
                            fullWidth
                            label="Full Name"
                            margin="normal"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                        <TextField
                            fullWidth
                            label="Email"
                            margin="normal"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                        <TextField
                            fullWidth
                            label="Password"
                            type="password"
                            margin="normal"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />
                        <Button
                            fullWidth
                            variant="contained"
                            color="primary"
                            size="large"
                            sx={{ mt: 4 }}
                            type="submit"
                        >
                            Finish Setup
                        </Button>
                    </form>
                </Paper>
            </Box>
        </Container>
    );
};

export default Setup;
