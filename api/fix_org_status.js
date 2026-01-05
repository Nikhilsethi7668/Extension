
// fix_org_status.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Organization from './src/models/Organization.js';
import connectDB from './src/config/db.js';

dotenv.config();

const fix = async () => {
    try {
        await connectDB();
        const res = await Organization.updateOne(
            { slug: 'default-org' },
            { $set: { status: 'active' } }
        );
        console.log('Update Result:', res);
        console.log('Fixed default-org status to active.');
    } catch (e) {
        console.error(e);
    }
    process.exit();
};

fix();
