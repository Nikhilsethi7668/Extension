
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import ImagePrompts from '../models/ImagePrompts.js';

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const deletePrompts = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const result = await ImagePrompts.deleteMany({});
        console.log(`Deleted ${result.deletedCount} prompts.`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error deleting prompts:', error);
        process.exit(1);
    }
};

deletePrompts();
