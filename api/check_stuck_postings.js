import mongoose from 'mongoose';
import Posting from './api/src/models/posting.model.js';
import dotenv from 'dotenv';
import path from 'path';

// Fix for imports since we are running from root
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: './api/.env' });

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27018/flash-fender');
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const checkStuckPostings = async () => {
    await connectDB();

    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60000);

    console.log(`Current Time: ${now.toISOString()}`);
    console.log(`Two Minutes Ago: ${twoMinutesAgo.toISOString()}`);

    // Find postings that are 'scheduled' but older than 2 minutes (missed window)
    const stuckPostings = await Posting.find({
        status: 'scheduled',
        scheduledTime: { $lt: twoMinutesAgo }
    });

    console.log(`\nFound ${stuckPostings.length} STUCK postings (scheduled but missed window):`);
    stuckPostings.forEach(p => {
        console.log(`- ID: ${p._id}, Scheduled: ${p.scheduledTime}, Diff: ${(now - p.scheduledTime)/1000/60} mins ago`);
    });

    // Also check total scheduled
    const totalScheduled = await Posting.countDocuments({ status: 'scheduled' });
    console.log(`\nTotal 'scheduled' postings: ${totalScheduled}`);

    process.exit();
};

checkStuckPostings();
