import express from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import AuditLog from '../models/AuditLog.js';
import { protect, superAdmin } from '../middleware/auth.js';

const router = express.Router();

// Generate Token
// Generate Token
const generateToken = (id, role, orgId) => {
    return jwt.sign({ id, role, orgId }, process.env.JWT_SECRET, {
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
            // Audit Log: User Login
            await AuditLog.create({
                action: 'User Login',
                entityType: 'User',
                entityId: user._id,
                user: user._id,
                organization: user.organization,
                details: { method: 'email_password' },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
            });

            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                organization: user.organization,
                needsPasswordChange: user.needsPasswordChange,
                token: generateToken(user._id, user.role, user.organization?._id || user.organization),
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

// @desc    Dashboard login with API Key (User or Org)
// @route   POST /api/auth/dashboard-api-login
// @access  Public
router.post('/dashboard-api-login', async (req, res) => {
    try {
        const { apiKey } = req.body;

        if (!apiKey) {
            res.status(400);
            throw new Error('API Key is required');
        }

        let user = await User.findOne({ apiKey }).populate('organization');

        // Case 1: User API Key (Agent)
        if (user) {
            if (user.status !== 'active') {
                res.status(403);
                throw new Error('Your account is inactive');
            }
            if (user.organization.status !== 'active') {
                res.status(403);
                throw new Error('Your organization is inactive');
            }
            if (user.organization.apiKeyStatus !== 'active') {
                res.status(403);
                throw new Error('Organization access is disabled');
            }
        }

        // Case 2: Organization API Key (Org Admin)
        else {
            const org = await Organization.findOne({ apiKey });

            if (org) {
                if (org.status !== 'active') {
                    res.status(403);
                    throw new Error('Organization is inactive');
                }
                if (org.apiKeyStatus !== 'active') {
                    res.status(403);
                    throw new Error('Organization API Key is inactive');
                }

                // Find the Org Admin for this organization
                user = await User.findOne({
                    organization: org._id,
                    role: 'org_admin'
                }).populate('organization');

                if (!user) {
                    res.status(404);
                    throw new Error('No Administrator account found for this Organization');
                }
            } else {
                res.status(401);
                throw new Error('Invalid API Key');
            }
        }

        // Common Success Response
        user.lastLogin = new Date();
        await user.save();

        // Audit Log: Dashboard API Login
        await AuditLog.create({
            action: 'User Login',
            entityType: 'User',
            entityId: user._id,
            user: user._id,
            organization: user.organization,
            details: { method: 'api_key_dashboard' },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
        });

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            organization: user.organization,
            needsPasswordChange: user.needsPasswordChange,
            token: generateToken(user._id),
        });

    } catch (error) {
        res.status(res.statusCode || 500).json({
            message: error.message,
        });
    }
});

// @desc    Agent login with token only (Legacy/Extension)
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

        // Audit Log: Agent Login
        await AuditLog.create({
            action: 'User Login',
            entityType: 'User',
            entityId: user._id,
            user: user._id,
            organization: user.organization,
            details: { method: 'agent_token' },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
        });

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            organization: user.organization,
            organization: user.organization,
            token: generateToken(user._id, user.role, user.organization?._id || user.organization),
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
        apiKey: uuidv4(),
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
            role: user.role,
            organization: org,
            token: generateToken(user._id, user.role, org._id),
        });
    } else {
        res.status(400);
        throw new Error('Invalid user data');
    }
});

// @desc    Update password
// @route   PUT /api/auth/update-password
// @access  Private
router.put('/update-password', protect, async (req, res) => {
    try {
        const { password } = req.body;
        const user = await User.findById(req.user._id);

        if (user) {
            user.password = password;
            user.needsPasswordChange = false;
            await user.save();
            res.json({ message: 'Password updated successfully' });
        } else {
            res.status(404);
            throw new Error('User not found');
        }
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export default router;
