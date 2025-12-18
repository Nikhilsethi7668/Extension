import React, { useState, useEffect } from 'react';
import {
    Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import Layout from '../components/Layout';

const Logs = () => {
    return (
        <Layout title="Activity Audit Logs">
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Timestamp</TableCell>
                            <TableCell>User</TableCell>
                            <TableCell>Action</TableCell>
                            <TableCell>Details</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        <TableRow>
                            <TableCell colSpan={4} align="center">No logs available.</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </TableContainer>
        </Layout>
    );
};

export default Logs;
