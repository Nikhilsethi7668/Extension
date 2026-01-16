
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

const seedPrompts = async () => {
    try {
        // Localhost override for script execution outside docker
        const mongoUri = `mongodb://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@localhost:27018/${process.env.MONGO_DATABASE}?authSource=${process.env.MONGO_AUTH_SOURCE}`;
        await mongoose.connect(mongoUri);
        console.log('MongoDB Connected');

        // Read JSON file
        const promptsPath = path.resolve(__dirname, '../prompts.json');
        if (!fs.existsSync(promptsPath)) {
            console.error('prompts.json not found at', promptsPath);
            process.exit(1);
        }

        const rawData = fs.readFileSync(promptsPath, 'utf-8');
        const allPrompts = JSON.parse(rawData);

        // Get first 50
        const itemsToSeed = allPrompts.slice(0, 50);

        console.log(`Found ${allPrompts.length} total prompts. Seeding first ${itemsToSeed.length}...`);

        await ImagePrompts.insertMany(itemsToSeed);

        const successMsg = `Successfully seeded ${itemsToSeed.length} prompts.`;
        console.log(successMsg);
        fs.writeFileSync(path.resolve(__dirname, '../seed-output.txt'), successMsg);
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Error seeding prompts:', error);
        fs.writeFileSync(path.resolve(__dirname, '../seed-output.txt'), `Error: ${error.message}`);
        process.exit(1);
    }
};

seedPrompts();
