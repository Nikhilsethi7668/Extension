
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Vehicle from './src/models/Vehicle.js';
import User from './src/models/User.js';
import AuditLog from './src/models/AuditLog.js';
import Organization from './src/models/Organization.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    }
};

const run = async () => {
    await connectDB();

    try {
        // Find a test user (Agent)
        const agent = await User.findOne({ role: 'agent' }).populate('organization');
        if (!agent) {
            console.log('No agent found');
            process.exit(1);
        }

        // Find a test vehicle
        let vehicle = await Vehicle.findOne({ status: 'available' });
        if (!vehicle) {
            console.log('No available vehicle found, checking any vehicle');
            vehicle = await Vehicle.findOne();
        }

        if (!vehicle) {
            console.log('No vehicle found at all');
            process.exit(1);
        }

        console.log(`Testing with Agent: ${agent.email} (${agent._id})`);
        console.log(`Testing with Vehicle: ${vehicle._id} (Status: ${vehicle.status})`);

        // Simulate Mark as Posted
        vehicle.status = 'posted';
        vehicle.postingHistory.push({
            userId: agent._id,
            platform: 'Facebook',
            listingUrl: 'https://test.com/listing',
            action: 'created',
            agentName: agent.name
        });

        await vehicle.save();
        console.log('Vehicle updated. Status:', vehicle.status);

        // Audit Log
        const log = await AuditLog.create({
            action: 'Vehicle Posted',
            entityType: 'Vehicle',
            entityId: vehicle._id,
            user: agent._id,
            organization: agent.organization._id || agent.organization,
            details: { platform: 'Facebook', listingUrl: 'https://test.com/listing', postAction: 'created' },
            ipAddress: '127.0.0.1',
            userAgent: 'Debug Script'
        });

        console.log('Audit Log created:', log);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
};

run();
