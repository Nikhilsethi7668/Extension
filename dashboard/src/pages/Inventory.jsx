import React, { useState, useEffect } from 'react';
import {
    Box, Button, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Dialog, DialogTitle,
    DialogContent, TextField, DialogActions, Chip
} from '@mui/material';
import { Plus } from 'lucide-react';
import axios from 'axios';
import Layout from '../components/Layout';

const Inventory = () => {
    const [vehicles, setVehicles] = useState([]);
    const [open, setOpen] = useState(false);
    const [scrapeUrl, setScrapeUrl] = useState('');
    const [loading, setLoading] = useState(false);

    const fetchVehicles = async () => {
        const { data } = await axios.get('/api/vehicles');
        setVehicles(data);
    };

    useEffect(() => {
        fetchVehicles();
    }, []);

    const handleScrape = async () => {
        setLoading(true);
        try {
            await axios.post('/api/vehicles/scrape', { url: scrapeUrl });
            setOpen(false);
            setScrapeUrl('');
            fetchVehicles();
        } catch (err) {
            alert('Scraping failed');
        } finally {
            setLoading(false);
        }
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
                            <TableCell>Vehicle</TableCell>
                            <TableCell>VIN</TableCell>
                            <TableCell>Price</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {vehicles.map((v) => (
                            <TableRow key={v._id}>
                                <TableCell>
                                    <Typography variant="subtitle2">{v.year} {v.make} {v.model}</Typography>
                                    <Typography variant="caption" color="textSecondary">{v.trim}</Typography>
                                </TableCell>
                                <TableCell>{v.vin}</TableCell>
                                <TableCell>${v.price?.toLocaleString()}</TableCell>
                                <TableCell>
                                    <Chip
                                        label={v.status}
                                        size="small"
                                        color={v.status === 'posted' ? 'success' : 'default'}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Button size="small">Edit</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Import Vehicle from URL</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Paste a URL from Autotrader, Cars.com, or CarGurus.
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        label="Listing URL"
                        value={scrapeUrl}
                        onChange={(e) => setScrapeUrl(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleScrape}
                        variant="contained"
                        disabled={loading || !scrapeUrl}
                    >
                        {loading ? 'Scraping...' : 'Start Import'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Layout>
    );
};

export default Inventory;
