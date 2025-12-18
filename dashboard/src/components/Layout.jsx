import React from 'react';
import {
    Box, Drawer, AppBar, Toolbar, List, Typography,
    Divider, ListItem, ListItemButton, ListItemIcon, ListItemText,
    IconButton, Avatar
} from '@mui/material';
import {
    LayoutDashboard, CarFront, Users, FileText, Settings, LogOut
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const drawerWidth = 240;

const Layout = ({ children, title }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuth();

    const menuItems = [
        { text: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
        { text: 'Inventory', icon: <CarFront size={20} />, path: '/inventory' },
        { text: 'Users', icon: <Users size={20} />, path: '/users' },
        { text: 'Activity Logs', icon: <FileText size={20} />, path: '/logs' },
        { text: 'Settings', icon: <Settings size={20} />, path: '/settings' },
    ];

    return (
        <Box sx={{ display: 'flex' }}>
            <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, bgcolor: '#161616', borderBottom: '1px solid #333' }} elevation={0}>
                <Toolbar sx={{ justifyContent: 'space-between' }}>
                    <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 'bold' }}>
                        FacebookMark <Typography component="span" color="primary" sx={{ fontWeight: 'bold' }}>Admin</Typography>
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="body2">{user?.name}</Typography>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '1rem' }}>
                            {user?.name?.[0]}
                        </Avatar>
                        <IconButton onClick={logout} color="inherit">
                            <LogOut size={20} />
                        </IconButton>
                    </Box>
                </Toolbar>
            </AppBar>
            <Drawer
                variant="permanent"
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box', bgcolor: '#0c0c0c', borderRight: '1px solid #333' },
                }}
            >
                <Toolbar />
                <Box sx={{ overflow: 'auto', mt: 2 }}>
                    <List>
                        {menuItems.map((item) => (
                            <ListItem key={item.text} disablePadding>
                                <ListItemButton
                                    selected={location.pathname === item.path}
                                    onClick={() => navigate(item.path)}
                                    sx={{
                                        mx: 1,
                                        borderRadius: 1,
                                        '&.Mui-selected': { bgcolor: 'rgba(15, 98, 254, 0.12)', color: 'primary.main', '& .MuiListItemIcon-root': { color: 'primary.main' } }
                                    }}
                                >
                                    <ListItemIcon sx={{ minWidth: 40 }}>
                                        {item.icon}
                                    </ListItemIcon>
                                    <ListItemText primary={item.text} primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: 500 }} />
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                </Box>
            </Drawer>
            <Box component="main" sx={{ flexGrow: 1, p: 3, bgcolor: '#0c0c0c', minHeight: '100vh' }}>
                <Toolbar />
                <Typography variant="h5" sx={{ mb: 4, fontWeight: 'bold' }}>{title}</Typography>
                {children}
            </Box>
        </Box>
    );
};

export default Layout;
