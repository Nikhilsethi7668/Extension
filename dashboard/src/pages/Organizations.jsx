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
    const [regeneratedKey, setRegeneratedKey] = useState(null);
    const [showKeyDialog, setShowKeyDialog] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState({ open: false, org: null });

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
        console.log('Regenerate clicked for org:', org.name);
        // Show confirmation dialog instead of window.confirm
        setConfirmDialog({ open: true, org });
    };

    const confirmRegenerate = async () => {
        const org = confirmDialog.org;
        setConfirmDialog({ open: false, org: null });

        try {
            console.log('Making API call to regenerate key...');
            const { data } = await apiClient.put(`/organizations/${org._id}/regenerate-api-key`);
            console.log('API response:', data);
            setRegeneratedKey(data.apiKey);
            setShowKeyDialog(true);
            console.log('Dialog should now be visible');
            fetchOrganizations();
        } catch (err) {
            console.error('Regenerate error:', err);
            setError('Failed to regenerate key: ' + (err.response?.data?.message || err.message));
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

            <TableContainer component={Paper} className="glass">
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

            {/* Confirm Regenerate Dialog */}
            <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ open: false, org: null })}>
                <DialogTitle>Confirm API Key Regeneration</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                            ⚠️ This will invalidate the old key immediately!
                        </Typography>
                        <Typography variant="caption">
                            Any applications using the current API key will stop working until updated with the new key.
                        </Typography>
                    </Alert>
                    <Typography variant="body2">
                        Are you sure you want to regenerate the API key for <strong>{confirmDialog.org?.name}</strong>?
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDialog({ open: false, org: null })}>
                        Cancel
                    </Button>
                    <Button onClick={confirmRegenerate} variant="contained" color="error">
                        Yes, Regenerate Key
                    </Button>
                </DialogActions>
            </Dialog>


            {/* Regenerated API Key Dialog */}
            <Dialog
                open={showKeyDialog}
                onClose={() => setShowKeyDialog(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CheckCircle size={24} color="#10b981" />
                        <Typography variant="h6">API Key Regenerated Successfully</Typography>
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                            ⚠️ Important: Copy this key now!
                        </Typography>
                        <Typography variant="caption">
                            This is the only time you'll see the full key. The old key has been invalidated immediately.
                        </Typography>
                    </Alert>

                    <Box
                        sx={{
                            p: 2,
                            bgcolor: 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            borderRadius: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 2
                        }}
                    >
                        <Typography
                            variant="body2"
                            sx={{
                                fontFamily: 'monospace',
                                wordBreak: 'break-all',
                                flexGrow: 1
                            }}
                        >
                            {regeneratedKey}
                        </Typography>
                        <Tooltip title={apiKeyCopied === regeneratedKey ? "Copied!" : "Copy to clipboard"}>
                            <IconButton
                                onClick={() => handleCopyKey(regeneratedKey)}
                                sx={{
                                    bgcolor: 'primary.main',
                                    color: 'white',
                                    '&:hover': { bgcolor: 'primary.dark' }
                                }}
                            >
                                <Copy size={18} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setShowKeyDialog(false)}
                        variant="contained"
                    >
                        I've Copied the Key
                    </Button>
                </DialogActions>
            </Dialog>
        </Layout>
    );
};

export default Organizations;
