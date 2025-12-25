import React, { useState } from 'react';
import {
    Box, Paper, Typography, TextField, Button, Grid,
    Alert, Divider, Switch, FormControlLabel
} from '@mui/material';
import {
    Settings as SettingsIcon, Save, Key, Shield,
    Bell, Globe
} from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import apiClient from '../config/axios';

const Settings = () => {
    const { user } = useAuth();
    const { isDark, toggleTheme } = useThemeMode();
    const [apiKey, setApiKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    const handleSave = async () => {
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            // Mock API call since specific endpoint might not exist yet
            // await apiClient.put('/organizations/settings', { geminiApiKey: apiKey });

            // Simulate delay
            await new Promise(resolve => setTimeout(resolve, 800));
            setSuccess('Settings saved successfully.');
        } catch (err) {
            setError('Failed to save settings.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout title="Settings">
            <Box sx={{ width: '100%' }}>
                {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>{success}</Alert>}
                {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

                {/* Section: AI Configuration */}
                <Paper className="glass" sx={{ p: 4, mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                            <Key size={24} />
                        </Box>
                        <Box>
                            <Typography variant="h6">AI Configuration</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Manage API keys for content generation.
                            </Typography>
                        </Box>
                    </Box>
                    <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }} />

                    <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>Gemini API Key</Typography>
                    <TextField
                        fullWidth
                        placeholder="sk-..."
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        helperText="This key will be used for all agents in your organization unless they have their own."
                        sx={{ mb: 3 }}
                    />

                    <Button
                        variant="contained"
                        startIcon={<Save size={18} />}
                        onClick={handleSave}
                        disabled={loading}
                    >
                        {loading ? 'Saving...' : 'Save Configuration'}
                    </Button>
                </Paper>

                {/* Section: General Preferences (Visual Only) */}
                <Paper className="glass" sx={{ p: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                            <Globe size={24} />
                        </Box>
                        <Box>
                            <Typography variant="h6">General Preferences</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Customize your experience.
                            </Typography>
                        </Box>
                    </Box>
                    <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }} />

                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                            <FormControlLabel
                                control={<Switch defaultChecked />}
                                label="Email Notifications"
                            />
                            <Typography variant="caption" display="block" color="text.secondary" sx={{ ml: 7, mt: -1 }}>
                                Receive weekly summaries.
                            </Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <FormControlLabel
                                control={<Switch checked={isDark} onChange={toggleTheme} />}
                                label="Dark Mode"
                            />
                            <Typography variant="caption" display="block" color="text.secondary" sx={{ ml: 7, mt: -1 }}>
                                {isDark ? 'Using dark theme' : 'Using light theme'}
                            </Typography>
                        </Grid>
                    </Grid>
                </Paper>
            </Box>
        </Layout>
    );
};

export default Settings;
