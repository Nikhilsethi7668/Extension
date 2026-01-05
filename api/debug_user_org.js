
// debug_user_org.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/models/User.js';
import Organization from './src/models/Organization.js';
import connectDB from './src/config/db.js';

dotenv.config();

const debug = async () => {
    try {
        await connectDB();
        const user = await User.findOne({ email: 'admin@gmail.com' }).populate('organization');
        console.log('User:', JSON.stringify(user, null, 2));

        if (user.organization) {
            console.log('Org Status:', user.organization.status);
            console.log('Org API Key Status:', user.organization.apiKeyStatus);
        } else {
            console.log('User has no organization populated.');
        }

    } catch (e) {
        console.error(e);
    }
    process.exit();
};

debug();
