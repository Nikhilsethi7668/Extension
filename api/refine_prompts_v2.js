
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Setup Env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Output DB
console.log('Connecting to Mongo:', process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/facebookmark');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/facebookmark';

// Paths
const promptsPath = path.join(__dirname, 'prompts.json');
const rawData = fs.readFileSync(promptsPath);
const prompts = JSON.parse(rawData);

// Regex Patterns to Remove
const patternsToRemove = [
    /Shot on (iPhone|Samsung|Google|Pixel) [a-zA-Z0-9 ]+,?/gi,
    /Taken with a (Google )?Pixel,?/gi,
    /Vertical smartphone shot,?/gi,
    /social media story quality,?/gi,
    /Raw phone photo,?/gi,
    /realistic amateur photography,?/gi,
    /Candid street photography style,?/gi,
    /slightly imperfect framing,?/gi,
    /no filters,?/gi,
    /4k resolution,?/gi,
    /high detail texture,?/gi,
    /--ar 16:9/gi,
    /sharp focus,?/gi,
    /uncropped,?/gi,
    /wide angle lens,?/gi,
    /HDR mode off,?/gi,
    /natural lighting,?/gi
];

// Refine Prompts
const refinedPrompts = prompts.map(p => {
    let cleanPrompt = p.prompt;

    // Apply removals
    patternsToRemove.forEach(regex => {
        cleanPrompt = cleanPrompt.replace(regex, '');
    });

    // Cleanup whitespace/punctuation
    cleanPrompt = cleanPrompt.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
    if (cleanPrompt.endsWith(',')) cleanPrompt = cleanPrompt.slice(0, -1);
    if (!cleanPrompt.endsWith('.')) cleanPrompt += '.';

    // Append Instruction
    const suffix = " Maintain photorealistic quality. Focus on updating the background and lighting. Keep the vehicle exactly as is in terms of geometry and perspective.";
    cleanPrompt = cleanPrompt + suffix;

    return {
        title: p.title,
        prompt: cleanPrompt
    };
});

// Save to JSON
fs.writeFileSync(promptsPath, JSON.stringify(refinedPrompts, null, 4));
console.log(`Updated ${refinedPrompts.length} prompts in JSON.`);

// Update DB
const ImagePromptsSchema = new mongoose.Schema({
    title: { type: String, required: true },
    prompt: { type: String, required: true }
}, { timestamps: true });

const ImagePrompts = mongoose.models.ImagePrompts || mongoose.model("ImagePrompts", ImagePromptsSchema);

async function seed() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to DB.');

        // Clear existing
        await ImagePrompts.deleteMany({});
        console.log('Cleared existing prompts.');

        // Insert New
        const result = await ImagePrompts.insertMany(refinedPrompts);
        console.log(`Inserted ${result.length} prompts into DB.`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

seed();
