import React, { useState, useEffect } from 'react';
import {
    Box, Paper, Typography, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip,
    Button, CircularProgress, Pagination, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions,
    DialogContentText, Tabs, Tab
} from '@mui/material';
import { Calendar, Trash2, AlertCircle } from 'lucide-react';
import Layout from '../components/Layout';
import apiClient from '../config/axios';
import { useAuth } from '../context/AuthContext';

const ScheduledPosts = () => {
    const { user: currentUser } = useAuth();
    const [postings, setPostings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState('all'); // Default to all as requested
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedPosting, setSelectedPosting] = useState(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetchPostings();
    }, [page, statusFilter]);

    const fetchPostings = async () => {
        try {
            setLoading(true);
            let url = `/postings?page=${page}&limit=20`;
            if (statusFilter !== 'all') {
                url += `&status=${statusFilter}`;
            }
            const { data } = await apiClient.get(url);
            setPostings(data.postings);
            setTotal(data.total);
        } catch (err) {
            console.error('Failed to fetch scheduled postings', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (posting) => {
        setSelectedPosting(posting);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!selectedPosting) return;

        try {
            setDeleting(true);
            await apiClient.delete(`/postings/${selectedPosting._id}`);
            setDeleteDialogOpen(false);
            setSelectedPosting(null);
            // Refresh the list
            fetchPostings();
        } catch (err) {
            console.error('Failed to delete posting', err);
            alert('Failed to delete posting: ' + (err.response?.data?.message || err.message));
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteCancel = () => {
        setDeleteDialogOpen(false);
        setSelectedPosting(null);
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'scheduled': return 'info';
            case 'processing': return 'warning';
            case 'completed': return 'success';
            case 'failed': return 'error';
            default: return 'default';
        }
    };

    return (
        <Layout title="Post Scheduler">
            <Paper className="glass" sx={{ overflow: 'hidden' }}>
                {/* Status Tabs */}
                <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, pt: 2 }}>
                    <Tabs 
                        value={statusFilter} 
                        onChange={(e, v) => { setStatusFilter(v); setPage(1); }}
                        textColor="primary"
                        indicatorColor="primary"
                        aria-label="status tabs"
                    >
                        <Tab label="Scheduled" value="scheduled" />
                        <Tab label="Processing" value="processing" />
                        <Tab label="Completed" value="completed" />
                        <Tab label="Failed" value="failed" />
                        <Tab label="All" value="all" />
                    </Tabs>
                </Box>

                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Vehicle</TableCell>
                                <TableCell>Price</TableCell>
                                <TableCell>Scheduled Time</TableCell>
                                <TableCell>Status</TableCell>
                                {(currentUser?.role === 'org_admin' || currentUser?.role === 'super_admin') && (
                                    <TableCell>User</TableCell>
                                )}
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                        <CircularProgress />
                                    </TableCell>
                                </TableRow>
                            ) : postings.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                            <Calendar size={48} style={{ opacity: 0.3 }} />
                                            <Typography color="text.secondary">No {statusFilter === 'all' ? '' : statusFilter} posts found.</Typography>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                postings.map((posting) => (
                                    <TableRow key={posting._id} hover>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                {posting.vehicleId?.images?.[0] && (
                                                    <Box
                                                        component="img"
                                                        src={posting.vehicleId.images[0]}
                                                        sx={{ width: 60, height: 40, objectFit: 'cover', borderRadius: 1 }}
                                                    />
                                                )}
                                                <Box>
                                                    <Typography variant="subtitle2" fontWeight={600}>
                                                        {posting.vehicleId?.year} {posting.vehicleId?.make} {posting.vehicleId?.model}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {posting.vehicleId?.vin || 'N/A'}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            ${Number(posting.vehicleId?.price || 0).toLocaleString()}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">
                                                {new Date(posting.scheduledTime).toLocaleString()}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
                                                <Chip
                                                    label={posting.status}
                                                    size="small"
                                                    color={getStatusColor(posting.status)}
                                                    variant="outlined"
                                                />
                                                {/* Show Failure Reason or Error */}
                                                {(posting.failureReason || posting.error) && (
                                                    <Typography variant="caption" color="error" sx={{ maxWidth: 200, lineHeight: 1.2 }}>
                                                        {posting.failureReason || posting.error}
                                                    </Typography>
                                                )}
                                            </Box>
                                        </TableCell>
                                        {(currentUser?.role === 'org_admin' || currentUser?.role === 'super_admin') && (
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {posting.userId?.name || 'Unknown'}
                                                </Typography>
                                            </TableCell>
                                        )}
                                        <TableCell align="right">
                                            <IconButton
                                                size="small"
                                                color="error"
                                                onClick={() => handleDeleteClick(posting)}
                                                title="Delete"
                                            >
                                                <Trash2 size={18} />
                                            </IconButton>
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

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteDialogOpen}
                onClose={handleDeleteCancel}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AlertCircle size={24} color="#f44336" />
                    Confirm Delete
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete this scheduled post for{' '}
                        <strong>
                            {selectedPosting?.vehicleId?.year} {selectedPosting?.vehicleId?.make} {selectedPosting?.vehicleId?.model}
                        </strong>?
                        This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleDeleteCancel} disabled={deleting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleDeleteConfirm}
                        color="error"
                        variant="contained"
                        disabled={deleting}
                    >
                        {deleting ? 'Deleting...' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Layout>
    );
};

export default ScheduledPosts;
