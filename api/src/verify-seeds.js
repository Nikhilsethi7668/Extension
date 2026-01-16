
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ImagePrompts from './models/ImagePrompts.js';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const verifySeeds = async () => {
    try {
        await mongoose.connect(`mongodb://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DATABASE}?authSource=${process.env.MONGO_AUTH_SOURCE}`);
        
        const count = await ImagePrompts.countDocuments({});
        const result = `ImagePrompts Count: ${count}`;
        
        // Write to file for checking
        fs.writeFileSync(path.join(__dirname, '../seed-result.txt'), result);
        console.log(result);
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error(error);
        fs.writeFileSync(path.join(__dirname, '../seed-result.txt'), `Error: ${error.message}`);
        process.exit(1);
    }
};

verifySeeds();
