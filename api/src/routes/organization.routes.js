import express from 'express';
import Organization from '../models/Organization.js';
import User from '../models/User.js'; // To cascade deactivate if needed, or just let middleware handle it
import { v4 as uuidv4 } from 'uuid';
import { protect, superAdmin } from '../middleware/auth.js';

const router = express.Router();

// @desc    Get all organizations
// @route   GET /api/organizations
// @access  Super Admin
router.get('/', protect, superAdmin, async (req, res) => {
    try {
        const organizations = await Organization.find({}).sort('-createdAt');

        // Enhance response with agent count for each org (optional, but requested for dashboard)
        // For efficiency, we might want to do an aggregation or separate call, but iterating is okay for low org count
        // Let's stick to basic fetch first, frontend can query counts or we can populate virtuals if setup

        res.json(organizations);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Create a new organization
// @route   POST /api/organizations
// @access  Super Admin
router.post('/', protect, superAdmin, async (req, res) => {
    const { name, aiProvider, geminiApiKey, openaiApiKey, maxAgents } = req.body;

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
            maxAgents: maxAgents || 10,
            apiKey: uuidv4(),
            settings: {
                aiProvider: aiProvider || 'gemini',
                geminiApiKey,
                openaiApiKey
            }
        });

        // Create Org Admin if credentials provided
        if (req.body.adminEmail && req.body.adminPassword) {
            await User.create({
                name: `${name} Admin`,
                email: req.body.adminEmail,
                password: req.body.adminPassword,
                role: 'org_admin',
                organization: org._id,
                needsPasswordChange: true
            });
        }

        res.status(201).json(org);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Update organization status or API key status
// @route   PUT /api/organizations/:id/status
// @access  Super Admin
router.put('/:id/status', protect, superAdmin, async (req, res) => {
    const { status, apiKeyStatus } = req.body;

    try {
        const org = await Organization.findById(req.params.id);

        if (!org) {
            res.status(404);
            throw new Error('Organization not found');
        }

        if (status) org.status = status;
        if (apiKeyStatus) org.apiKeyStatus = apiKeyStatus;

        await org.save();

        res.json(org);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Update organization limits
// @route   PUT /api/organizations/:id/limit
// @access  Super Admin
router.put('/:id/limit', protect, superAdmin, async (req, res) => {
    const { maxAgents } = req.body;

    try {
        const org = await Organization.findById(req.params.id);

        if (!org) {
            res.status(404);
            throw new Error('Organization not found');
        }

        org.maxAgents = maxAgents;
        await org.save();

        res.json(org);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Regenerate Organization API Key
// @route   PUT /api/organizations/:id/regenerate-api-key
// @access  Super Admin
router.put('/:id/regenerate-api-key', protect, superAdmin, async (req, res) => {
    try {
        const org = await Organization.findById(req.params.id);

        if (!org) {
            res.status(404);
            throw new Error('Organization not found');
        }

        org.apiKey = uuidv4();
        await org.save();

        res.json({
            _id: org._id,
            apiKey: org.apiKey
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export default router;
