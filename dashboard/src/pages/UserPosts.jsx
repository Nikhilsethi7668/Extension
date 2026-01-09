import React, { useState, useEffect } from 'react';
import {
    Box, Paper, Typography, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip,
    TextField, InputAdornment, MenuItem, Button,
    CircularProgress, Pagination
} from '@mui/material';
import { Search, Calendar, User } from 'lucide-react';
import Layout from '../components/Layout';
import apiClient from '../config/axios';
import { useAuth } from '../context/AuthContext';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

const UserPosts = () => {
    const { user: currentUser } = useAuth();
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    
    // Filters
    const [search, setSearch] = useState('');
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    const [selectedAgent, setSelectedAgent] = useState('all'); // 'all' or specific ID
    
    // Data for dropdowns
    const [agents, setAgents] = useState([]);

    useEffect(() => {
        if (currentUser?.role === 'org_admin' || currentUser?.role === 'super_admin') {
            fetchAgents();
        }
    }, [currentUser]);

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            fetchVehicles();
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [search, startDate, endDate, selectedAgent, page]);

    const fetchAgents = async () => {
        try {
            const { data } = await apiClient.get('/users?role=agent'); // Using existing endpoint
            // Endpoint returns all users if admin, but we might want just agents? 
            // The endpoint `/api/users` returns agents by default as per my read.
            setAgents(data);
        } catch (err) {
            console.error('Failed to fetch agents', err);
        }
    };

    const fetchVehicles = async () => {
        try {
            setLoading(true);
            let query = `?page=${page}&limit=20&sort=-createdAt`;
            
            if (search) query += `&search=${encodeURIComponent(search)}`;
            if (startDate) query += `&startDate=${startDate.toISOString()}`;
            if (endDate) query += `&endDate=${endDate.toISOString()}`;
            
            if ((currentUser.role === 'org_admin' || currentUser.role === 'super_admin')) {
                // If specific agent selected
                if (selectedAgent !== 'all') {
                     query += `&assignedUser=${selectedAgent}`;
                } else {
                    // Start of discussion: "Show posts posted by THAT user" vs "All posts if admin"
                    // Request: "for org admin give a dropdown for selection of there agent to get to se its posting"
                    // Default view for Admin? Probably all, or maybe just theirs? 
                    // Let's assume Default is ALL, filterable by Agent.
                    // But if I want to simulate "User Posts" page, maybe I should select "Me" by default?
                    // Let's default to 'all' for overview.
                }
            } else {
                // Regular agent: API automatically filters to "assignedUsers" or creates query?
                // Wait, GET /vehicles filters by `assignedUsers` if role is agent.
                // So no extra param needed for agent.
            }

            const { data } = await apiClient.get(`/vehicles/user-posts${query}`);
            setVehicles(data.vehicles);
            setTotal(data.total);
        } catch (err) {
            console.error('Failed to fetch vehicles', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout title="User Posts">
            <LocalizationProvider dateAdapter={AdapterDayjs}>
                <Paper className="glass" sx={{ p: 2, mb: 3, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                    {/* Search by Car Name */}
                    <TextField
                        size="small"
                        placeholder="Search specific vehicle..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment>
                        }}
                        sx={{ minWidth: 200, flex: 1 }}
                    />

                    {/* Date Filters */}
                    <DatePicker
                        label="Start Date"
                        value={startDate}
                        onChange={(newValue) => setStartDate(newValue)}
                        slotProps={{ textField: { size: 'small', sx: { width: 170 } } }}
                    />
                    <DatePicker
                        label="End Date"
                        value={endDate}
                        onChange={(newValue) => setEndDate(newValue)}
                        slotProps={{ textField: { size: 'small', sx: { width: 170 } } }}
                    />

                    {/* Org Admin Agent Selector */}
                    {(currentUser?.role === 'org_admin' || currentUser?.role === 'super_admin') && (
                        <TextField
                            select
                            label="Filter by Agent"
                            size="small"
                            value={selectedAgent}
                            onChange={(e) => setSelectedAgent(e.target.value)}
                            sx={{ minWidth: 200 }}
                        >
                            <MenuItem value="all">All Agents</MenuItem>
                            {agents.map((agent) => (
                                <MenuItem key={agent._id} value={agent._id}>
                                    {agent.name}
                                </MenuItem>
                            ))}
                        </TextField>
                    )}
                </Paper>

                <Paper className="glass" sx={{ overflow: 'hidden' }}>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Vehicle</TableCell>
                                    <TableCell>Price</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Posted By</TableCell>
                                    <TableCell>Date Created</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ py: 4 }}><CircularProgress /></TableCell>
                                    </TableRow>
                                ) : vehicles.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                            <Typography color="text.secondary">No posts found matching criteria.</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    vehicles.map((v) => (
                                        <TableRow key={v._id} hover>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                    <Box
                                                        component="img"
                                                        src={v.images?.[0] || '/placeholder.png'}
                                                        sx={{ width: 60, height: 40, objectFit: 'cover', borderRadius: 1 }}
                                                    />
                                                    <Box>
                                                        <Typography variant="subtitle2" fontWeight={600}>
                                                            {v.year} {v.make} {v.model}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {v.vin}
                                                        </Typography>
                                                    </Box>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                ${Number(v.price).toLocaleString()}
                                            </TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={v.status} 
                                                    size="small" 
                                                    color={v.status === 'posted' ? 'success' : v.status === 'sold' ? 'error' : 'default'}
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                 {/* Logic for showing who posted/assigned */}
                                                {(v.assignedUsers && v.assignedUsers.length > 0) ? (
                                                    v.assignedUsers.map(u => (
                                                        <Chip key={u._id} label={u.name} size="small" sx={{ mr: 0.5 }} />
                                                    ))
                                                ) : (
                                                    <Typography variant="caption" color="text.secondary">Unassigned</Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {new Date(v.createdAt).toLocaleDateString()}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    {/* Pagination */}
                    <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
                        <Pagination 
                            count={Math.ceil(total / 20)} 
                            page={page} 
                            onChange={(e, v) => setPage(v)} 
                            color="primary"
                        />
                    </Box>
                </Paper>
            </LocalizationProvider>
        </Layout>
    );
};

export default UserPosts;
