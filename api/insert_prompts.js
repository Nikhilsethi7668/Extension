import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MongoDB connection
const MONGO_URI = 'mongodb://extension:Password1234@mongo:27017/facebookmark?authSource=admin';

// ImagePrompts Schema
const ImagePromptsSchema = new mongoose.Schema({
    title: { type: String, required: true },
    prompt: { type: String, required: true }
}, { timestamps: true });

const ImagePrompts = mongoose.model('ImagePrompts', ImagePromptsSchema);

async function insertPrompts() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Read prompts.json
        const promptsPath = path.join(__dirname, 'prompts.json');
        const promptsData = JSON.parse(fs.readFileSync(promptsPath, 'utf8'));
        console.log('📂 Loaded', promptsData.length, 'prompts from file');

        // Clear existing prompts (optional - comment out if you want to keep existing)
        await ImagePrompts.deleteMany({});
        console.log('🗑️  Cleared existing prompts');

        // Insert all prompts
        const result = await ImagePrompts.insertMany(promptsData);
        console.log('✅ Inserted', result.length, 'prompts successfully!');

        // Show first few
        console.log('\n📋 Sample prompts inserted:');
        result.slice(0, 5).forEach((p, i) => {
            console.log('  ' + (i+1) + '. ' + p.title);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

insertPrompts();
