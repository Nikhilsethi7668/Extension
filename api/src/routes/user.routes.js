import express from 'express';
import User from '../models/User.js';
import { protect, admin } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// @desc    Get all users for the organization
// @route   GET /api/users
// @access  Admin (Super & Org)
router.get('/', protect, admin, async (req, res) => {
    try {
        let query = {};

        // If not super admin, restrict to own organization
        if (req.user.role !== 'super_admin') {
            query.organization = req.user.organization._id;
        } else {
            // Super Admin can filter by org if provided in query, otherwise get all
            if (req.query.orgId) {
                query.organization = req.query.orgId;
            }
        }

        const users = await User.find(query).select('-password').populate('organization', 'name');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Create a new user
// @route   POST /api/users
// @access  Admin
router.post('/', protect, admin, async (req, res) => {
    const { name, email, password, role } = req.body;
    let { organizationId } = req.body;

    // Org Admin can only create users in their own org
    if (req.user.role !== 'super_admin') {
        organizationId = req.user.organization._id;
    } else {
        // Super admin must specify org
        if (!organizationId) {
            return res.status(400).json({ message: 'Organization ID is required for Super Admin creation' });
        }
    }

    try {
        const userExists = await User.findOne({ email });
        if (userExists) {
            res.status(400);
            throw new Error('User already exists');
        }

        // Generate API Key for agents
        const apiKey = role === 'agent' ? uuidv4() : undefined;

        const user = await User.create({
            name,
            email,
            password,
            role: role || 'agent',
            organization: organizationId,
            apiKey,
            status: 'active'
        });

        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            organization: user.organization,
            apiKey: user.apiKey
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Update user status (active/inactive)
// @route   PUT /api/users/:id/status
// @access  Admin
router.put('/:id/status', protect, admin, async (req, res) => {
    const { status } = req.body;

    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            res.status(404);
            throw new Error('User not found');
        }

        // Check if requester has rights to edit this user
        if (req.user.role !== 'super_admin') {
            if (user.organization.toString() !== req.user.organization._id.toString()) {
                res.status(403);
                throw new Error('Not authorized to edit this user');
            }
        }

        // Don't allow disabling yourself? Or maybe yes, but warn?
        // Let's allow it for now but maybe frontend should block it.

        user.status = status;
        await user.save();

        res.json({
            _id: user._id,
            status: user.status
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export default router;
