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
        const orgId = req.user.organization?._id || req.user.organization;

        // Ensure Org ID is present for non-super-admins
        if (!orgId && req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Organization context required' });
        }

        const query = {};
        if (orgId) {
            query.orgId = orgId;
        }

        // Restrict to specific user unless they are an admin
        if (req.user.role !== 'org_admin' && req.user.role !== 'super_admin') {
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
            .sort({ scheduledTime: -1 }) // Recent/Newest first
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

// @desc    Check for recent postings of a vehicle (prevents duplicate postings)
// @route   GET /api/postings/vehicle/:vehicleId/recent
// @access  Protected (API Key from extension)
router.get('/vehicle/:vehicleId/recent', protect, async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const { hours = 24 } = req.query;

        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

        // Find successfully completed postings for this vehicle in the time window
        const recentPostings = await Posting.find({
            vehicleId,
            status: 'completed',
            completedAt: { $gte: cutoff }
        }).sort({ completedAt: -1 });

        const count = recentPostings.length;
        const lastPosting = recentPostings[0];

        res.json({
            count,
            hours: parseInt(hours),
            lastPostedAt: lastPosting?.completedAt || null,
            postings: recentPostings.map(p => ({
                id: p._id,
                completedAt: p.completedAt,
                platform: 'facebook_marketplace'
            }))
        });
    } catch (error) {
        console.error('Error checking recent postings:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Update posting status (lightweight - just status + log)
// @route   PATCH /api/postings/:id/status
// @access  Protected (API Key from extension)
router.patch('/:id/status', async (req, res) => {
    try {
        const { status, log } = req.body;
        const postingId = req.params.id;

        if (!status) {
            return res.status(400).json({ 
                success: false, 
                message: 'Status is required' 
            });
        }

        // Find the posting
        const posting = await Posting.findById(postingId);
        if (!posting) {
            return res.status(404).json({ success: false, message: 'Posting not found' });
        }

        // Update status
        const previousStatus = posting.status;
        posting.status = status;

        // Add log if provided
        if (log) {
            posting.logs.push({
                message: log,
                timestamp: new Date()
            });
        }

        await posting.save();
        
        console.log(`[Posting Status] ${postingId}: ${previousStatus} → ${status}${log ? ` (${log})` : ''}`);

        res.json({
            success: true,
            message: `Status updated to ${status}`,
            posting: {
                id: posting._id,
                status: posting.status,
                previousStatus
            }
        });
    } catch (error) {
        console.error('[Posting Status] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Mark posting as complete and update vehicle status
// @route   POST /api/postings/:id/complete
// @access  Protected (API Key from extension)
router.post('/:id/complete', async (req, res) => {
    try {
        const { status, error, listingUrl, vehicleId } = req.body;
        const postingId = req.params.id;

        // Validate status is one of the expected values
        const validStatuses = ['completed', 'failed', 'timeout'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: `Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}` 
            });
        }

        console.log(`[Posting Complete] Processing completion for posting ${postingId}`, { 
            status, 
            vehicleId,
            requestUserId: req.user._id,
            listingUrl 
        });

        // 1. Find and validate the posting record
        const posting = await Posting.findById(postingId);
        
        if (!posting) {
            return res.status(404).json({ success: false, message: 'Posting not found' });
        }

        // 2. Verify ownership - posting must belong to same org
        const userOrgId = req.user.organization._id ? req.user.organization._id.toString() : req.user.organization.toString();
        const postOrgId = posting.orgId.toString();
        if (userOrgId !== postOrgId) {
            console.warn(`[Posting Complete] Unauthorized attempt to update posting from different org`);
            return res.status(403).json({ success: false, message: 'Not authorized to update this posting' });
        }

        // 3. Check if posting has already been completed (prevent re-marking)
        if (posting.status === 'completed') {
            console.warn(`[Posting Complete] Attempt to re-mark already completed posting ${postingId}`);
            return res.status(400).json({ 
                success: false, 
                message: 'Posting already marked as completed' 
            });
        }

        // 4. Update posting status with validation
        const previousStatus = posting.status;
        posting.status = status; // Use status directly since we've validated it above
        posting.completedAt = new Date();
        
        if (error) {
            posting.error = error;
        }
        
        if (listingUrl) {
            posting.listingUrl = listingUrl;
        }

        // Add completion log
        posting.logs.push({
            message: `Status changed from '${previousStatus}' to '${status}'${error ? ` - Error: ${error}` : ''}`,
            timestamp: new Date()
        });

        await posting.save();
        console.log(`[Posting Complete] Updated posting status: ${previousStatus} → ${posting.status}`);

        // 5. If successful, update vehicle status and posting history
        if (status === 'completed' && posting.vehicleId) {
            const vehicle = await Vehicle.findById(posting.vehicleId);
            
            if (vehicle) {
                const previousVehicleStatus = vehicle.status;
                
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
                console.log(`[Posting Complete] Updated vehicle ${posting.vehicleId.toString()}: '${previousVehicleStatus}' → 'posted'`);
                console.log(`[Posting Complete] Added posting history for vehicle: ${listingUrl}`);
            } else {
                console.warn(`[Posting Complete] Vehicle ${posting.vehicleId} not found - cannot update status to 'posted'`);
                // Log this issue in the posting for debugging
                posting.logs.push({
                    message: `WARNING: Vehicle ${posting.vehicleId} not found when marking posting complete`,
                    timestamp: new Date()
                });
                await posting.save();
            }
        } else if (status !== 'completed') {
            console.log(`[Posting Complete] Posting status is '${status}' (not 'completed') - vehicle status not updated`);
        }

        res.json({
            success: true,
            message: `Posting marked as ${status}`,
            posting: {
                id: posting._id,
                status: posting.status,
                previousStatus,
                completedAt: posting.completedAt,
                listingUrl: posting.listingUrl
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
