import Posting from '../models/posting.model.js';

// In-memory mutex for concurrency control
const locks = new Map();

async function acquireLock(key) {
    while (locks.has(key)) {
        await locks.get(key);
    }
    let resolve;
    const promise = new Promise(r => resolve = r);
    locks.set(key, promise);
    return () => {
        locks.delete(key);
        resolve();
    };
}

/**
 * Resolves a safe scheduled time for a posting, enforcing a strict 5-minute
 * gap between any active postings for the same user and Chrome profile.
 * 
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.profileId
 * @param {Date|string|number} params.requestedTime - The target time for the post
 * @param {boolean} params.isQuickPost - Whether this is a "Post Now" request
 * @returns {Promise<Object>} The resolved schedule details
 */
export async function resolvePostingSchedule({ userId, profileId, requestedTime, isQuickPost = false }) {
    const lockKey = `${userId}:${profileId || 'default'}`;
    const release = await acquireLock(lockKey);

    try {
        const reqTimeDate = new Date(requestedTime);
        const MIN_GAP_MS = 5 * 60 * 1000;
        
        // Query window: look back 5 min (in case we're in the tail of a current post's window)
        // and far forward (all future active posts for this profile)
        const earliestConflictTime = new Date(reqTimeDate.getTime() - MIN_GAP_MS);

        const activePosts = await Posting.find({
            userId,
            profileId,
            status: { $nin: ['failed', 'completed', 'already-posted', 'timeout'] },
            scheduledTime: { $gte: earliestConflictTime }
        }).sort({ scheduledTime: 1 });

        console.log(`[RESOLVE-SCHEDULE] userId=${userId} profileId=${profileId} isQuickPost=${isQuickPost}`);
        console.log(`[RESOLVE-SCHEDULE] requestedTime=${reqTimeDate.toISOString()} earliestConflictTime=${earliestConflictTime.toISOString()}`);
        console.log(`[RESOLVE-SCHEDULE] activePosts found: ${activePosts.length}`, activePosts.map(p => ({
            id: p._id, scheduledTime: p.scheduledTime, status: p.status, profileId: p.profileId
        })));

        let candidate = new Date(reqTimeDate);
        let isValid = false;
        let conflictPostId = null;

        while (!isValid) {
            isValid = true;
            for (const post of activePosts) {
                const postTime = new Date(post.scheduledTime).getTime();
                const candTime = candidate.getTime();
                const diffMs = Math.abs(candTime - postTime);
                
                if (diffMs < MIN_GAP_MS) {
                    isValid = false;
                    conflictPostId = post._id;
                    // Conflict found. Shift candidate to immediately after THIS post's occupancy window
                    candidate = new Date(postTime + MIN_GAP_MS);
                    console.log(`[RESOLVE-SCHEDULE] Conflict with post ${post._id} at ${new Date(postTime).toISOString()} (diff=${Math.round(diffMs/60000)}min). Candidate shifted to ${candidate.toISOString()}`);
                    break; // Restart validation with the new candidate
                }
            }
        }

        const wasAdjusted = candidate.getTime() > reqTimeDate.getTime();

        // HARD GUARD for Quick Posts:
        // Even if the ±5-min scan found nothing, do a forward-only scan for the next 10 minutes.
        // This catches edge cases where profileId comparison or timing produces a false empty result.
        let forwardConflictFound = false;
        if (isQuickPost && !wasAdjusted) {
            const forwardWindow = new Date(Date.now() + MIN_GAP_MS * 2); // next 10 minutes
            const forwardPosts = await Posting.find({
                userId,
                profileId,
                status: { $nin: ['failed', 'completed', 'already-posted', 'timeout'] },
                scheduledTime: { $gt: new Date(), $lte: forwardWindow }
            }).sort({ scheduledTime: 1 });

            console.log(`[RESOLVE-SCHEDULE] Forward guard scan (next 10min): ${forwardPosts.length} posts found`, forwardPosts.map(p => ({
                id: p._id, scheduledTime: p.scheduledTime, status: p.status
            })));

            if (forwardPosts.length > 0) {
                forwardConflictFound = true;
                const nearestPost = forwardPosts[0];
                const nearestTime = new Date(nearestPost.scheduledTime).getTime();
                // Bump candidate past the nearest conflict
                candidate = new Date(nearestTime + MIN_GAP_MS);
                conflictPostId = nearestPost._id;
                console.log(`[RESOLVE-SCHEDULE] Forward guard: conflict with post ${nearestPost._id} at ${new Date(nearestTime).toISOString()}. Candidate forced to ${candidate.toISOString()}`);
            }
        }

        const finalWasAdjusted = candidate.getTime() > reqTimeDate.getTime();
        
        let action = 'scheduled';
        // For Quick Posts with no conflict detected: schedule 30 seconds from now.
        // This mandatory minimum delay closes the TOCTOU race window where a concurrent
        // batch-schedule job hasn't finished writing to MongoDB yet when this check runs.
        // The post will trigger shortly after (30s), but after any in-flight writes settle.
        if (isQuickPost && !finalWasAdjusted && !forwardConflictFound) {
            const QUICK_POST_MIN_DELAY_MS = 30 * 1000; // 30 seconds minimum
            const quickPostTime = new Date(Date.now() + QUICK_POST_MIN_DELAY_MS);
            candidate = quickPostTime;
            action = 'immediate'; // Still triggers via forceTriggerPosting, just with a 30s wait
            console.log(`[RESOLVE-SCHEDULE] Quick Post with no conflicts: scheduling for +30s at ${candidate.toISOString()}`);
        }

        console.log(`[RESOLVE-SCHEDULE] Final: action=${action} scheduledTime=${candidate.toISOString()} wasAdjusted=${finalWasAdjusted}`);

        return {
            action,
            scheduledTime: candidate,
            wasAdjusted: finalWasAdjusted,
            conflictPostId,
            message: finalWasAdjusted ? 'Scheduled time adjusted to prevent conflict' : 'Scheduled successfully'
        };

    } finally {
        release();
    }
}

/**
 * Schedules a Quick Post (Post Now) for LATER when the profile is busy.
 *
 * Protected by the same per-profile mutex to prevent race conditions if two
 * "Schedule for Later" requests arrive simultaneously.
 *
 * Formula: new scheduledTime = latest active post's scheduledTime + 5 minutes
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.profileId
 * @returns {Promise<{ scheduledTime: Date, basedOnPostId: string|null }>}
 */
export async function scheduleQuickPostForLater({ userId, profileId }) {
    const lockKey = `${userId}:${profileId || 'default'}`;
    const release = await acquireLock(lockKey);

    try {
        const MIN_GAP_MS = 5 * 60 * 1000;

        // Find the latest active (non-terminal) post for this user+profile
        const latestPost = await Posting.findOne({
            userId,
            profileId,
            status: { $in: ['scheduled', 'rescheduled', 'triggered', 'processing'] }
        }).sort({ scheduledTime: -1 });

        let scheduledTime;
        let basedOnPostId = null;

        if (latestPost) {
            // Chain: latest post + exactly 5 minutes
            scheduledTime = new Date(new Date(latestPost.scheduledTime).getTime() + MIN_GAP_MS);
            basedOnPostId = latestPost._id;
        } else {
            // No active posts — schedule 5 minutes from now as a safe default
            scheduledTime = new Date(Date.now() + MIN_GAP_MS);
        }

        // Safeguard: never produce a time in the past
        if (scheduledTime.getTime() < Date.now()) {
            scheduledTime = new Date(Date.now() + MIN_GAP_MS);
        }

        return { scheduledTime, basedOnPostId };

    } finally {
        release();
    }
}

/**
 * Reschedules a failed/stuck posting to the next available conflict-free window.
 * 
 * @param {Object} io - Socket.io server instance (optional)
 * @param {Object} post - The posting mongoose document
 * @param {number} currentAttempt - Current attempt number (optional)
 */
export async function rescheduleStuckPost(io, post, currentAttempt) {
    try {
        let newTime;
        const requestedTime = new Date(Date.now() + 5 * 60000); // 5 mins from now as base
        
        const scheduleResult = await resolvePostingSchedule({
            userId: post.userId,
            profileId: post.profileId,
            requestedTime,
            isQuickPost: false
        });

        newTime = scheduleResult.scheduledTime;

        post.status = 'scheduled'; // Reschedule the existing post
        post.scheduledTime = newTime;
        post.retryCount = (post.retryCount || 0) + 1;
        post.failureReason = null; // Clear previous failure reason
        post.logs.push({ 
            message: `Created as rescheduled attempt (Attempt ${post.retryCount}, next run at ${newTime.toISOString()})`, 
            timestamp: new Date() 
        });
        
        await post.save();
        
        if (io) {
            // Immediately notify dashboard to refresh vehicles so Retry counts show up
            io.to(`user:${post.userId}:dashboard`).emit('queue-progress', {
                action: 'reschedule',
                message: `Retry ${post.retryCount} scheduled for ${newTime.toLocaleTimeString()}`,
                progress: 100
            });
            // Also explicitly ask client to refresh
            io.to(`user:${post.userId}:dashboard`).emit('refresh-vehicles');
        }

        console.log(`[CRON-RESCUE] SUCCESS\npostingId=${post._id}\nattempt=${post.retryCount}`);
    } catch (err) {
        console.error(`[CRON-RESCUE][ERROR] postingId=${post._id}`, err);
    }
}

