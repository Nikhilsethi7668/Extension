
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
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
        console.log('--- Clearing Posting Data (Cron System) ---');
        // 1. Clear MongoDB Records
        console.log('Deleting ALL postings from MongoDB...');
        const result = await Posting.deleteMany({});
        console.log(`Deleted ${result.deletedCount} postings.`);

        console.log('--- Cleanup Complete ---');
        
        // Cleanup connections
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Error clearing data:', error);
        process.exit(1);
    }
};

clearQueue();
