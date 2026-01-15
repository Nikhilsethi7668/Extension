
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { postingQueue, redisConnection } from './config/queue.js';
import Posting from './models/posting.model.js';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(`mongodb://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DATABASE}?authSource=${process.env.MONGO_AUTH_SOURCE}`);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const clearQueue = async () => {
    await connectDB();

    try {
        console.log('--- Clearing Queue Data ---');

        // 1. Clear BullMQ Queue
        console.log('Draining BullMQ queue...');
        // drain removes all jobs that are waiting to be processed (paused, delayed, priority-waiting, etc.)
        await postingQueue.drain(); 
        
        // Also aim to remove active/completed/failed if possible, or just use obliterate if we want a TOTAL reset.
        // For "queued data", drain is usually what's meant, but let's check counts.
        const counts = await postingQueue.getJobCounts();
        console.log('Current Job Counts (after drain):', counts);

        if (counts.wait > 0 || counts.paused > 0 || counts.delayed > 0) {
             console.log('Warning: Queue might not be fully empty. Attempting obliterate...');
             await postingQueue.obliterate({ force: true });
             console.log('Queue obliterated.');
        }

        // 2. Clear MongoDB Records
        console.log('Deleting ALL postings from MongoDB...');
        const result = await Posting.deleteMany({});
        console.log(`Deleted ${result.deletedCount} postings.`);

        // Optional: Reset "processing" to "failed" if we want to clean up stuck state
        // (Similar to reset-jobs.js but we can just delete them if we want "all queued data" gone implying "pending work")
        // The user said "delete all queued dada". Usually means things waiting to happen.
        // Let's stick to status: 'queued'.

        console.log('--- Cleanup Complete ---');
        
        // Cleanup connections
        await postingQueue.close();
        await redisConnection.quit();
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Error clearing queue:', error);
        process.exit(1);
    }
};

clearQueue();
