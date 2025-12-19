import React, { useState, useEffect } from 'react';
import {
    Box,
    Button,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Alert,
    IconButton,
    Menu,
    MenuItem,
    CircularProgress,
    Tooltip,
    Switch,
    FormControlLabel,
} from '@mui/material';
import {
    UserPlus,
    MoreVertical,
    Edit,
    Trash2,
    Copy,
    RefreshCw,
} from 'lucide-react';
import apiClient from '../config/axios';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

const Users = () => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [openDialog, setOpenDialog] = useState(false);
    const [openEditDialog, setOpenEditDialog] = useState(false);
    const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [anchorEl, setAnchorEl] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [apiKeyCopied, setApiKeyCopied] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'agent',
    });

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            setError('');
            const { data } = await apiClient.get('/api/users');
            // Backend already filters to return only agents
            setUsers(data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch agents');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDialog = () => {
        setFormData({ name: '', email: '', password: '', role: 'agent' });
        setError('');
        setSuccess('');
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setFormData({ name: '', email: '', password: '', role: 'agent' });
        setError('');
    };

    const handleOpenEditDialog = (user) => {
        setSelectedUser(user);
        setFormData({
            name: user.name,
            email: user.email,
            password: '',
            role: user.role,
        });
        setError('');
        setSuccess('');
        setOpenEditDialog(true);
    };

    const handleCloseEditDialog = () => {
        setOpenEditDialog(false);
        setSelectedUser(null);
        setFormData({ name: '', email: '', password: '', role: 'agent' });
        setError('');
    };

    const handleOpenDeleteDialog = (user) => {
        setSelectedUser(user);
        setOpenDeleteDialog(true);
        setAnchorEl(null);
    };

    const handleCloseDeleteDialog = () => {
        setOpenDeleteDialog(false);
        setSelectedUser(null);
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            setError('');
            setSuccess('');

            const payload = {
                name: formData.name,
                email: formData.email,
                role: 'agent', // Always create as agent
            };

            // Password is optional for agents
            if (formData.password) {
                payload.password = formData.password;
            }

            const { data } = await apiClient.post('/api/users', payload);
            // Backend always creates agents
            setUsers([...users, data]);
            setSuccess('Agent created successfully!');
            setTimeout(() => {
                handleCloseDialog();
                setSuccess('');
            }, 1500);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to create agent');
        }
    };

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        try {
            setError('');
            setSuccess('');

            const payload = {
                name: formData.name,
                email: formData.email,
                // Keep role as agent, don't allow changing it
            };

            // Only include password if it's provided
            if (formData.password) {
                payload.password = formData.password;
            }

            const { data } = await apiClient.put(`/api/users/${selectedUser._id}`, payload);
            // Backend ensures it remains an agent
            setUsers(users.map((u) => (u._id === data._id ? data : u)));
            setSuccess('Agent updated successfully!');
            setTimeout(() => {
                handleCloseEditDialog();
                setSuccess('');
            }, 1500);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update agent');
        }
    };

    const handleDeleteUser = async () => {
        try {
            setError('');
            await apiClient.delete(`/api/users/${selectedUser._id}`);
            setUsers(users.filter((u) => u._id !== selectedUser._id));
            setSuccess('Agent deleted successfully!');
            handleCloseDeleteDialog();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to delete agent');
            handleCloseDeleteDialog();
        }
    };

    const handleToggleStatus = async (user) => {
        try {
            const newStatus = user.status === 'active' ? 'inactive' : 'active';
            await apiClient.put(`/api/users/${user._id}/status`, { status: newStatus });
            setUsers(users.map((u) => (u._id === user._id ? { ...u, status: newStatus } : u)));
            setSuccess(`User ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully!`);
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update user status');
        }
    };

    const handleRegenerateApiKey = async (user) => {
        try {
            setError('');
            const { data } = await apiClient.put(`/api/users/${user._id}/regenerate-api-key`);
            setUsers(users.map((u) => (u._id === user._id ? { ...u, apiKey: data.apiKey } : u)));
            setSuccess('API key regenerated successfully!');
            setAnchorEl(null);
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to regenerate API key');
            setAnchorEl(null);
        }
    };

    const handleCopyApiKey = (apiKey) => {
        navigator.clipboard.writeText(apiKey);
        setApiKeyCopied(apiKey);
        setTimeout(() => setApiKeyCopied(null), 2000);
    };

    const handleMenuOpen = (event, user) => {
        setAnchorEl(event.currentTarget);
        setSelectedUser(user);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
        setSelectedUser(null);
    };


    const formatDate = (date) => {
        if (!date) return 'Never';
        return new Date(date).toLocaleDateString();
    };

    return (
        <Layout title="Agents">
            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}
            {success && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
                    {success}
                </Alert>
            )}

            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                    {users.length} {users.length === 1 ? 'agent' : 'agents'}
                </Typography>
                <Button variant="contained" startIcon={<UserPlus size={18} />} onClick={handleOpenDialog}>
                    Add Agent
                </Button>
            </Box>

            <TableContainer component={Paper} sx={{ bgcolor: '#161616' }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : users.length === 0 ? (
                    <Box sx={{ p: 4, textAlign: 'center' }}>
                        <Typography color="text.secondary">No agents found. Start by adding an agent.</Typography>
                    </Box>
                ) : (
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>Email</TableCell>
                                <TableCell>API Key</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Last Login</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {users.map((user) => (
                                <TableRow key={user._id} hover>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="body2" fontWeight={500}>
                                                {user.name}
                                            </Typography>
                                            {user._id === currentUser?._id && (
                                                <Chip label="You" size="small" color="primary" />
                                            )}
                                        </Box>
                                    </TableCell>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell>
                                        {user.apiKey ? (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        fontFamily: 'monospace',
                                                        fontSize: '0.75rem',
                                                        maxWidth: '200px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                    }}
                                                >
                                                    {user.apiKey}
                                                </Typography>
                                                <Tooltip title={apiKeyCopied === user.apiKey ? 'Copied!' : 'Copy API Key'}>
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleCopyApiKey(user.apiKey)}
                                                        sx={{ color: 'text.secondary' }}
                                                    >
                                                        <Copy size={14} />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">
                                                N/A
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={user.status === 'active'}
                                                    onChange={() => handleToggleStatus(user)}
                                                    disabled={user._id === currentUser?._id}
                                                    size="small"
                                                />
                                            }
                                            label={
                                                <Typography variant="body2" sx={{ textTransform: 'capitalize', ml: 1 }}>
                                                    {user.status}
                                                </Typography>
                                            }
                                            sx={{ m: 0 }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" color="text.secondary">
                                            {formatDate(user.lastLogin)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <IconButton
                                            size="small"
                                            onClick={(e) => handleMenuOpen(e, user)}
                                            disabled={user._id === currentUser?._id && user.role === 'super_admin'}
                                        >
                                            <MoreVertical size={18} />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </TableContainer>

            {/* Create Agent Dialog */}
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <form onSubmit={handleCreateUser}>
                    <DialogTitle>Add New Agent</DialogTitle>
                    <DialogContent>
                        <TextField
                            autoFocus
                            margin="dense"
                            label="Name"
                            fullWidth
                            required
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            sx={{ mb: 2 }}
                        />
                        <TextField
                            margin="dense"
                            label="Email"
                            type="email"
                            fullWidth
                            required
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            sx={{ mb: 2 }}
                        />
                        <TextField
                            margin="dense"
                            label="Password (Optional)"
                            type="password"
                            fullWidth
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            helperText="Agents can use API keys for authentication. Password is optional."
                            sx={{ mb: 2 }}
                        />
                        {error && (
                            <Alert severity="error" sx={{ mt: 2 }}>
                                {error}
                            </Alert>
                        )}
                        {success && (
                            <Alert severity="success" sx={{ mt: 2 }}>
                                {success}
                            </Alert>
                        )}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDialog}>Cancel</Button>
                        <Button type="submit" variant="contained">
                            Create Agent
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>

            {/* Edit Agent Dialog */}
            <Dialog open={openEditDialog} onClose={handleCloseEditDialog} maxWidth="sm" fullWidth>
                <form onSubmit={handleUpdateUser}>
                    <DialogTitle>Edit Agent</DialogTitle>
                    <DialogContent>
                        <TextField
                            autoFocus
                            margin="dense"
                            label="Name"
                            fullWidth
                            required
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            sx={{ mb: 2 }}
                        />
                        <TextField
                            margin="dense"
                            label="Email"
                            type="email"
                            fullWidth
                            required
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            sx={{ mb: 2 }}
                        />
                        <TextField
                            margin="dense"
                            label="New Password (Leave blank to keep current)"
                            type="password"
                            fullWidth
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            helperText="Leave blank to keep the current password"
                            sx={{ mb: 2 }}
                        />
                        {error && (
                            <Alert severity="error" sx={{ mt: 2 }}>
                                {error}
                            </Alert>
                        )}
                        {success && (
                            <Alert severity="success" sx={{ mt: 2 }}>
                                {success}
                            </Alert>
                        )}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseEditDialog}>Cancel</Button>
                        <Button type="submit" variant="contained">
                            Update Agent
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={openDeleteDialog} onClose={handleCloseDeleteDialog}>
                <DialogTitle>Delete Agent</DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure you want to delete agent <strong>{selectedUser?.name}</strong>? This action cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDeleteDialog}>Cancel</Button>
                    <Button onClick={handleDeleteUser} color="error" variant="contained">
                        Delete Agent
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Actions Menu */}
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
                <MenuItem onClick={() => { handleOpenEditDialog(selectedUser); handleMenuClose(); }}>
                    <Edit size={16} style={{ marginRight: 8 }} />
                    Edit
                </MenuItem>
                {selectedUser?.role === 'agent' && selectedUser?.apiKey && (
                    <MenuItem onClick={() => handleRegenerateApiKey(selectedUser)}>
                        <RefreshCw size={16} style={{ marginRight: 8 }} />
                        Regenerate API Key
                    </MenuItem>
                )}
                <MenuItem
                    onClick={() => handleOpenDeleteDialog(selectedUser)}
                    disabled={selectedUser?._id === currentUser?._id}
                    sx={{ color: 'error.main' }}
                >
                    <Trash2 size={16} style={{ marginRight: 8 }} />
                    Delete
                </MenuItem>
            </Menu>
        </Layout>
    );
};

export default Users;
