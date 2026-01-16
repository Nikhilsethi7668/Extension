import cron from 'node-cron';
import Posting from '../models/posting.model.js';
import Vehicle from '../models/Vehicle.js';

// Actually we don't need jobEvents here. We emit socket directly.

export const initPostingCron = (io) => {
    console.log('[Cron] Initializing Posting Scheduler...');

    // Run every minute
    cron.schedule('* * * * *', async () => {
        const now = new Date();
        console.log(`[Cron] Post Scheduler running at ${now.toLocaleTimeString()}`);
        // Check for postings scheduled in the past 2 minutes or next 1 minute (window)
        // Actually, best practice is: scheduledTime <= now AND status == 'scheduled'
        // The user said: "check 2 min old and 1 min upconning posting"
        // This implies a window: [Now - 2m, Now + 1m]
        // But if we run every minute, we might miss something if we are strict.
        // Let's look for anything 'scheduled' that is due (scheduledTime <= Now + 1 min)
        // And maybe filter out very old ones if they are deemed 'stale', but usually we just process them.
        
        // Let's follow the user's specific logic roughly but make it robust.
        // Window: Start = Now - 2 mins. End = Now + 1 mins.
        
        const twoMinutesAgo = new Date(now.getTime() - 2 * 60000);
        const oneMinuteFuture = new Date(now.getTime() + 1 * 60000);

        try {
            // Find active scheduled postings in the time window
            const postings = await Posting.find({
                status: 'scheduled',
                scheduledTime: { $gte: twoMinutesAgo, $lte: oneMinuteFuture }
            }).populate('vehicleId');

            if (postings.length > 0) {
                console.log(`[Cron] Found ${postings.length} postings to trigger.`);
            }

            for (const posting of postings) {
                const { orgId, userId, vehicleId, profileId } = posting;
                const vehicle = posting.vehicleId; // Populated

                if (!vehicle) {
                    console.error(`[Cron] Posting ${posting._id} has no vehicle.`);
                    posting.status = 'failed';
                    posting.error = 'Vehicle not found';
                    await posting.save();
                    continue;
                }

                console.log(`[Cron] Triggering Posting ${posting._id} for Vehicle ${vehicleId._id} (User: ${userId})`);

                const desktopRoom = `org:${orgId}:desktop`;
                const extensionRoom = `org:${orgId}:extension`;

                // 1. Launch/Focus Profile (if specified)
                // We fire this to Desktop
                if (profileId) {
                    console.log(`[Cron] Emitting launch-browser-profile to ${desktopRoom} for profile ${profileId}`);
                    io.to(desktopRoom).emit('launch-browser-profile', { profileId });
                    
                    // Simple delay to ensure browser opens before extension command? 
                    // Socket emission is async and 'fire and forget' here. 
                    // The user said "trigger posting by calling the desktop socker... and just after sheduling mark status completed"
                    // Wait 5-10 seconds? The cron loop continues. 
                    // We can't blocking wait easily in a loop without delaying others too much 
                    // UNLESS we use Promise.all or just fire them.
                    // Let's add a small artificial delay or just assume Desktop handles queueing.
                    // But we need to send the 'start-posting-vehicle' to the EXTENSION. 
                    // If the browser isn't open, extension isn't connected.
                    
                    // The old worker waited 15s. Here we might need a staggered approach?
                    // "run a cron job... trigger posting... mark status completed"
                    // If we just emit, and extension isn't there, it fails.
                    // BUT checking existing worker logic: It sends 'launch-browser-profile', then waits, then sends to extension.
                    
                    // We can emulate this async logic without blocking the main loop.
                    processPostingAsync(io, posting, extensionRoom, vehicle);
                } else {
                     // Direct to extension
                     const vehiclePayload = vehicle.toObject ? vehicle.toObject() : { ...vehicle };
                     if (posting.selectedImages && posting.selectedImages.length > 0) {
                        console.log(`[Cron] Using ${posting.selectedImages.length} selected images for posting.`);
                        vehiclePayload.preparedImages = posting.selectedImages;
                        vehiclePayload.images = posting.selectedImages; // Strict override
                     }
                     
                     // Also attach custom description/prompt if present
                     if (posting.customDescription) {
                        vehiclePayload.description = posting.customDescription; // Override description
                     }

                     io.to(extensionRoom).emit('start-posting-vehicle', {
                        vehicleId: vehicle._id,
                        vehicleData: vehiclePayload,
                        postingId: posting._id,
                        jobId: posting._id // Use ID as JobID
                    });
                    
                    // Mark Completed Immediately
                    posting.status = 'completed'; // As requested
                    posting.completedAt = new Date();
                    posting.logs.push({ message: 'Triggered via Cron', timestamp: new Date() });
                    await posting.save();
                }
            }

        } catch (error) {
            console.error('[Cron] Error processing postings:', error);
        }
    });
};

// Async helper to handle the delay without blocking the cron loop
async function processPostingAsync(io, posting, extensionRoom, vehicle) {
    try {
        // Wait 15 seconds for browser to launch
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        console.log(`[Cron] Emitting start-posting-vehicle to ${extensionRoom} after delay`);
        
        const vehiclePayload = vehicle.toObject ? vehicle.toObject() : { ...vehicle };
        if (posting.selectedImages && posting.selectedImages.length > 0) {
           console.log(`[Cron] Using ${posting.selectedImages.length} selected images for posting.`);
           vehiclePayload.preparedImages = posting.selectedImages;
           vehiclePayload.images = posting.selectedImages; // Strict override
        }
        
        // Also attach custom description/prompt if present
        if (posting.customDescription) {
           vehiclePayload.description = posting.customDescription; // Override description
        }

        io.to(extensionRoom).emit('start-posting-vehicle', {
            vehicleId: vehicle._id,
            vehicleData: vehiclePayload,
            postingId: posting._id,
            jobId: posting._id
        });

        // Mark Completed Immediately (or after trigger)
        posting.status = 'completed';
        posting.completedAt = new Date();
        posting.logs.push({ message: 'Triggered via Cron (Async)', timestamp: new Date() });
        await posting.save();
        console.log(`[Cron] Posting ${posting._id} marked as completed.`);

    } catch (err) {
        console.error(`[Cron] Async processing failed for ${posting._id}:`, err);
        posting.status = 'failed';
        posting.error = err.message;
        await posting.save();
    }
}
