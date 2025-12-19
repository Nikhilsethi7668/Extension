import express from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import { protect, superAdmin } from '../middleware/auth.js';

const router = express.Router();

// Generate Token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400);
            throw new Error('Email and password are required');
        }

        const user = await User.findOne({ email }).populate('organization');

        if (user && (await user.matchPassword(password))) {
            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                organization: user.organization,
                token: generateToken(user._id),
            });
        } else {
            res.status(401);
            throw new Error('Invalid email or password');
        }
    } catch (error) {
        res.status(res.statusCode || 500).json({
            message: error.message,
        });
    }
});

// @desc    Agent login with token only
// @route   POST /api/auth/agent-login
// @access  Public
router.post('/agent-login', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            res.status(400);
            throw new Error('Token is required');
        }

        const user = await User.findOne({ apiKey: token }).populate('organization');

        if (!user) {
            res.status(401);
            throw new Error('Invalid token');
        }

        // Verify user is an agent
        if (user.role !== 'agent') {
            res.status(403);
            throw new Error('This endpoint is only for agents');
        }

        // Check if user is active
        if (user.status !== 'active') {
            res.status(403);
            throw new Error('Your account is inactive');
        }

        // Check if organization is active
        if (user.organization && user.organization.status !== 'active') {
            res.status(403);
            throw new Error('Your organization is inactive');
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            organization: user.organization,
            token: generateToken(user._id),
        });
    } catch (error) {
        res.status(res.statusCode || 500).json({
            message: error.message,
        });
    }
});

// @desc    Validate API Key and get user profile
// @route   GET /api/auth/validate-key
// @access  Protected (via API Key)
router.get('/validate-key', protect, async (req, res) => {
    res.json({
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        organization: req.user.organization,
    });
});

// @desc    Initial setup - Create Super Admin and First Organization
// @route   POST /api/auth/setup
// @access  Public (Should be restricted after first run)
router.post('/setup', async (req, res) => {
    const existingSuperAdmin = await User.findOne({ role: 'super_admin' });
    if (existingSuperAdmin) {
        res.status(400);
        throw new Error('Super Admin already exists');
    }

    const { name, email, password, orgName } = req.body;

    const org = await Organization.create({
        name: orgName,
        slug: orgName.toLowerCase().replace(/ /g, '-'),
    });

    const user = await User.create({
        name,
        email,
        password,
        role: 'super_admin',
        organization: org._id,
    });

    if (user) {
        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            organization: org,
            token: generateToken(user._id),
        });
    } else {
        res.status(400);
        throw new Error('Invalid user data');
    }
});

export default router;
