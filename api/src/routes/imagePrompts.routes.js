import express from 'express';
import ImagePrompts from '../models/ImagePrompts.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @desc    Seed ALL Image Prompts from prompts.json
// @route   GET /api/image-prompts/seed-all
// @access  Public (for seeding)
router.get('/seed-all', async (req, res) => {
    try {
        console.log('[Seed All] Starting to seed all image prompts...');

        // Read the prompts.json file
        const promptsPath = '/app/prompts.json';
        console.log('[Seed All] Reading prompts from:', promptsPath);
        
        if (!fs.existsSync(promptsPath)) {
            return res.status(404).json({
                success: false,
                message: 'prompts.json file not found'
            });
        }

        const promptsData = JSON.parse(fs.readFileSync(promptsPath, 'utf-8'));
        console.log(`[Seed All] Found ${promptsData.length} prompts to insert`);

        // Clear existing data
        console.log('[Seed All] Clearing existing ImagePrompts...');
        const deleteResult = await ImagePrompts.deleteMany({});
        console.log(`[Seed All] Deleted ${deleteResult.deletedCount} existing prompts`);

        // Insert all prompts in batches to avoid memory issues
        const batchSize = 1000;
        let insertedCount = 0;

        for (let i = 0; i < promptsData.length; i += batchSize) {
            const batch = promptsData.slice(i, i + batchSize);
            await ImagePrompts.insertMany(batch);
            insertedCount += batch.length;
            console.log(`[Seed All] Inserted ${insertedCount}/${promptsData.length} prompts...`);
        }

        console.log(`[Seed All] ✅ Successfully seeded ${insertedCount} image prompts!`);
        
        // Verify the count
        const count = await ImagePrompts.countDocuments();
        console.log(`[Seed All] Total prompts in database: ${count}`);

        res.json({
            success: true,
            message: `Successfully seeded all image prompts`,
            deletedCount: deleteResult.deletedCount,
            insertedCount: insertedCount,
            totalInDatabase: count
        });
    } catch (error) {
        console.error('[Seed All] Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @desc    Get count of Image Prompts
// @route   GET /api/image-prompts/count
// @access  Public
router.get('/count', async (req, res) => {
    try {
        const count = await ImagePrompts.countDocuments();
        const sample = await ImagePrompts.findOne().select('title prompt');
        
        res.json({
            success: true,
            count,
            sample: sample || null
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @desc    Get all Image Prompts (paginated)
// @route   GET /api/image-prompts
// @access  Public
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 50, search } = req.query;
        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;

        const query = {};
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { prompt: { $regex: search, $options: 'i' } }
            ];
        }

        const total = await ImagePrompts.countDocuments(query);
        const prompts = await ImagePrompts.find(query)
            .skip(skip)
            .limit(limitNum)
            .sort('title');

        res.json({
            success: true,
            prompts,
            total,
            page: pageNum,
            pages: Math.ceil(total / limitNum)
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;
