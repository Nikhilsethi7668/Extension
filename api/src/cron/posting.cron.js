import cron from 'node-cron';
import Posting from '../models/posting.model.js';
import Vehicle from '../models/Vehicle.js';
import ChromeProfile from '../models/ChromeProfile.js';
import { queueEvent, isProfileActive } from '../routes/events.routes.js';

// Actually we don't need jobEvents here. We emit socket directly.

const toFullUrl = (url) => {
    // Hardcoded as per user request to ensure stability
    const BASE_URL = 'https://api-flash.adaptusgroup.ca';
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
        
        const twoMinutesAgo = new Date(now.getTime() - 120 * 60000);
        const oneMinuteFuture = new Date(now.getTime() + 1 * 60000);

        try {
            // Find active scheduled postings
            // REMOVE LIMIT to support concurrency (processed in parallel below)
            const postings = await Posting.find({
                status: 'scheduled',
                scheduledTime: { $gte: twoMinutesAgo, $lte: oneMinuteFuture }
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

    // Run every 2 minutes to check for stuck 'processing' posts
    cron.schedule('*/2 * * * *', async () => {
         try {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60000);
            
            const stuckPostings = await Posting.find({
                status: 'processing',
                scheduledTime: { $lt: tenMinutesAgo }
            });

            if (stuckPostings.length > 0) {
                console.log(`[Cron-Rescue] Found ${stuckPostings.length} stuck postings. Rescheduling...`);
                
                for (const post of stuckPostings) {
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
        
        // Find the last scheduled post for this profile to determine new time
        const lastScheduled = await Posting.findOne({
            userId: post.userId,
            profileId: post.profileId,
            status: 'scheduled'
        }).sort({ scheduledTime: -1 });

        let newTime;
        const randomDelay = Math.floor((4 + Math.random() * 3) * 60000); // 4-7 min delay

        if (lastScheduled) {
            // Append to end of queue
            newTime = new Date(new Date(lastScheduled.scheduledTime).getTime() + randomDelay);
        } else {
            // Queue is empty, start soon
            newTime = new Date(Date.now() + randomDelay);
        }

        post.status = 'scheduled';
        post.scheduledTime = newTime;
        post.failureReason = null; // Clear previous failure
        post.logs.push({ 
            message: 'Rescheduled by cron (detected stuck in processing > 10m)', 
            timestamp: new Date() 
        });

        await post.save();
        console.log(`[Cron-Rescue] Post ${post._id} rescheduled to ${newTime.toLocaleTimeString()}`);

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
        await posting.save();
        return;
    }

    // 1. Connectivity Checks
    if (userId) {
        // A. Desktop App Check (Strict)
        const desktopRoom = `user:${userId}:desktop`;
        const desktopConnected = checkRoomHasClients(io, desktopRoom);

        if (!desktopConnected) {
            console.warn(`[Cron] Desktop App not connected for User ${userId}. Skipping.`);
            posting.failureReason = 'Desktop App Disconnected';
            await posting.save();
            return;
        }
        
        // Note: Extension check is moved to AFTER the launch/delay phase
    }

    console.log(`[Cron] Triggering Posting ${posting._id} for Vehicle ${vehicle._id} (User: ${userId})`);

    // Mark as processing
    posting.status = 'processing';
    posting.failureReason = null; 
    posting.logs.push({ message: 'Processing started (Launching Profile)', timestamp: new Date() });
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
