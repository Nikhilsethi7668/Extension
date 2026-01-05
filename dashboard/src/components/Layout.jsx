import React, { useState } from 'react';
import {
    Box, Drawer, AppBar, Toolbar, List, Typography,
    ListItem, ListItemButton, ListItemIcon, ListItemText,
    IconButton, Avatar, Menu, MenuItem, Tooltip, Fade
} from '@mui/material';
import {
    LayoutDashboard, CarFront, Users, FileText, Settings, LogOut, Building2,
    ChevronLeft, ChevronRight, Bell, Search
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const drawerWidth = 260; // Slightly wider for modern look

const Layout = ({ children, title, actions }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuth();
    const [anchorEl, setAnchorEl] = useState(null);

    const menuItems = [
        { text: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
        { text: 'Inventory', icon: <CarFront size={20} />, path: '/inventory' },
        ...(user?.role !== 'agent' ? [{ text: 'Users', icon: <Users size={20} />, path: '/users' }] : []),
        { text: 'Activity Logs', icon: <FileText size={20} />, path: '/logs' },
        { text: 'Settings', icon: <Settings size={20} />, path: '/settings' },
    ];

    if (user?.role === 'super_admin') {
        menuItems.splice(1, 0, { text: 'Organizations', icon: <Building2 size={20} />, path: '/organizations' });
    }

    const handleMenu = (event) => setAnchorEl(event.currentTarget);
    const handleClose = () => setAnchorEl(null);
    const handleLogout = () => {
        handleClose();
        logout();
    };

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
            {/* --- Modern Sidebar --- */}
            <Drawer
                variant="permanent"
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: drawerWidth,
                        boxSizing: 'border-box',
                        bgcolor: 'background.paper',
                        borderRight: '1px solid rgba(255,255,255,0.05)',
                        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%)'
                    },
                }}
            >
                {/* Logo Area */}
                <Toolbar sx={{ px: 3, mb: 2, mt: 1 }}>
                    <Box
                        sx={{
                            width: 36, height: 36, borderRadius: '10px',
                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', mr: 2,
                            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                        }}
                    >
                        <CarFront size={20} color="white" />
                    </Box>
                    <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                            Flash Fender
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                            VEHICLE ADMIN
                        </Typography>
                    </Box>
                </Toolbar>

                {/* Menu List */}
                <Box sx={{ overflow: 'auto', px: 2 }}>
                    <List>
                        {menuItems.map((item) => {
                            const active = location.pathname === item.path;
                            return (
                                <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
                                    <ListItemButton
                                        selected={active}
                                        onClick={() => navigate(item.path)}
                                        sx={{
                                            borderRadius: '10px',
                                            minHeight: 48,
                                            px: 2,
                                            transition: 'all 0.2s',
                                            '&.Mui-selected': {
                                                bgcolor: 'rgba(59, 130, 246, 0.1)',
                                                color: 'primary.main',
                                                '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.15)' },
                                                '& .MuiListItemIcon-root': { color: 'primary.main' }
                                            },
                                            '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' }
                                        }}
                                    >
                                        <ListItemIcon sx={{ minWidth: 40, color: active ? 'primary.main' : 'text.secondary', transition: 'color 0.2s' }}>
                                            {item.icon}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={item.text}
                                            primaryTypographyProps={{
                                                fontSize: '0.9rem',
                                                fontWeight: active ? 600 : 500
                                            }}
                                        />
                                        {active && (
                                            <Box sx={{
                                                width: 6, height: 6, borderRadius: '50%',
                                                bgcolor: 'primary.main', boxShadow: '0 0 8px #3b82f6'
                                            }} />
                                        )}
                                    </ListItemButton>
                                </ListItem>
                            )
                        })}
                    </List>
                </Box>

                {/* User Profile Mini - Bottom */}
                <Box sx={{ mt: 'auto', p: 2 }}>
                    <Box
                        sx={{
                            p: 2,
                            borderRadius: 2,
                            bgcolor: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex', alignItems: 'center', gap: 1.5
                        }}
                    >
                        <Avatar sx={{ width: 36, height: 36, bgcolor: 'secondary.main', fontSize: '0.9rem' }}>
                            {user?.name?.[0] || 'U'}
                        </Avatar>
                        <Box sx={{ overflow: 'hidden' }}>
                            <Typography variant="subtitle2" noWrap>{user?.name}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>
                                {user?.role === 'super_admin' ? 'Super Admin' : user?.role === 'org_admin' ? 'Org Admin' : 'Agent'}
                            </Typography>
                        </Box>
                    </Box>
                </Box>
            </Drawer>

            {/* --- Main Content Area --- */}
            <Box component="main" sx={{ flexGrow: 1, p: 2, ml: 0, width: `calc(100% - ${drawerWidth}px)`, overflowX: 'hidden' }}>
                {/* Header Bar */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Box>
                        {/* Breadcrumbs or Title could go here */}
                        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.5px' }}>
                            {title}
                        </Typography>
                    </Box>

                    {/* Header Actions */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Tooltip title="Notifications">
                            <IconButton size="small" sx={{ color: 'text.secondary', border: '1px solid rgba(255,255,255,0.1)', p: 1 }}>
                                <Bell size={18} />
                            </IconButton>
                        </Tooltip>

                        <Tooltip title="Account Settings">
                            <IconButton
                                size="small"
                                onClick={handleMenu}
                                sx={{
                                    border: '1px solid rgba(255,255,255,0.1)', p: 0.5,
                                    transition: 'all 0.2s',
                                    '&:hover': { borderColor: 'primary.main' }
                                }}
                            >
                                <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.85rem' }}>
                                    {user?.name?.[0]}
                                </Avatar>
                            </IconButton>
                        </Tooltip>
                        <Menu
                            anchorEl={anchorEl}
                            open={Boolean(anchorEl)}
                            onClose={handleClose}
                            TransitionComponent={Fade}
                            PaperProps={{
                                elevation: 0,
                                sx: {
                                    overflow: 'visible',
                                    filter: 'drop-shadow(0px 4px 12px rgba(0,0,0,0.32))',
                                    mt: 1.5,
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    bgcolor: 'background.paper',
                                    '& .MuiAvatar-root': { width: 32, height: 32, ml: -0.5, mr: 1 },
                                },
                            }}
                            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                        >
                            <MenuItem onClick={handleClose}>
                                <Settings size={16} style={{ marginRight: 10 }} /> Settings
                            </MenuItem>
                            <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                                <LogOut size={16} style={{ marginRight: 10 }} /> Logout
                            </MenuItem>
                        </Menu>
                    </Box>
                </Box>

                {/* Page Content */}
                <Fade in={true} timeout={500}>
                    <Box sx={{ width: '100%' }}>
                        {children}
                    </Box>
                </Fade>
            </Box>
        </Box>
    );
};

export default Layout;
