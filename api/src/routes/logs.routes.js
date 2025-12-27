import express from 'express';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @desc    Get audit logs
// @route   GET /api/logs
// @access  Protected
router.get('/', protect, async (req, res) => {
    try {
        console.log('GET /api/logs hit');
        const { userId, search, startDate, endDate, page = 1, limit = 50 } = req.query;

        const pageNum = Number(page) || 1;
        const limitNum = Number(limit) || 50;
        const skip = (pageNum - 1) * limitNum;

        // Build query
        const query = {};

        // Filter by organization for non-superadmins
        if (req.user.role !== 'super_admin') {
            query.organization = req.user.organization._id || req.user.organization;
        }

        // If user is an agent, only show their logs
        if (req.user.role === 'agent') {
            query.user = req.user._id;
        }

        // Filter by specific user (for admins)
        // Filter by specific user (for admins)
        if (userId && userId !== 'undefined' && userId !== 'null' && req.user.role !== 'agent') {
            query.user = userId;
        }

        // Date filtering
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) {
                query.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                const endDateTime = new Date(endDate);
                endDateTime.setHours(23, 59, 59, 999);
                query.createdAt.$lte = endDateTime;
            }
        }

        // Search (Basic implementation)
        if (search) {
            query.$or = [
                { action: { $regex: search, $options: 'i' } },
                { 'details.method': { $regex: search, $options: 'i' } },
                { ipAddress: { $regex: search, $options: 'i' } }
            ];
            // Note: Searching populated fields like user name or entity name is complex with simple find.
            // keeping it simple for now as requested.
        }

        const total = await AuditLog.countDocuments(query);

        const logs = await AuditLog.find(query)
            .populate('user', 'name email role')
            .populate('entityId') // Dynamic population based on refPath
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);

        res.json({
            logs,
            total,
            page: pageNum,
            pages: Math.ceil(total / limitNum)
        });

    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Clear audit logs
// @route   DELETE /api/logs
// @access  Super Admin / Org Admin
router.delete('/', protect, async (req, res) => {
    try {
        const query = {};

        // Security: Only Admins can clear logs
        if (!['super_admin', 'org_admin'].includes(req.user.role)) {
            res.status(403);
            throw new Error('Not authorized to clear logs');
        }

        // Filter by organization for non-superadmins
        if (req.user.role !== 'super_admin') {
            query.organization = req.user.organization._id || req.user.organization;
        }

        const result = await AuditLog.deleteMany(query);

        res.json({ message: `Successfully cleared ${result.deletedCount} logs.`, deletedCount: result.deletedCount });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
