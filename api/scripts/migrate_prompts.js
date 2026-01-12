
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ImagePrompts from '../models/ImagePrompts.js';

// Load env
dotenv.config();

// Default to user provided URI if not in env
const MONGO_URI = process.env.MONGO_URI || 'mongodb://extension:Password1234@45.137.194.145:27017/facebookmark?authSource=admin';

async function migratePrompts() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('Connected!');

        console.log('Migrating Image Prompts...');
        // Fetch all prompts
        const prompts = await ImagePrompts.find({});
        console.log(`Found ${prompts.length} prompts.`);

        let updatedCount = 0;
        for (const p of prompts) {
            let modified = false;
            let newPrompt = p.prompt;

            // Check if emoji instruction is missing
            if (!newPrompt.toLowerCase().includes('emoji')) {
                newPrompt += " REQUIRED: Include 3-4 relevant emojis in the description.";
                modified = true;
            }

            if (modified) {
                p.prompt = newPrompt;
                await p.save();
                updatedCount++;
                console.log(`Updated prompt: ${p.title}`);
            }
        }

        console.log(`Migration complete. Updated ${updatedCount} prompts.`);

    } catch (error) {
        console.error('Migration Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

migratePrompts();
