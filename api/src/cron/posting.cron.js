import cron from 'node-cron';
import Posting from '../models/posting.model.js';
import ChromeProfile from '../models/ChromeProfile.js';
import { queueEvent, isProfileActive } from '../routes/events.routes.js';

// Actually we don't need jobEvents here. We emit socket directly.

const toFullUrl = (url) => {
    // Hardcoded as per user request to ensure stability
    const BASE_URL = 'https://api.flashfender.com';
    if (!url) return url;
    if (url.startsWith('http')) return url;
    return `${BASE_URL}${url}`;
};

export const initPostingCron = (io) => {
    console.log('[Cron] Initializing Posting Scheduler...');

    // Run every 30 seconds
    cron.schedule('*/30 * * * * *', async () => {
        const now = new Date();
        console.log(`[Cron] Post Scheduler running at ${now.toLocaleTimeString()}`);
        
        const twoMinutesAgo = new Date(now.getTime() - 10 * 60000);
        const oneMinuteFuture = new Date(now.getTime() + 1 * 60000);

        try {
            // Find active scheduled postings
            // REMOVE LIMIT to support concurrency (processed in parallel below)
            // Safety: Only fetch 'scheduled' status (not 'completed', 'triggered', 'processing')
            const postings = await Posting.find({
                status: 'scheduled',
                scheduledTime: { $gte: twoMinutesAgo, $lte: oneMinuteFuture },
                failureReason: null,
                completedAt: null  // Extra safety: ensure not already completed
            }).populate('vehicleId');

            if (postings.length > 0) {
                console.log(`[Cron] Found ${postings.length} postings to trigger.`);
                
                // Process ALL postings concurrently
                await Promise.all(postings.map(async (posting) => {
                    await processSinglePosting(io, posting);
                }));
            }

        } catch (error) {
            console.error('[Cron] Error processing postings:', error);
        }
    });

    // Run every 2 minutes to check for stuck postings & timeouts
    // Note: Posting takes ~4 minutes, so triggered timeout < processing timeout
    cron.schedule('*/2 * * * *', async () => {
         try {
            
            // 1. Mark postings stuck in 'triggered' for >3 min as failed (should connect quickly)
            const threeMinutesAgo = new Date(Date.now() - 3 * 60000);
            const triggeredTimeouts = await Posting.find({
                status: 'triggered',
                updatedAt: { $lt: threeMinutesAgo }
            });

            if (triggeredTimeouts.length > 0) {
                console.log(`[Cron-Timeout] Found ${triggeredTimeouts.length} triggered postings timed out (>3min).`);
                for (const post of triggeredTimeouts) {
                    post.status = 'failed';
                    post.failureReason = 'Extension connection timeout (>3min in triggered state)';
                    post.logs.push({ message: 'Marked as failed - triggered timeout (>3min)', timestamp: new Date() });
                    await post.save();
                    console.log(`[Cron-Timeout] Marked triggered posting ${post._id} as failed`);
                }
            }

            // 2. Mark postings stuck in 'processing' for >8 min as failed (4min posting + 4min buffer)
            const eightMinutesAgo = new Date(Date.now() - 8 * 60000);
            const processingTimeouts = await Posting.find({
                status: 'processing',
                updatedAt: { $lt: eightMinutesAgo }
            });

            if (processingTimeouts.length > 0) {
                console.log(`[Cron-Timeout] Found ${processingTimeouts.length} processing postings timed out (>8min).`);
                for (const post of processingTimeouts) {
                    post.status = 'failed';
                    post.failureReason = 'Posting timeout (>8min in processing state). Posting takes ~4min, timeout allows for delays.';
                    post.logs.push({ message: 'Marked as failed - processing timeout (>8min). Expected: ~4min', timestamp: new Date() });
                    await post.save();
                    console.log(`[Cron-Timeout] Marked processing posting ${post._id} as failed`);
                }
            }

            // 3. Reschedule failed postings that are eligible for retry
            // Check for failures as early as possible - immediately after timeout is detected
            const twoMinutesAgo = new Date(Date.now() - 2 * 60000); // 2 Minutes (matches cron interval)

            const stuckPostings = await Posting.find({
                status: { $in: ['failed', 'timeout'] }, // Only failed/timeout (exclude scheduled)
                failureReason: { $ne: null }, // Must have a failure reason
                updatedAt: { $lt: twoMinutesAgo }, // Updated at least 2 minutes ago (one cron cycle old)
                rescheduledFromId: null // Not already a rescheduled attempt (avoid infinite chains)
            });

            if (stuckPostings.length > 0) {
                console.log(`[Cron-Rescue] Found ${stuckPostings.length} stuck postings. Rescheduling...`);
                
                for (const post of stuckPostings) {
                    // Check retry count - max 3 attempts
                    const retryCount = post.logs.filter(l => l.message.includes('Rescheduled')).length;
                    if (retryCount >= 3) {
                        console.log(`[Cron-Rescue] Post ${post._id} has reached max retries (3). Keeping as failed.`);
                        continue;
                    }
                    await rescheduleStuckPost(post);
                }
            }
         } catch(error) {
             console.error('[Cron-Rescue] Error:', error);
         }
    });
};

async function rescheduleStuckPost(post) {
    try {
        console.log(`[Cron-Rescue] Rescheduling stuck post ${post._id} for vehicle ${post.vehicleId}`);
        
        // Schedule immediately (ASAP) rather than after last post
        let newTime;
        const minDelay = Math.floor(Math.random() * 30000); // 0-30 second random delay for staggering
        newTime = new Date(Date.now() + minDelay);

        // 1. Mark the original post as 'rescheduled' so it won't be used anywhere
        post.status = 'rescheduled';
        post.failureReason = `Rescheduled - new posting created with ID to be tracked`;
        post.logs.push({ 
            message: `Marked as rescheduled by cron (original posting - no longer active)`, 
            timestamp: new Date() 
        });
        await post.save();
        console.log(`[Cron-Rescue] Post ${post._id} marked as 'rescheduled'`);

        // 2. Create a new posting document with the new scheduled time
        const newPosting = new Posting({
            vehicleId: post.vehicleId,
            userId: post.userId,
            orgId: post.orgId,
            profileId: post.profileId,
            selectedImages: post.selectedImages,
            prompt: post.prompt,
            customDescription: post.customDescription,
            scheduledTime: newTime,
            status: 'scheduled',
            failureReason: null,
            rescheduledFromId: post._id, // Link back to original post
            logs: [{ 
                message: `Created as rescheduled attempt (original post: ${post._id})`,
                timestamp: new Date()
            }]
        });

        await newPosting.save();
        console.log(`[Cron-Rescue] New post ${newPosting._id} created and scheduled to ${newTime.toLocaleTimeString()}`);

    } catch (err) {
        console.error(`[Cron-Rescue] Failed to reschedule post ${post._id}:`, err);
    }
}

async function processSinglePosting(io, posting) {
    const { orgId, userId, vehicleId, profileId } = posting;
    const vehicle = posting.vehicleId;

    if (!vehicle) {
        console.error(`[Cron] Posting ${posting._id} has no vehicle.`);
        posting.status = 'failed';
        posting.error = 'Vehicle not found';
        posting.logs.push({ message: 'Vehicle not found', timestamp: new Date() });
        await posting.save();
        return;
    }

    // CHECK 1: Prevent duplicate - Check if same profile already has active posting for this vehicle (scheduled, triggered, processing)
    const activePosting = await Posting.findOne({
        vehicleId: vehicleId,
        profileId: profileId,
        status: { $in: ['scheduled', 'triggered', 'processing'] },
        _id: { $ne: posting._id } // Exclude current posting
    });

    if (activePosting) {
        console.warn(`[Cron] Vehicle ${vehicleId} already has active posting ${activePosting._id}. Skipping.`);
        posting.failureReason = 'Vehicle already has active posting';
        posting.logs.push({ message: 'Skipped - vehicle has concurrent active posting', timestamp: new Date() });
        await posting.save();
        return;
    }

    // CHECK 2: Prevent reposting - Check if vehicle already posted
    // Mark as 'already-posted' if posted 2+ hours ago, otherwise 'completed' if posted recently
    if (vehicle.status === 'posted') {
        // Check if vehicle was posted BEFORE this posting was created
        const lastPosting = vehicle.postingHistory ? vehicle.postingHistory[vehicle.postingHistory.length - 1] : null;
        const wasPostedBeforeThisPosting = lastPosting && new Date(lastPosting.timestamp) < new Date(posting.createdAt);

        if (wasPostedBeforeThisPosting) {
            // Check how long ago it was posted
            const hoursAgo = (Date.now() - new Date(lastPosting.timestamp).getTime()) / (1000 * 60 * 60);
            
            if (hoursAgo >= 2) {
                // Posted 2+ hours ago
                console.warn(`[Cron] Vehicle ${vehicleId} already marked as posted ${Math.floor(hoursAgo)} hours ago. Marking as 'already-posted'.`);
                posting.status = 'already-posted';
                posting.failureReason = `Vehicle already posted ${Math.floor(hoursAgo)} hours ago`;
                posting.logs.push({ message: `Marked as 'already-posted' - vehicle posted before this posting was created (${Math.floor(hoursAgo)}h ago)`, timestamp: new Date() });
                await posting.save();
                return;
            } else {
                // Posted recently (within 2 hours)
                console.warn(`[Cron] Vehicle ${vehicleId} already marked as posted (${Math.floor(hoursAgo * 60)} minutes ago). Completing this posting.`);
                posting.status = 'completed';
                posting.completedAt = new Date();
                posting.logs.push({ message: `Vehicle already posted recently (${Math.floor(hoursAgo * 60)} min ago) - auto-completed`, timestamp: new Date() });
                await posting.save();
                return;
            }
        }
    }

    // CHECK 3: Check vehicle posting history - prevent reposting within 24 hours on same profile
    if (posting.profileId && vehicle.postingHistory && vehicle.postingHistory.length > 0) {
        const recentHistory = vehicle.postingHistory.find(h => {
            const hoursSince = (Date.now() - h.timestamp) / (1000 * 60 * 60);
            return h.profileId === posting.profileId && hoursSince < 24;
        });

        if (recentHistory) {
            console.warn(`[Cron] Vehicle ${vehicleId} already posted to profile ${posting.profileId} in last 24h. Skipping.`);
            posting.failureReason = 'Vehicle recently posted to this profile';
            posting.logs.push({ message: 'Skipped - vehicle recently posted to this profile', timestamp: new Date() });
            posting.status = 'failed';
            await posting.save();
            return;
        }
    }

    // 1. Connectivity Checks
    if (userId) {
        // A. Desktop App Check (Strict)
        const desktopRoom = `user:${userId}:desktop`;
        const desktopConnected = checkRoomHasClients(io, desktopRoom);

        if (!desktopConnected) {
            console.warn(`[Cron] Desktop App not connected for User ${userId}. Skipping.`);
            posting.failureReason = 'Desktop App Disconnected';
            posting.logs.push({ message: 'Desktop app not connected', timestamp: new Date() });
            posting.status = 'failed';
            await posting.save();
            return;
        }
        
    }

    console.log(`[Cron] Triggering Posting ${posting._id} for Vehicle ${vehicle._id} (User: ${userId})`);

    // Mark as triggered (initially)
    posting.status = 'triggered';
    posting.failureReason = null; 
    posting.logs.push({ message: 'Triggered by Cron (Launching/Checking Profile)', timestamp: new Date() });
    await posting.save();



    // 2. Launch/Focus Profile (via Desktop)
    if (profileId) {
        const desktopRoom = `user:${userId}:desktop`;
        const extensionRoom = `user:${userId}:extension:${profileId}`; // MongoID room
        
        // --- RESOLVE UNIQUE ID FOR POLLING CHECK ---
        let profileUniqueId = profileId; // Default to assuming it's the Unique ID (String) since Posting schema says type: String
        let chromeProfile = null;
        
        // Try to see if it IS a mongo ID first (legacy or mixed usage)
        if (profileId.match(/^[0-9a-fA-F]{24}$/)) {
            try {
                chromeProfile = await ChromeProfile.findById(profileId);
                if (chromeProfile) {
                    profileUniqueId = chromeProfile.uniqueId;
                }
            } catch (e) { console.error('[Cron] Error resolving profile:', e); }
        } else {
             // It is likely the unique ID string already (e.g. "Profile 3")
             // We can optionally try to find the ChromeProfile doc by uniqueId if we need the Name for the desktop app?
             // Desktop app launch needs: profileId (Unique), profileName (Display), mongoId (Optional)
             try {
                 const p = await ChromeProfile.findOne({ uniqueId: profileId, user: userId });
                 if (p) chromeProfile = p;
             } catch (e) { }
        }

        // --- CHECK CONNECTIVITY (SOCKET OR POLLING) ---
        const isSocketActive = checkRoomHasClients(io, extensionRoom);
        const isPollingActive = profileUniqueId ? isProfileActive(userId, profileUniqueId) : false;

        console.log(`[Cron] Connectivity Check for Profile ${profileUniqueId || profileId}: Socket=${isSocketActive}, Polling=${isPollingActive}`);

        if (isSocketActive || isPollingActive) {
            console.log(`[Cron] Extension for profile ${profileUniqueId || profileId} is ALREADY ACTIVE. Skipping launch & delay.`);
            processPostingAsync(io, posting, vehicle, 0, false, profileUniqueId);
        } else {
             // Not active, so trigger launch
            try {
                if (chromeProfile) {
                    console.log(`[Cron] Emitting launch-browser-profile to ${desktopRoom} for profile "${chromeProfile.name}" (${chromeProfile.uniqueId})`);
                    io.to(desktopRoom).emit('launch-browser-profile', { 
                        profileId: chromeProfile.uniqueId, 
                        profileName: chromeProfile.name,
                        mongoId: chromeProfile._id
                    });
                } else {
                     console.warn(`[Cron] ChromeProfile ${profileId} not found in DB. Sending raw ID.`);
                     io.to(desktopRoom).emit('launch-browser-profile', { profileId });
                }

            } catch (e) {
                console.error('[Cron] Error emitting launch event:', e);
            }

            // 3. Queue Event (Async Delay + Extension Check)
            // Wait 8 seconds as requested
            processPostingAsync(io, posting, vehicle, 8000, true, profileUniqueId);
        }
    } else {
        // Direct handling (no specific profile launch)
        processPostingAsync(io, posting, vehicle, 0, false); 
    }
}

// Helper to check socket room
function checkRoomHasClients(io, roomName) {
    const room = io.sockets.adapter.rooms.get(roomName);
    return room && room.size > 0;
}

// Async helper to handle the delay and checks
async function processPostingAsync(io, posting, vehicle, delayMs = 15000, enforceExtensionCheck = false, profileUniqueId = null) {
    try {
        if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        // 3.5 Extension Check (Post-Launch)
        if (enforceExtensionCheck && posting.profileId && posting.userId) {
            const extensionRoom = `user:${posting.userId}:extension:${posting.profileId}`;
            const isSocketActive = checkRoomHasClients(io, extensionRoom);
            
            // Use passed uniqueId or resolve it
            let currentUniqueId = profileUniqueId || posting.profileId; // Default to using what we have
            
            // If it looks like a Mongo ID, try to resolve it to get the real Unique ID
            if (!profileUniqueId && posting.profileId && posting.profileId.match(/^[0-9a-fA-F]{24}$/)) {
                 try {
                    const ChromeProfile = (await import('../models/ChromeProfile.js')).default;
                    const p = await ChromeProfile.findById(posting.profileId);
                    if (p) currentUniqueId = p.uniqueId;
                } catch (e) { }
            }

            // Check Polling
            let isPollingActive = false;
            if (currentUniqueId) {
                const { isProfileActive } = await import('../routes/events.routes.js');
                isPollingActive = isProfileActive(posting.userId, currentUniqueId);
            }

            if (!isSocketActive && !isPollingActive) {
                console.warn(`[Cron] Extension Profile ${posting.profileId} failed to connect (Socket/Poll) after ${delayMs}ms.`);
                posting.status = 'failed';
                posting.failureReason = 'Extension Failed to Connect (Timeout)';
                posting.logs.push({ message: `Extension check failed after ${delayMs}ms`, timestamp: new Date() });
                await posting.save();
                return;
            }
        }
        
        console.log(`[Cron] Queuing start-posting-vehicle for User ${posting.userId}`);
        
        const vehiclePayload = vehicle.toObject ? vehicle.toObject() : { ...vehicle };
        if (posting.selectedImages && posting.selectedImages.length > 0) {
           const fullUrls = posting.selectedImages.map(toFullUrl);
           vehiclePayload.preparedImages = fullUrls;
           vehiclePayload.images = fullUrls;
        }
        
        if (posting.customDescription) {
           vehiclePayload.description = posting.customDescription;
        }

        // IMPORTANT: Use profileUniqueId if available for the event data, 
        // because extension polls by Unique ID (e.g. "Profile 1")
        queueEvent(posting.userId, 'start-posting-vehicle', {
            profileId: profileUniqueId || posting.profileId || null, 
            userId: posting.userId,
            vehicleId: vehicle._id,
            vehicleData: vehiclePayload,
            postingId: posting._id,
            jobId: posting._id
        });

        posting.logs.push({ message: 'Triggered via Cron', timestamp: new Date() });
        // posting.status remains 'processing' until worker finishes? 
        // Or if we want to follow previous logic "mark completed" is removed.
        // But if we marked it 'processing' earlier, we are good.
        await posting.save();

    } catch (err) {
        console.error(`[Cron] Async processing failed for ${posting._id}:`, err);
        posting.status = 'failed';
        posting.error = err.message;
        await posting.save();
    }
}
