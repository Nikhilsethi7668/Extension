import React from 'react';
import { Box, Paper, Typography, TextField, Button, Grid } from '@mui/material';
import Layout from '../components/Layout';

const Settings = () => {
    return (
        <Layout title="Organization Settings">
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" gutterBottom>Gemini AI Config</Typography>
                        <TextField
                            fullWidth
                            label="Organization Gemini API Key"
                            type="password"
                            margin="normal"
                            helperText="Overrides system-wide key if provided."
                        />
                        <Button variant="contained" sx={{ mt: 2 }}>Save Config</Button>
                    </Paper>
                </Grid>
            </Grid>
        </Layout>
    );
};

export default Settings;
