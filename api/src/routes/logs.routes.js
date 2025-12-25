import express from 'express';
import Vehicle from '../models/Vehicle.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @desc    Get activity logs (vehicle posting history)
// @route   GET /api/logs
// @access  Protected
router.get('/', protect, async (req, res) => {
    try {
        const { userId, search, startDate, endDate, page = 1, limit = 50 } = req.query;

        const pageNum = Number(page) || 1;
        const limitNum = Number(limit) || 50;
        const skip = (pageNum - 1) * limitNum;

        // Build aggregation pipeline
        const pipeline = [];

        // Stage 1: Match vehicles by organization
        const matchStage = {
            organization: req.user.organization._id || req.user.organization
        };

        // If user is an agent, only show their vehicles
        if (req.user.role === 'agent') {
            matchStage.assignedUser = req.user._id;
        }

        // If filtering by specific user (only for org admins)
        if (userId && req.user.role !== 'agent') {
            matchStage.assignedUser = userId;
        }

        pipeline.push({ $match: matchStage });

        // Stage 2: Unwind posting history
        pipeline.push({
            $unwind: {
                path: '$postingHistory',
                preserveNullAndEmptyArrays: false // Only include vehicles with posting history
            }
        });

        // Stage 3: Filter by date range if provided
        if (startDate || endDate) {
            const dateFilter = {};
            if (startDate) {
                dateFilter.$gte = new Date(startDate);
            }
            if (endDate) {
                // Set to end of day
                const endDateTime = new Date(endDate);
                endDateTime.setHours(23, 59, 59, 999);
                dateFilter.$lte = endDateTime;
            }
            if (Object.keys(dateFilter).length > 0) {
                pipeline.push({
                    $match: {
                        'postingHistory.timestamp': dateFilter
                    }
                });
            }
        }

        // Stage 4: Lookup user details
        pipeline.push({
            $lookup: {
                from: 'users',
                localField: 'assignedUser',
                foreignField: '_id',
                as: 'userDetails'
            }
        });

        // Stage 5: Unwind user details
        pipeline.push({
            $unwind: {
                path: '$userDetails',
                preserveNullAndEmptyArrays: true
            }
        });

        // Stage 6: Search filter (if provided) - Now supports vehicle search too
        if (search) {
            pipeline.push({
                $match: {
                    $or: [
                        // User search
                        { 'userDetails.name': { $regex: search, $options: 'i' } },
                        { 'userDetails.email': { $regex: search, $options: 'i' } },
                        { 'postingHistory.agentName': { $regex: search, $options: 'i' } },
                        // Vehicle search
                        { 'make': { $regex: search, $options: 'i' } },
                        { 'model': { $regex: search, $options: 'i' } },
                        { 'trim': { $regex: search, $options: 'i' } },
                        { 'year': isNaN(search) ? null : Number(search) }
                    ].filter(Boolean) // Remove null conditions
                }
            });
        }

        // Stage 7: Sort by timestamp (most recent first)
        pipeline.push({
            $sort: { 'postingHistory.timestamp': -1 }
        });

        // Stage 8: Project the fields we need
        pipeline.push({
            $project: {
                _id: 1,
                timestamp: '$postingHistory.timestamp',
                action: '$postingHistory.action',
                platform: '$postingHistory.platform',
                listingUrl: '$postingHistory.listingUrl',
                agentName: '$postingHistory.agentName',
                userName: '$userDetails.name',
                userEmail: '$userDetails.email',
                userId: '$userDetails._id',
                vehicleInfo: {
                    year: '$year',
                    make: '$make',
                    model: '$model',
                    trim: '$trim',
                    price: '$price'
                }
            }
        });

        // Get total count for pagination (before skip/limit)
        const countPipeline = [...pipeline, { $count: 'total' }];
        const countResult = await Vehicle.aggregate(countPipeline);
        const total = countResult.length > 0 ? countResult[0].total : 0;

        // Stage 9: Pagination
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: limitNum });

        // Execute aggregation
        const logs = await Vehicle.aggregate(pipeline);

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

export default router;
