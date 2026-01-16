import express from 'express';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

// In-memory event queue (consider using Redis in production)
const eventQueues = new Map(); // orgId -> array of events

// Poll for events (called by extension every 5 seconds)
router.get('/poll', protect, async (req, res) => {
    try {
        const orgId = req.user.organization?._id || req.user.organization;
        
        if (!orgId) {
            return res.status(400).json({ success: false, message: 'No organization ID' });
        }

        // Get events for this organization
        const events = eventQueues.get(orgId.toString()) || [];
        
        // Clear the queue after retrieving
        eventQueues.delete(orgId.toString());
        
        res.json({ success: true, events });
    } catch (error) {
        console.error('[Events] Poll error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Queue an event for an organization (called by backend/cron jobs)
export function queueEvent(orgId, eventType, eventData) {
    const orgIdStr = orgId.toString();
    
    if (!eventQueues.has(orgIdStr)) {
        eventQueues.set(orgIdStr, []);
    }
    
    eventQueues.get(orgIdStr).push({
        type: eventType,
        data: eventData,
        timestamp: Date.now()
    });
    
    console.log(`[Events] Queued event '${eventType}' for org ${orgIdStr}`);
}

// Verify posting (called by extension after successful post)
router.post('/verify-posting', protect, async (req, res) => {
    try {
        const { vehicleId, listingUrl, postingId } = req.body;
        
        console.log('[Events] Received posting verification:', { vehicleId, listingUrl, postingId });
        
        // You can add additional verification logic here
        // For now, just acknowledge receipt
        
        res.json({ success: true, message: 'Verification received' });
    } catch (error) {
        console.error('[Events] Verify posting error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Clean up old events periodically (events older than 5 minutes)
setInterval(() => {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    for (const [orgId, events] of eventQueues.entries()) {
        const filtered = events.filter(event => (now - event.timestamp) < maxAge);
        
        if (filtered.length === 0) {
            eventQueues.delete(orgId);
        } else if (filtered.length < events.length) {
            eventQueues.set(orgId, filtered);
        }
    }
}, 60000); // Run every minute

export default router;
