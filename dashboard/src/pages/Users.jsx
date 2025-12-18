import React, { useState, useEffect } from 'react';
import {
    Box, Button, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip
} from '@mui/material';
import { UserPlus } from 'lucide-react';
import axios from 'axios';
import Layout from '../components/Layout';

const Users = () => {
    const [users, setUsers] = useState([]);

    useEffect(() => {
        // Fetch users logic
    }, []);

    return (
        <Layout title="Team Members">
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="contained" startIcon={<UserPlus size={18} />}>
                    Add Agent
                </Button>
            </Box>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Email</TableCell>
                            <TableCell>Role</TableCell>
                            <TableCell>API Key</TableCell>
                            <TableCell>Status</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        <TableRow>
                            <TableCell colSpan={5} align="center">No agents found. Start by adding a member.</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </TableContainer>
        </Layout>
    );
};

export default Users;
