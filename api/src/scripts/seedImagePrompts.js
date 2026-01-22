import mongoose from 'mongoose';
import ImagePrompts from '../models/ImagePrompts.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedImagePrompts = async () => {
    try {
        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB successfully');

        // Read the prompts.json file
        const promptsPath = path.join(__dirname, '../../../prompts.json');
        console.log('Reading prompts from:', promptsPath);
        
        const promptsData = JSON.parse(fs.readFileSync(promptsPath, 'utf-8'));
        console.log(`Found ${promptsData.length} prompts to insert`);

        // Clear existing data
        console.log('Clearing existing ImagePrompts...');
        await ImagePrompts.deleteMany({});
        console.log('Existing data cleared');

        // Insert all prompts in batches to avoid memory issues
        const batchSize = 1000;
        let insertedCount = 0;

        for (let i = 0; i < promptsData.length; i += batchSize) {
            const batch = promptsData.slice(i, i + batchSize);
            await ImagePrompts.insertMany(batch);
            insertedCount += batch.length;
            console.log(`Inserted ${insertedCount}/${promptsData.length} prompts...`);
        }

        console.log(`✅ Successfully seeded ${insertedCount} image prompts!`);
        
        // Verify the count
        const count = await ImagePrompts.countDocuments();
        console.log(`Total prompts in database: ${count}`);

    } catch (error) {
        console.error('Error seeding image prompts:', error);
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log('Database connection closed');
        process.exit(0);
    }
};

// Run the seed function
seedImagePrompts();
