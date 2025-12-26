import React, { useState, useEffect } from 'react';
import {
    Box, Button, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Dialog, DialogTitle,
    DialogContent, TextField, DialogActions, Chip, InputAdornment, TablePagination,
    IconButton, Tooltip
} from '@mui/material';
import { Plus, Search, RefreshCw, X, Eye, ExternalLink, Image as ImageIcon, Trash2 } from 'lucide-react';
import apiClient from '../config/axios';
import Layout from '../components/Layout';

const Inventory = () => {
    const [vehicles, setVehicles] = useState([]);
    const [open, setOpen] = useState(false);
    const [scrapeUrl, setScrapeUrl] = useState('');
    const [maxVehicles, setMaxVehicles] = useState(''); // New state for limit
    const [loading, setLoading] = useState(false);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [detailOpen, setDetailOpen] = useState(false);

    // Pagination & Search State
    const [page, setPage] = useState(0); // MUI is 0-indexed
    const [rowsPerPage, setRowsPerPage] = useState(50);
    const [totalVehicles, setTotalVehicles] = useState(0);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(0); // Reset to first page on new search
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    const fetchVehicles = async () => {
        setLoading(true);
        try {
            const { data } = await apiClient.get('/vehicles', {
                params: {
                    page: page + 1, // API is 1-indexed
                    limit: rowsPerPage,
                    search: debouncedSearch
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
    }, [page, rowsPerPage, debouncedSearch]);

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
            setMaxVehicles(''); // Reset limit
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

    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

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
        if (!window.confirm('Are you sure you want to delete this vehicle? This action cannot be undone.')) {
            return;
        }

        setLoading(true);
        try {
            await apiClient.delete(`/vehicles/${vehicleId}`);
            alert('Vehicle deleted successfully!');
            fetchVehicles();
        } catch (error) {
            console.error('Error deleting vehicle:', error);
            alert('Failed to delete vehicle: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAll = async () => {
        if (!window.confirm('⚠️ WARNING: This will delete ALL your vehicles! This action cannot be undone. Are you absolutely sure?')) {
            return;
        }

        if (!window.confirm('This is your last chance. Delete ALL vehicles permanently?')) {
            return;
        }

        setLoading(true);
        try {
            const { data } = await apiClient.delete('/vehicles');
            alert(`✅ Deleted ${data.deletedCount} vehicles successfully!`);
            fetchVehicles();
        } catch (error) {
            console.error('Error deleting all vehicles:', error);
            alert('Failed to delete vehicles: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout title="Vehicle Inventory">
            <Paper className="glass" sx={{ p: 2, mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: '300px' }}>
                    <TextField
                        placeholder="Search by Make, Model, VIN..."
                        variant="outlined"
                        size="small"
                        fullWidth
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search size={18} color="#94a3b8" />
                                </InputAdornment>
                            ),
                            endAdornment: search && (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={clearSearch}>
                                        <X size={16} />
                                    </IconButton>
                                </InputAdornment>
                            ),
                            sx: { bgcolor: 'background.paper' }
                        }}
                    />
                </Box>

                <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <Button
                        variant="outlined"
                        color="error"
                        onClick={handleDeleteAll}
                        startIcon={<Trash2 size={18} />}
                        disabled={loading || vehicles.length === 0}
                    >
                        Delete All
                    </Button>
                    <Button
                        variant="outlined"
                        color="secondary"
                        onClick={fetchVehicles}
                        startIcon={<RefreshCw size={18} />}
                    >
                        Refresh
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => setOpen(true)}
                        startIcon={<Plus size={18} />}
                    >
                        Import Vehicle
                    </Button>
                </Box>
            </Paper>

            <Paper className="glass" sx={{ overflow: 'hidden' }}>
                <TableContainer sx={{ maxHeight: 'calc(100vh - 280px)' }}>
                    <Table stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell width={100}>Image</TableCell>
                                <TableCell>Vehicle Info</TableCell>
                                <TableCell>VIN</TableCell>
                                <TableCell>Price</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                                        <Typography color="text.secondary">Loading inventory...</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : vehicles.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
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
                                        <TableCell>
                                            {v.images && v.images.length > 0 ? (
                                                <img
                                                    src={v.images[0]}
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
                                        <TableCell align="right">
                                            <Tooltip title="View Details">
                                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleViewVehicle(v); }}>
                                                    <Eye size={18} />
                                                </IconButton>
                                            </Tooltip>
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
                            {/* Images */}
                            {selectedVehicle.images && selectedVehicle.images.length > 0 && (
                                <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 2, mb: 2 }}>
                                    {selectedVehicle.images.map((img, idx) => (
                                        <Box key={idx} sx={{ flexShrink: 0, width: 200, height: 150, borderRadius: 2, overflow: 'hidden' }}>
                                            <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </Box>
                                    ))}
                                </Box>
                            )}

                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                                <Box>
                                    <Typography variant="overline" color="text.secondary">Vehicle Details</Typography>
                                    <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="body2" color="text.secondary">VIN</Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{selectedVehicle.vin}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="body2" color="text.secondary">Mileage</Typography>
                                            <Typography variant="body2">{selectedVehicle.mileage?.toLocaleString() || '-'}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="body2" color="text.secondary">Price</Typography>
                                            <Typography variant="body2" fontWeight={600} color="success.light">${selectedVehicle.price?.toLocaleString() || '-'}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="body2" color="text.secondary">Location</Typography>
                                            <Typography variant="body2">{selectedVehicle.location || '-'}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="body2" color="text.secondary">Fuel Type</Typography>
                                            <Typography variant="body2">{selectedVehicle.fuelType || '-'}</Typography>
                                        </Box>
                                    </Box>
                                </Box>
                                <Box>
                                    <Typography variant="overline" color="text.secondary">Description</Typography>
                                    <Typography variant="body2" sx={{ mt: 1, maxHeight: 150, overflowY: 'auto' }}>
                                        {selectedVehicle.description || 'No description available.'}
                                    </Typography>
                                </Box>
                            </Box>
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => setDetailOpen(false)}>Close</Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>
        </Layout>
    );
};

export default Inventory;
