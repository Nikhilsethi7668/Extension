import React, { useState, useEffect } from 'react';
import { Box, Grid, Card, CardContent, Typography, LinearProgress } from '@mui/material';
import axios from 'axios';
import Layout from '../components/Layout';

const Dashboard = () => {
    const [stats, setStats] = useState({ totalUsers: 0, totalVehicles: 0, postedToday: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch stats logic would go here
        setLoading(false);
    }, []);

    if (loading) return <LinearProgress />;

    return (
        <Layout title="Dashboard Overview">
            <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>Total Vehicles</Typography>
                            <Typography variant="h4">0</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>Active Agents</Typography>
                            <Typography variant="h4">0</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>Posted Today</Typography>
                            <Typography variant="h4">0</Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Layout>
    );
};

export default Dashboard;
