import React, { useState, useEffect } from 'react';
import {
    Box, Button, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Dialog, DialogTitle,
    DialogContent, TextField, DialogActions, Chip, InputAdornment, TablePagination,
    IconButton, Tooltip, FormControl, Select, MenuItem, Checkbox, InputLabel, RadioGroup, FormControlLabel, Radio
} from '@mui/material';
import { Plus, Search, RefreshCw, X, Eye, ExternalLink, Image as ImageIcon, Trash2, UserPlus, Users, AlertTriangle, DollarSign, RotateCcw, Zap, CheckCircle, Loader } from 'lucide-react';
import apiClient from '../config/axios';
import Layout from '../components/Layout';

const Inventory = () => {
    const [vehicles, setVehicles] = useState([]);
    const [open, setOpen] = useState(false);
    const [scrapeUrl, setScrapeUrl] = useState('');
    const [maxVehicles, setMaxVehicles] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [imageFilter, setImageFilter] = useState('all');

    // State for Assignment Conflict
    const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
    const [assignmentMode, setAssignmentMode] = useState('merge'); // 'merge' | 'replace'
    const [conflictedCount, setConflictedCount] = useState(0);

    // State for viewing assignments
    const [assignmentDetailsOpen, setAssignmentDetailsOpen] = useState(false);
    const [selectedAssignments, setSelectedAssignments] = useState([]);
    const [selectedVehicleForAssignment, setSelectedVehicleForAssignment] = useState(null);

    // Marketplace Preparation State
    // State removed: preparingVehicle, batchPreparing (Deprecated)

    // Assignment State
    const [currentUser, setCurrentUser] = useState(null);
    const [agents, setAgents] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [selectedAgentId, setSelectedAgentId] = useState('');

    useEffect(() => {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const user = JSON.parse(userStr);
            setCurrentUser(user);
            // If Admin, fetch agents
            if (['org_admin', 'super_admin'].includes(user.role)) {
                fetchAgents();
            }
        }
    }, []);

    const fetchAgents = async () => {
        try {
            const { data } = await apiClient.get('/users');
            setAgents(data);
        } catch (error) {
            console.error('Failed to fetch agents:', error);
        }
    };

    // ... (Existing Functions: getFilteredImages, handleDeleteImage) ...
    // Note: Re-implementing them or keeping them if not replaced by range. 
    // Since I am replacing the top block, I need to ensure I don't lose functions if I cross boundaries.
    // The previous EndLine was 258 which covers TableHead.

    const getFilteredImages = () => {
        if (!selectedVehicle) return [];
        const original = (selectedVehicle.images || []).map(url => ({ url, type: 'original' }));
        const ai = (selectedVehicle.aiImages || []).map(url => ({ url, type: 'ai' }));
        if (imageFilter === 'original') return original;
        if (imageFilter === 'ai') return ai;
        return [...original, ...ai];
    };

    const handleDeleteImage = async (imageUrl) => {
        if (!window.confirm('Delete this image?')) return;
        try {
            await apiClient.delete(`/vehicles/${selectedVehicle._id}/images`, { data: { imageUrl } });
            // Update local state is complex, for brevity just refresh details or handle naive update
            const updatedVehicle = { ...selectedVehicle };
            if (updatedVehicle.images) updatedVehicle.images = updatedVehicle.images.filter(img => img !== imageUrl);
            if (updatedVehicle.aiImages) updatedVehicle.aiImages = updatedVehicle.aiImages.filter(img => img !== imageUrl);
            setSelectedVehicle(updatedVehicle);
            setVehicles(prev => prev.map(v => v._id === updatedVehicle._id ? updatedVehicle : v));
        } catch (error) {
            console.error(error);
            alert('Failed to delete image: ' + (error.response?.data?.message || error.message));
        }
    };

    // Pagination & Search State
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(50);
    const [totalVehicles, setTotalVehicles] = useState(0);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Status Confirmation Dialog State
    const [confirmStatusOpen, setConfirmStatusOpen] = useState(false);
    const [statusActionData, setStatusActionData] = useState({ id: null, action: null }); // action: 'mark-sold' | 'mark-available'

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(0);
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    const fetchVehicles = async () => {
        setLoading(true);
        try {
            const { data } = await apiClient.get('/vehicles', {
                params: {
                    page: page + 1,
                    limit: rowsPerPage,
                    search: debouncedSearch,
                    status: statusFilter // Add this
                }
            });

            if (data.vehicles) {
                setVehicles(data.vehicles);
                setTotalVehicles(data.total);
            } else {
                setVehicles(Array.isArray(data) ? data : []);
                setTotalVehicles(Array.isArray(data) ? data.length : 0);
            }
        } catch (error) {
            console.error('Error fetching vehicles:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVehicles();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, rowsPerPage, debouncedSearch, statusFilter]);

    // ... handleScrape ...
    const handleScrape = async () => {
        setLoading(true);
        try {
            const urls = scrapeUrl.split('\n').filter(u => u.trim());
            if (urls.length === 0) return;
            const limit = parseInt(maxVehicles) || null;
            const { data } = await apiClient.post('/vehicles/scrape-bulk', { urls, limit });
            if (data.failed > 0) {
                const errors = data.items.filter(i => i.status === 'failed').map(i => i.url + ': ' + i.error).join('\n');
                alert(`Imported ${data.success}, Failed ${data.failed}:\n${errors}`);
            } else {
                alert(`Successfully imported ${data.success} vehicles.`);
            }
            setOpen(false);
            setScrapeUrl('');
            setMaxVehicles('');
            fetchVehicles();
        } catch (err) {
            console.error(err);
            alert('Scraping process failed');
        } finally {
            setLoading(false);
        }
    };

    const handleViewVehicle = (vehicle) => {
        setSelectedVehicle(vehicle);
        setDetailOpen(true);
    };

    const handleChangePage = (event, newPage) => setPage(newPage);
    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };
    const clearSearch = () => {
        setSearch('');
        setDebouncedSearch('');
        setPage(0);
    };

    const handleDeleteVehicle = async (vehicleId) => {
        if (!window.confirm('Are you sure?')) return;
        setLoading(true);
        try {
            await apiClient.delete(`/vehicles/${vehicleId}`);
            fetchVehicles();
        } catch (error) { console.error(error); alert('Failed'); }
        finally { setLoading(false); }
    };

    // Re-implementing handleDeleteAll specifically would be long.
    // I will skip replacing functionality I don't touch if possible.
    // BUT I am replacing a huge chunk.
    const handleDeleteAll = async () => {
        if (!window.confirm('Delete ALL vehicles?')) return;
        setLoading(true);
        try {
            const { data } = await apiClient.delete('/vehicles');
            alert(`Deleted ${data.deletedCount}`);
            fetchVehicles();
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const handleOpenStatusConfirm = (id, action) => {
        setStatusActionData({ id, action });
        setConfirmStatusOpen(true);
    };

    const executeStatusChange = async () => {
        if (!statusActionData.id || !statusActionData.action) return;
        setLoading(true);
        try {
            await apiClient.post(`/vehicles/${statusActionData.id}/${statusActionData.action}`);
            fetchVehicles();
            setConfirmStatusOpen(false);
        } catch (error) {
            console.error(error);
            alert('Action failed: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    // Assignment Logic
    const handleSelectAll = (event) => {
        if (event.target.checked) {
            setSelectedIds(vehicles.map((v) => v._id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (event, id) => {
        if (event.target.checked) {
            setSelectedIds((prev) => [...prev, id]);
        } else {
            setSelectedIds((prev) => prev.filter((item) => item !== id));
        }
    };

    // Check for conflicts before assigning
    const handleAssignClick = () => {
        if (!selectedAgentId || selectedAgentId === 'unassigned') {
            // If unassigning, just go straight to execute (replace with [])
            executeAssignment('replace');
            return;
        }

        // Check active vehicles for existing assignments
        const selectedVehicles = vehicles.filter(v => selectedIds.includes(v._id));
        // Check for 'assignedUsers' array OR legacy 'assignedUser' field
        const alreadyAssigned = selectedVehicles.filter(v =>
            (v.assignedUsers && v.assignedUsers.length > 0) ||
            (v.assignedUser)
        );

        if (alreadyAssigned.length > 0) {
            setConflictedCount(alreadyAssigned.length);
            setConflictDialogOpen(true);
        } else {
            executeAssignment('replace'); // Default behavior if clean
        }
    };

    const executeAssignment = async (mode) => {
        setLoading(true);
        try {
            await apiClient.post('/vehicles/assign', {
                vehicleIds: selectedIds,
                agentId: selectedAgentId === 'unassigned' ? null : selectedAgentId,
                mode: mode
            });
            alert('Vehicles assigned successfully');
            setAssignDialogOpen(false);
            setConflictDialogOpen(false);
            setSelectedIds([]);
            fetchVehicles();
        } catch (error) {
            console.error(error);
            alert('Assignment failed: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };


    const handleRemoveAssignment = async (userId) => {
        if (!window.confirm('Remove this user from the vehicle?')) return;
        setLoading(true);
        try {
            await apiClient.post('/vehicles/assign', {
                vehicleIds: [selectedVehicleForAssignment],
                agentId: userId,
                mode: 'remove'
            });
            setSelectedAssignments(prev => prev.filter(u => u._id !== userId));
            fetchVehicles();
            if (selectedAssignments.length <= 1) {
                setAssignmentDetailsOpen(false);
            }
        } catch (error) {
            console.error(error);
            alert('Failed to remove assignment: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    // Marketplace Preparation Handlers REMOVED (Auto-Stealth on Scrape)

    const isAdmin = currentUser && ['org_admin', 'super_admin'].includes(currentUser.role);

    return (
        <Layout title="Vehicle Inventory">
            <Paper className="glass" sx={{ p: 2, mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: '300px' }}>

                    <FormControl size="small" sx={{ minWidth: 150 }}>
                        <Select
                            value={statusFilter}
                            onChange={(e) => {
                                setStatusFilter(e.target.value);
                                setPage(0);
                            }}
                            displayEmpty
                            variant="outlined"
                            sx={{ bgcolor: 'background.paper' }}
                        >
                            <MenuItem value="">All Statuses</MenuItem>
                            <MenuItem value="available">Available</MenuItem>
                            <MenuItem value="posted">Posted (All)</MenuItem>
                            <MenuItem value="recently_posted">Recently Posted</MenuItem>
                            <MenuItem value="previously_posted">Previously Posted</MenuItem>
                            <MenuItem value="sold">Sold</MenuItem>
                        </Select>
                    </FormControl>

                    {isAdmin && selectedIds.length > 0 && (() => {
                        // Check if any selected vehicle needs preparation
                        const selectedVehicles = vehicles.filter(v => selectedIds.includes(v._id));
                        const needsPreparation = selectedVehicles.some(v =>
                            !(v.preparedImages && v.preparedImages.length > 0 &&
                                v.images && v.images.length > 0 &&
                                v.preparationStatus === 'ready')
                        );

                        return (
                            <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'primary.dark', color: 'white', px: 2, mr: 2, borderRadius: 1, height: 40, gap: 1 }}>
                                <Typography variant="body2" sx={{ mr: 1 }}>{selectedIds.length} Selected</Typography>
                                {/* Removed Batch Prepare (Auto-Stealth) */}
                                <Button
                                    size="small"
                                    variant="contained"
                                    color="warning"
                                    startIcon={<UserPlus size={16} />}
                                    onClick={() => setAssignDialogOpen(true)}
                                >
                                    Assign
                                </Button>
                            </Box>
                        );
                    })()}

                    <TextField
                        placeholder="Search by Make, Model, VIN..."
                        variant="outlined"
                        size="small"
                        fullWidth
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: (<InputAdornment position="start"><Search size={18} color="#94a3b8" /></InputAdornment>),
                            endAdornment: search && (<InputAdornment position="end"><IconButton size="small" onClick={clearSearch}><X size={16} /></IconButton></InputAdornment>),
                            sx: { bgcolor: 'background.paper' }
                        }}
                    />
                </Box>

                <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <Button variant="outlined" color="error" onClick={handleDeleteAll} startIcon={<Trash2 size={18} />} disabled={loading || vehicles.length === 0}>Delete All</Button>
                    <Button variant="outlined" color="secondary" onClick={fetchVehicles} startIcon={<RefreshCw size={18} />}>Refresh</Button>
                    {currentUser && currentUser.role !== 'agent' && (
                        <Button variant="contained" onClick={() => setOpen(true)} startIcon={<Plus size={18} />}>Import Vehicle</Button>
                    )}
                </Box>
            </Paper>

            <Paper className="glass" sx={{ overflow: 'hidden' }}>
                <TableContainer sx={{ maxHeight: 'calc(100vh - 280px)' }}>
                    <Table stickyHeader>
                        <TableHead>
                            <TableRow>
                                {isAdmin && (
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            color="primary"
                                            indeterminate={selectedIds.length > 0 && selectedIds.length < vehicles.length}
                                            checked={vehicles.length > 0 && selectedIds.length === vehicles.length}
                                            onChange={handleSelectAll}
                                        />
                                    </TableCell>
                                )}
                                <TableCell width={100}>Image</TableCell>
                                <TableCell>Vehicle Info</TableCell>
                                {isAdmin && <TableCell>Assigned To</TableCell>}
                                <TableCell>VIN</TableCell>
                                <TableCell>Price</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Posted Date</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={isAdmin ? 8 : 6} align="center" sx={{ py: 6 }}>
                                        <Typography color="text.secondary">Loading inventory...</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : vehicles.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={isAdmin ? 8 : 6} align="center" sx={{ py: 6 }}>
                                        <Typography color="text.secondary">No vehicles found matching your criteria.</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                vehicles.map((v) => (
                                    <TableRow
                                        key={v._id}
                                        hover
                                        sx={{ cursor: 'pointer', '&:last-child td, &:last-child th': { border: 0 } }}
                                        onClick={() => handleViewVehicle(v)}
                                    >
                                        {isAdmin && (
                                            <TableCell padding="checkbox">
                                                <Checkbox
                                                    color="primary"
                                                    checked={selectedIds.includes(v._id)}
                                                    onClick={(e) => { e.stopPropagation(); handleSelectOne(e, v._id); }}
                                                />
                                            </TableCell>
                                        )}
                                        <TableCell>
                                            {((v.preparedImages && v.preparedImages.length > 0) || (v.images && v.images.length > 0)) ? (
                                                <img
                                                    src={(v.preparedImages && v.preparedImages.length > 0) ? v.preparedImages[0] : v.images[0]}
                                                    alt="vehicle"
                                                    style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 6 }}
                                                />
                                            ) : (
                                                <Box sx={{ width: 64, height: 48, bgcolor: 'background.paper', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <ImageIcon size={20} color="#555" />
                                                </Box>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                                {v.year} {v.make} {v.model}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {v.trim}
                                            </Typography>
                                        </TableCell>
                                        {isAdmin && (
                                            <TableCell>
                                                {v.assignedUsers && v.assignedUsers.length > 1 ? (
                                                    <Chip
                                                        label={`See Assignments (${v.assignedUsers.length})`}
                                                        size="small"
                                                        color="primary"
                                                        variant="outlined"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedAssignments(v.assignedUsers);
                                                            setSelectedVehicleForAssignment(v._id);
                                                            setAssignmentDetailsOpen(true);
                                                        }}
                                                        sx={{ cursor: 'pointer' }}
                                                    />
                                                ) : v.assignedUsers && v.assignedUsers.length === 1 ? (
                                                    <Chip
                                                        icon={<Users size={14} />}
                                                        label={v.assignedUsers[0].name}
                                                        size="small"
                                                        variant="outlined"
                                                        color="primary"
                                                    />
                                                ) : v.assignedUser ? (
                                                    <Chip
                                                        icon={<Users size={14} />}
                                                        label={agents.find(a => a._id === v.assignedUser)?.name || 'Unknown Agent'}
                                                        size="small"
                                                        color="info"
                                                        variant="outlined"
                                                    />
                                                ) : (
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>Unassigned</Typography>
                                                )}
                                            </TableCell>
                                        )}
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                                                {v.vin || '-'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.light' }}>
                                                ${v.price?.toLocaleString() || 'N/A'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={v.status}
                                                size="small"
                                                variant={v.status === 'posted' ? 'filled' : 'outlined'}
                                                color={v.status === 'posted' ? 'success' : v.status === 'sold' ? 'error' : 'default'}
                                                sx={{ textTransform: 'capitalize' }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary">
                                                {v.postingHistory && v.postingHistory.length > 0
                                                    ? new Date(v.postingHistory[v.postingHistory.length - 1].timestamp).toLocaleDateString()
                                                    : 'None'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Tooltip title="View Details">
                                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleViewVehicle(v); }}>
                                                    <Eye size={18} />
                                                </IconButton>
                                            </Tooltip>
                                            {v.status !== 'sold' ? (
                                                <Tooltip title="Mark as Sold">
                                                    <IconButton
                                                        size="small"
                                                        color="success"
                                                        onClick={(e) => { e.stopPropagation(); handleOpenStatusConfirm(v._id, 'mark-sold'); }}
                                                    >
                                                        <DollarSign size={18} />
                                                    </IconButton>
                                                </Tooltip>
                                            ) : (
                                                <Tooltip title="Mark as Available">
                                                    <IconButton
                                                        size="small"
                                                        color="warning"
                                                        onClick={(e) => { e.stopPropagation(); handleOpenStatusConfirm(v._id, 'mark-available'); }}
                                                    >
                                                        <RotateCcw size={18} />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                            <Tooltip title="Delete Vehicle">
                                                <IconButton
                                                    size="small"
                                                    color="error"
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteVehicle(v._id); }}
                                                >
                                                    <Trash2 size={18} />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
                <TablePagination
                    rowsPerPageOptions={[25, 50, 100]}
                    component="div"
                    count={totalVehicles}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={handleChangePage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                    sx={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                />
            </Paper>

            {/* Import Dialog */}
            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Import Vehicles</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Paste scraping URLs (one per line)
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        multiline
                        rows={6}
                        placeholder="https://www.autotrader.com/..."
                        value={scrapeUrl}
                        onChange={(e) => setScrapeUrl(e.target.value)}
                        variant="outlined"
                    />
                    <TextField
                        margin="dense"
                        label="Max Vehicles (Optional)"
                        placeholder="e.g. 50"
                        fullWidth
                        type="number"
                        value={maxVehicles}
                        onChange={(e) => setMaxVehicles(e.target.value)}
                        variant="outlined"
                        sx={{ mt: 2 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleScrape}
                        variant="contained"
                        disabled={loading || !scrapeUrl.trim()}
                    >
                        {loading ? 'Importing...' : 'Start Import'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Assign Dialog */}
            <Dialog open={assignDialogOpen} onClose={() => setAssignDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Assign Vehicles</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Assign {selectedIds.length} selected vehicle(s) to:
                    </Typography>
                    <FormControl fullWidth size="small">
                        <Select
                            value={selectedAgentId}
                            onChange={(e) => setSelectedAgentId(e.target.value)}
                            displayEmpty
                        >
                            <MenuItem value="" disabled>Select Agent</MenuItem>
                            <MenuItem value="unassigned" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>-- Unassign (Back to Pool) --</MenuItem>
                            {agents.map((agent) => (
                                <MenuItem key={agent._id} value={agent._id}>{agent.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleAssignClick}
                        variant="contained"
                        disabled={loading || !selectedAgentId}
                    >
                        {loading ? 'Assigning...' : 'Confirm Assignment'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Detail Dialog */}
            <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
                {selectedVehicle && (
                    <>
                        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                {selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}
                                <Typography variant="caption" display="block" color="text.secondary">
                                    Trim: {selectedVehicle.trim}
                                </Typography>
                            </Box>
                            <Box>
                                <Chip
                                    label={selectedVehicle.status}
                                    color={selectedVehicle.status === 'posted' ? 'success' : 'default'}
                                    size="small"
                                    sx={{ mr: 1 }}
                                />
                                {selectedVehicle.sourceUrl && (
                                    <IconButton component="a" href={selectedVehicle.sourceUrl} target="_blank" size="small">
                                        <ExternalLink size={18} />
                                    </IconButton>
                                )}
                            </Box>
                        </DialogTitle>
                        <DialogContent dividers>
                            {/* Filter Control */}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="subtitle1" fontWeight={600}>Vehicle Images</Typography>
                                <FormControl size="small" sx={{ minWidth: 150 }}>
                                    <Select
                                        value={imageFilter}
                                        onChange={(e) => setImageFilter(e.target.value)}
                                        displayEmpty
                                    >
                                        <MenuItem value="all">All Images</MenuItem>
                                        <MenuItem value="original">Original Only</MenuItem>
                                        <MenuItem value="ai">AI Generated</MenuItem>
                                    </Select>
                                </FormControl>
                            </Box>

                            {/* Images Grid */}
                            <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 2, mb: 2 }}>
                                {getFilteredImages().length > 0 ? (
                                    getFilteredImages().map((img, idx) => (
                                        <Box key={idx} sx={{ position: 'relative', flexShrink: 0, width: 200, height: 150, borderRadius: 2, overflow: 'hidden', group: 'group' }}>
                                            <img
                                                src={img.url}
                                                alt=""
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                            {/* Badge for AI images */}
                                            {img.type === 'ai' && (
                                                <Chip
                                                    label="AI"
                                                    size="small"
                                                    color="secondary"
                                                    sx={{ position: 'absolute', top: 8, left: 8, height: 20, fontSize: '0.7rem' }}
                                                />
                                            )}

                                            {/* Delete Overlay */}
                                            <Box
                                                sx={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    right: 0,
                                                    p: 0.5,
                                                    opacity: 0,
                                                    transition: 'opacity 0.2s',
                                                    '&:hover': { opacity: 1 },
                                                    bgcolor: 'rgba(0,0,0,0.5)',
                                                    borderRadius: '0 0 0 8px'
                                                }}
                                                className="delete-overlay"
                                            >
                                                <IconButton
                                                    size="small"
                                                    sx={{ color: 'white', '&:hover': { color: '#ff5252' } }}
                                                    onClick={() => handleDeleteImage(img.url)}
                                                >
                                                    <Trash2 size={16} />
                                                </IconButton>
                                            </Box>

                                            {/* CSS to show delete button on hover of parent box */}
                                            <style>{`
                                                .delete-overlay { opacity: 0; }
                                                div:hover > .delete-overlay { opacity: 1; }
                                            `}</style>
                                        </Box>
                                    ))
                                ) : (
                                    <Typography variant="body2" color="text.secondary" sx={{ py: 4, width: '100%', textAlign: 'center' }}>
                                        No images found for this filter.
                                    </Typography>
                                )}
                            </Box>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                                    <Box>
                                        <Typography variant="overline" color="text.secondary">Vehicle Details</Typography>
                                        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" color="text.secondary">VIN</Typography>
                                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{selectedVehicle.vin}</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" color="text.secondary">Stock #</Typography>
                                                <Typography variant="body2">{selectedVehicle.stockNumber || '-'}</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" color="text.secondary">Mileage</Typography>
                                                <Typography variant="body2">{selectedVehicle.mileage?.toLocaleString() || '-'}</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" color="text.secondary">Price</Typography>
                                                <Typography variant="body2" fontWeight={600} color="success.light">
                                                    ${selectedVehicle.price?.toLocaleString() || '-'}
                                                </Typography>
                                            </Box>
                                            {selectedVehicle.msrp > 0 && (
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <Typography variant="body2" color="text.secondary">MSRP</Typography>
                                                    <Typography variant="body2">${selectedVehicle.msrp?.toLocaleString()}</Typography>
                                                </Box>
                                            )}
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" color="text.secondary">Location</Typography>
                                                <Typography variant="body2">{selectedVehicle.location || '-'}</Typography>
                                            </Box>
                                        </Box>
                                    </Box>
                                    <Box>
                                        <Typography variant="overline" color="text.secondary">Specs & Colors</Typography>
                                        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" color="text.secondary">Transmission</Typography>
                                                <Typography variant="body2">{selectedVehicle.transmission || '-'}</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" color="text.secondary">Drivetrain</Typography>
                                                <Typography variant="body2">{selectedVehicle.drivetrain || '-'}</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" color="text.secondary">Engine</Typography>
                                                <Typography variant="body2" sx={{ maxWidth: '60%', textAlign: 'right' }}>
                                                    {selectedVehicle.engineCylinders || selectedVehicle.engine || '-'}
                                                </Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" color="text.secondary">Fuel Type</Typography>
                                                <Typography variant="body2">{selectedVehicle.fuelType || '-'}</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" color="text.secondary">Exterior</Typography>
                                                <Typography variant="body2">{selectedVehicle.exteriorColor || '-'}</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" color="text.secondary">Interior</Typography>
                                                <Typography variant="body2">{selectedVehicle.interiorColor || '-'}</Typography>
                                            </Box>
                                        </Box>
                                    </Box>
                                </Box>

                                {selectedVehicle.features && selectedVehicle.features.length > 0 && (
                                    <Box>
                                        <Typography variant="overline" color="text.secondary">Features ({selectedVehicle.features.length})</Typography>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1, maxHeight: 100, overflowY: 'auto' }}>
                                            {selectedVehicle.features.map((feature, idx) => (
                                                <Chip key={idx} label={feature} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 24 }} />
                                            ))}
                                        </Box>
                                    </Box>
                                )}

                                <Box>
                                    <Typography variant="overline" color="text.secondary">Description</Typography>
                                    <Typography variant="body2" sx={{ mt: 1, maxHeight: 150, overflowY: 'auto', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: selectedVehicle.description || 'No description available.' }} />
                                </Box>
                            </Box>

                            {/* Marketplace Preparation Section */}
                            <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Zap size={18} color="#9333ea" />
                                        <Typography variant="subtitle2" fontWeight={600}>
                                            Marketplace Preparation
                                        </Typography>
                                    </Box>
                                    <Chip
                                        size="small"
                                        label={selectedVehicle.preparationStatus || 'pending'}
                                        color={
                                            selectedVehicle.preparationStatus === 'ready' ? 'success' :
                                                selectedVehicle.preparationStatus === 'processing' ? 'warning' :
                                                    selectedVehicle.preparationStatus === 'failed' ? 'error' : 'default'
                                        }
                                        icon={selectedVehicle.preparationStatus === 'ready' ? <CheckCircle size={14} /> : undefined}
                                    />
                                </Box>

                                {selectedVehicle.preparationStatus === 'ready' && selectedVehicle.preparedImages?.length > 0 && (
                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                                            {selectedVehicle.preparedImages.length} prepared images ready • {selectedVehicle.preparationMetadata?.camera || 'Unknown camera'}
                                        </Typography>
                                    </Box>
                                )}

                                {/* Removed Manual Prepare Button (Auto-Stealth on Scrape) */}
                            </Box>
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => setDetailOpen(false)}>Close</Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>

            {/* Conflict Resolution Dialog */}
            <Dialog open={conflictDialogOpen} onClose={() => setConflictDialogOpen(false)}>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AlertTriangle color="orange" size={24} />
                    Assignment Conflict
                </DialogTitle>
                <DialogContent>
                    <Typography gutterBottom>
                        {conflictedCount} of {selectedIds.length} selected vehicles are already assigned to other agents.
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                        How do you want to proceed?
                    </Typography>

                    <FormControl component="fieldset">
                        <RadioGroup
                            value={assignmentMode}
                            onChange={(e) => setAssignmentMode(e.target.value)}
                        >
                            <FormControlLabel
                                value="merge"
                                control={<Radio />}
                                label={
                                    <Box>
                                        <Typography variant="body2" fontWeight={600}>Allow Shared Access (Merge)</Typography>
                                        <Typography variant="caption" color="text.secondary">Add new agent while keeping existing agents.</Typography>
                                    </Box>
                                }
                                sx={{ mb: 1 }}
                            />
                            <FormControlLabel
                                value="replace"
                                control={<Radio />}
                                label={
                                    <Box>
                                        <Typography variant="body2" fontWeight={600}>Overwrite (Replace)</Typography>
                                        <Typography variant="caption" color="text.secondary">Remove all existing agents and assign only to new agent.</Typography>
                                    </Box>
                                }
                            />
                        </RadioGroup>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConflictDialogOpen(false)}>Cancel</Button>
                    <Button onClick={() => executeAssignment(assignmentMode)} variant="contained" color="warning">
                        Confirm Assignment
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Assignment Details Dialog */}
            <Dialog open={assignmentDetailsOpen} onClose={() => setAssignmentDetailsOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Assigned Users</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
                        {selectedAssignments.map((user, idx) => (
                            <Box
                                key={user._id || idx}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 1.5,
                                    p: 1.5,
                                    bgcolor: 'background.paper',
                                    borderRadius: 1,
                                    border: '1px solid',
                                    borderColor: 'divider'
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Users size={18} color="var(--primary-color)" />
                                    <Typography variant="body2">{user.name}</Typography>
                                </Box>
                                <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => handleRemoveAssignment(user._id)}
                                    disabled={loading}
                                >
                                    <Trash2 size={16} />
                                </IconButton>
                            </Box>
                        ))}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAssignmentDetailsOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Status Confirmation Dialog */}
            <Dialog open={confirmStatusOpen} onClose={() => setConfirmStatusOpen(false)}>
                <DialogTitle>
                    {statusActionData.action === 'mark-sold' ? 'Mark as Sold?' : 'Mark as Available?'}
                </DialogTitle>
                <DialogContent>
                    <Typography>
                        {statusActionData.action === 'mark-sold'
                            ? 'Are you sure you want to mark this vehicle as SOLD? This will hide it from active listings.'
                            : 'Are you sure you want to mark this vehicle as AVAILABLE? It will appear in listings again.'}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmStatusOpen(false)}>Cancel</Button>
                    <Button
                        onClick={executeStatusChange}
                        variant="contained"
                        color={statusActionData.action === 'mark-sold' ? 'success' : 'primary'}
                        autoFocus
                    >
                        Confirm
                    </Button>
                </DialogActions>
            </Dialog>
        </Layout>
    );
};

export default Inventory;
