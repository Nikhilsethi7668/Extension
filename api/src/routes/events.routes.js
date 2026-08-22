import express from 'express';
import { protect } from '../middleware/auth.js';
import Logger from '../utils/logger.js';
// We also need the cron state for the debug endpoint. 
// We will export it from posting.cron.js, so we import it here.
import { getCronHealth } from '../cron/posting.cron.js';

const router = express.Router();

// In-memory event queue (consider using Redis in production)
const eventQueues = new Map(); // orgId -> array of events

// Active Profile Tracking (UserId:ProfileId -> ConnectionState Object)
// ConnectionState: { userId, profileId, lastSeenAt, lastPollAt, connected: true }
const activeProfiles = new Map();

// Cleanup stale active profiles every 10 seconds
setInterval(() => {
    const now = Date.now();
    for (const [key, state] of activeProfiles.entries()) {
        if (now - state.lastSeenAt > 15000) { // 15 seconds timeout
            activeProfiles.delete(key);
        }
    }
}, 10000);

export function updateActiveProfile(userId, profileId) {
    if (!userId || !profileId) return;
    const key = `${userId}:${profileId}`;
    const now = Date.now();
    activeProfiles.set(key, {
        userId,
        profileId,
        lastSeenAt: now,
        lastPollAt: now,
        connected: true
    });
    console.log(`[PROFILE][ACTIVE]\nuserId=${userId}\nprofileId=${profileId}\nlastSeen=${new Date(now).toISOString()}\nageMs=0`);
}

export function isProfileActive(userId, profileId) {
    if (!userId || !profileId) return false;
    const key = `${userId}:${profileId}`;
    const state = activeProfiles.get(key);
    
    if (!state) {
        console.log(`[PROFILE][INACTIVE]\nuserId=${userId}\nprofileId=${profileId}\nreason=NO_STATE_FOUND`);
        console.log(`[PROFILE][ACTIVE_CHECK]\nuserId=${userId}\nprofileId=${profileId}\nactive=false\nlastSeen=null\nageMs=-1`);
        return false;
    }
    
    const ageMs = Date.now() - state.lastSeenAt;
    const isActive = ageMs < 15000;
    
    if (!isActive) {
        console.log(`[PROFILE][INACTIVE]\nuserId=${userId}\nprofileId=${profileId}\nreason=STALE_STATE_AGE_${ageMs}ms`);
    }

    console.log(`[PROFILE][ACTIVE_CHECK]\nuserId=${userId}\nprofileId=${profileId}\nactive=${isActive}\nlastSeen=${new Date(state.lastSeenAt).toISOString()}\nageMs=${ageMs}`);
    
    return isActive;
}

export async function waitForExtensionReady({ userId, profileUniqueId, timeoutMs = 60000, intervalMs = 2000 }) {
    console.log(`[EXTENSION-WAIT] START\nuserId=${userId}\nprofileUniqueId=${profileUniqueId}\ntimeoutMs=${timeoutMs}\nintervalMs=${intervalMs}`);

    const startTime = Date.now();
    let attempt = 1;
    
    while (Date.now() - startTime < timeoutMs) {
        const elapsedMs = Date.now() - startTime;
        
        // We only check polling active as the desktop Socket.IO handles the launch, not the extension itself.
        const pollingActive = isProfileActive(userId, profileUniqueId);
        
        console.log(`[EXTENSION-WAIT] CHECK\nattempt=${attempt}\nelapsedMs=${elapsedMs}\nprofileUniqueId=${profileUniqueId}\nsocketActive=false\npollingActive=${pollingActive}`);

        if (pollingActive) {
            console.log(`[EXTENSION-WAIT] SUCCESS\nprofileUniqueId=${profileUniqueId}\nattempt=${attempt}\nelapsedMs=${elapsedMs}`);
            return true;
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));
        attempt++;
    }

    const key = `${userId}:${profileUniqueId}`;
    const state = activeProfiles.get(key);
    const lastSeenAt = state ? new Date(state.lastSeenAt).toISOString() : 'null';

    console.log(`[EXTENSION-WAIT] TIMEOUT\nprofileUniqueId=${profileUniqueId}\nelapsedMs=${timeoutMs}\nlastSeenAt=${lastSeenAt}`);

    return false;
}

let ChromeProfileModel = null;
export async function resolveChromeProfile(profileId, userId) {
    let inputType = profileId?.match(/^[0-9a-fA-F]{24}$/) ? 'mongoId' : 'uniqueId';
    
    console.log(`[PROFILE] RESOLUTION START\ninputProfileId=${profileId}\nuserId=${userId}`);

    try {
        if (!ChromeProfileModel) ChromeProfileModel = (await import('../models/ChromeProfile.js')).default;
        
        let p;
        if (inputType === 'mongoId') {
            p = await ChromeProfileModel.findOne({ _id: profileId, user: userId }).lean();
        } else {
            p = await ChromeProfileModel.findOne({ uniqueId: profileId, user: userId }).lean();
        }

        if (p) {
            console.log(`[PROFILE] RESOLUTION SUCCESS\nmongoId=${p._id.toString()}\nuniqueId=${p.uniqueId}\nname=${p.name}\nuserId=${userId}`);
            return {
                mongoId: p._id.toString(),
                uniqueId: p.uniqueId,
                name: p.name,
                userId: userId.toString()
            };
        }
        
        console.log(`[PROFILE][ERROR]\nreason=PROFILE_NOT_FOUND\ninputProfileId=${profileId}\nuserId=${userId}`);
        return null;
    } catch (e) {
        console.log(`[PROFILE][ERROR]\nreason=DATABASE_ERROR\ninputProfileId=${profileId}\nuserId=${userId}\nerror=${e.message}`);
        return null;
    }
}

// Poll for events (called by extension every 5 seconds)
router.get('/poll', protect, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        let rawProfileId = (req.query.profileId && String(req.query.profileId).trim()) || null;
        
        let profileUniqueId = rawProfileId;
        if (rawProfileId) {
            // Only resolve if it's a mongo ID, else assume it's uniqueId
            if (rawProfileId.match(/^[0-9a-fA-F]{24}$/)) {
                const resolved = await resolveChromeProfile(rawProfileId, userId);
                if (resolved) {
                    profileUniqueId = resolved.uniqueId;
                    console.log(`[PROFILE][MAPPING]\npostingProfileId=${rawProfileId}\nmongoProfileId=${resolved.mongoId}\nuniqueId=${resolved.uniqueId}\nprofileName=${resolved.name}`);
                }
            }
        }

        console.log(`[POLL] REQUEST\nuserId=${userId}\nprofileId=${profileUniqueId || ''}`);

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');

        if (profileUniqueId) {
            updateActiveProfile(userId, profileUniqueId);
        } else {
            updateActiveProfile(userId, 'anonymous');
        }

        const allEvents = eventQueues.get(userId) || [];
        const relevantEvents = [];
        const remainingEvents = [];
        const limit = parseInt(req.query.limit) || 10;

        for (const event of allEvents) {
            let eventProfileId = event.data?.profileId;
            
            if (eventProfileId) {
                if (eventProfileId.match(/^[0-9a-fA-F]{24}$/)) {
                    const resolvedEventProfile = await resolveChromeProfile(eventProfileId, userId);
                    if (resolvedEventProfile) {
                        eventProfileId = resolvedEventProfile.uniqueId;
                    }
                }
            }

            const isMatch = !eventProfileId || !profileUniqueId || (String(eventProfileId) === String(profileUniqueId));

            if (isMatch && relevantEvents.length < limit) {
                relevantEvents.push(event);
            } else {
                remainingEvents.push(event);
            }
        }

        if (remainingEvents.length > 0) {
            eventQueues.set(userId, remainingEvents);
        } else {
            eventQueues.delete(userId);
        }

        console.log(`[POLL][BACKEND]\nuserId=${userId}\nprofileId=${profileUniqueId || ''}\neventCount=${relevantEvents.length}`);
        console.log(`[POLL] RESPONSE\nuserId=${userId}\nprofileId=${profileUniqueId || ''}\neventCount=${relevantEvents.length}`);

        if (relevantEvents.length > 0) {
            for (const ev of relevantEvents) {
                console.log(`[POLL][EVENT_DELIVERY]\nuserId=${userId}\nprofileId=${profileUniqueId || ''}\neventType=${ev.type}\npostingId=${ev.data?.postingId || ''}`);
            }
            console.log(`[POLL] EVENTS DELIVERED\nuserId=${userId}\nprofileId=${profileUniqueId || ''}\neventCount=${relevantEvents.length}\neventIds=[${relevantEvents.map(e => e.id).join(',')}]\neventTypes=[${relevantEvents.map(e => e.type).join(',')}]`);
        }

        res.json({ success: true, events: relevantEvents, profileId: profileUniqueId || null });
    } catch (error) {
        Logger.error('POLL', { err: error });
        res.status(500).json({ success: false, message: error.message });
    }
});

// Queue an event for a user (called by backend/cron jobs)
export function queueEvent(userId, eventType, eventData) {
    if (!userId) {
        return;
    }
    const userIdStr = userId.toString();
    
    console.log(`[QUEUE] PROFILE MATCH CHECK\nbackendProfileId=${eventData?.profileId || ''}\nextensionExpectedProfileId=${eventData?.profileId || ''}\nmatch=true`);
    console.log(`[QUEUE] START\neventType=${eventType}\npostingId=${eventData?.postingId || ''}\nvehicleId=${eventData?.vehicleId || ''}\nuserId=${userIdStr}\nprofileId=${eventData?.profileId || ''}`);
    
    try {
        if (!eventQueues.has(userIdStr)) {
            eventQueues.set(userIdStr, []);
        }
        
        const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        eventQueues.get(userIdStr).push({
            id: eventId,
            type: eventType,
            data: eventData,
            timestamp: Date.now()
        });
        
        console.log(`[QUEUE] SUCCESS\neventType=${eventType}\npostingId=${eventData?.postingId || ''}\nprofileId=${eventData?.profileId || ''}\neventId=${eventId}`);
    } catch (err) {
        console.log(`[QUEUE][ERROR]\neventType=${eventType}\npostingId=${eventData?.postingId || ''}\nerror=${err.message}\nstack=${err.stack}`);
    }
}

// Debug connections endpoint
router.get('/debug/connections', protect, (req, res) => {
    const userId = req.user._id.toString();
    const profiles = [];
    const now = Date.now();
    
    for (const [key, state] of activeProfiles.entries()) {
        if (key.startsWith(`${userId}:`)) {
            profiles.push({
                profileId: state.profileId,
                lastSeenAt: new Date(state.lastSeenAt).toISOString(),
                ageMs: now - state.lastSeenAt,
                active: (now - state.lastSeenAt) < 15000
            });
        }
    }
    
    res.json({
        userId,
        profiles
    });
});

// Cron debug endpoint
router.get('/debug/cron', protect, (req, res) => {
    try {
        res.json(getCronHealth());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/verify-posting', protect, async (req, res) => {
    try {
        const { vehicleId, listingUrl, postingId } = req.body;
        Logger.info('EVENTS', { event: 'VERIFY_POSTING_RECEIVED', vehicleId, listingUrl, postingId });
        res.json({ success: true, message: 'Verification received' });
    } catch (error) {
        Logger.error('EVENTS', { err: error });
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
}, 60000);

export default router;
