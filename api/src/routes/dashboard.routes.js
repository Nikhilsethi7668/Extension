import express from 'express';
import Vehicle from '../models/Vehicle.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Protected
router.get('/stats', protect, async (req, res) => {
    try {
        const { orgId } = req.query; // Organization filter for super admin
        const stats = {};

        if (req.user.role === 'super_admin') {
            // Super Admin: Cross-organization stats or specific org
            if (orgId) {
                // Show specific organization's stats
                const totalVehicles = await Vehicle.countDocuments({
                    organization: orgId
                });

                const activeAgents = await User.countDocuments({
                    organization: orgId,
                    role: 'agent',
                    status: 'active'
                });

                const vehicles = await Vehicle.find({ organization: orgId });
                let totalPosts = 0;
                vehicles.forEach(vehicle => {
                    totalPosts += vehicle.postingHistory?.length || 0;
                });

                stats.totalVehicles = totalVehicles;
                stats.activeAgents = activeAgents;
                stats.totalPosts = totalPosts;
            } else {
                // Show global stats across all organizations
                const Organization = (await import('../models/Organization.js')).default;

                const totalOrganizations = await Organization.countDocuments();
                const totalAgents = await User.countDocuments({ role: 'agent' });

                // Count all posts across all organizations
                const allVehicles = await Vehicle.find({});
                let totalPosts = 0;
                allVehicles.forEach(vehicle => {
                    totalPosts += vehicle.postingHistory?.length || 0;
                });

                stats.totalOrganizations = totalOrganizations;
                stats.totalAgents = totalAgents;
                stats.totalPosts = totalPosts;
            }

        } else if (req.user.role === 'agent') {
            // Agent: Their vehicles and their posts
            const totalVehicles = await Vehicle.countDocuments({
                organization: req.user.organization._id || req.user.organization,
                $or: [
                    { assignedUser: req.user._id },
                    { assignedUsers: req.user._id }
                ]
            });

            const vehicles = await Vehicle.find({
                organization: req.user.organization._id || req.user.organization,
                $or: [
                    { assignedUser: req.user._id },
                    { assignedUsers: req.user._id }
                ]
            });

            let totalPosts = 0;
            vehicles.forEach(vehicle => {
                totalPosts += vehicle.postingHistory?.length || 0;
            });

            stats.totalVehicles = totalVehicles;
            stats.totalPosts = totalPosts;

        } else {
            // Admin: Organization-wide stats
            const totalVehicles = await Vehicle.countDocuments({
                organization: req.user.organization._id || req.user.organization
            });

            const activeAgents = await User.countDocuments({
                organization: req.user.organization._id || req.user.organization,
                role: 'agent',
                status: 'active'
            });

            const vehicles = await Vehicle.find({
                organization: req.user.organization._id || req.user.organization
            });

            let totalPosts = 0;
            vehicles.forEach(vehicle => {
                totalPosts += vehicle.postingHistory?.length || 0;
            });

            stats.totalVehicles = totalVehicles;
            stats.activeAgents = activeAgents;
            stats.totalPosts = totalPosts;
        }

        res.json(stats);

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get posting timeline data
// @route   GET /api/dashboard/timeline
// @access  Protected
router.get('/timeline', protect, async (req, res) => {
    try {
        const { timeframe = 'month', startDate, endDate, orgId } = req.query;

        // Build query
        let query = {};

        if (req.user.role === 'super_admin') {
            // Super admin: Filter by orgId if provided, otherwise all orgs
            if (orgId) {
                query.organization = orgId;
            }
            // If no orgId, query will match all organizations
        } else if (req.user.role === 'agent') {
            // Agent sees only their vehicles
            query.organization = req.user.organization._id || req.user.organization;
            // Check both legacy single assignment and new array assignment
            query.$or = [
                { assignedUser: req.user._id },
                { assignedUsers: req.user._id }
            ];
        } else {
            // Admin sees organization vehicles
            query.organization = req.user.organization._id || req.user.organization;
        }

        // Find vehicles and unwind posting history
        const vehicles = await Vehicle.aggregate([
            { $match: query },
            { $unwind: { path: '$postingHistory', preserveNullAndEmptyArrays: false } },
            {
                $match: startDate || endDate ? {
                    'postingHistory.timestamp': {
                        ...(startDate && { $gte: new Date(startDate) }),
                        ...(endDate && { $lte: new Date(endDate) })
                    }
                } : {}
            },
            {
                $project: {
                    timestamp: '$postingHistory.timestamp',
                    date: {
                        $dateToString: {
                            format: timeframe === 'year' ? '%Y-%m' :
                                timeframe === 'month' ? '%Y-%m-%d' :
                                    '%Y-%m-%d %H:00',
                            date: '$postingHistory.timestamp'
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$date',
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    _id: 0,
                    date: '$_id',
                    count: 1
                }
            }
        ]);

        res.json(vehicles);

    } catch (error) {
        console.error('Error fetching timeline:', error);
        res.status(500).json({ message: error.message });
    }
});

export default router;
