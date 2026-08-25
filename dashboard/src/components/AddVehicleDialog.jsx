import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    Button, Box, Typography, Grid, IconButton, Select, MenuItem,
    InputLabel, FormControl, CircularProgress, Alert
} from '@mui/material';
import { X, Upload, Trash2 } from 'lucide-react';
import apiClient, { getImageUrl } from '../config/axios';

const AddVehicleDialog = ({ open, onClose, onSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [images, setImages] = useState([]);
    const [formData, setFormData] = useState({
        make: '',
        model: '',
        year: '',
        price: '',
        vin: '',
        mileage: '',
        exteriorColor: '',
        interiorColor: '',
        transmission: 'Automatic',
        fuelType: 'Gasoline',
        bodyStyle: '',
        condition: 'Used',
        description: ''
    });

    const handleChange = (e) => {
        let { name, value } = e.target;

        // Custom validation on input
        if (name === 'vin') {
            // Alphanumeric only, up to 17 chars, uppercase
            value = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            if (value.length > 17) value = value.substring(0, 17);
        }

        if (name === 'description') {
            // Max 100 words
            const words = value.trim().split(/\s+/);
            // If the user tries to add a 101st word, ignore the change
            if (words.length > 100 && value.length > formData.description.length) {
                return;
            }
        }

        if (['year', 'price', 'mileage'].includes(name)) {
            // Prevent negative numbers
            if (value !== '' && Number(value) < 0) return;
        }
        setFormData({ ...formData, [name]: value });
    };

    const handleImageUpload = async (event) => {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        setUploading(true);
        setError('');

        try {
            const uploadedUrls = [];
            for (const file of files) {
                const formDataUpload = new FormData();
                formDataUpload.append('image', file);

                const { data } = await apiClient.post('/upload', formDataUpload, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                if (data.success && data.url) {
                    uploadedUrls.push(data.url);
                }
            }

            setImages(prev => [...prev, ...uploadedUrls]);
        } catch (err) {
            console.error('Upload failed:', err);
            setError('Image upload failed: ' + (err.response?.data?.message || err.message));
        } finally {
            setUploading(false);
            event.target.value = ''; // Reset input
        }
    };

    const handleRemoveImage = (indexToRemove) => {
        setImages(prev => prev.filter((_, index) => index !== indexToRemove));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (formData.vin && formData.vin.length !== 17) {
            setError('VIN must be exactly 17 alphanumeric characters');
            setLoading(false);
            return;
        }

        try {
            const payload = {
                ...formData,
                year: parseInt(formData.year, 10),
                price: parseFloat(formData.price),
                mileage: formData.mileage ? parseInt(formData.mileage, 10) : 0,
                images: images
            };

            await apiClient.post('/vehicles', payload);

            // Reset form
            setFormData({
                make: '', model: '', year: '', price: '', vin: '',
                mileage: '', exteriorColor: '', interiorColor: '',
                transmission: 'Automatic', fuelType: 'Gasoline',
                bodyStyle: '', condition: 'Used', description: ''
            });
            setImages([]);

            onSuccess(); // Triggers refresh
        } catch (err) {
            console.error('Create Vehicle Error:', err);
            setError(err.response?.data?.message || 'Failed to create vehicle');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6">Add Vehicle Manually</Typography>
                <IconButton onClick={onClose} size="small">
                    <X size={20} />
                </IconButton>
            </DialogTitle>

            <DialogContent dividers>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                <form id="add-vehicle-form" onSubmit={handleSubmit}>
                    <Grid container spacing={2}>
                        {/* Basic Info */}
                        <Grid item xs={12} sm={4}>
                            <TextField fullWidth required label="Make" name="make" value={formData.make} onChange={handleChange} size="small" inputProps={{ maxLength: 15 }} helperText={`${formData.make.length}/15`} />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField fullWidth required label="Model" name="model" value={formData.model} onChange={handleChange} size="small" inputProps={{ maxLength: 10 }} helperText={`${formData.model.length}/10`} />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField fullWidth required type="number" label="Year" name="year" value={formData.year} onChange={handleChange} size="small" inputProps={{ min: 0 }} />
                        </Grid>

                        {/* Specs */}
                        <Grid item xs={12} sm={4}>
                            <TextField fullWidth required type="number" label="Price" name="price" value={formData.price} onChange={handleChange} size="small" inputProps={{ min: 0, step: "any" }} />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField fullWidth type="number" label="Mileage" name="mileage" value={formData.mileage} onChange={handleChange} size="small" inputProps={{ min: 0 }} />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField fullWidth label="VIN" name="vin" value={formData.vin} onChange={handleChange} size="small" inputProps={{ maxLength: 17 }} />
                        </Grid>

                        {/* Colors */}
                        <Grid item xs={12} sm={6}>
                            <TextField fullWidth label="Exterior Color" name="exteriorColor" value={formData.exteriorColor} onChange={handleChange} size="small" inputProps={{ maxLength: 20 }} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField fullWidth label="Interior Color" name="interiorColor" value={formData.interiorColor} onChange={handleChange} size="small" inputProps={{ maxLength: 20 }} />
                        </Grid>

                        {/* Dropdowns */}
                        <Grid item xs={12} sm={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Transmission</InputLabel>
                                <Select name="transmission" value={formData.transmission} onChange={handleChange} label="Transmission">
                                    <MenuItem value="Automatic">Automatic</MenuItem>
                                    <MenuItem value="Manual">Manual</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Fuel Type</InputLabel>
                                <Select name="fuelType" value={formData.fuelType} onChange={handleChange} label="Fuel Type">
                                    <MenuItem value="Gasoline">Gasoline</MenuItem>
                                    <MenuItem value="Diesel">Diesel</MenuItem>
                                    <MenuItem value="Electric">Electric</MenuItem>
                                    <MenuItem value="Hybrid">Hybrid</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Condition</InputLabel>
                                <Select name="condition" value={formData.condition} onChange={handleChange} label="Condition">
                                    <MenuItem value="New">New</MenuItem>
                                    <MenuItem value="Used">Used</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12}>
                            <TextField fullWidth label="Body Style" name="bodyStyle" value={formData.bodyStyle} onChange={handleChange} size="small" placeholder="e.g. Sedan, SUV" />
                        </Grid>

                        <Grid item xs={12}>
                            <TextField fullWidth multiline rows={4} label="Description" name="description" value={formData.description} onChange={handleChange} size="small" helperText={`${formData.description.trim() ? formData.description.trim().split(/\\s+/).length : 0}/100 words`} />
                        </Grid>

                        {/* Images */}
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>Images</Typography>

                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                                {images.map((url, index) => (
                                    <Box key={index} sx={{ position: 'relative', width: 100, height: 100 }}>
                                        <img src={getImageUrl(url)} alt="vehicle" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }} />
                                        <IconButton
                                            size="small"
                                            color="error"
                                            sx={{ position: 'absolute', top: -10, right: -10, bgcolor: 'background.paper', '&:hover': { bgcolor: 'background.paper' } }}
                                            onClick={() => handleRemoveImage(index)}
                                        >
                                            <Trash2 size={16} />
                                        </IconButton>
                                    </Box>
                                ))}

                                <Button
                                    variant="outlined"
                                    component="label"
                                    sx={{ width: 100, height: 100, display: 'flex', flexDirection: 'column', gap: 1 }}
                                    disabled={uploading}
                                >
                                    {uploading ? <CircularProgress size={24} /> : <Upload size={24} />}
                                    <Typography variant="caption">Upload</Typography>
                                    <input type="file" hidden multiple accept="image/*" onChange={handleImageUpload} />
                                </Button>
                            </Box>
                        </Grid>
                    </Grid>
                </form>
            </DialogContent>

            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose} color="inherit" disabled={loading}>Cancel</Button>
                <Button type="submit" form="add-vehicle-form" variant="contained" disabled={loading || uploading}>
                    {loading ? <CircularProgress size={24} color="inherit" /> : 'Save Vehicle'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default AddVehicleDialog;
