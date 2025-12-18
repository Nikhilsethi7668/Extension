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
    const { email, password } = req.body;

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
