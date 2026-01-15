import { Worker } from 'bullmq';
import { redisConnection } from '../config/queue.js';
import Vehicle from '../models/Vehicle.js';
import { EventEmitter } from 'events';

// Global Event Emitter for ephemeral communication between API routes and Worker
// This allows api/src/index.js to emit 'posting-result' here.
export const jobEvents = new EventEmitter();

let worker;

export const initWorker = (io) => {
    worker = new Worker('posting-queue', async (job) => {
        const { postingId, vehicleId, userId, orgId } = job.data;
        console.log(`[Worker] Processing Job ${job.id} for Vehicle ${vehicleId} (User: ${userId})`);

        const lockKey = `lock:user:${userId}`;

        try {
            // 1. Fetch Posting & Validate
            const posting = await Posting.findById(postingId);
            if (!posting) throw new Error('Posting record not found');

            // 2. Per-User Sequential Check (Redis Lock)
            const existingLock = await redisConnection.get(lockKey);
            if (existingLock && existingLock !== job.id) {
                console.log(`[Worker] User ${userId} is busy (Lock held by ${existingLock}). Delaying job ${job.id}.`);
                throw new Error('User has active posting - Retrying later');
            }

            // Acquire Lock
            await redisConnection.set(lockKey, job.id, 'EX', 300);

            // 3. Fetch Vehicle Data
            const vehicle = await Vehicle.findById(vehicleId);
            if (!vehicle) throw new Error('Vehicle not found');

            let vehicleDataToSend = vehicle.toObject();

            // 4. Stealth Processing (On-the-fly per job)
            if (job.data.stealth) {
                try {
                    console.log(`[Worker] Applying Stealth Mode for Job ${job.id} (Generating unique images...)`);
                    const { prepareImageBatch } = await import('../services/image-processor.service.js');

                    const stealthResult = await prepareImageBatch(vehicle.images, {});

                    if (stealthResult.success || stealthResult.successCount > 0) {
                        const validImages = stealthResult.results.map(r => r.preparedUrl);

                        // Convert to full URLs for extension
                        const baseUrl = process.env.BACKEND_URL || 'http://localhost:5573';
                        const fullUrls = validImages.map(url => {
                            if (url.startsWith('http')) return url;
                            const cleanUrl = url.startsWith('/') ? url : `/${url}`;
                            return `${baseUrl}${cleanUrl}`;
                        });

                        // CRITICAL: Override preparedImages for this specific job payload ONLY
                        vehicleDataToSend.preparedImages = fullUrls;

                        // Save track record of what was used
                        posting.variationData = {
                            preparedImages: fullUrls,
                            metadata: stealthResult.batchMetadata
                        };
                        await posting.save();
                        console.log(`[Worker] Stealth images generated: ${fullUrls.length}`);
                    } else {
                        console.warn('[Worker] Stealth generation failed, falling back to standard/original images');
                    }
                } catch (stealthError) {
                    console.error('[Worker] Stealth Error:', stealthError);
                }
            }

            // 5. Launch/Focus Profile (if specified)
            if (job.data.profileId) {
                const desktopRoom = `org:${orgId}:desktop`;
                console.log(`[Worker] Launching/Focusing profile ${job.data.profileId} via ${desktopRoom}`);
                io.to(desktopRoom).emit('launch-browser-profile', { profileId: job.data.profileId });
                await new Promise(r => setTimeout(r, 5000));
            }

            // 6. Emit Socket Event to Extension
            const room = `org:${orgId}:extension`;
            console.log(`[Worker] Emitting start-posting-vehicle to ${room}`);

            io.to(room).emit('start-posting-vehicle', {
                vehicleId: vehicleId,
                vehicleData: vehicleDataToSend, // Use the (potentially stealthed) data
                postingId: postingId,
                jobId: job.id
            });

            // 7. Wait for Completion or Timeout
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    cleanup();
                    reject(new Error('Posting timed out (3 minutes)'));
                }, 180000);

                // Handler for completion event from API
                const resultHandler = async ({ jobId: resJobId, success, error, listingUrl }) => {
                    if (resJobId === job.id || resJobId === postingId) {
                        cleanup();
                        if (success) {
                            try {
                                const vehicle = await Vehicle.findById(vehicleId);
                                if (vehicle) {
                                    vehicle.status = 'posted';
                                    vehicle.marketplaceStatus = 'listed';
                                    vehicle.marketplaceUrl = listingUrl;
                                    vehicle.lastPostedAt = new Date();

                                    if (!vehicle.postingHistory) vehicle.postingHistory = [];
                                    vehicle.postingHistory.push({
                                        platform: 'facebook',
                                        listingUrl: listingUrl,
                                        timestamp: new Date(),
                                        status: 'active',
                                        user: userId
                                    });
                                    await vehicle.save();
                                    console.log(`[Worker] Vehicle ${vehicleId} marked as posted.`);
                                }
                            } catch (dbErr) {
                                console.error('[Worker] Failed to update vehicle status:', dbErr);
                            }
                            resolve('Posting completed successfully');
                        } else {
                            reject(new Error(error || 'Posting failed'));
                        }
                    }
                };

                const cleanup = () => {
                    clearTimeout(timeout);
                    clearInterval(lockInterval);
                    jobEvents.off('job-completed', resultHandler);
                };

                // Listen for event from API (emitted by index.js on receiving 'posting-result')
                jobEvents.on('job-completed', resultHandler);

                // Keep lock alive while waiting (Both Redis Lock and BullMQ Lock)
                const lockInterval = setInterval(async () => {
                    try {
                        await job.updateProgress({ pct: 50, message: 'Waiting for extension...' });
                        await job.extendLock(30000); // BullMQ Lock

                        // Extend Redis User Lock
                        await redisConnection.expire(lockKey, 300);
                    } catch (err) {
                    };


                }).finally(async () => {
                    // Key Step: Release User Lock regardless of success/failure
                    // Only delete if WE hold it (though simple del is usually fine here)
                    const currentLock = await redisConnection.get(lockKey);
                    if (currentLock === job.id) {
                        await redisConnection.del(lockKey);
                        console.log(`[Worker] Released lock for User ${userId}`);
                    }
                });

            } catch (error) {
                // If it's just a concurrency delay, don't log as a scary error
                if (error.message === 'User has active posting - Retrying later') {
                    console.log(`[Worker] Job ${job.id} waiting for user lock... (Backoff triggered)`);
                } else {
                    console.error(`[Worker] Job ${job.id} failed:`, error);
                }

                // Ensure lock is released if we crash before finally block (e.g. initial sync error)
                // But finally block above handles the promise chain. 
                // If error is thrown BEFORE promise chain (step 0, 1), we need to catch it here.
                // Step 0 throws 'User busy' - we do NOT want to delete the lock then (someone else has it).
                // Step 1 throws error - we DO want to delete lock if we set it.

                // Checking if we set the lock is tricky unless we track state. 
                // But Step 0 checks existing lock. If we passed Step 0, we likely set the lock.
                // EXCEPT if set failed.

                // Safe bet: Check if lock equals our job ID.
                const lockKeys = `lock:user:${userId}`; // Needs scope access or re-define
                // Re-define lockKey here or move scope. 
                // Actually 'lockKey' is in scope above.
                const currentLock = await redisConnection.get(lockKey);
                if (currentLock === job.id) {
                    await redisConnection.del(lockKey);
                }

                throw error;
            }

        }, {
            connection: redisConnection,
                lockDuration: 240000,
                    concurrency: 5 // Allow 5 concurrent jobs globally (but only 1 per user due to logic above)
        });

    worker.on('completed', job => {
        console.log(`[Worker] Job ${job.id} has completed!`);
    });

    worker.on('failed', (job, err) => {
        if (err.message === 'User has active posting - Retrying later') {
            console.log(`[Worker] Job ${job.id} queued for retry (User busy)`);
        } else {
            console.log(`[Worker] Job ${job.id} has failed with ${err.message}`);
        }
    });
};
