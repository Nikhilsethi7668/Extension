
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

// Import App Logic
// Note: Relative paths depend on where we run node from. Assuming API root.
import connectDB from './src/config/db.js';
import ImagePrompts from './src/models/ImagePrompts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Relative to api/fix_prompts.js
const promptsPath = path.join(__dirname, 'prompts.json');
const rawData = fs.readFileSync(promptsPath);
const prompts = JSON.parse(rawData);

async function seed() {
    try {
        console.log('Connecting via App Config...');
        await connectDB();

        console.log('Seeding ImagePrompts...');
        await ImagePrompts.deleteMany({}); // Clear old ones? User wants "change title", old titles are bad. Yes, clear.
        console.log('Cleared old prompts.');

        // Convert for Mongo
        const docs = prompts.map(p => ({
            title: p.title,
            prompt: p.prompt
        }));

        // Insert Many is faster than bulkWrite upsert if we cleared
        const result = await ImagePrompts.insertMany(docs);
        console.log(`Seeding Complete. Inserted: ${result.length}`);

        process.exit(0);
    } catch (err) {
        console.error('Seeding Failed:', err);
        process.exit(1);
    }
}

seed();
