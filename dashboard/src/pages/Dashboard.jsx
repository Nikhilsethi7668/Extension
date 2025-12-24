import React, { useState, useEffect } from 'react';
import {
    Box, Grid, Paper, Typography, LinearProgress,
    Avatar, IconButton, Chip
} from '@mui/material';
import {
    CarFront, Users, CheckCircle, Clock,
    TrendingUp, ArrowRight, Activity
} from 'lucide-react';
import apiClient from '../config/axios';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

const StatCard = ({ title, value, icon: Icon, color, trend }) => (
    <Paper
        className="glass"
        sx={{
            p: 3,
            height: '100%',
            display: 'relative',
            overflow: 'hidden',
            transition: 'transform 0.2s, box-shadow 0.2s',
            '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: `0 12px 24px -10px ${color}40`,
                borderColor: `${color}40`
            }
        }}
    >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
            <Box
                sx={{
                    p: 1.5,
                    borderRadius: '12px',
                    bgcolor: `${color}15`,
                    color: color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
            >
                <Icon size={24} />
            </Box>
            {trend && (
                <Chip
                    label={trend}
                    size="small"
                    sx={{
                        bgcolor: 'success.main',
                        color: 'white',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        height: 24
                    }}
                    icon={<TrendingUp size={14} color="white" />}
                />
            )}
        </Box>
        <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5 }}>
            {value}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            {title}
        </Typography>

        {/* Decorative Gradient Blob */}
        <Box
            sx={{
                position: 'absolute',
                top: -40,
                right: -40,
                width: 100,
                height: 100,
                borderRadius: '50%',
                bgcolor: color,
                opacity: 0.05,
                filter: 'blur(30px)',
                pointerEvents: 'none'
            }}
        />
    </Paper>
);

const ActivityItem = ({ icon: Icon, title, time, color }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <Avatar
            sx={{
                bgcolor: `${color}15`,
                color: color,
                width: 40, height: 40
            }}
        >
            <Icon size={18} />
        </Avatar>
        <Box sx={{ flexGrow: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{title}</Typography>
            <Typography variant="caption" color="text.secondary">{time}</Typography>
        </Box>
        <IconButton size="small">
            <ArrowRight size={16} />
        </IconButton>
    </Box>
);

const Dashboard = () => {
    const { user } = useAuth();
    const [stats, setStats] = useState({
        totalVehicles: 0,
        activeAgents: 0,
        postedToday: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Placeholder fetch logic
        // In a real app, you'd fetch from an analytics endpoint
        const loadStats = async () => {
            try {
                // Simulating API call
                setTimeout(() => {
                    setStats({
                        totalVehicles: 124, // Mock data
                        activeAgents: 8,
                        postedToday: 12
                    });
                    setLoading(false);
                }, 800);
            } catch (err) {
                console.error(err);
                setLoading(false);
            }
        };
        loadStats();
    }, []);

    if (loading) {
        return (
            <Layout title="Dashboard">
                <Box sx={{ width: '100%', mt: 4 }}><LinearProgress /></Box>
            </Layout>
        );
    }

    return (
        <Layout title="Overview">
            {/* Stats Grid */}
            <Grid container spacing={3} sx={{ mb: 4, width: '100%' }}>
                <Grid item xs={12} sm={6} md={4}>
                    <StatCard
                        title="Total Vehicles"
                        value={stats.totalVehicles}
                        icon={CarFront}
                        color="#3b82f6" // Blue
                        trend="+12%"
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                    <StatCard
                        title="Active Agents"
                        value={stats.activeAgents}
                        icon={Users}
                        color="#8b5cf6" // Violet
                        trend="+2"
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                    <StatCard
                        title="Posted Today"
                        value={stats.postedToday}
                        icon={CheckCircle}
                        color="#10b981" // Emerald
                    />
                </Grid>
            </Grid>

            {/* Content Split: 2/3 Main, 1/3 Side */}
            <Grid container spacing={3} sx={{ width: '100%' }}>
                <Grid item xs={12} md={8}>
                    <Paper className="glass" sx={{ p: 3, minHeight: 400 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                            <Typography variant="h6">Performance Trends</Typography>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Chip label="This Week" size="small" color="primary" variant="outlined" />
                                <Chip label="This Month" size="small" variant="outlined" />
                            </Box>
                        </Box>

                        {/* Placeholder for Chart */}
                        <Box
                            sx={{
                                height: 300,
                                border: '2px dashed rgba(255,255,255,0.1)',
                                borderRadius: 2,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexDirection: 'column',
                                gap: 2,
                                color: 'text.secondary'
                            }}
                        >
                            <Activity size={48} />
                            <Typography>Activity Chart Placeholder</Typography>
                            <Typography variant="caption">(Install Recharts to visualize real data)</Typography>
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Paper className="glass" sx={{ p: 3, height: '100%' }}>
                        <Typography variant="h6" sx={{ mb: 3 }}>Recent Activity</Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <ActivityItem
                                icon={CarFront}
                                title="New Vehicle Scraped"
                                time="2 mins ago"
                                color="#3b82f6"
                            />
                            <ActivityItem
                                icon={Users}
                                title="Agent Login: Sarah"
                                time="15 mins ago"
                                color="#8b5cf6"
                            />
                            <ActivityItem
                                icon={CheckCircle}
                                title="Vehicle Posted to FB"
                                time="1 hour ago"
                                color="#10b981"
                            />
                            <ActivityItem
                                icon={Clock}
                                title="Scheduled Maintenance"
                                time="5 hours ago"
                                color="#f59e0b"
                            />
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </Layout>
    );
};

export default Dashboard;
