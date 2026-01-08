import express from 'express';
import Organization from '../models/Organization.js';
import User from '../models/User.js'; // To cascade deactivate if needed, or just let middleware handle it
import { v4 as uuidv4 } from 'uuid';
import { protect, superAdmin } from '../middleware/auth.js';

import { sendOrgWelcomeEmail, sendOrgUpdateEmail, sendOrgStatusEmail } from '../services/email.service.js';

const router = express.Router();

// Helper function to calculate expiration date
const calculateExpiresAt = (subscriptionDuration) => {
    if (subscriptionDuration === 'lifetime') {
        return null;
    }
    
    const now = new Date();
    if (subscriptionDuration === '7-days') {
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (subscriptionDuration === '14-days') {
        return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    }
    return null; // fallback
};

// @desc    Get all organizations
// @route   GET /api/organizations
// @access  Super Admin
router.get('/', protect, superAdmin, async (req, res) => {
    try {
        const organizations = await Organization.find({}).sort('-createdAt');

        // Enhance response with agent count for each org
        const orgsWithCounts = await Promise.all(
            organizations.map(async (org) => {
                const agentCount = await User.countDocuments({ organization: org._id, role: 'agent' });
                return {
                    ...org.toObject(),
                    agentCount
                };
            })
        );

        res.json(orgsWithCounts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get current user's organization details
// @route   GET /api/organizations/my-org
// @access  Org Admin / Agent
router.get('/my-org', protect, async (req, res) => {
    try {
        const org = await Organization.findById(req.user.organization);
        if (!org) {
            res.status(404);
            throw new Error('Organization not found');
        }

        const agentCount = await User.countDocuments({ organization: org._id, role: 'agent' });

        res.json({
            ...org.toObject(),
            agentCount
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Create a new organization
// @route   POST /api/organizations
// @access  Super Admin
router.post('/', protect, superAdmin, async (req, res) => {
    const { name, aiProvider, geminiApiKey, openaiApiKey, maxAgents, gpsLocation, subscriptionDuration } = req.body;

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
            subscriptionDuration: subscriptionDuration || 'lifetime',
            expiresAt: calculateExpiresAt(subscriptionDuration || 'lifetime'),
            settings: {
                aiProvider: aiProvider || 'gemini',
                geminiApiKey,
                openaiApiKey,
                gpsLocation: gpsLocation || {
                    latitude: 25.2048,
                    longitude: 55.2708,
                    city: 'Dubai',
                    country: 'UAE'
                }
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

            // Send Welcome Email
            sendOrgWelcomeEmail(req.body.adminEmail, req.body.adminPassword, name, `${name} Admin`);
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

        if (status) {
            org.status = status;
            
            // Get Org Admin to send email
            const adminUser = await User.findOne({ 
                organization: org._id, 
                role: 'org_admin' 
            });

            if (adminUser) {
                sendOrgStatusEmail(
                    adminUser.email, 
                    org.name, 
                    adminUser.name, 
                    status
                );
            }
        }
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
    const { maxAgents, subscriptionDuration } = req.body;

    try {
        const org = await Organization.findById(req.params.id);

        if (!org) {
            res.status(404);
            throw new Error('Organization not found');
        }

        if (maxAgents !== undefined) org.maxAgents = maxAgents;
        if (subscriptionDuration) {
            org.subscriptionDuration = subscriptionDuration;
            org.expiresAt = calculateExpiresAt(subscriptionDuration);
        }
        await org.save();

        // Get Org Admin to send email
        const adminUser = await User.findOne({ 
            organization: org._id, 
            role: 'org_admin' 
        });

        if (adminUser) {

            sendOrgUpdateEmail(
                adminUser.email, 
                org.name, 
                adminUser.name, 
                {
                    maxAgents: org.maxAgents,
                    subscriptionDuration: org.subscriptionDuration,
                    expiresAt: org.expiresAt
                }
            );
        }

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

// @desc    Update organization settings (AI, GPS)
// @route   PUT /api/organizations/:id/settings
// @access  Super Admin
router.put('/:id/settings', protect, superAdmin, async (req, res) => {
    const { aiProvider, geminiApiKey, openaiApiKey, gpsLocation } = req.body;

    try {
        const org = await Organization.findById(req.params.id);

        if (!org) {
            res.status(404);
            throw new Error('Organization not found');
        }

        // Initialize settings if they don't exist
        if (!org.settings) org.settings = {};

        // Update provided fields
        if (aiProvider) org.settings.aiProvider = aiProvider;
        if (geminiApiKey !== undefined) org.settings.geminiApiKey = geminiApiKey;
        if (openaiApiKey !== undefined) org.settings.openaiApiKey = openaiApiKey;

        if (gpsLocation) {
            org.settings.gpsLocation = {
                ...org.settings.gpsLocation,
                ...gpsLocation
            };
        }

        await org.save();

        res.json(org);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export default router;
