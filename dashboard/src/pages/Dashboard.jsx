import React, { useState, useEffect } from 'react';
import {
    Box, Grid, Paper, Typography, LinearProgress,
    Button, ButtonGroup, TextField, MenuItem, Chip
} from '@mui/material';
import {
    CarFront, Users, CheckCircle, TrendingUp, Building2
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import apiClient from '../config/axios';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

const StatCard = ({ title, value, icon: Icon, color }) => (
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

const Dashboard = () => {
    const { user } = useAuth();
    const [stats, setStats] = useState({
        totalVehicles: 0,
        totalOrganizations: 0,
        activeAgents: 0,
        totalAgents: 0,
        totalPosts: 0
    });
    const [timelineData, setTimelineData] = useState([]);
    const [organizations, setOrganizations] = useState([]);
    const [selectedOrg, setSelectedOrg] = useState('');
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState('month');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Generate years from 2025 to current year + 1
    const years = [];
    const currentYear = new Date().getFullYear();
    for (let year = 2025; year <= currentYear + 1; year++) {
        years.push(year);
    }

    const months = [
        { value: 1, label: 'January' }, { value: 2, label: 'February' },
        { value: 3, label: 'March' }, { value: 4, label: 'April' },
        { value: 5, label: 'May' }, { value: 6, label: 'June' },
        { value: 7, label: 'July' }, { value: 8, label: 'August' },
        { value: 9, label: 'September' }, { value: 10, label: 'October' },
        { value: 11, label: 'November' }, { value: 12, label: 'December' }
    ];

    // Fetch organizations for super admin
    useEffect(() => {
        if (user?.role === 'super_admin') {
            const fetchOrgs = async () => {
                try {
                    const { data } = await apiClient.get('/organizations');
                    setOrganizations(data || []);
                } catch (err) {
                    console.error('Error fetching organizations:', err);
                }
            };
            fetchOrgs();
        }
    }, [user]);

    // Fetch stats
    useEffect(() => {
        const fetchStats = async () => {
            try {
                const params = {};
                if (user?.role === 'super_admin' && selectedOrg) {
                    params.orgId = selectedOrg;
                }
                const { data } = await apiClient.get('/dashboard/stats', { params });
                setStats(data);
            } catch (err) {
                console.error('Error fetching stats:', err);
            }
        };
        fetchStats();
    }, [user, selectedOrg]);

    // Fetch timeline data
    useEffect(() => {
        const fetchTimeline = async () => {
            setLoading(true);
            try {
                const params = { timeframe };

                // Add organization filter for super admin
                if (user?.role === 'super_admin' && selectedOrg) {
                    params.orgId = selectedOrg;
                }

                // Build date range based on selections
                if (timeframe === 'year') {
                    params.startDate = `${selectedYear}-01-01`;
                    params.endDate = `${selectedYear}-12-31`;
                } else if (timeframe === 'month') {
                    const year = selectedYear;
                    const month = selectedMonth.toString().padStart(2, '0');
                    const lastDay = new Date(year, selectedMonth, 0).getDate();
                    params.startDate = `${year}-${month}-01`;
                    params.endDate = `${year}-${month}-${lastDay}`;
                } else if (timeframe === 'day') {
                    if (startDate && endDate) {
                        params.startDate = startDate;
                        params.endDate = endDate;
                    }
                }

                const { data } = await apiClient.get('/dashboard/timeline', { params });
                setTimelineData(data);
            } catch (err) {
                console.error('Error fetching timeline:', err);
                setTimelineData([]);
            } finally {
                setLoading(false);
            }
        };
        fetchTimeline();
    }, [timeframe, selectedYear, selectedMonth, startDate, endDate, selectedOrg, user]);

    return (
        <Layout title="Dashboard">
            {/* Super Admin Organization Filter */}
            {user?.role === 'super_admin' && (
                <Paper className="glass" sx={{ p: 2, mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Filter by Organization:
                    </Typography>
                    <TextField
                        select
                        size="small"
                        value={selectedOrg}
                        onChange={(e) => setSelectedOrg(e.target.value)}
                        sx={{ minWidth: 250 }}
                        placeholder="All Organizations"
                    >
                        <MenuItem value="">
                            <em>All Organizations</em>
                        </MenuItem>
                        {organizations.map((org) => (
                            <MenuItem key={org._id} value={org._id}>
                                {org.name}
                            </MenuItem>
                        ))}
                    </TextField>
                    {selectedOrg && (
                        <Chip
                            label="Clear Filter"
                            onDelete={() => setSelectedOrg('')}
                            size="small"
                            color="primary"
                            variant="outlined"
                        />
                    )}
                </Paper>
            )}

            {/* Stats Grid */}
            <Grid container spacing={3} sx={{ mb: 4, width: '100%' }}>
                {user?.role === 'super_admin' && !selectedOrg ? (
                    <>
                        <Grid item xs={12} sm={6} md={4}>
                            <StatCard
                                title="Total Organizations"
                                value={stats.totalOrganizations || 0}
                                icon={Building2}
                                color="#3b82f6"
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                            <StatCard
                                title="Total Agents"
                                value={stats.totalAgents || 0}
                                icon={Users}
                                color="#8b5cf6"
                            />
                        </Grid>
                    </>
                ) : (
                    <>
                        <Grid item xs={12} sm={6} md={4}>
                            <StatCard
                                title={user?.role === 'agent' ? "Assigned Vehicles" : "Total Vehicles"}
                                value={stats.totalVehicles || 0}
                                icon={CarFront}
                                color="#3b82f6"
                            />
                        </Grid>
                        {user?.role !== 'agent' && (
                            <Grid item xs={12} sm={6} md={4}>
                                <StatCard
                                    title="Active Agents"
                                    value={stats.activeAgents || 0}
                                    icon={Users}
                                    color="#8b5cf6"
                                />
                            </Grid>
                        )}
                    </>
                )}
                <Grid item xs={12} sm={6} md={4}>
                    <StatCard
                        title="Total Ads Posted"
                        value={stats.totalPosts || 0}
                        icon={CheckCircle}
                        color="#10b981"
                    />
                </Grid>
            </Grid>

            {/* Timeline Graph */}
            <Paper className="glass" sx={{ p: 3, mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h6">Posting Activity Timeline</Typography>

                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Year Selector */}
                        <TextField
                            select
                            size="small"
                            label="Year"
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                            sx={{ minWidth: 100 }}
                        >
                            {years.map((year) => (
                                <MenuItem key={year} value={year}>{year}</MenuItem>
                            ))}
                        </TextField>

                        {/* Month Selector (shown for month view) */}
                        {timeframe === 'month' && (
                            <TextField
                                select
                                size="small"
                                label="Month"
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                sx={{ minWidth: 130 }}
                            >
                                {months.map((month) => (
                                    <MenuItem key={month.value} value={month.value}>{month.label}</MenuItem>
                                ))}
                            </TextField>
                        )}

                        {/* Date Range (shown for day view) */}
                        {timeframe === 'day' && (
                            <>
                                <TextField
                                    type="date"
                                    size="small"
                                    label="Start Date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                    sx={{ minWidth: 150 }}
                                />
                                <TextField
                                    type="date"
                                    size="small"
                                    label="End Date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                    sx={{ minWidth: 150 }}
                                />
                            </>
                        )}

                        {/* Timeframe Toggle */}
                        <ButtonGroup size="small" variant="outlined">
                            <Button
                                onClick={() => setTimeframe('day')}
                                variant={timeframe === 'day' ? 'contained' : 'outlined'}
                            >
                                Day
                            </Button>
                            <Button
                                onClick={() => setTimeframe('month')}
                                variant={timeframe === 'month' ? 'contained' : 'outlined'}
                            >
                                Month
                            </Button>
                            <Button
                                onClick={() => setTimeframe('year')}
                                variant={timeframe === 'year' ? 'contained' : 'outlined'}
                            >
                                Year
                            </Button>
                        </ButtonGroup>
                    </Box>
                </Box>

                {loading ? (
                    <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <LinearProgress sx={{ width: '50%' }} />
                    </Box>
                ) : timelineData.length === 0 ? (
                    <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
                        <TrendingUp size={48} color="#64748b" />
                        <Typography color="text.secondary">No posting activity in selected period</Typography>
                    </Box>
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={timelineData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis
                                dataKey="date"
                                stroke="#94a3b8"
                                style={{ fontSize: '12px' }}
                            />
                            <YAxis
                                stroke="#94a3b8"
                                style={{ fontSize: '12px' }}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1e293b',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px'
                                }}
                                labelStyle={{ color: '#e2e8f0' }}
                            />
                            <Line
                                type="monotone"
                                dataKey="count"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                dot={{ fill: '#3b82f6', r: 4 }}
                                activeDot={{ r: 6 }}
                                name="Posts"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </Paper>
        </Layout>
    );
};

export default Dashboard;
