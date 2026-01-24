import express from 'express';
import { protect } from '../middleware/auth.js';
import Posting from '../models/posting.model.js';
import Vehicle from '../models/Vehicle.js'; // Ensure model is registered

const router = express.Router();

// @desc    Get all scheduled postings for an organization
// @route   GET /api/postings
// @access  Protected
router.get('/', protect, async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        const orgId = req.user.organization._id || req.user.organization;

        const query = { orgId };

        // Agent restriction
        if (req.user.role === 'agent') {
            query.userId = req.user._id;
        }

        // Status filter (default to scheduled if not specified, or allow all)
        if (status) {
            query.status = status;
        } else {
             // Default behavior: show scheduled and processing? Or just all? 
             // The requirements said "list all post sheduling", implies scheduled. 
             // But usually a "Scheduled Posts" page might want to see history too? 
             // Let's default to 'scheduled' if no status provided, OR let frontend decide.
             // Actually, for "Scheduled Posts" page, we probably only want scheduled/processing.
             // But if I want to list ALL, I should probably not default here unless requested.
             // Let's NOT default here, let frontend pass ?status=scheduled.
             // Wait, the plan said "default to scheduled".
             // query.status = 'scheduled'; 
        }

        const pageNum = Number(page) || 1;
        const limitNum = Number(limit) || 20;
        const skip = (pageNum - 1) * limitNum;

        const total = await Posting.countDocuments(query);
        const postings = await Posting.find(query)
            .populate({
                path: 'vehicleId',
                select: 'year make model images vin price' // Minimal fields
            })
            .populate('userId', 'name email')
            .sort({ scheduledTime: 1 }) // Closest first
            .skip(skip)
            .limit(limitNum);

        res.json({
            postings,
            total,
            page: pageNum,
            pages: Math.ceil(total / limitNum)
        });
    } catch (error) {
        console.error('Error fetching postings:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Mark posting as complete and update vehicle status
// @route   POST /api/postings/:id/complete
// @access  Protected (API Key from extension)
router.post('/:id/complete', protect, async (req, res) => {
    try {
        const { status, error, listingUrl, vehicleId } = req.body;
        const postingId = req.params.id;

        console.log(`[Posting Complete] Processing completion for posting ${postingId}`, { status, vehicleId });

        // 1. Find and update the posting record
        const posting = await Posting.findById(postingId);
        
        if (!posting) {
            return res.status(404).json({ success: false, message: 'Posting not found' });
        }

        // Update posting status
        posting.status = status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'timeout';
        posting.completedAt = new Date();
        
        if (error) {
            posting.error = error;
        }

        await posting.save();
        console.log(`[Posting Complete] Updated posting status to: ${posting.status}`);

        // 2. If successful, update vehicle status and posting history
        if (status === 'completed' && vehicleId) {
            const vehicle = await Vehicle.findById(vehicleId);
            
            if (vehicle) {
                // Update vehicle status
                vehicle.status = 'posted';
                
                // Add to posting history
                vehicle.postingHistory.push({
                    userId: req.user._id,
                    timestamp: new Date(),
                    listingUrl: listingUrl || '',
                    platform: 'facebook_marketplace',
                    profileId: posting.profileId || '',
                    action: 'post',
                    agentName: req.user.name
                });

                await vehicle.save();
                console.log(`[Posting Complete] Updated vehicle ${vehicleId} status to 'posted' and added posting history`);
            } else {
                console.warn(`[Posting Complete] Vehicle ${vehicleId} not found`);
            }
        }

        res.json({
            success: true,
            message: 'Posting completed successfully',
            posting: {
                id: posting._id,
                status: posting.status,
                completedAt: posting.completedAt
            }
        });
    } catch (error) {
        console.error('[Posting Complete] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Delete a posting
// @route   DELETE /api/postings/:id
// @access  Protected
router.delete('/:id', protect, async (req, res) => {
    try {
        const posting = await Posting.findById(req.params.id);

        if (!posting) {
            return res.status(404).json({ message: 'Posting not found' });
        }

        // Check ownership/permissions
        // 1. Must be in same org
        const userOrgId = req.user.organization._id ? req.user.organization._id.toString() : req.user.organization.toString();
        const postOrgId = posting.orgId.toString();

        if (userOrgId !== postOrgId) {
             return res.status(403).json({ message: 'Not authorized' });
        }

        // 2. If agent, must be their own post
        if (req.user.role === 'agent' && posting.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to delete this post' });
        }

        await posting.deleteOne(); // Use deleteOne() for document instance

        res.json({ success: true, message: 'Posting deleted successfully' });
    } catch (error) {
        console.error('Error deleting posting:', error);
        res.status(500).json({ message: error.message });
    }
});

export default router;
