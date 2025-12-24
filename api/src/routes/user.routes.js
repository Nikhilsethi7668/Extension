import express from 'express';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import { protect, admin } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// @desc    Get all agents for the organization
// @route   GET /api/users
// @access  Admin (Super & Org)
router.get('/', protect, admin, async (req, res) => {
    try {
        let query = { role: 'agent' }; // Only return agents

        // If not super admin, restrict to own organization
        if (req.user.role !== 'super_admin') {
            query.organization = req.user.organization._id || req.user.organization;
        } else {
            // Super Admin can filter by org if provided in query
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

// @desc    Create a new agent
// @route   POST /api/users
// @access  Admin
router.post('/', protect, admin, async (req, res) => {
    try {
        const { name, email, password } = req.body;
        let { organizationId } = req.body;

        // Force role to be agent - ignore any role in request body
        const role = 'agent';

        // Org Admin can only create users in their own org
        if (req.user.role !== 'super_admin') {
            organizationId = req.user.organization._id || req.user.organization;
        } else {
            // Super admin must specify org, or use their own
            if (!organizationId) {
                organizationId = req.user.organization._id || req.user.organization;
            }
        }

        if (!name || !email) {
            res.status(400);
            throw new Error('Name and email are required');
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            res.status(400);
            throw new Error('User with this email already exists');
        }

        // Check Max Agent Limit (Hierarchical System Rule)
        // Find org to check limits
        const org = await Organization.findById(organizationId);
        if (!org) {
            res.status(400);
            throw new Error('Organization not found');
        }

        const currentAgentCount = await User.countDocuments({ organization: organizationId, role: 'agent' });

        if (currentAgentCount >= org.maxAgents) {
            res.status(400);
            throw new Error('Maximum agent limit reached. Please delete an existing agent or request a limit increase.');
        }

        // Generate API Key for agents
        const apiKey = uuidv4();

        const user = await User.create({
            name,
            email,
            password: password || undefined, // Optional for agents
            role: role, // Always agent
            organization: organizationId,
            apiKey,
            status: 'active'
        });

        const createdUser = await User.findById(user._id).select('-password').populate('organization', 'name');

        res.status(201).json(createdUser);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Update agent status (active/inactive)
// @route   PUT /api/users/:id/status
// @access  Admin
router.put('/:id/status', protect, admin, async (req, res) => {
    const { status } = req.body;

    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            res.status(404);
            throw new Error('Agent not found');
        }

        // Only allow updating agents
        if (user.role !== 'agent') {
            res.status(403);
            throw new Error('This endpoint is only for agents');
        }

        // Check if requester has rights to edit this user
        if (req.user.role !== 'super_admin') {
            if (user.organization.toString() !== req.user.organization._id.toString()) {
                res.status(403);
                throw new Error('Not authorized to edit this agent');
            }
        }

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

// @desc    Delete an agent
// @route   DELETE /api/users/:id
// @access  Admin
router.delete('/:id', protect, admin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            res.status(404);
            throw new Error('Agent not found');
        }

        // Only allow deleting agents
        if (user.role !== 'agent') {
            res.status(403);
            throw new Error('This endpoint is only for agents');
        }

        // Check if requester has rights to delete this user
        if (req.user.role !== 'super_admin') {
            if (user.organization.toString() !== req.user.organization._id.toString()) {
                res.status(403);
                throw new Error('Not authorized to delete this agent');
            }
        }

        // Don't allow deleting yourself
        if (user._id.toString() === req.user._id.toString()) {
            res.status(400);
            throw new Error('You cannot delete your own account');
        }

        await User.findByIdAndDelete(req.params.id);

        res.json({ message: 'Agent deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Regenerate API key for an agent
// @route   PUT /api/users/:id/regenerate-api-key
// @access  Admin
router.put('/:id/regenerate-api-key', protect, admin, async (req, res) => {
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

        // Only agents can have API keys
        if (user.role !== 'agent') {
            res.status(400);
            throw new Error('Only agents can have API keys');
        }

        // Generate new API key
        user.apiKey = uuidv4();
        await user.save();

        res.json({
            _id: user._id,
            apiKey: user.apiKey
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Update agent details
// @route   PUT /api/users/:id
// @access  Admin
router.put('/:id', protect, admin, async (req, res) => {
    const { name, email, password } = req.body;

    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            res.status(404);
            throw new Error('Agent not found');
        }

        // Only allow updating agents
        if (user.role !== 'agent') {
            res.status(403);
            throw new Error('This endpoint is only for agents');
        }

        // Check if requester has rights to edit this user
        if (req.user.role !== 'super_admin') {
            if (user.organization.toString() !== req.user.organization._id.toString()) {
                res.status(403);
                throw new Error('Not authorized to edit this agent');
            }
        }

        // Update fields - role cannot be changed through this endpoint
        if (name) user.name = name;
        if (email) {
            // Check if email is already taken by another user
            const emailExists = await User.findOne({ email, _id: { $ne: user._id } });
            if (emailExists) {
                res.status(400);
                throw new Error('Email already exists');
            }
            user.email = email;
        }
        if (password) {
            user.password = password; // Will be hashed by pre-save hook
        }

        await user.save();

        const updatedUser = await User.findById(user._id).select('-password').populate('organization', 'name');

        res.json(updatedUser);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export default router;
