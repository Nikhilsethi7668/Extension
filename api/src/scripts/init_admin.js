import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import connectDB from '../config/db.js';

dotenv.config();

// Override URI if not picked up (though dotenv should pick it up from root/api/.env if run correctly)
// But to be safe, we can pass it or rely on loading it.
// We will rely on dotenv loading from ../../.env or similar if we run from src/scripts

const initAdmin = async () => {
    try {
        await connectDB();

        console.log('Connected to DB. Checking for Organization...');

        let org = await Organization.findOne({ slug: 'default-org' });
        if (!org) {
            console.log('Creating Default Organization...');
            org = await Organization.create({
                name: 'Default Organization',
                slug: 'default-org',
                settings: {
                    aiProvider: 'gemini'
                }
            });
            console.log('Organization Created:', org._id);
        } else {
            console.log('Organization exists:', org._id);
        }

        const email = 'test@gmail.com';
        const password = 'Password1234';

        console.log(`Checking for user ${email}...`);
        let user = await User.findOne({ email });

        if (user) {
            console.log('User already exists. Updating password/role...');
            user.password = password; // Will be hashed by pre-save hook
            user.role = 'super_admin';
            user.organization = org._id;
            await user.save();
            console.log('User updated.');
        } else {
            console.log('Creating new user...');
            user = await User.create({
                name: 'Admin User',
                email,
                password,
                role: 'super_admin',
                organization: org._id,
                status: 'active'
            });
            console.log('User created successfully.');
        }

        console.log('Done.');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

initAdmin();
