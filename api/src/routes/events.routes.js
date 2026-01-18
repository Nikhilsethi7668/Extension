import express from 'express';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// In-memory event queue (consider using Redis in production)
const eventQueues = new Map(); // orgId -> array of events

// Active Profile Tracking (UserId:ProfileId -> Timestamp)
const activeProfiles = new Map();

// Cleanup stale active profiles every minute
setInterval(() => {
    const now = Date.now();
    for (const [key, lastSeen] of activeProfiles.entries()) {
        if (now - lastSeen > 60000) { // 1 minute timeout
            activeProfiles.delete(key);
        }
    }
}, 60000);

export function updateActiveProfile(userId, profileId) {
    if (!userId || !profileId) return;
    const key = `${userId}:${profileId}`;
    activeProfiles.set(key, Date.now());
}

export function isProfileActive(userId, profileId) {
    if (!userId || !profileId) return false;
    const key = `${userId}:${profileId}`;
    const lastSeen = activeProfiles.get(key);
    if (!lastSeen) return false;
    // Consider active if seen in last 45 seconds
    return (Date.now() - lastSeen) < 45000;
}

// Poll for events (called by extension every 5 seconds)
// Poll for events (called by extension every 5 seconds)
router.get('/poll', protect, async (req, res) => {
    try {
        const orgId = req.user.organization?._id || req.user.organization;
        const profileId = req.query.profileId; // Optional profile ID
        const userId = req.user._id;

        // Track Active Profiles logic
        if (profileId) {
            updateActiveProfile(userId, profileId);
        }
        
        if (!orgId) {
            return res.status(400).json({ success: false, message: 'No organization ID' });
        }

        // Get events for this organization
        const allEvents = eventQueues.get(orgId.toString()) || [];
        
        // Filter events for this profile (or global events)
        const relevantEvents = [];
        const remainingEvents = [];

        // Default limit to 1 to ensure load balancing across multiple extensions
        // Unless explicitly requested otherwise
        const limit = parseInt(req.query.limit) || 1; 

        for (const event of allEvents) {
            // Check if matches profile
            const eventProfileId = event.data?.profileId;
            
            // If event is specific to a profile, only return it if we are that profile
            // If event has NO profile, it is global -> typically we might want to broadcast, 
            // but for a queue system, we usually want ONE worker to pick it up. 
            // If we have multiple profiles active, who gets the global event?
            // Current logic: If we are a specific profile, we take our specific events + global events.
            // CAUTION: If multiple profiles poll, global events might be raced. 
            // Ideally global events go to a "default" poller? 
            // For now: take if matches profileId OR !eventProfileId
            const isMatch = !eventProfileId || (profileId && eventProfileId === profileId);

            if (isMatch && relevantEvents.length < limit) {
                relevantEvents.push(event);
            } else {
                remainingEvents.push(event);
            }
        }
        
        // Update the queue with remaining events
        if (remainingEvents.length > 0) {
            eventQueues.set(orgId.toString(), remainingEvents);
        } else {
            // Only delete if queue is truly empty
            eventQueues.delete(orgId.toString());
        }
        
        res.json({ success: true, events: relevantEvents });
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
