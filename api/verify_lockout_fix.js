
// verify_lockout_fix.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import axios from 'axios';
import Organization from './src/models/Organization.js';
import connectDB from './src/config/db.js';

dotenv.config();

const verify = async () => {
    try {
        await connectDB();

        // 1. Set Org to Inactive
        console.log('1. Setting Org to Inactive...');
        await Organization.updateOne({ slug: 'default-org' }, { $set: { status: 'inactive' } });

        // 2. Attempt Login via API (simulated) or just checking logic?
        // Since we modified middleware, we need to hit the endpoint.
        // We'll use axios to hit the local container API

        console.log('2. Attempting Login as Super Admin...');
        try {
            const res = await axios.post('https://api-flash.adaptusgroup.ca/api/auth/login', {
                email: 'admin@gmail.com',
                password: 'Password1234'
            });

            console.log('Login Result Status:', res.status);
            if (res.status === 200) {
                console.log('PASS: Super Admin logged in successfully despite inactive org.');
            } else {
                console.log('FAIL: Unexpected status code', res.status);
            }
        } catch (error) {
            console.log('FAIL: Login failed.');
            if (error.response) {
                console.log('Error Status:', error.response.status);
                console.log('Error Message:', error.response.data.message);
            } else {
                console.log('Error:', error.message);
            }
        }

        // 3. Revert Org to Active
        console.log('3. Reverting Org to Active...');
        await Organization.updateOne({ slug: 'default-org' }, { $set: { status: 'active' } });
        console.log('Org Status Reverted.');

    } catch (e) {
        console.error(e);
    }
    process.exit();
};

verify();
