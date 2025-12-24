import React, { useState, useEffect } from 'react';
import {
    Box, Paper, Typography, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, IconButton,
    Pagination, CircularProgress, InputAdornment, TextField
} from '@mui/material';
import {
    FileText, Search, Filter, Download, Activity
} from 'lucide-react';
import Layout from '../components/Layout';
import apiClient from '../config/axios';

const Logs = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');

    useEffect(() => {
        // Simulate fetching logs
        const fetchLogs = async () => {
            setLoading(true);
            try {
                // Mock data since endpoint might not exist
                // const { data } = await apiClient.get('/logs');
                await new Promise(r => setTimeout(r, 1000));

                const mockLogs = Array.from({ length: 15 }).map((_, i) => ({
                    id: i + 1,
                    timestamp: new Date(Date.now() - i * 3600000).toISOString(),
                    user: i % 3 === 0 ? 'Admin User' : `Agent ${i}`,
                    action: i % 4 === 0 ? 'LOGIN' : i % 4 === 1 ? 'CREATE_LISTING' : 'UPDATE_SETTINGS',
                    details: i % 4 === 1 ? 'Created listing for 2018 Camry' : 'Success',
                    status: 'success'
                }));
                setLogs(mockLogs);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchLogs();
    }, []);

    const handleChangePage = (event, value) => {
        setPage(value);
    };

    return (
        <Layout title="Audit Logs">
            <Paper className="glass" sx={{ p: 2, mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'primary.main', color: 'white' }}>
                        <Activity size={24} />
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{ lineHeight: 1 }}>System Activity</Typography>
                        <Typography variant="caption" color="text.secondary">Review user actions and system events.</Typography>
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                        placeholder="Search logs..."
                        size="small"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment>
                        }}
                    />
                    <IconButton sx={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                        <Filter size={20} />
                    </IconButton>
                    <IconButton sx={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                        <Download size={20} />
                    </IconButton>
                </Box>
            </Paper>

            <Paper className="glass" sx={{ overflow: 'hidden' }}>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Timestamp</TableCell>
                                <TableCell>User</TableCell>
                                <TableCell>Action</TableCell>
                                <TableCell>Details</TableCell>
                                <TableCell>Status</TableCell>
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
                                        <Typography color="text.secondary">No logs found.</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                logs.map((log) => (
                                    <TableRow key={log.id} hover>
                                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'text.secondary' }}>
                                            {new Date(log.timestamp).toLocaleString()}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={500}>{log.user}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={log.action}
                                                size="small"
                                                variant="outlined"
                                                color={log.action === 'LOGIN' ? 'info' : 'default'}
                                                sx={{ borderRadius: 1, fontWeight: 600, fontSize: '0.7rem' }}
                                            />
                                        </TableCell>
                                        <TableCell sx={{ opacity: 0.8 }}>{log.details}</TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'success.main' }} />
                                                <Typography variant="caption" fontWeight={500} color="success.main">Success</Typography>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <Pagination count={5} page={page} onChange={handleChangePage} color="primary" />
                </Box>
            </Paper>
        </Layout>
    );
};

export default Logs;
