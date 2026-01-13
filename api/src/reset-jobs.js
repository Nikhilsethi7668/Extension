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

const resetJobs = async () => {
    await connectDB();

    try {
        console.log('Finding stuck processing jobs...');
        const stuckJobs = await Posting.find({ status: 'processing' });
        
        console.log(`Found ${stuckJobs.length} stuck jobs.`);

        if (stuckJobs.length > 0) {
            const res = await Posting.updateMany(
                { status: 'processing' },
                { 
                    $set: { 
                        status: 'failed', 
                        error: 'Manually reset via script',
                        completedAt: new Date()
                    } 
                }
            );
            console.log(`Reset ${res.modifiedCount} jobs to 'failed'.`);
        } else {
            console.log('No stuck jobs found.');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error resetting jobs:', error);
        process.exit(1);
    }
};

resetJobs();
