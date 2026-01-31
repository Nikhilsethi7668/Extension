import express from 'express';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// In-memory event queue (consider using Redis in production)
const eventQueues = new Map(); // orgId -> array of events

// Active Profile Tracking (UserId:ProfileId -> Timestamp)
const activeProfiles = new Map();

// Cleanup stale active profiles every minute
// Cleanup stale active profiles every 10 seconds
setInterval(() => {
    const now = Date.now();
    for (const [key, lastSeen] of activeProfiles.entries()) {
        if (now - lastSeen > 10000) { // 10 seconds timeout
            activeProfiles.delete(key);
        }
    }
}, 10000);

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
    // Consider active if seen in last 15 seconds (matching cleanup logic)
    return (Date.now() - lastSeen) < 15000;
}

// Poll for events (called by extension every 5 seconds)
// Poll for events (called by extension every 5 seconds)
router.get('/poll', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const profileId = req.query.profileId; // Optional profile ID

        // Track Active Profiles logic
        if (profileId) {
            updateActiveProfile(userId, profileId);
        }

        if (!userId) {
            return res.status(400).json({ success: false, message: 'No User ID found' });
        }

        // Get events for this USER (Strict Isolation)
        const allEvents = eventQueues.get(userId.toString()) || [];
        
        // Filter events for this profile (or global events)
        const relevantEvents = [];
        const remainingEvents = [];

        // Default limit to 10 to allow multiple profile-specific events
        // This ensures all scheduled postings for a profile are retrieved
        const limit = parseInt(req.query.limit) || 10; 

        for (const event of allEvents) {
            // Check if matches profile
            const eventProfileId = event.data?.profileId;
            
            // Match if no profile specified OR profile matches
            // We already matched userId by pulling from the user's queue
            const isMatch = !eventProfileId || (profileId && eventProfileId === profileId);

            if (isMatch && relevantEvents.length < limit) {
                relevantEvents.push(event);
            } else {
                remainingEvents.push(event);
            }
        }
        
        // Update the queue with remaining events
        if (remainingEvents.length > 0) {
            eventQueues.set(userId.toString(), remainingEvents);
        } else {
            eventQueues.delete(userId.toString());
        }
        
        res.json({ success: true, events: relevantEvents });
    } catch (error) {
        console.error('[Events] Poll error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Queue an event for a user (called by backend/cron jobs)
export function queueEvent(userId, eventType, eventData) {
    if (!userId) {
        console.error('[Events] Cannot queue event check userId');
        return;
    }
    const userIdStr = userId.toString();
    
    if (!eventQueues.has(userIdStr)) {
        eventQueues.set(userIdStr, []);
    }
    
    eventQueues.get(userIdStr).push({
        type: eventType,
        data: eventData,
        timestamp: Date.now()
    });
    
    console.log(`[Events] Queued event '${eventType}' for user ${userIdStr}`);
}

// Verify posting (called by extension after successful post)
router.post('/verify-posting', protect, async (req, res) => {
    try {
        const { vehicleId, listingUrl, postingId } = req.body;
        
        console.log('[Events] Received posting verification:', { vehicleId, listingUrl, postingId });
        
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
    
    for (const [key, events] of eventQueues.entries()) {
        const filtered = events.filter(event => (now - event.timestamp) < maxAge);
        
        if (filtered.length === 0) {
            eventQueues.delete(key);
        } else if (filtered.length < events.length) {
            eventQueues.set(key, filtered);
        }
    }
}, 60000); // Run every minute

export default router;
