import { Worker } from 'bullmq';
import { redisConnection } from '../config/queue.js';
import Posting from '../models/posting.model.js';
import Vehicle from '../models/Vehicle.js';

let worker;

export const initWorker = (io) => {
    worker = new Worker('posting-queue', async (job) => {
        const { postingId, vehicleId, userId, orgId } = job.data;
        console.log(`[Worker] Processing Job ${job.id} for Posting ${postingId}`);

        try {
            // 1. Fetch Posting & Validate
            const posting = await Posting.findById(postingId);
            if (!posting) throw new Error('Posting record not found');
            
            // 2. Concurrency Check: Check if user already has a 'processing' posting (excluding self)
            // Note: This relies on the previous job correctly marking itself as completed/failed.
            // If the previous job crashed, we might need a cleanup mechanism, but the timeout handles that.
            const activePosting = await Posting.findOne({
                userId,
                status: 'processing',
                _id: { $ne: postingId }
            });

            if (activePosting) {
                // If another posting is active, delay this job by throwing an error that triggers backoff
                console.log(`[Worker] User ${userId} has active posting ${activePosting._id}. Delaying job ${job.id}.`);
                // Throwing an error will cause BullMQ to move to 'failed' temporarily, 
                // and then retry based on 'backoff' settings in the job.
                throw new Error('User has active posting - Retrying later');
            }

            // 3. Mark as Processing
            posting.status = 'processing';
            posting.startedAt = new Date();
            await posting.save();

            // 4. Fetch Vehicle Data
            const vehicle = await Vehicle.findById(vehicleId);
            if (!vehicle) throw new Error('Vehicle not found');

            // 4.5 Launch/Focus Profile (if specified)
            if (job.data.profileId) {
                const desktopRoom = `org:${orgId}:desktop`;
                console.log(`[Worker] Launching/Focusing profile ${job.data.profileId} via ${desktopRoom}`);
                io.to(desktopRoom).emit('launch-browser-profile', { profileId: job.data.profileId });
                // Brief wait to ensure browser comes to foreground/launches
                await new Promise(r => setTimeout(r, 5000));
            }

            // 5. Emit Socket Event to Extension
            // Target the specific organization/extension room
            const room = `org:${orgId}:extension`;
            console.log(`[Worker] Emitting start-posting-vehicle to ${room}`);
            
            io.to(room).emit('start-posting-vehicle', {
                vehicleId: vehicleId,
                vehicleData: vehicle, // Send full data (redundant with fetch in extension, but helpful)
                postingId: postingId,
                jobId: job.id
            });

            // 6. Wait for Completion or Timeout
            // We return a Promise that resolves when the socket event 'posting-result' comes back
            // OR rejects after 3 minutes (180000 ms)
            
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(async () => {
                    cleanup();
                    // Mark as Timeout in DB
                    posting.status = 'timeout';
                    posting.error = 'Operation timed out (3 minutes)';
                    posting.completedAt = new Date();
                    await posting.save();
                    reject(new Error('Posting timed out'));
                }, 180000); // 3 minutes

                // We need a listener for the result. 
                // Since this worker might be running in the same process as the socket server (for now),
                // we can listen to an internal event emitter or just rely on the API updating the DB.
                // 
                // Strategy: The extension will call an API endpoint /api/vehicles/posting-result
                // That API endpoint will update the Posting AND trigger a job completion.
                // 
                // BUT BullMQ works best if the worker function waits = Lock the job.
                // 
                // Alternative: The worker *just* starts the process and returns. 
                // But the user wants "1 at a time". If we return, the next job starts.
                // So we MUST wait here.
                
                // We'll use a polling check or an internal Event Emitter.
                // Let's use an internal Event Emitter exposed by the app/index.
                // Or simpler: Poll the DB every 5 seconds to see if status changed to 'completed'/'failed'.
                
                const pollInterval = setInterval(async () => {
                    try {
                        // Keep lock alive explicitly
                        await job.updateProgress({ pct: 50, message: 'Waiting for extension...' });
                        await job.extendLock(30000); // Extend by 30s every loop

                        const updatedPosting = await Posting.findById(postingId);
                        if (updatedPosting.status === 'completed') {
                            cleanup();
                            resolve('Posting completed successfully');
                        } else if (updatedPosting.status === 'failed') {
                            cleanup();
                            reject(new Error(updatedPosting.error || 'Posting failed'));
                        }
                    } catch (err) {
                        // Ignore lock errors here to keep polling, but log critical ones
                        if (err.message && !err.message.includes('Missing lock')) {
                             console.error('[Worker] Polling error:', err);
                        }
                    }
                }, 2000);

                function cleanup() {
                    clearTimeout(timeout);
                    clearInterval(pollInterval);
                }
            });

        } catch (error) {
            console.error(`[Worker] Job ${job.id} failed:`, error.message);
            // Update DB if not already updated (e.g. initial fetch fail)
            const posting = await Posting.findById(postingId);
            if (posting && posting.status !== 'timeout' && posting.status !== 'failed') {
                posting.status = 'failed';
                posting.error = error.message;
                posting.completedAt = new Date();
                await posting.save();
            }
            throw error; // Let BullMQ know it failed
        }

    }, { 
        connection: redisConnection,
        lockDuration: 240000, // 4 minutes (must be longer than the 3 min timeout)
        concurrency: 5 // Optional: Allow multiple concurrent jobs if node process can handle it (since mostly waiting)
    });

    worker.on('completed', job => {
        console.log(`[Worker] Job ${job.id} has completed!`);
    });

    worker.on('failed', (job, err) => {
        console.log(`[Worker] Job ${job.id} has failed with ${err.message}`);
    });
};
