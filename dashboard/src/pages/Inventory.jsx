import React, { useState, useEffect } from 'react';
import {
    Box, Button, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Dialog, DialogTitle,
    DialogContent, TextField, DialogActions, Chip, InputAdornment, TablePagination,
    IconButton, Tooltip, FormControl, Select, MenuItem, Checkbox, InputLabel, RadioGroup, FormControlLabel, Radio,
    LinearProgress, Alert, CircularProgress
} from '@mui/material';
import { Plus, Search, RefreshCw, X, Eye, ExternalLink, Image as ImageIcon, Trash2, UserPlus, Users, AlertTriangle, DollarSign, RotateCcw, Zap, CheckCircle, Loader, Edit, Send } from 'lucide-react';
import apiClient from '../config/axios';
import Layout from '../components/Layout';
import { useQueue } from '../context/QueueContext';
import { useSocket } from '../context/SocketContext';
import { Upload } from 'lucide-react';

const Inventory = () => {
    const [vehicles, setVehicles] = useState([]);
    const [open, setOpen] = useState(false);
    const [scrapeUrl, setScrapeUrl] = useState('');
    const [maxVehicles, setMaxVehicles] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [imageFilter, setImageFilter] = useState('all');

    // Profile Selection Setup
    // const [profileDialogOpen, setProfileDialogOpen] = useState(false); // Bulk dialog removed
    const [chromeProfiles, setChromeProfiles] = useState([]);
    const [selectedProfileIds, setSelectedProfileIds] = useState([]);
    const [postingVehicle, setPostingVehicle] = useState(null); // The vehicle being posted

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

    // Socket.IO and Progress State
    const socket = useSocket();
    const [scrapingProgress, setScrapingProgress] = useState({
        active: false,
        scraped: 0,
        prepared: 0,
        total: 0,
        success: 0,
        failed: 0,
        currentUrl: '',
        message: '',
        status: 'idle' // 'idle', 'scraping', 'complete', 'error'
    });
    const [progressDialogOpen, setProgressDialogOpen] = useState(false);

    // AI Edit & Queue State
    const [selectedDetailImages, setSelectedDetailImages] = useState([]);
    const [aiEditDialogOpen, setAiEditDialogOpen] = useState(false);
    const [queueDialogOpen, setQueueDialogOpen] = useState(false);
    const [prompts, setPrompts] = useState([]);
    const [selectedPromptId, setSelectedPromptId] = useState('');
    const [customPrompt, setCustomPrompt] = useState('');
    const [queueSchedule, setQueueSchedule] = useState({ intervalMinutes: 15, randomize: true, stealth: true, contactNumber: '' });

    const [editDialogOpen, setEditDialogOpen] = useState(false); // New state for edit dialog
    
    // Post Now State
    const [postNowDialogOpen, setPostNowDialogOpen] = useState(false);
    const [selectedPostNowImages, setSelectedPostNowImages] = useState([]);
    const [postNowPrompt, setPostNowPrompt] = useState('');
    const [postNowContactNumber, setPostNowContactNumber] = useState('');

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

    const fetchChromeProfiles = async () => {
        try {
            const { data } = await apiClient.get('/chrome-profiles');
            setChromeProfiles(data);
        } catch (error) {
            console.error('Failed to fetch chrome profiles:', error);
        }
    };





    // Socket.IO Listeners
    useEffect(() => {
        if (!socket) return;

        const onScrapeStart = (data) => {
            console.log('[Socket.IO] Scrape started:', data);
            setScrapingProgress(prev => ({
                ...prev,
                active: true,
                total: data.total,
                scraped: 0,
                prepared: 0,
                success: 0,
                failed: 0,
                status: 'scraping',
                message: `Starting to scrape ${data.total} item(s)...`
            }));
            setProgressDialogOpen(true);
        };

        const onProgress = (data) => {
            console.log('[Socket.IO] Progress update:', data);
            setScrapingProgress(prev => ({
                ...prev,
                scraped: data.scraped,
                prepared: data.prepared,
                total: data.total,
                success: data.success,
                failed: data.failed,
                currentUrl: data.currentUrl,
                message: `Processing: ${data.currentUrl.substring(0, 60)}...`
            }));
        };

        const onVehicle = (data) => {
            console.log('[Socket.IO] Vehicle scraped:', data);
            setScrapingProgress(prev => ({
                ...prev,
                success: data.success,
                failed: data.failed,
                message: `✓ Successfully added: ${data.vehicle.title}`
            }));
        };

        const onError = (data) => {
            console.log('[Socket.IO] Scrape error:', data);
            setScrapingProgress(prev => ({
                ...prev,
                failed: data.failed,
                message: `✗ Failed: ${data.url} - ${data.error}`
            }));
        };

        const onComplete = (data) => {
            console.log('[Socket.IO] Scrape complete:', data);
            setScrapingProgress(prev => ({
                ...prev,
                active: false,
                status: 'complete',
                message: `Completed! ${data.success} succeeded, ${data.failed} failed.`
            }));
            // Refresh vehicle list
            if (typeof fetchVehicles === 'function') fetchVehicles();
        };

        // Attach listeners
        socket.on('scrape:start', onScrapeStart);
        socket.on('scrape:progress', onProgress);
        socket.on('scrape:vehicle', onVehicle);
        socket.on('scrape:error', onError);
        socket.on('scrape:complete', onComplete);

        // Cleanup
        return () => {
            socket.off('scrape:start', onScrapeStart);
            socket.off('scrape:progress', onProgress);
            socket.off('scrape:vehicle', onVehicle);
            socket.off('scrape:error', onError);
            socket.off('scrape:complete', onComplete);
        };
    }, [socket]);

    // ... (Existing Functions: getFilteredImages, handleDeleteImage) ...
    // Note: Re-implementing them or keeping them if not replaced by range. 
    // Since I am replacing the top block, I need to ensure I don't lose functions if I cross boundaries.
    // The previous EndLine was 258 which covers TableHead.

    const getFilteredImages = () => {
        if (!selectedVehicle) return [];
        
        // Specific placeholder image to remove
        const PLACEHOLDER_URL = 'https://image123.azureedge.net/1452782bcltd/16487202666893896-12.png';
        
        const aiUrls = selectedVehicle.aiImages || [];
        const allImages = selectedVehicle.images || [];

        // Unique set of URLs to avoid duplicates (Backend might append AI images to main list)
        const uniqueUrls = [...new Set([...allImages, ...aiUrls])];

        const processed = uniqueUrls
            .filter(url => url !== PLACEHOLDER_URL)
            .map(url => ({
                url,
                type: aiUrls.includes(url) ? 'ai' : 'original'
            }));

        if (imageFilter === 'original') return processed.filter(img => img.type === 'original');
        if (imageFilter === 'ai') return processed.filter(img => img.type === 'ai');
        return processed;
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
        setProgressDialogOpen(true);
        setScrapingProgress({
            active: true,
            scraped: 0,
            prepared: 0,
            total: 0,
            success: 0,
            failed: 0,
            currentUrl: '',
            message: 'Initializing scrape...',
            status: 'scraping'
        });

        try {
            const urls = scrapeUrl.split('\n').filter(u => u.trim());
            if (urls.length === 0) return;
            const limit = parseInt(maxVehicles) || null;
            const { data } = await apiClient.post('/vehicles/scrape-bulk', { urls, limit });

            // Final update will come via socket, but handle edge case
            if (!scrapingProgress.active || scrapingProgress.status !== 'complete') {
                setScrapingProgress(prev => ({
                    ...prev,
                    active: false,
                    status: 'complete',
                    message: `Import complete! ${data.success} succeeded, ${data.failed} failed.`
                }));
            }

            setOpen(false);
            setScrapeUrl('');
            setMaxVehicles('');
            fetchVehicles();
        } catch (err) {
            console.error(err);
            setScrapingProgress(prev => ({
                ...prev,
                active: false,
                status: 'error',
                message: 'Scraping process failed: ' + (err.response?.data?.message || err.message)
            }));
        } finally {
            setLoading(false);
        }
    };

    // AI Edit Handlers
    const handleOpenAiDialog = async () => {
        if (selectedDetailImages.length === 0) return alert('Select at least one image first.');
        
        try {
            const { data } = await apiClient.get(`/vehicles/${selectedVehicle._id}/recommend-prompts`);
            setPrompts(data || []);
            setAiEditDialogOpen(true);
        } catch (error) {
            console.error(error);
            alert('Failed to load prompts');
        }
    };

    const handleAiEditSubmit = () => {
        if (!selectedPromptId && !customPrompt) return alert('Select a prompt or enter a custom one.');
        
        // Close dialog and cleanup immediately
        setAiEditDialogOpen(false);
        const imagesToProcess = [...selectedDetailImages];
        const vehicleId = selectedVehicle._id;
        const payload = {
            images: imagesToProcess,
            promptId: selectedPromptId || undefined,
            prompt: customPrompt || undefined
        };
        
        setSelectedDetailImages([]); // Clear selection
        setCustomPrompt('');
        setSelectedPromptId('');
        
        // Process in background via Global Context
        const userStr = localStorage.getItem('user');
        const user = userStr ? JSON.parse(userStr) : null;
        const token = user?.token;

        if (!token) return alert('No auth token found');
        
        aiEditing(vehicleId, payload, token, async () => {
            // onSuccess: Refresh Vehicle Data
            try {
                const { data: refreshedData } = await apiClient.get(`/vehicles/${vehicleId}`);
                if (refreshedData.success && refreshedData.data) {
                     // Only update if we are still viewing the same vehicle
                     setSelectedVehicle(prev => (prev && prev._id === vehicleId ? refreshedData.data : prev));
                }
                fetchVehicles(); // update list
            } catch (err) {
                console.error('Failed to refresh vehicle after AI edit:', err);
            }
        });
    };

    // Queue Handler (Detail View)
    const handleOpenQueueDialog = () => {
        fetchChromeProfiles();
        setQueueDialogOpen(true);
    };

    const { queuePosting, postNow, aiEditing, aiProgress } = useQueue();

    const handleQueueSubmit = async () => {
        if (selectedProfileIds.length === 0) return alert('Select at least one profile');
        
        // Close dialog immediately
        setQueueDialogOpen(false);
        
        // Get auth token
        const userStr = localStorage.getItem('user');
        const user = userStr ? JSON.parse(userStr) : null;
        const token = user?.token;

        if (!token) return alert('No auth token found');

        const payload = {
            vehicleIds: [selectedVehicle._id],
            profileIds: selectedProfileIds,
            schedule: queueSchedule,
            selectedImages: selectedDetailImages
        };

        // Trigger global queue
        queuePosting(payload, token, () => {
             fetchVehicles(); // Refresh on success
        });

        // Clean up immediately
        setSelectedDetailImages([]);
        setSelectedProfileIds([]);
    };

    // Post Now Handlers
    const handleOpenPostNowDialog = (vehicle) => {
        setPostingVehicle(vehicle);
        
        // Initialize images (valid ones only)
        const PLACEHOLDER_URL = 'https://image123.azureedge.net/1452782bcltd/16487202666893896-12.png';
        const images = (vehicle.images || []).filter(url => url !== PLACEHOLDER_URL);
        const aiImages = (vehicle.aiImages || []).filter(url => url !== PLACEHOLDER_URL);
        // Combine unique
        const all = [...new Set([...images, ...aiImages])];
        
        setSelectedPostNowImages(all.slice(0, 4));
        setPostNowPrompt('');
        
        fetchChromeProfiles();
        setPostNowContactNumber(currentUser?.organization?.settings?.contactNumber || '');
        setPostNowDialogOpen(true);
    };

    const handlePostNowSubmit = async () => {
        if (selectedProfileIds.length === 0) return alert('Select at least one profile');
        setLoading(true); // Keep loading for the dialog transition
        
        // Close dialog immediately to show progress in sidebar
        setPostNowDialogOpen(false);

        // Get token
        const userStr = localStorage.getItem('user');
        const user = userStr ? JSON.parse(userStr) : null;
        const token = user?.token;

        if (!token) {
            setLoading(false);
            return alert('No auth token found');
        }

        const payload = {
            vehicleId: postingVehicle._id,
            profileIds: selectedProfileIds,
            selectedImages: selectedPostNowImages,
            prompt: postNowPrompt,
            contactNumber: postNowContactNumber
        };

        postNow(payload, token, (data) => {
            // onSuccess
            // We don't need to alert big messages anymore as status is in sidebar.
            // But a small toast or alert is fine.
            // alert(data.message); 
            setSelectedProfileIds([]);
            fetchVehicles();
            setLoading(false);
        });
    };

    // New Handler for Edit Submission
    const handleEditSubmit = async (formData) => {
        setLoading(true);
        try {
            const { data } = await apiClient.put(`/vehicles/${selectedVehicle._id}`, formData);
            
            // Update local state
            setSelectedVehicle(data); // Update detail view
            
            // Update list state (find and replace)
            setVehicles(prev => prev.map(v => v._id === data._id ? data : v));
            
            alert('Vehicle updated successfully'); // Replaced toast with alert
            setEditDialogOpen(false);
        } catch (error) {
            console.error('Update Error:', error);
            alert(error.response?.data?.message || 'Failed to update vehicle'); // Replaced toast with alert
        } finally {
            setLoading(false);
        }
    };

    const handleImageUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('image', file);

        setLoading(true);
        try {
            // 1. Upload Image
            const { data: uploadData } = await apiClient.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (uploadData.success && uploadData.url) {
                const newImageUrl = uploadData.url;
                
                // 2. Update Vehicle local state
                const updatedVehicle = { ...selectedVehicle };
                updatedVehicle.images = [...(updatedVehicle.images || []), newImageUrl];
                
                // 3. Persist to Backend
                await apiClient.put(`/vehicles/${selectedVehicle._id}`, {
                    images: updatedVehicle.images
                });

                setSelectedVehicle(updatedVehicle);
                setVehicles(prev => prev.map(v => v._id === updatedVehicle._id ? updatedVehicle : v));
                alert('Image uploaded successfully!');
            }
        } catch (error) {
            console.error('Upload failed:', error);
            alert('Image upload failed: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
            // Reset input value to allow uploading same file again
            event.target.value = '';
        }
    };

    const handleEditClick = (vehicle, e) => {
        if (e) e.stopPropagation();
        setSelectedVehicle(vehicle);
        setEditDialogOpen(true);
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



    const isAdmin = currentUser && ['org_admin', 'super_admin'].includes(currentUser.role);
    const canSelect = true; // Allow everyone to select for bulk actions

    return (
        <Layout 
            title="Vehicle Inventory"

        >
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

                    {selectedIds.length > 0 && (() => {
                        return (
                            <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'primary.dark', color: 'white', px: 2, mr: 2, borderRadius: 1, height: 40, gap: 1 }}>
                                <Typography variant="body2" sx={{ mr: 1 }}>{selectedIds.length} Selected</Typography>

                                {isAdmin && (
                                    <Button
                                        size="small"
                                        variant="contained"
                                        color="warning"
                                        startIcon={<UserPlus size={16} />}
                                        onClick={() => setAssignDialogOpen(true)}
                                    >
                                        Assign
                                    </Button>
                                )}
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
                    {isAdmin && (
                        <Button variant="outlined" color="error" onClick={handleDeleteAll} startIcon={<Trash2 size={18} />} disabled={loading || vehicles.length === 0}>Delete All</Button>
                    )}
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
                                {canSelect && (
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
                                        {canSelect && (
                                            <TableCell padding="checkbox">
                                                <Checkbox
                                                    color="primary"
                                                    checked={selectedIds.includes(v._id)}
                                                    onClick={(e) => { e.stopPropagation(); handleSelectOne(e, v._id); }}
                                                />
                                            </TableCell>
                                        )}
                                        <TableCell>
                                            {(() => {
                                                const PLACEHOLDER_URL = 'https://image123.azureedge.net/1452782bcltd/16487202666893896-12.png';
                                                const validPrepared = (v.preparedImages || []).filter(img => img !== PLACEHOLDER_URL);
                                                const validOriginal = (v.images || []).filter(img => img !== PLACEHOLDER_URL);

                                                if (validPrepared.length > 0 || validOriginal.length > 0) {
                                                    return (
                                                        <img
                                                            src={validPrepared.length > 0 ? validPrepared[0] : validOriginal[0]}
                                                            alt="vehicle"
                                                            style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 6 }}
                                                        />
                                                    );
                                                }
                                                return (
                                                    <Box sx={{ width: 64, height: 48, bgcolor: 'background.paper', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <ImageIcon size={20} color="#555" />
                                                    </Box>
                                                );
                                            })()}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                                {v.year} {v.make} {v.model}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {v.trim}
                                            </Typography>
                                        </TableCell>
                                        {canSelect && (
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
                                            
                                            <Tooltip title="Post Now">
                                                <IconButton
                                                    size="small"
                                                    color="primary"
                                                    onClick={(e) => { e.stopPropagation(); handleOpenPostNowDialog(v); }}
                                                >
                                                    <Send size={18} />
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
                                            <Tooltip title="Edit Vehicle">
                                                <IconButton
                                                    size="small"
                                                    color="primary"
                                                    onClick={(e) => handleEditClick(v, e)}
                                                >
                                                    <Edit size={18} />
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
                            {/* Filter Control & Actions */}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
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
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        onClick={() => {
                                            const filteredImages = getFilteredImages();
                                            const allSelected = filteredImages.every(img => selectedDetailImages.includes(img.url));
                                            
                                            if (allSelected) {
                                                // Deselect all filtered images
                                                setSelectedDetailImages(prev => 
                                                    prev.filter(url => !filteredImages.some(img => img.url === url))
                                                );
                                            } else {
                                                // Select all filtered images
                                                const newUrls = filteredImages.map(img => img.url);
                                                setSelectedDetailImages(prev => {
                                                    const combined = [...prev, ...newUrls];
                                                    return [...new Set(combined)]; // Remove duplicates
                                                });
                                            }
                                        }}
                                    >
                                        {(() => {
                                            const filteredImages = getFilteredImages();
                                            const allSelected = filteredImages.every(img => selectedDetailImages.includes(img.url));
                                            return allSelected ? 'Deselect All' : 'Select All';
                                        })()}
                                    </Button>
                                </Box>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        startIcon={<Edit size={16} />}
                                        onClick={() => setEditDialogOpen(true)}
                                    >
                                        Edit Details
                                    </Button>
                                    {selectedDetailImages.length > 0 && (
                                        <Button
                                            variant="contained"
                                            color="secondary"
                                            size="small"
                                            startIcon={<Zap size={16} />}
                                            onClick={handleOpenAiDialog}
                                        >
                                            AI Edit ({selectedDetailImages.length})
                                        </Button>
                                    )}
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        size="small"
                                        startIcon={<ExternalLink size={16} />}
                                        onClick={handleOpenQueueDialog}
                                    >
                                        Queue Post
                                    </Button>
                                </Box>
                                <Button
                                    component="label"
                                    variant="outlined"
                                    color="primary"
                                    size="small"
                                    startIcon={<Upload size={16} />}
                                >
                                    Upload
                                    <input
                                        type="file"
                                        hidden
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                    />
                                </Button>
                            </Box>

                            {/* Images Grid */}
                            <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 2, mb: 2 }}>
                                {getFilteredImages().length > 0 ? (
                                    getFilteredImages().map((img, idx) => (
                                        <Box key={idx} sx={{ position: 'relative', flexShrink: 0, width: 200, height: 150, borderRadius: 2, overflow: 'hidden', group: 'group', border: selectedDetailImages.includes(img.url) ? '2px solid #2196f3' : '1px solid #ddd' }}>
                                            <img
                                                src={img.url}
                                                alt=""
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                onClick={() => {
                                                    if (selectedDetailImages.includes(img.url)) {
                                                        setSelectedDetailImages(prev => prev.filter(u => u !== img.url));
                                                    } else {
                                                        setSelectedDetailImages(prev => [...prev, img.url]);
                                                    }
                                                }}
                                            />
                                            {/* Selection Checkbox (Visual) */}
                                            <Box sx={{ position: 'absolute', top: 5, right: 5, zIndex: 2 }}>
                                                <Checkbox
                                                    checked={selectedDetailImages.includes(img.url)}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        if (selectedDetailImages.includes(img.url)) {
                                                            setSelectedDetailImages(prev => prev.filter(u => u !== img.url));
                                                        } else {
                                                            setSelectedDetailImages(prev => [...prev, img.url]);
                                                        }
                                                    }}
                                                    sx={{
                                                        color: 'white',
                                                        '&.Mui-checked': { color: '#2196f3' },
                                                        bgcolor: 'rgba(0,0,0,0.5)',
                                                        borderRadius: '50%',
                                                        p: 0.5
                                                    }}
                                                />
                                            </Box>

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
                                                    bottom: 0,
                                                    right: 0,
                                                    p: 0.5,
                                                    opacity: 0,
                                                    transition: 'opacity 0.2s',
                                                    '&:hover': { opacity: 1 },
                                                    bgcolor: 'rgba(0,0,0,0.6)',
                                                    borderRadius: '8px 0 0 0'
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

            {/* Progress Dialog */}
            <Dialog
                open={progressDialogOpen}
                onClose={() => scrapingProgress.status === 'complete' && setProgressDialogOpen(false)}
                maxWidth="sm"
                fullWidth
                disableEscapeKeyDown={scrapingProgress.active}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {scrapingProgress.active ? (
                        <>
                            <Loader size={20} className="animate-spin" />
                            Scraping in Progress
                        </>
                    ) : scrapingProgress.status === 'complete' ? (
                        <>
                            <CheckCircle size={20} color="#4caf50" />
                            Scraping Complete
                        </>
                    ) : (
                        <>
                            <AlertTriangle size={20} color="#ff9800" />
                            Scraping Status
                        </>
                    )}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ mb: 2 }}>
                        {/* Scraping Progress */}
                        <Box sx={{ mb: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption" fontWeight={600} color="text.secondary">
                                    Step 1: Scraping Vehicles
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {scrapingProgress.scraped} / {scrapingProgress.total}
                                </Typography>
                            </Box>
                            <LinearProgress
                                variant="determinate"
                                value={scrapingProgress.total > 0
                                    ? (scrapingProgress.scraped / scrapingProgress.total) * 100
                                    : 0}
                                sx={{ height: 6, borderRadius: 3 }}
                            />
                        </Box>

                        {/* Preparation Progress */}
                        <Box sx={{ mb: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption" fontWeight={600} color="text.secondary">
                                    Step 2: Preparing Images (Auto-Stealth)
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {scrapingProgress.prepared} / {scrapingProgress.total}
                                </Typography>
                            </Box>
                            <LinearProgress
                                variant="determinate"
                                color="secondary"
                                value={scrapingProgress.total > 0
                                    ? (scrapingProgress.prepared / scrapingProgress.total) * 100
                                    : 0}
                                sx={{ height: 6, borderRadius: 3 }}
                            />
                        </Box>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                        <Chip
                            label={`✓ Success: ${scrapingProgress.success}`}
                            color="success"
                            size="small"
                            variant="outlined"
                        />
                        <Chip
                            label={`✗ Failed: ${scrapingProgress.failed}`}
                            color="error"
                            size="small"
                            variant="outlined"
                        />
                    </Box>

                    {scrapingProgress.message && (
                        <Alert
                            severity={
                                scrapingProgress.status === 'complete' ? 'success' :
                                    scrapingProgress.status === 'error' ? 'error' : 'info'
                            }
                            sx={{ wordBreak: 'break-word' }}
                        >
                            {scrapingProgress.message}
                        </Alert>
                    )}

                    {scrapingProgress.currentUrl && scrapingProgress.active && (
                        <Box sx={{ mt: 2 }}>
                            <Typography variant="caption" color="text.secondary" display="block">
                                Current URL:
                            </Typography>
                            <Typography variant="body2" sx={{
                                fontFamily: 'monospace',
                                fontSize: '0.75rem',
                                wordBreak: 'break-all',
                                mt: 0.5
                            }}>
                                {scrapingProgress.currentUrl}
                            </Typography>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setProgressDialogOpen(false)}
                        disabled={scrapingProgress.active}
                    >
                        {scrapingProgress.active ? 'Please Wait...' : 'Close'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* AI Edit Dialog */}
            <Dialog open={aiEditDialogOpen} onClose={() => setAiEditDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>AI Image Editor ({selectedDetailImages.length} images)</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        Select a prompt to apply to your selected images. Processing happens in parallel.
                    </Typography>

                    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Recommended Prompts</InputLabel>
                            <Select
                                value={selectedPromptId}
                                label="Recommended Prompts"
                                onChange={(e) => {
                                    setSelectedPromptId(e.target.value);
                                    setCustomPrompt('');
                                }}
                            >
                                <MenuItem value="">-- Select a Prompt --</MenuItem>
                                {prompts.map((p) => (
                                    <MenuItem key={p._id} value={p._id}>
                                        <Box>
                                            <Typography variant="body2" fontWeight={600}>{p.title}</Typography>
                                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', maxWidth: 400 }}>
                                                {p.prompt}
                                            </Typography>
                                        </Box>
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <TextField
                            label="Or Custom Prompt"
                            multiline
                            rows={3}
                            value={customPrompt}
                            onChange={(e) => {
                                setCustomPrompt(e.target.value);
                                setSelectedPromptId('');
                            }}
                            placeholder="e.g. Enhance lighting and remove background clutter..."
                            fullWidth
                            variant="outlined"
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAiEditDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleAiEditSubmit}
                        variant="contained"
                        color="secondary"
                        disabled={(aiProgress && aiProgress.active) || (!selectedPromptId && !customPrompt)}
                        startIcon={<Zap size={16} />}
                    >
                        Apply AI Edit
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Queue Post Dialog */}
            <Dialog open={queueDialogOpen} onClose={() => setQueueDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Queue Post</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Chrome Profiles</InputLabel>
                                <Select
                                    multiple
                                    value={selectedProfileIds}
                                    label="Chrome Profiles"
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setSelectedProfileIds(typeof value === 'string' ? value.split(',') : value);
                                    }}
                                    renderValue={(selected) => (
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                            {selected.map((profileId) => {
                                                const profile = chromeProfiles.find(p => p.uniqueId === profileId);
                                                return (
                                                    <Chip
                                                        key={profileId}
                                                        label={profile?.name || profileId}
                                                        size="small"
                                                    />
                                                );
                                            })}
                                        </Box>
                                    )}
                                >
                                    {chromeProfiles.map((p) => (
                                        <MenuItem key={p.uniqueId} value={p.uniqueId}>
                                            <Checkbox checked={selectedProfileIds.indexOf(p.uniqueId) > -1} />
                                            {p.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <Button 
                                variant="outlined" 
                                sx={{ height: 40, minWidth: 'fit-content' }} 
                                onClick={() => setSelectedProfileIds(chromeProfiles.map(p => p.uniqueId))}
                            >
                                Select All
                            </Button>
                        </Box>

                        {/* AI Description Prompt */}
                        <Box sx={{ bgcolor: 'background.paper', p: 2, borderRadius: 1, border: '1px solid #eee' }}>
                            <Typography variant="subtitle2" gutterBottom>AI Description Generation</Typography>
                            <TextField
                                label="Custom Description Prompt (Optional)"
                                placeholder="e.g. Urgent sale (Title is fixed, Desc. approx 60-80 words)..."
                                multiline
                                rows={2}
                                fullWidth
                                size="small"
                                value={queueSchedule.prompt || ''}
                                onChange={(e) => setQueueSchedule({ ...queueSchedule, prompt: e.target.value })}
                                sx={{ mb: 1 }}
                            />
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                {[
                                    { label: 'Urgent Sale', value: 'Write an urgent sale listing. Emphasize "Must Go" and "Negotiable".' },
                                    { label: 'Short & Concise', value: 'Keep it extremely short and punchy. Bullet points only. Focus on key specs.' },
                                    { label: 'Emphasize Features', value: 'Highlight the premium features, technology, and comfort options in detail.' },
                                    { label: 'Family Friendly', value: 'Focus on safety, reliability, and space for families. Mention safety ratings.' },
                                    { label: 'Luxury Tone', value: 'Use sophisticated, premium language. Emphasize elegance, status, and condition.' }
                                ].map((suggestion) => (
                                    <Chip
                                        key={suggestion.label}
                                        label={suggestion.label}
                                        size="small"
                                        onClick={() => setQueueSchedule({ ...queueSchedule, prompt: suggestion.value })}
                                        sx={{ cursor: 'pointer' }}
                                    />
                                ))}
                            </Box>
                            <TextField
                                label="Contact Number (Optional)"
                                placeholder="e.g. +1 555-0123"
                                fullWidth
                                size="small"
                                value={queueSchedule.contactNumber || ''}
                                onChange={(e) => setQueueSchedule({ ...queueSchedule, contactNumber: e.target.value })}
                                sx={{ mt: 2 }}
                            />
                        </Box>

                        <Box sx={{ bgcolor: 'background.paper', p: 2, borderRadius: 1, border: '1px solid #eee' }}>
                            <Typography variant="subtitle2" gutterBottom>Scheduler Options</Typography>

                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
                                <TextField
                                    label="Delay (Minutes)"
                                    type="number"
                                    size="small"
                                    value={queueSchedule.intervalMinutes}
                                    onChange={(e) => setQueueSchedule({ ...queueSchedule, intervalMinutes: parseInt(e.target.value) || 0 })}
                                />
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={queueSchedule.randomize}
                                            onChange={(e) => setQueueSchedule({ ...queueSchedule, randomize: e.target.checked })}
                                        />
                                    }
                                    label="Randomize Delay"
                                />
                            </Box>

                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={queueSchedule.stealth}
                                        onChange={(e) => setQueueSchedule({ ...queueSchedule, stealth: e.target.checked })}
                                    />
                                }
                                label={
                                    <Box>
                                        <Typography variant="body2" fontWeight={600}>Enable Stealth Mode</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Generates unique images for this post to avoid detection.
                                        </Typography>
                                    </Box>
                                }
                            />
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setQueueDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleQueueSubmit}
                        variant="contained"
                        color="primary"
                        disabled={loading || selectedProfileIds.length === 0}
                    >
                        {loading ? 'Queueing...' : 'Add to Queue'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Post Now Dialog */}
            <Dialog open={postNowDialogOpen} onClose={() => setPostNowDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Send size={20} />
                        Post Now
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {postingVehicle && (
                            <Alert severity="info">
                                Posting: {postingVehicle.year} {postingVehicle.make} {postingVehicle.model}
                            </Alert>
                        )}

                        {/* Image Selection */}
                        <Box>
                            <Typography variant="subtitle2" gutterBottom>Select Images ({selectedPostNowImages.length})</Typography>
                            <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1, minHeight: 80 }}>
                                {(() => {
                                    const PLACEHOLDER_URL = 'https://image123.azureedge.net/1452782bcltd/16487202666893896-12.png';
                                    const allImages = [...new Set([...(postingVehicle?.images || []), ...(postingVehicle?.aiImages || [])])].filter(u => u !== PLACEHOLDER_URL);

                                    if (allImages.length === 0) return <Typography variant="caption">No images available</Typography>;

                                    return allImages.map((img, idx) => (
                                        <Box key={idx} sx={{ position: 'relative', flexShrink: 0, width: 100, height: 75, borderRadius: 1, overflow: 'hidden', border: selectedPostNowImages.includes(img) ? '2px solid #2196f3' : '1px solid #ddd', cursor: 'pointer' }}
                                            onClick={() => {
                                                if (selectedPostNowImages.includes(img)) {
                                                    setSelectedPostNowImages(prev => prev.filter(u => u !== img));
                                                } else {
                                                    setSelectedPostNowImages(prev => [...prev, img]);
                                                }
                                            }}
                                        >
                                            <img
                                                src={img}
                                                alt=""
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                            {selectedPostNowImages.includes(img) && (
                                                <Box sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'primary.main', borderRadius: '50%', p: 0.2, display: 'flex' }}>
                                                    <CheckCircle size={12} color="white" />
                                                </Box>
                                            )}
                                        </Box>
                                    ));
                                })()}
                            </Box>
                        </Box>

                        {/* AI Description Prompt */}
                        <Box sx={{ bgcolor: 'background.paper', p: 2, borderRadius: 1, border: '1px solid #eee' }}>
                            <Typography variant="subtitle2" gutterBottom>AI Description Enhancement</Typography>
                            <TextField
                                label="Custom Description Prompt (Optional)"
                                placeholder="e.g. Urgent sale, Price negotiable..."
                                multiline
                                rows={2}
                                fullWidth
                                size="small"
                                value={postNowPrompt}
                                onChange={(e) => setPostNowPrompt(e.target.value)}
                                sx={{ mb: 1 }}
                            />
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                {[
                                    { label: 'Urgent Sale', value: 'Write an urgent sale listing. Emphasize "Must Go".' },
                                    { label: 'Short', value: 'Keep it extremely short. Bullet points only.' },
                                    { label: 'Detailed', value: 'Highlight all premium features in detail.' },
                                    { label: 'Standard', value: '' }
                                ].map((suggestion) => (
                                    <Chip
                                        key={suggestion.label}
                                        label={suggestion.label}
                                        size="small"
                                        onClick={() => setPostNowPrompt(suggestion.value)}
                                        sx={{ cursor: 'pointer' }}
                                        variant="outlined"
                                    />
                                ))}
                            </Box>
                            <TextField
                                label="Contact Number (Optional)"
                                placeholder="e.g. +1 555-0123"
                                fullWidth
                                size="small"
                                value={postNowContactNumber}
                                onChange={(e) => setPostNowContactNumber(e.target.value)}
                                sx={{ mt: 2 }}
                            />
                        </Box>

                        <FormControl fullWidth size="small">
                            <InputLabel>Select Profiles</InputLabel>
                            <Select
                                multiple
                                value={selectedProfileIds}
                                label="Select Profiles"
                                onChange={(e) => setSelectedProfileIds(e.target.value)}
                                renderValue={(selected) => `${selected.length} profile(s) selected`}
                            >
                                {chromeProfiles.map((profile) => (
                                    <MenuItem key={profile._id} value={profile._id}>
                                        <Checkbox checked={selectedProfileIds.includes(profile._id)} />
                                        {profile.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPostNowDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handlePostNowSubmit}
                        variant="contained"
                        color="primary"
                        disabled={loading || selectedProfileIds.length === 0}
                        startIcon={<Send size={16} />}
                    >
                        {loading ? 'Posting...' : 'Post Now'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Edit Vehicle Dialog */}
            <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Edit Vehicle Details</DialogTitle>
                <DialogContent>
                    {selectedVehicle && (
                        <EditVehicleForm 
                            vehicle={selectedVehicle} 
                            onSubmit={handleEditSubmit} 
                            onCancel={() => setEditDialogOpen(false)} 
                            loading={loading}
                        />
                    )}
                </DialogContent>
            </Dialog>

        </Layout >
    );
};

// Sub-component for Edit Form to keep main component cleaner
const EditVehicleForm = ({ vehicle, onSubmit, onCancel, loading }) => {
    const [formData, setFormData] = useState({
        year: vehicle.year || '',
        make: vehicle.make || '',
        model: vehicle.model || '',
        trim: vehicle.trim || '',
        vin: vehicle.vin || '',
        stockNumber: vehicle.stockNumber || '',
        price: vehicle.price || '',
        mileage: vehicle.mileage || '',
        exteriorColor: vehicle.exteriorColor || '',
        interiorColor: vehicle.interiorColor || '',
        transmission: vehicle.transmission || '',
        drivetrain: vehicle.drivetrain || '',
        engine: vehicle.engine || '',
        fuelType: vehicle.fuelType || '',
        bodyStyle: vehicle.bodyStyle || '',
        description: vehicle.description || ''
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    return (
        <Box component="form" sx={{ mt: 1 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3 }}>
                <TextField label="Year" name="year" value={formData.year} onChange={handleChange} size="small" fullWidth type="number" />
                <TextField label="Make" name="make" value={formData.make} onChange={handleChange} size="small" fullWidth />
                <TextField label="Model" name="model" value={formData.model} onChange={handleChange} size="small" fullWidth />
                
                <TextField label="Trim" name="trim" value={formData.trim} onChange={handleChange} size="small" fullWidth />
                <TextField label="VIN" name="vin" value={formData.vin} onChange={handleChange} size="small" fullWidth />
                <TextField label="Stock #" name="stockNumber" value={formData.stockNumber} onChange={handleChange} size="small" fullWidth />
                
                <TextField label="Price" name="price" value={formData.price} onChange={handleChange} size="small" fullWidth type="number" />
                <TextField label="Mileage" name="mileage" value={formData.mileage} onChange={handleChange} size="small" fullWidth type="number" />
                <TextField label="Body Style" name="bodyStyle" value={formData.bodyStyle} onChange={handleChange} size="small" fullWidth />
            </Box>

            <Typography variant="overline" color="text.secondary">Specs & Colors</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3, mt: 1 }}>
                <TextField label="Exterior Color" name="exteriorColor" value={formData.exteriorColor} onChange={handleChange} size="small" fullWidth />
                <TextField label="Interior Color" name="interiorColor" value={formData.interiorColor} onChange={handleChange} size="small" fullWidth />
                <TextField label="Transmission" name="transmission" value={formData.transmission} onChange={handleChange} size="small" fullWidth />
                
                <TextField label="Drivetrain" name="drivetrain" value={formData.drivetrain} onChange={handleChange} size="small" fullWidth />
                <TextField label="Engine" name="engine" value={formData.engine} onChange={handleChange} size="small" fullWidth />
                <TextField label="Fuel Type" name="fuelType" value={formData.fuelType} onChange={handleChange} size="small" fullWidth />
            </Box>

            <TextField
                label="Description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                multiline
                rows={6}
                fullWidth
                variant="outlined"
            />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3 }}>
                <Button onClick={onCancel} disabled={loading}>Cancel</Button>
                <Button 
                    variant="contained" 
                    onClick={() => onSubmit(formData)} 
                    disabled={loading}
                >
                    {loading ? 'Saving...' : 'Save Changes'}
                </Button>
            </Box>
        </Box>
    );
};

export default Inventory;
