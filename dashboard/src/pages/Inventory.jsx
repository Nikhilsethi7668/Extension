import React, { useState, useEffect } from 'react';
import {
    Box, Button, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Dialog, DialogTitle,
    DialogContent, TextField, DialogActions, Chip
} from '@mui/material';
import { Plus } from 'lucide-react';
import apiClient from '../config/axios';
import Layout from '../components/Layout';

const Inventory = () => {
    const [vehicles, setVehicles] = useState([]);
    const [open, setOpen] = useState(false);
    const [scrapeUrl, setScrapeUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [detailOpen, setDetailOpen] = useState(false);

    const fetchVehicles = async () => {
        const { data } = await apiClient.get('/api/vehicles');
        setVehicles(data);
    };

    useEffect(() => {
        fetchVehicles();
    }, []);

    const handleScrape = async () => {
        setLoading(true);
        try {
            const urls = scrapeUrl.split('\n').filter(u => u.trim());

            if (urls.length === 0) return;

            const { data } = await apiClient.post('/api/vehicles/scrape-bulk', { urls });

            if (data.failed > 0) {
                const errors = data.items.filter(i => i.status === 'failed').map(i => i.url + ': ' + i.error).join('\n');
                alert(`Imported ${data.success}, Failed ${data.failed}:\n${errors}`);
            } else {
                alert(`Successfully imported ${data.success} vehicles.`);
            }

            setOpen(false);
            setScrapeUrl('');
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

    return (
        <Layout title="Vehicle Inventory">
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                    variant="contained"
                    startIcon={<Plus size={18} />}
                    onClick={() => setOpen(true)}
                >
                    Add Vehicle (Scrape)
                </Button>
            </Box>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Image</TableCell>
                            <TableCell>Vehicle</TableCell>
                            <TableCell>VIN</TableCell>
                            <TableCell>Price</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {vehicles.map((v) => (
                            <TableRow
                                key={v._id}
                                sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                                onClick={() => handleViewVehicle(v)}
                            >
                                <TableCell>
                                    {v.images && v.images.length > 0 ? (
                                        <img
                                            src={v.images[0]}
                                            alt={`${v.year} ${v.make} ${v.model}`}
                                            style={{
                                                width: '80px',
                                                height: '60px',
                                                objectFit: 'cover',
                                                borderRadius: '4px'
                                            }}
                                        />
                                    ) : (
                                        <Box
                                            sx={{
                                                width: '80px',
                                                height: '60px',
                                                bgcolor: 'grey.200',
                                                borderRadius: '4px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'grey.500'
                                            }}
                                        >
                                            No Image
                                        </Box>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Typography variant="subtitle2">{v.year} {v.make} {v.model}</Typography>
                                    <Typography variant="caption" color="textSecondary">{v.trim}</Typography>
                                </TableCell>
                                <TableCell>{v.vin || 'N/A'}</TableCell>
                                <TableCell>${v.price?.toLocaleString() || 'N/A'}</TableCell>
                                <TableCell>
                                    <Chip
                                        label={v.status}
                                        size="small"
                                        color={v.status === 'posted' ? 'success' : 'default'}
                                    />
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                    <Button size="small" onClick={() => handleViewVehicle(v)}>View</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Import Vehicles from URLs</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Paste URLs from Autotrader, Cars.com, etc. (One per line)
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        multiline
                        rows={6}
                        label="Listing URLs"
                        placeholder="https://www.autotrader.com/...\nhttps://www.cars.com/..."
                        value={scrapeUrl}
                        onChange={(e) => setScrapeUrl(e.target.value)}
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

            {/* Vehicle Detail Modal */}
            <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
                {selectedVehicle && (
                    <>
                        <DialogTitle>
                            {selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model} {selectedVehicle.trim}
                        </DialogTitle>
                        <DialogContent>
                            {/* Image Gallery */}
                            {selectedVehicle.images && selectedVehicle.images.length > 0 && (
                                <Box sx={{ mb: 3 }}>
                                    <Box sx={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                        gap: 2
                                    }}>
                                        {selectedVehicle.images.map((img, idx) => (
                                            <img
                                                key={idx}
                                                src={img}
                                                alt={`${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model} - ${idx + 1}`}
                                                style={{
                                                    width: '100%',
                                                    height: '150px',
                                                    objectFit: 'cover',
                                                    borderRadius: '8px'
                                                }}
                                            />
                                        ))}
                                    </Box>
                                </Box>
                            )}

                            {/* Vehicle Details */}
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
                                <Box>
                                    <Typography variant="caption" color="textSecondary">VIN</Typography>
                                    <Typography variant="body1">{selectedVehicle.vin || 'N/A'}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="textSecondary">Price</Typography>
                                    <Typography variant="body1">${selectedVehicle.price?.toLocaleString() || 'N/A'}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="textSecondary">Mileage</Typography>
                                    <Typography variant="body1">{selectedVehicle.mileage?.toLocaleString() || 'N/A'} miles</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="textSecondary">Status</Typography>
                                    <Chip
                                        label={selectedVehicle.status}
                                        size="small"
                                        color={selectedVehicle.status === 'posted' ? 'success' : 'default'}
                                    />
                                </Box>
                            </Box>

                            {/* Description */}
                            {selectedVehicle.description && (
                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="caption" color="textSecondary">Description</Typography>
                                    <Typography variant="body2" sx={{ mt: 1 }}>
                                        {selectedVehicle.description}
                                    </Typography>
                                </Box>
                            )}

                            {/* Source URL */}
                            {selectedVehicle.sourceUrl && (
                                <Box>
                                    <Typography variant="caption" color="textSecondary">Source</Typography>
                                    <Typography variant="body2" sx={{ mt: 1 }}>
                                        <a href={selectedVehicle.sourceUrl} target="_blank" rel="noopener noreferrer">
                                            View Original Listing
                                        </a>
                                    </Typography>
                                </Box>
                            )}
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
