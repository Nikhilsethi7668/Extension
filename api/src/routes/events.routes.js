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

// Resolve event profileId to uniqueId when it's a Mongo ID (so extension "Profile N" still matches)
let ChromeProfileModel = null;
async function resolveEventProfileId(eventProfileId, userId) {
    if (!eventProfileId || typeof eventProfileId !== 'string') return eventProfileId;
    if (!eventProfileId.match(/^[0-9a-fA-F]{24}$/)) return eventProfileId; // already display id like "Profile 3"
    try {
        if (!ChromeProfileModel) ChromeProfileModel = (await import('../models/ChromeProfile.js')).default;
        const p = await ChromeProfileModel.findOne({ _id: eventProfileId, user: userId }).select('uniqueId').lean();
        return p ? p.uniqueId : eventProfileId;
    } catch (e) {
        return eventProfileId;
    }
}

// Poll for events (called by extension every 5 seconds)
router.get('/poll', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const profileId = (req.query.profileId && String(req.query.profileId).trim()) || null;

        // Prevent caching so every profile gets fresh response
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');

        // Track Active Profiles (so cron knows this profile is connected)
        if (profileId) {
            updateActiveProfile(userId, profileId);
        }

        if (!userId) {
            return res.status(400).json({ success: false, message: 'No User ID found' });
        }

        const allEvents = eventQueues.get(userId.toString()) || [];
        const relevantEvents = [];
        const remainingEvents = [];
        const limit = parseInt(req.query.limit) || 10;

        for (const event of allEvents) {
            let eventProfileId = event.data?.profileId;
            // Resolve Mongo ID to uniqueId so extension "Profile 3" matches event queued with Mongo ID
            if (eventProfileId && eventProfileId.match(/^[0-9a-fA-F]{24}$/)) {
                eventProfileId = await resolveEventProfileId(eventProfileId, userId);
            }
            const isMatch = !eventProfileId || (profileId && (eventProfileId === profileId || String(eventProfileId) === String(profileId)));

            if (isMatch && relevantEvents.length < limit) {
                relevantEvents.push(event);
            } else {
                remainingEvents.push(event);
            }
        }

        if (remainingEvents.length > 0) {
            eventQueues.set(userId.toString(), remainingEvents);
        } else {
            eventQueues.delete(userId.toString());
        }

        res.json({ success: true, events: relevantEvents, profileId: profileId || null });
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
