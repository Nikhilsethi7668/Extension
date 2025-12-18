import express from 'express';
import Organization from '../models/Organization.js';
import User from '../models/User.js'; // To cascade deactivate if needed, or just let middleware handle it
import { protect, superAdmin } from '../middleware/auth.js';

const router = express.Router();

// @desc    Get all organizations
// @route   GET /api/organizations
// @access  Super Admin
router.get('/', protect, superAdmin, async (req, res) => {
    try {
        const organizations = await Organization.find({}).sort('-createdAt');
        res.json(organizations);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Create a new organization
// @route   POST /api/organizations
// @access  Super Admin
router.post('/', protect, superAdmin, async (req, res) => {
    const { name, aiProvider, geminiApiKey, openaiApiKey } = req.body;

    try {
        const slug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, ''); // Simple slugify

        const orgExists = await Organization.findOne({ slug });
        if (orgExists) {
            res.status(400);
            throw new Error('Organization already exists');
        }

        const org = await Organization.create({
            name,
            slug,
            settings: {
                aiProvider: aiProvider || 'gemini',
                geminiApiKey,
                openaiApiKey
            }
        });

        res.status(201).json(org);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Update organization status
// @route   PUT /api/organizations/:id/status
// @access  Super Admin
router.put('/:id/status', protect, superAdmin, async (req, res) => {
    const { status } = req.body;

    try {
        const org = await Organization.findById(req.params.id);

        if (!org) {
            res.status(404);
            throw new Error('Organization not found');
        }

        org.status = status;
        await org.save();

        res.json(org);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export default router;
