import React, { useState, useEffect } from 'react';
import {
    Box, Paper, Typography, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, IconButton,
    Pagination, CircularProgress, InputAdornment, TextField,
    Autocomplete
} from '@mui/material';
import {
    Search, Activity, Calendar
} from 'lucide-react';
import Layout from '../components/Layout';
import apiClient from '../config/axios';
import { useAuth } from '../context/AuthContext';

const Logs = () => {
    const { user } = useAuth();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Date filtering
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // User filtering (only for org admins and super admins)
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [usersLoading, setUsersLoading] = useState(false);

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1); // Reset to first page on search
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    // Fetch users for filter (only for non-agents)
    useEffect(() => {
        if (user && user.role !== 'agent') {
            const fetchUsers = async () => {
                setUsersLoading(true);
                try {
                    const { data } = await apiClient.get('/users');
                    setUsers(data || []);
                } catch (err) {
                    console.error('Error fetching users:', err);
                    setUsers([]);
                } finally {
                    setUsersLoading(false);
                }
            };
            fetchUsers();
        }
    }, [user]);

    // Fetch logs
    useEffect(() => {
        const fetchLogs = async () => {
            setLoading(true);
            try {
                const params = {
                    page,
                    limit: 50,
                };

                if (debouncedSearch) {
                    params.search = debouncedSearch;
                }

                if (selectedUser) {
                    params.userId = selectedUser._id;
                }

                if (startDate) {
                    params.startDate = startDate;
                }

                if (endDate) {
                    params.endDate = endDate;
                }

                const { data } = await apiClient.get('/logs', { params });
                setLogs(data.logs || []);
                setTotalPages(data.pages || 1);
            } catch (err) {
                console.error('Error fetching logs:', err);
                setLogs([]);
            } finally {
                setLoading(false);
            }
        };

        fetchLogs();
    }, [page, debouncedSearch, selectedUser, startDate, endDate]);

    const handleChangePage = (event, value) => {
        setPage(value);
    };

    const getActionColor = (action) => {
        if (!action) return 'default';
        const lowerAction = action.toLowerCase();
        if (lowerAction === 'post') return 'success';
        if (lowerAction === 'repost') return 'info';
        if (lowerAction === 'renew') return 'warning';
        return 'default';
    };

    const getActionLabel = (action) => {
        if (!action) return 'POSTED';
        return action.toUpperCase();
    };

    const clearFilters = () => {
        setSearch('');
        setDebouncedSearch('');
        setStartDate('');
        setEndDate('');
        setSelectedUser(null);
        setPage(1);
    };

    const hasActiveFilters = debouncedSearch || startDate || endDate || selectedUser;

    const renderEntity = (log) => {
        const { entityType, entityId } = log;
        
        if (!entityId) {
             return <Typography variant="caption" color="text.secondary">Deleted/Unknown</Typography>;
        }

        if (entityType === 'Vehicle') {
             return (
                 <Box>
                    <Typography variant="body2" fontWeight={500}>
                        {entityId.year} {entityId.make} {entityId.model}
                    </Typography>
                     {entityId.trim && (
                        <Typography variant="caption" color="text.secondary">
                            {entityId.trim}
                        </Typography>
                    )}
                 </Box>
             );
        }

        if (entityType === 'User') {
             return (
                <Box>
                    <Typography variant="body2">{entityId.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{entityId.email}</Typography>
                </Box>
             );
        }

        if (entityType === 'Organization') {
             return <Typography variant="body2">{entityId.name}</Typography>;
        }

        // Fallback
        return (
             <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {entityId.name || entityId.title || entityId._id?.toString().substring(0, 8) || '...'}
            </Typography>
        );
    };

    return (
        <Layout title="Activity Logs">
            <Paper className="glass" sx={{ p: 2, mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'primary.main', color: 'white' }}>
                        <Activity size={24} />
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{ lineHeight: 1 }}>System Audit Logs</Typography>
                        <Typography variant="caption" color="text.secondary">
                            View all system activities, logins, and changes.
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {/* Date Range Filters */}
                    <TextField
                        type="date"
                        label="Start Date"
                        size="small"
                        value={startDate}
                        onChange={(e) => {
                            setStartDate(e.target.value);
                            setPage(1);
                        }}
                        sx={{ minWidth: 150 }}
                        InputLabelProps={{ shrink: true }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Calendar size={16} />
                                </InputAdornment>
                            )
                        }}
                    />

                    <TextField
                        type="date"
                        label="End Date"
                        size="small"
                        value={endDate}
                        onChange={(e) => {
                            setEndDate(e.target.value);
                            setPage(1);
                        }}
                        sx={{ minWidth: 150 }}
                        InputLabelProps={{ shrink: true }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Calendar size={16} />
                                </InputAdornment>
                            )
                        }}
                    />

                    {/* User Filter - Only for non-agents */}
                    {user && user.role !== 'agent' && (
                        <Autocomplete
                            options={users}
                            getOptionLabel={(option) => option.name || option.email}
                            value={selectedUser}
                            onChange={(event, newValue) => {
                                setSelectedUser(newValue);
                                setPage(1);
                            }}
                            loading={usersLoading}
                            sx={{ minWidth: 200 }}
                            size="small"
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Filter by User"
                                    placeholder="All Users"
                                    InputProps={{
                                        ...params.InputProps,
                                        endAdornment: (
                                            <>
                                                {usersLoading ? <CircularProgress size={20} /> : null}
                                                {params.InputProps.endAdornment}
                                            </>
                                        ),
                                    }}
                                />
                            )}
                        />
                    )}

                    {/* Smart Search - Only for non-agents */}
                    {user && user.role !== 'agent' && (
                        <TextField
                            placeholder="Search by user or vehicle..."
                            size="small"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            sx={{ minWidth: 240 }}
                            InputProps={{
                                startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment>
                            }}
                        />
                    )}

                    {/* Clear Filters Button */}
                    {hasActiveFilters && (
                        <Chip
                            label="Clear Filters"
                            onDelete={clearFilters}
                            color="primary"
                            variant="outlined"
                            sx={{ height: 40 }}
                        />
                    )}
                </Box>
            </Paper>

            <Paper className="glass" sx={{ overflow: 'hidden' }}>
                <TableContainer sx={{ maxHeight: 'calc(100vh - 320px)' }}>
                    <Table stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell>Timestamp</TableCell>
                                <TableCell>User</TableCell>
                                <TableCell>Action</TableCell>
                                <TableCell>Entity</TableCell>
                                <TableCell>Details</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                                        <CircularProgress size={30} />
                                    </TableCell>
                                </TableRow>
                            ) : logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                                        <Typography color="text.secondary">
                                            {hasActiveFilters
                                                ? 'No logs found matching your filters.'
                                                : 'No activity logs found.'}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                logs.map((log, index) => (
                                    <TableRow key={`${log._id}-${index}`} hover>
                                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'text.secondary' }}>
                                            {new Date(log.createdAt).toLocaleString()}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={500}>
                                                {log.user?.name || 'System'}
                                            </Typography>
                                            {log.user?.email && (
                                                <Typography variant="caption" color="text.secondary" display="block">
                                                    {log.user.email}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={log.action}
                                                size="small"
                                                color="primary"
                                                variant="outlined"
                                                sx={{ borderRadius: 1, fontWeight: 600, fontSize: '0.75rem' }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Chip 
                                                    label={log.entityType} 
                                                    size="small" 
                                                    sx={{ fontSize: '0.7rem', height: 20 }} 
                                                />
                                                <Box>
                                                    {renderEntity(log)}
                                                </Box>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                           <Typography variant="caption" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: 'text.secondary', display: 'block', maxWidth: 300 }}>
                                               {log.details ? JSON.stringify(log.details) : '-'}
                                           </Typography>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                {totalPages > 1 && (
                    <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <Pagination count={totalPages} page={page} onChange={handleChangePage} color="primary" />
                    </Box>
                )}
            </Paper>
        </Layout>
    );
};

export default Logs;
