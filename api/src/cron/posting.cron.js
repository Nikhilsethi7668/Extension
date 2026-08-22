import cron from 'node-cron';
import Posting from '../models/posting.model.js';
import ChromeProfile from '../models/ChromeProfile.js';
import { queueEvent, isProfileActive, waitForExtensionReady, resolveChromeProfile } from '../routes/events.routes.js';
import Logger from '../utils/logger.js';
import { resolvePostingSchedule, rescheduleStuckPost } from '../services/postingScheduling.service.js';

const toFullUrl = (url) => {
    // Hardcoded as per user request to ensure stability
    const BASE_URL = 'https://api.flashfender.com';
    if (!url) return url;
    if (url.startsWith('http')) return url;
    return `${BASE_URL}${url}`;
};

let postingCronInitialized = false;

// Health state for debug endpoint
let lastCronRunAt = null;
let cronRunCount = 0;
let lastCronError = null;

export const getCronHealth = () => ({
    running: postingCronInitialized,
    lastRunAt: lastCronRunAt,
    runCount: cronRunCount,
    lastError: lastCronError ? lastCronError.message : null
});

export const initPostingCron = (io) => {
    if (postingCronInitialized) {
        console.warn('[CRON] Posting scheduler already initialized. Skipping duplicate initialization.');
        return;
    }

    postingCronInitialized = true;

    console.log('==================================================');
    console.log('[CRON] POSTING SCHEDULER INITIALIZING');
    console.log('[CRON] Time:', new Date().toISOString());
    console.log('[CRON] IO available:', !!io);
    console.log('[CRON] node-cron available:', !!cron);
    console.log('==================================================');

    // Run every 30 seconds
    const postingSchedulerTask = cron.schedule('*/30 * * * * *', async () => {
        console.log('==================================================');
        console.log('[CRON] POSTING SCHEDULER TICK');
        console.log('[CRON] Time:', new Date().toISOString());
        console.log('==================================================');

        lastCronRunAt = new Date();
        cronRunCount++;

        Logger.info('CRON', {
            event: 'SCHEDULER_RUN',
            timestamp: lastCronRunAt.toISOString()
        });

        const now = new Date();
        const tenMinutesAgo = new Date(now.getTime() - 10 * 60000);
        // Look 60 seconds ahead (cron runs every 30s, so each post is caught within one tick)
        const scheduleWindowEnd = new Date(now.getTime() + 60000);

        console.log('[CRON] Searching scheduled postings');
        console.log('[CRON] Window:', {
            from: tenMinutesAgo.toISOString(),
            to: scheduleWindowEnd.toISOString()
        });

        try {
            const postings = await Posting.find({
                status: { $in: ['scheduled', 'rescheduled'] },
                scheduledTime: { $gte: tenMinutesAgo, $lte: scheduleWindowEnd },
                failureReason: null,
                completedAt: null
            }).populate('vehicleId');

            console.log('[CRON] MongoDB query completed');
            
            if (postings.length === 0) {
                console.log('[CRON] Scheduled postings found: 0');
            } else {
                console.log(`[CRON] FOUND SCHEDULED POSTINGS: ${postings.length}`);
                
                for (const posting of postings) {
                    console.log('[CRON] Posting candidate:', {
                        postingId: posting._id?.toString(),
                        vehicleId: posting.vehicleId?._id?.toString(),
                        userId: posting.userId?.toString(),
                        profileId: posting.profileId,
                        scheduledTime: posting.scheduledTime,
                        status: posting.status,
                        failureReason: posting.failureReason
                    });
                }
                
                for (const posting of postings) {
                    try {
                        await processSinglePosting(io, posting);
                    } catch (error) {
                        console.error('[CRON][POSTING][ERROR]', {
                            postingId: posting._id?.toString(),
                            error: error.message,
                            stack: error.stack
                        });
                    }
                }
            }
        } catch (error) {
            lastCronError = error;
            console.error('[CRON][ERROR]', error);
            Logger.error('CRON', { err: error, event: 'SCHEDULER_ERROR' });
        }
    });

    console.log('[CRON] Posting scheduler registered successfully');
    console.log('[CRON] Schedule: every 30 seconds');
    console.log('[CRON] Task created:', !!postingSchedulerTask);

    // Run every 2 minutes to check for stuck postings & timeouts
    cron.schedule('*/2 * * * *', async () => {
        // 1. Check for triggered postings that haven't moved to processing within 5 minutes
        try {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const triggeredTimeouts = await Posting.find({
                status: 'triggered',
                updatedAt: { $lt: fiveMinutesAgo }
            });

            if (triggeredTimeouts.length > 0) {
                console.log(`[CRON-TIMEOUT] triggered timeouts found=${triggeredTimeouts.length}`);
            }
            for (const post of triggeredTimeouts) {
                console.log(`[STATUS]\npostingId=${post._id}\nfrom=triggered\nto=failed\nreason=TRIGGER_TIMEOUT`);
                
                const currentAttempt = post.retryCount || 0;
                if (currentAttempt < 2) {
                    await rescheduleStuckPost(io, post, currentAttempt, 'Chrome post failed (Timeout)');
                } else {
                    console.log(`[CRON-TIMEOUT] Max retries reached for postingId=${post._id}`);
                    post.status = 'failed';
                    post.failureReason = `[Attempt ${currentAttempt + 1}] Chrome post failed (Timeout) - Failed after max retries`;
                    post.logs.push({ message: 'Marked as failed - triggered timeout (>5min) - Max retries reached', timestamp: new Date() });
                    await post.save();
                }
            }
        } catch (err) {
            console.error('[CRON-TIMEOUT] Error checking triggered timeouts:', err);
        }

        // 2. Check for processing postings that haven't completed within 5 minutes
        try {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const processingTimeouts = await Posting.find({
                status: 'processing',
                updatedAt: { $lt: fiveMinutesAgo }
            });

            if (processingTimeouts.length > 0) {
                console.log(`[CRON-TIMEOUT] processing timeouts found=${processingTimeouts.length}`);
            }

            for (const post of processingTimeouts) {
                console.log(`[STATUS]\npostingId=${post._id}\nfrom=processing\nto=failed\nreason=PROCESSING_TIMEOUT`);

                const currentAttempt = post.retryCount || 0;
                if (currentAttempt < 2) {
                    await rescheduleStuckPost(io, post, currentAttempt, 'Posting timeout (>6min in processing state)');
                } else {
                    console.log(`[CRON-TIMEOUT] Max retries reached for postingId=${post._id}`);
                    post.status = 'failed';
                    post.failureReason = `[Attempt ${currentAttempt + 1}] Posting timeout (>6min in processing state) - Failed after max retries`;
                    post.logs.push({ message: 'Marked as failed - processing timeout (>6min). Expected: ~4min - Max retries reached', timestamp: new Date() });
                    await post.save();
                }
            }

            const twoMinutesAgo = new Date(Date.now() - 2 * 60000);
            const stuckPostings = await Posting.find({
                status: { $in: ['failed', 'timeout'] },
                failureReason: { $ne: null },
                updatedAt: { $lt: twoMinutesAgo },
            });

            console.log(`[CRON-RESCUE] stuck postings found=${stuckPostings.length}`);

            for (const post of stuckPostings) {
                const currentAttempt = post.retryCount || 0;

                if (currentAttempt >= 2) {
                    console.log(`[CRON-RESCUE] Max retries reached for postingId=${post._id}`);
                    post.failureReason = post.failureReason || 'Failed after max retries';
                    post.status = 'failed';
                    await post.save();
                    continue;
                }
                await rescheduleStuckPost(io, post, currentAttempt, post.failureReason);
            }
         } catch(error) {
             console.error('[CRON-TIMEOUT][ERROR]', error);
         }
    });
};



export async function forceTriggerPosting(io, postingId) {
    try {
        console.log(`[FORCE-TRIGGER] Forcing instant trigger for postingId=${postingId}`);
        const posting = await Posting.findById(postingId).populate('vehicleId');
        if (posting && posting.status === 'scheduled') {
            await processSinglePosting(io, posting);
        }
    } catch (error) {
        console.error(`[FORCE-TRIGGER][ERROR] postingId=${postingId}`, error);
    }
}

async function processSinglePosting(io, posting) {
    const { orgId, userId, vehicleId, profileId } = posting;
    const vehicle = posting.vehicleId;
    
    console.log(`[POSTING] PROCESSING START\npostingId=${posting._id}\nvehicleId=${vehicleId || ''}\nuserId=${userId || ''}\nprofileId=${profileId || ''}\nscheduledTime=${posting.scheduledTime}`);

    if (!vehicle) {
        console.log(`[POSTING][SKIP]\nreason=VEHICLE_NOT_FOUND\npostingId=${posting._id}`);
        posting.status = 'failed';
        posting.error = 'Vehicle not found';
        posting.logs.push({ message: 'Vehicle not found', timestamp: new Date() });
        await posting.save();
        return;
    }

    const activePosting = await Posting.findOne({
        vehicleId: vehicleId,
        profileId: profileId,
        status: { $in: ['scheduled', 'triggered', 'processing'] },
        _id: { $ne: posting._id }
    });

    if (activePosting) {
        console.log(`[POSTING][SKIP]\nreason=ACTIVE_POSTING_EXISTS\npostingId=${posting._id}\nactivePostingId=${activePosting._id}`);
        posting.failureReason = `[Attempt ${posting.retryCount || 1}] Vehicle already has active posting`;
        posting.logs.push({ message: 'Skipped - vehicle has concurrent active posting', timestamp: new Date() });
        await posting.save();
        return;
    }

    if (posting.profileId && vehicle.postingHistory && vehicle.postingHistory.length > 0 && !posting.forcePost) {
        const recentHistory = vehicle.postingHistory.find(h => {
            if (!h.timestamp) return false;
            const hoursSince = (Date.now() - new Date(h.timestamp).getTime()) / (1000 * 60 * 60);
            return h.profileId === posting.profileId && hoursSince <= 1;
        });

        if (recentHistory) {
            const hoursAgo = (Date.now() - new Date(recentHistory.timestamp).getTime()) / (1000 * 60 * 60);
            console.log(`[POSTING][SKIP]\nreason=RECENT_POSTING\npostingId=${posting._id}\nprofileId=${profileId}\nminutesAgo=${Math.floor(hoursAgo * 60)}`);
            posting.status = 'already-posted';
            posting.failureReason = `Vehicle already posted to this profile ${Math.floor(hoursAgo * 60)} min ago`;
            posting.logs.push({ message: `Marked as 'already-posted' - vehicle posted to the same Chrome profile within the last 1 hour`, timestamp: new Date() });
            await posting.save();
            return;
        }
    }

    if (userId) {
        const desktopRoom = `user:${userId}:desktop`;
        const desktopConnected = checkRoomHasClients(io, desktopRoom);

        if (!desktopConnected) {
            console.log(`[POSTING][SKIP]\nreason=DESKTOP_DISCONNECTED\nroom=${desktopRoom}`);
            const currentAttempt = posting.retryCount || 0;
            if (currentAttempt < 2) {
                await rescheduleStuckPost(io, posting, currentAttempt, 'Desktop app not connected');
            } else {
                console.log(`[POSTING][SKIP] Max retries reached for postingId=${posting._id}`);
                posting.status = 'failed';
                posting.failureReason = `[Attempt ${currentAttempt + 1}] Desktop app not connected - Failed after max retries`;
                posting.logs.push({ message: 'Desktop app not connected', timestamp: new Date() });
                await posting.save();
            }
            return;
        }
    }

    console.log(`[STATUS]\npostingId=${posting._id}\nfrom=scheduled\nto=triggered\nreason=CRON_TRIGGER`);

    posting.status = 'triggered';
    posting.failureReason = null; 
    posting.logs.push({ message: 'Triggered by Cron (Launching/Checking Profile)', timestamp: new Date() });
    await posting.save();

    if (profileId) {
        const desktopRoom = `user:${userId}:desktop`;
        
        let profileUniqueId = profileId;
        let chromeProfileName = profileId;
        
        const resolved = await resolveChromeProfile(profileId, userId);
        if (resolved) {
            profileUniqueId = resolved.uniqueId;
            chromeProfileName = resolved.name;
        }

        const isPollingActive = isProfileActive(userId, profileUniqueId);

        console.log(`[EXTENSION] ACTIVE CHECK\nuserId=${userId}\nprofileUniqueId=${profileUniqueId}\nsocketActive=false\npollingActive=${isPollingActive}`);

        if (isPollingActive) {
            processPostingAsync(io, posting, vehicle, profileUniqueId).catch(error => {
                console.error('[POSTING][ASYNC][ERROR]', {
                    postingId: posting._id?.toString(),
                    error: error.message,
                    stack: error.stack
                });
            });
        } else {
            const mongoProfileId = resolved?.mongoId || profileId;
            console.log(`[DESKTOP][LAUNCH]\npostingId=${posting._id}\nuserId=${userId}\nmongoProfileId=${mongoProfileId}\nprofileUniqueId=${profileUniqueId}\nprofileName=${chromeProfileName}`);
            
            console.log(`[DESKTOP] LAUNCH PROFILE REQUEST\nuserId=${userId}\nmongoProfileId=${mongoProfileId}\nprofileUniqueId=${profileUniqueId}\nprofileName=${chromeProfileName}\nroom=${desktopRoom}`);

            io.to(desktopRoom).emit('launch-browser-profile', { 
                profileId: profileUniqueId, 
                profileName: chromeProfileName,
                mongoId: mongoProfileId
            });

            console.log(`[DESKTOP][LAUNCH][EMITTED]\nuserId=${userId}\nprofileUniqueId=${profileUniqueId}\nsocketRoom=${desktopRoom}`);
            console.log(`[DESKTOP] LAUNCH PROFILE EVENT EMITTED\nprofileUniqueId=${profileUniqueId}`);

            processPostingAsync(io, posting, vehicle, profileUniqueId).catch(error => {
                console.error('[POSTING][ASYNC][ERROR]', {
                    postingId: posting._id?.toString(),
                    error: error.message,
                    stack: error.stack
                });
            });
        }
    } else {
        processPostingAsync(io, posting, vehicle, null).catch(error => {
            console.error('[POSTING][ASYNC][ERROR]', {
                postingId: posting._id?.toString(),
                error: error.message,
                stack: error.stack
            });
        }); 
    }
}

function checkRoomHasClients(io, roomName) {
    console.log(`[DESKTOP] CONNECTION CHECK\nroom=${roomName}`);
    const room = io.sockets.adapter.rooms.get(roomName);
    const count = room ? room.size : 0;
    console.log(`[DESKTOP] CONNECTION RESULT\nconnected=${count > 0}\nclientCount=${count}`);
    return count > 0;
}

async function processPostingAsync(io, posting, vehicle, profileUniqueId = null) {
    if (posting.profileId && posting.userId) {
        let currentUniqueId = profileUniqueId || posting.profileId; 
        
        if (!profileUniqueId) {
            const resolved = await resolveChromeProfile(posting.profileId, posting.userId);
            if (resolved) {
                currentUniqueId = resolved.uniqueId;
            }
        }

        const isReady = await waitForExtensionReady({
            userId: posting.userId,
            profileUniqueId: currentUniqueId,
            timeoutMs: 60000,
            intervalMs: 2000
        });

        if (!isReady) {
            console.log(`[STATUS]\npostingId=${posting._id}\nfrom=triggered\nto=failed\nreason=EXTENSION_TIMEOUT`);
            const currentAttempt = posting.retryCount || 0;
            if (currentAttempt < 2) {
                await rescheduleStuckPost(io, posting, currentAttempt, 'Extension Failed to Connect (Timeout)');
            } else {
                console.log(`[POSTING][EXTENSION-TIMEOUT] Max retries reached for postingId=${posting._id}`);
                posting.status = 'failed';
                posting.failureReason = `[Attempt ${currentAttempt + 1}] Extension Failed to Connect (Timeout) - Failed after max retries`;
                posting.logs.push({ message: 'Extension failed to connect within timeout period', timestamp: new Date() });
                await posting.save();
            }
            return;
        }
    }
    
    const vehiclePayload = vehicle.toObject ? vehicle.toObject() : { ...vehicle };
    if (posting.selectedImages && posting.selectedImages.length > 0) {
       const fullUrls = posting.selectedImages.map(toFullUrl);
       vehiclePayload.preparedImages = fullUrls;
       vehiclePayload.images = fullUrls;
    }
    
    if (posting.customDescription) {
       vehiclePayload.description = posting.customDescription;
    }

    console.log(`[STATUS]\npostingId=${posting._id}\nfrom=triggered\nto=processing\nreason=EXTENSION_RECEIVED_EVENT`);
    
    queueEvent(posting.userId, 'start-posting-vehicle', {
        profileId: profileUniqueId || posting.profileId || null, 
        userId: posting.userId,
        vehicleId: vehicle._id,
        vehicleData: vehiclePayload,
        postingId: posting._id,
        jobId: posting._id
    });

    posting.status = 'processing';
    posting.logs.push({ message: 'Sent to Extension Queue', timestamp: new Date() });
    await posting.save();
}
