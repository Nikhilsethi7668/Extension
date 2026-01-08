import React, { useState, useEffect } from 'react';
import {
    Box, Paper, Typography, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, Dialog,
    DialogTitle, DialogContent, DialogActions, TextField,
    Alert, IconButton, Menu, MenuItem, CircularProgress,
    Tooltip, Switch, FormControlLabel, Button, InputAdornment
} from '@mui/material';
import {
    UserPlus, MoreVertical, Edit, Trash2, Copy, RefreshCw,
    Search, Users as UsersIcon, Shield
} from 'lucide-react';
import apiClient from '../config/axios';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

const Users = () => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    // Dialogs
    const [openDialog, setOpenDialog] = useState(false);
    const [openEditDialog, setOpenEditDialog] = useState(false);
    const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [anchorEl, setAnchorEl] = useState(null);

    // Feedback
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [apiKeyCopied, setApiKeyCopied] = useState(null);

    const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'agent' });
    const [orgData, setOrgData] = useState(null);

    // Search
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetchUsers();
        if (currentUser?.role === 'org_admin') {
            fetchOrgDetails();
        }
    }, [currentUser]);

    const fetchOrgDetails = async () => {
        try {
            const { data } = await apiClient.get('/organizations/my-org');
            setOrgData(data);
        } catch (err) {
            console.error('Failed to fetch org details', err);
        }
    };

    const fetchUsers = async () => {
        try {
            setLoading(true);
            setError('');
            const { data } = await apiClient.get('/users');
            setUsers(data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch agents');
        } finally {
            setLoading(false);
        }
    };

    // --- Search Filter ---
    const filteredUsers = users.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    );

    // --- Actions ---

    const handleOpenDialog = () => {
        if (orgData && orgData.agentCount >= orgData.maxAgents) {
            setError('Maximum agent limit reached. Please request a limit increase.');
            return;
        }
        setFormData({ name: '', email: '', password: '', role: 'agent' });
        setError('');
        setSuccess('');
        setOpenDialog(true);
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            const payload = { name: formData.name, email: formData.email, role: 'agent' };
            if (formData.password) payload.password = formData.password;

            const { data } = await apiClient.post('/users', payload);
            setUsers([...users, data]);
            setSuccess('Agent created successfully!');
            setOpenDialog(false);
            if (orgData) fetchOrgDetails(); // Refresh limits
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to create agent');
        }
    };

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        try {
            const payload = { name: formData.name, email: formData.email };
            if (formData.password) payload.password = formData.password;

            const { data } = await apiClient.put(`/users/${selectedUser._id}`, payload);
            setUsers(users.map((u) => (u._id === data._id ? data : u)));
            setSuccess('Agent updated successfully!');
            setOpenEditDialog(false);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update agent');
        }
    };

    const handleDeleteUser = async () => {
        try {
            await apiClient.delete(`/users/${selectedUser._id}`);
            setUsers(users.filter((u) => u._id !== selectedUser._id));
            setSuccess('Agent deleted successfully!');
            setOpenDeleteDialog(false);
            if (orgData) fetchOrgDetails();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to delete agent');
        }
    };

    const handleToggleStatus = async (user) => {
        try {
            const newStatus = user.status === 'active' ? 'inactive' : 'active';
            await apiClient.put(`/users/${user._id}/status`, { status: newStatus });
            setUsers(users.map((u) => (u._id === user._id ? { ...u, status: newStatus } : u)));
            setSuccess(`User ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully!`);
        } catch (err) {
            setError('Failed to update status');
        }
    };

    const handleRegenerateApiKey = async (user) => {
        try {
            const { data } = await apiClient.put(`/users/${user._id}/regenerate-api-key`);
            setUsers(users.map((u) => (u._id === user._id ? { ...u, apiKey: data.apiKey } : u)));
            setSuccess('API key regenerated successfully!');
            setAnchorEl(null);
        } catch (err) {
            setError('Failed to regenerate API key');
        }
    };

    const handleCopyApiKey = async (apiKey) => {
        try {
            await navigator.clipboard.writeText(apiKey);
            setApiKeyCopied(apiKey);
            setTimeout(() => setApiKeyCopied(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
            setError('Failed to copy API key to clipboard');
        }
    };

    return (
        <Layout title="Agent Management">
            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

            {/* Org Status Card (if applicable) */}
            {orgData && (
                <Paper className="glass" sx={{ mb: 3, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '4px solid #3b82f6' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Shield size={24} color="#3b82f6" />
                        <Box>
                            <Typography variant="subtitle2" color="text.secondary">Organization Limit</Typography>
                            <Typography variant="h6" sx={{ lineHeight: 1 }}>
                                {orgData.agentCount} <Typography component="span" color="text.secondary">/ {orgData.maxAgents} Agents Used</Typography>
                            </Typography>
                        </Box>
                    </Box>
                    <Chip
                        label={orgData.apiKeyStatus === 'active' ? 'Org Key Active' : 'Org Key Inactive'}
                        color={orgData.apiKeyStatus === 'active' ? 'success' : 'error'}
                        variant="outlined"
                    />
                </Paper>
            )}

            {/* Header & Controls */}
            <Paper className="glass" sx={{ p: 2, mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                    <TextField
                        placeholder="Search Agents..."
                        size="small"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment>
                        }}
                        sx={{ minWidth: 250 }}
                    />
                </Box>
                <Button
                    variant="contained"
                    startIcon={<UserPlus size={18} />}
                    onClick={handleOpenDialog}
                    disabled={orgData && orgData.agentCount >= orgData.maxAgents}
                >
                    Add Agent
                </Button>
            </Paper>

            <Paper className="glass" sx={{ overflow: 'hidden' }}>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Agent Info</TableCell>
                                <TableCell>Authentication</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Last Login</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}><CircularProgress /></TableCell>
                                </TableRow>
                            ) : filteredUsers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                        <Typography color="text.secondary">No agents found.</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredUsers.map((user) => (
                                    <TableRow key={user._id} hover>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'primary.main', color: 'white', display: 'flex' }}>
                                                    <UsersIcon size={16} />
                                                </Box>
                                                <Box>
                                                    <Typography variant="subtitle2" fontWeight={600}>
                                                        {user.name} {user._id === currentUser?._id && <Chip label="You" size="small" color="primary" sx={{ height: 16, fontSize: '0.65rem' }} />}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">{user.email}</Typography>
                                                </Box>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            {user.apiKey ? (
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'background.default', p: 0.5, borderRadius: 1, width: '100%', maxWidth: '300px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <Typography
                                                        variant="caption"
                                                        sx={{
                                                            fontFamily: 'monospace',
                                                            color: 'text.secondary',
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            userSelect: 'all', // ALLOW SELECTION
                                                            cursor: 'text',
                                                            flex: 1
                                                        }}
                                                        onClick={(e) => {
                                                            const range = document.createRange();
                                                            range.selectNodeContents(e.target);
                                                            const sel = window.getSelection();
                                                            sel.removeAllRanges();
                                                            sel.addRange(range);
                                                        }}
                                                    >
                                                        {user.apiKey}
                                                    </Typography>
                                                    <Tooltip title={apiKeyCopied === user.apiKey ? "Copied!" : "Copy Key"}>
                                                        <IconButton
                                                            size="small"
                                                            sx={{ p: 0.5, flexShrink: 0 }}
                                                            onClick={(e) => {
                                                                e.stopPropagation(); // Prevent text selection on click
                                                                handleCopyApiKey(user.apiKey);
                                                            }}
                                                        >
                                                            {apiKeyCopied === user.apiKey ? <UsersIcon size={12} color="green" /> : <Copy size={12} />}
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            ) : <Typography variant="caption" color="text.secondary">Password Only</Typography>}
                                        </TableCell>
                                        <TableCell>
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        size="small"
                                                        checked={user.status === 'active'}
                                                        onChange={() => handleToggleStatus(user)}
                                                        disabled={user._id === currentUser?._id}
                                                    />
                                                }
                                                label={<Typography variant="caption">{user.status === 'active' ? 'Active' : 'Inactive'}</Typography>}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption" color="text.secondary">
                                                {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <IconButton size="small" onClick={(e) => { setAnchorEl(e.currentTarget); setSelectedUser(user); }}>
                                                <MoreVertical size={18} />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            {/* Actions Menu */}
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
                <MenuItem onClick={() => {
                    setFormData({ name: selectedUser.name, email: selectedUser.email, password: '', role: 'agent' });
                    setOpenEditDialog(true);
                    setAnchorEl(null);
                }}>
                    <Edit size={16} style={{ marginRight: 8 }} /> Edit Details
                </MenuItem>
                {selectedUser?.apiKey && (
                    <MenuItem onClick={() => { handleRegenerateApiKey(selectedUser); }}>
                        <RefreshCw size={16} style={{ marginRight: 8 }} /> Regen Key
                    </MenuItem>
                )}
                {!selectedUser?.apiKey && (
                    <MenuItem onClick={() => { handleRegenerateApiKey(selectedUser); }}>
                        <RefreshCw size={16} style={{ marginRight: 8 }} /> Generate API Key
                    </MenuItem>
                )}
                <MenuItem onClick={() => { setOpenDeleteDialog(true); setAnchorEl(null); }} sx={{ color: 'error.main' }}>
                    <Trash2 size={16} style={{ marginRight: 8 }} /> Delete Agent
                </MenuItem>
            </Menu>

            {/* Create Dialog */}
            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
                <form onSubmit={handleCreateUser}>
                    <DialogTitle>Create New Agent</DialogTitle>
                    <DialogContent>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                            <TextField label="Full Name" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            <TextField label="Email Address" type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                            <TextField label="Password (Optional)" type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} helperText="If left blank, user can login via generated API key." />
                        </Box>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
                        <Button type="submit" variant="contained">Create Agent</Button>
                    </DialogActions>
                </form>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={openEditDialog} onClose={() => setOpenEditDialog(false)} maxWidth="sm" fullWidth>
                <form onSubmit={handleUpdateUser}>
                    <DialogTitle>Edit Agent</DialogTitle>
                    <DialogContent>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                            <TextField label="Full Name" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            <TextField label="Email Address" type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                            <TextField label="New Password" type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} helperText="Leave blank to keep existing password." />
                        </Box>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenEditDialog(false)}>Cancel</Button>
                        <Button type="submit" variant="contained">Save Changes</Button>
                    </DialogActions>
                </form>
            </Dialog>

            {/* Delete Confirm */}
            <Dialog open={openDeleteDialog} onClose={() => setOpenDeleteDialog(false)}>
                <DialogTitle>Delete Agent?</DialogTitle>
                <DialogContent>
                    <Typography>Are you sure you want to delete <b>{selectedUser?.name}</b>? This action cannot be undone.</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDeleteDialog(false)}>Cancel</Button>
                    <Button onClick={handleDeleteUser} color="error" variant="contained">Delete</Button>
                </DialogActions>
            </Dialog>
        </Layout>
    );
};

export default Users;
