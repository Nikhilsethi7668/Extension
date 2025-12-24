import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    IconButton,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Alert,
    Tooltip,
    CircularProgress,
    Switch,
    FormControlLabel,
    Grid
} from '@mui/material';
import {
    MoreVertical,
    RefreshCw,
    Edit,
    CheckCircle,
    XCircle,
    Copy,
    Plus
} from 'lucide-react';
import apiClient from '../config/axios';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

const Organizations = () => {
    const { user } = useAuth();
    const [organizations, setOrganizations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [openDialog, setOpenDialog] = useState(false);
    const [selectedOrg, setSelectedOrg] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        maxAgents: 10,
        aiProvider: 'gemini',
        geminiApiKey: '',
        openaiApiKey: ''
    });
    const [openEditDialog, setOpenEditDialog] = useState(false);
    const [editData, setEditData] = useState({
        maxAgents: 10
    });
    const [apiKeyCopied, setApiKeyCopied] = useState(null);

    useEffect(() => {
        fetchOrganizations();
    }, []);

    const fetchOrganizations = async () => {
        try {
            setLoading(true);
            const { data } = await apiClient.get('/organizations');
            setOrganizations(data);
        } catch (err) {
            setError('Failed to load organizations');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateOrg = async (e) => {
        e.preventDefault();
        try {
            await apiClient.post('/organizations', formData);
            setSuccess('Organization created successfully');
            setOpenDialog(false);
            fetchOrganizations();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to create organization');
        }
    };

    const handleUpdateLimit = async () => {
        try {
            await apiClient.put(`/organizations/${selectedOrg._id}/limit`, { maxAgents: editData.maxAgents });
            setSuccess('Limit updated successfully');
            setOpenEditDialog(false);
            fetchOrganizations();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update limit');
        }
    };

    const handleStatusChange = async (org, type) => {
        try {
            const payload = {};
            if (type === 'org') {
                payload.status = org.status === 'active' ? 'inactive' : 'active';
            } else {
                payload.apiKeyStatus = org.apiKeyStatus === 'active' ? 'inactive' : 'active';
            }

            await apiClient.put(`/organizations/${org._id}/status`, payload);
            fetchOrganizations();
        } catch (err) {
            setError('Failed to update status');
        }
    };

    const handleRegenerateKey = async (org) => {
        if (!window.confirm('Are you sure? This will invalidate the old key immediately.')) return;
        try {
            await apiClient.put(`/organizations/${org._id}/regenerate-api-key`);
            setSuccess('API Key regenerated');
            fetchOrganizations();
        } catch (err) {
            setError('Failed to regenerate key');
        }
    };

    const handleCopyKey = (key) => {
        navigator.clipboard.writeText(key);
        setApiKeyCopied(key);
        setTimeout(() => setApiKeyCopied(null), 2000);
    };

    if (user?.role !== 'super_admin') {
        return (
            <Layout title="Organizations">
                <Alert severity="error">Access Denied</Alert>
            </Layout>
        );
    }

    return (
        <Layout title="Organizations">
            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="contained" startIcon={<Plus />} onClick={() => setOpenDialog(true)}>
                    New Organization
                </Button>
            </Box>

            <TableContainer component={Paper} sx={{ bgcolor: '#161616' }}>
                {loading ? (
                    <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
                ) : (
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>API Key Status</TableCell>
                                <TableCell>API Key</TableCell>
                                <TableCell>Agents</TableCell>
                                <TableCell>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {organizations.map(org => (
                                <TableRow key={org._id}>
                                    <TableCell sx={{ fontWeight: 'bold' }}>{org.name}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={org.status}
                                            color={org.status === 'active' ? 'success' : 'error'}
                                            size="small"
                                            onClick={() => handleStatusChange(org, 'org')}
                                            sx={{ cursor: 'pointer' }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={org.apiKeyStatus === 'active' ? 'Active' : 'Inactive'}
                                            color={org.apiKeyStatus === 'active' ? 'success' : 'error'}
                                            variant="outlined"
                                            size="small"
                                            onClick={() => handleStatusChange(org, 'key')}
                                            sx={{ cursor: 'pointer' }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                                {org.apiKey ? `${org.apiKey.substring(0, 8)}...` : 'N/A'}
                                            </Typography>
                                            {org.apiKey && (
                                                <Tooltip title={apiKeyCopied === org.apiKey ? "Copied!" : "Copy"}>
                                                    <IconButton size="small" onClick={() => handleCopyKey(org.apiKey)}>
                                                        <Copy size={14} />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                            <Tooltip title="Regenerate">
                                                <IconButton size="small" onClick={() => handleRegenerateKey(org)}>
                                                    <RefreshCw size={14} />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2">
                                            {org.agentCount} / {org.maxAgents}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <IconButton size="small" onClick={() => {
                                            setSelectedOrg(org);
                                            setEditData({ maxAgents: org.maxAgents });
                                            setOpenEditDialog(true);
                                        }}>
                                            <Edit size={16} />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </TableContainer>

            {/* Create Org Dialog */}
            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
                <form onSubmit={handleCreateOrg}>
                    <DialogTitle>Create Organization</DialogTitle>
                    <DialogContent>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                            <TextField
                                label="Organization Name"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                            <TextField
                                label="Max Agents"
                                type="number"
                                required
                                value={formData.maxAgents}
                                onChange={(e) => setFormData({ ...formData, maxAgents: e.target.value })}
                            />
                            <TextField
                                label="Gemini API Key"
                                value={formData.geminiApiKey}
                                onChange={(e) => setFormData({ ...formData, geminiApiKey: e.target.value })}
                            />

                            <Typography variant="subtitle2" sx={{ mt: 1, color: 'text.secondary' }}>
                                Organization Admin (Optional)
                            </Typography>
                            <TextField
                                label="Admin Email"
                                type="email"
                                value={formData.adminEmail || ''}
                                onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                                placeholder="Leave blank to skip user creation"
                            />
                            <TextField
                                label="Admin Password"
                                type="password"
                                value={formData.adminPassword || ''}
                                onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                            />
                        </Box>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
                        <Button type="submit" variant="contained">Create</Button>
                    </DialogActions>
                </form>
            </Dialog>

            {/* Edit Limits Dialog */}
            <Dialog open={openEditDialog} onClose={() => setOpenEditDialog(false)}>
                <DialogTitle>Edit Limits for {selectedOrg?.name}</DialogTitle>
                <DialogContent>
                    <TextField
                        label="Max Agents"
                        type="number"
                        fullWidth
                        sx={{ mt: 2 }}
                        value={editData.maxAgents}
                        onChange={(e) => setEditData({ ...editData, maxAgents: e.target.value })}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenEditDialog(false)}>Cancel</Button>
                    <Button onClick={handleUpdateLimit} variant="contained">Update</Button>
                </DialogActions>
            </Dialog>
        </Layout>
    );
};

export default Organizations;
