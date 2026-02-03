import Posting from '../models/posting.model.js';
import Vehicle from '../models/Vehicle.js';
import { generateVehicleContent } from './ai.service.js';
import { prepareImageBatch, DEFAULT_GPS } from './image-processor.service.js';

class QueueManager {
    constructor() {
        this.queues = new Map(); // userId -> Array<Job>
        this.processing = new Map(); // userId -> Boolean
        this.stats = new Map(); // userId -> { total: number, completed: number }
    }

    /**
     * Add a job to the user's queue
     * @param {string} userId 
     * @param {string} type 'batch-schedule' | 'post-now'
     * @param {object} data Job data
     * @param {Server} io Socket.IO instance
     */
    addJob(userId, type, data, io) {
        if (!this.queues.has(userId)) {
            this.queues.set(userId, []);
            this.processing.set(userId, false);
            this.stats.set(userId, { total: 0, completed: 0 });
        }

        const queue = this.queues.get(userId);
        const userStats = this.stats.get(userId);

        // FLATTEN JOBS HERE
        const newJobs = this.flattenJobs(userId, type, data);
        
        // Add to queue and update total count
        newJobs.forEach(job => queue.push(job));
        userStats.total += newJobs.length;

        console.log(`[QueueManager] Added ${newJobs.length} jobs for user ${userId}. Total in session: ${userStats.total}`);
        
        // Emit progress immediately so frontend knows total increased (recalculates %)
        this.emitProgress(io, userId, `Added ${newJobs.length} new jobs to queue...`, 0);

        this.processQueue(userId, io);
    }

    /**
     * Helper to flatten inputs into single execution units
     */
    flattenJobs(userId, type, data) {
        const jobs = [];
        // Extract common data
        const { vehicleIds, profileIds, profileId, vehicleId, schedule, selectedImages, prompt, contactNumber, orgId, user, randomize, intervalMinutes } = data;

        // Normalize Targets
        let targetProfiles = [];
        if (profileIds && Array.isArray(profileIds) && profileIds.length > 0) {
            targetProfiles = profileIds;
        } else if (profileId) {
            targetProfiles = [profileId];
        } else {
            targetProfiles = [null]; // No specific profile (maybe just database entry?)
        }

        // Normalize Vehicles
        let targetVehicles = [];
        if (vehicleIds && Array.isArray(vehicleIds)) {
            targetVehicles = vehicleIds;
        } else if (vehicleId) {
            targetVehicles = [vehicleId];
        }

        // Current timestamp for scheduling base (if multiple, we increment this base later)
        // Actually, we should probably pass the schedule parameters and let the worker calculate the exact time relative to the *last* one.
        // But to keep it simple, we can pass metadata.
        
        for (const pid of targetProfiles) {
            for (const vid of targetVehicles) {
                jobs.push({
                    type: 'single-posting', // Unified type
                    addedAt: Date.now(),
                    data: {
                        userId,
                        orgId,
                        vehicleId: vid,
                        profileId: pid,
                        // Configs
                        schedule: schedule || {},
                        intervalMinutes: intervalMinutes || (schedule?.intervalMinutes || 1),
                        randomize: randomize !== false && (schedule?.randomize !== false),
                        useStealth: schedule?.stealth === true || data.useStealth === true,
                        // Content Override
                        selectedImages: selectedImages, // Note: if batching multiple vehicles, selectedImages might not apply to all. usually 'selectedImages' comes from single vehicle select.
                        // If vehicleIds > 1, selectedImages usually isn't passed (unless bulk action). 
                        // If bulk action, same images for all cars? Unlikely. 
                        // Assumption: If vehicleIds.length > 1, selectedImages is null/undefined usually.
                        prompt: prompt || schedule?.prompt,
                        contactNumber: contactNumber || schedule?.contactNumber,
                        user: user,
                        isPostNow: type === 'post-now'
                    }
                });
            }
        }
        return jobs;
    }

    /**
     * Process the next item in the user's queue
     */
    async processQueue(userId, io) {
        if (this.processing.get(userId)) return; // Already processing
        const queue = this.queues.get(userId);
        const userStats = this.stats.get(userId);

        if (!queue || queue.length === 0) {
            // Queue Finished entirely
            if (userStats && userStats.total > 0) {
                 this.emitProgress(io, userId, `Queue execution complete!`, 100, 'complete');
            }
            // CLEANUP: Prevent memory leak by removing inactive user entries
            this.stats.delete(userId);
            this.queues.delete(userId);
            this.processing.delete(userId);
            
            console.log(`[QueueManager] ✅ Queue finished and cleaned up for user ${userId}`);
            return;
        }

        this.processing.set(userId, true);
        const job = queue.shift();

        try {
            await this.handleSingleJob(userId, job, io, userStats);
        } catch (error) {
            console.error(`[QueueManager] Error processing job for ${userId}:`, error);
            // Even if error, we count as processed/attempted?
            // Yes, so we don't get stuck.
        } finally {
            // Update Stats
            userStats.completed++;
            this.processing.set(userId, false);
            
            // Process next item
            this.processQueue(userId, io);
        }
    }

    /**
     * Emit aggregated progress
     */
    emitProgress(io, userId, message, itemPercent, type = 'progress') {
        const userStats = this.stats.get(userId) || { total: 1, completed: 0 };
        const { total, completed } = userStats;
        
        // Global Percent Calculation
        // Each item is worth (100 / total) percent.
        // Current base is (completed / total) * 100.
        // Current item contribution is (itemPercent / 100) * (1 / total) * 100 = itemPercent / total.
        
        let globalPercent = 0;
        if (total > 0) {
            const baseProgress = (completed / total) * 100;
            const currentItemContribution = itemPercent / total;
            globalPercent = Math.min(100, Math.floor(baseProgress + currentItemContribution));
        }

        // Identify rooms
        const desktopRoom = `user:${userId}:desktop`;
        const dashboardRoom = `user:${userId}:dashboard`;
        
        const payload = {
            type,
            message,
            percent: globalPercent, // The UI expects a 0-100 value
            itemPercent: itemPercent, // Optional: if UI wants to show "Job 3/10: 50%"
            stats: { completed, total }
        };

        io.to(desktopRoom).emit('queue-progress', payload);
        io.to(dashboardRoom).emit('queue-progress', payload);
    }

    async handleSingleJob(userId, job, io, stats) {
        const { vehicleId, profileId, user, selectedImages, prompt, contactNumber, schedule, isPostNow, orgId, intervalMinutes, randomize, useStealth } = job.data;
        
        // 1. INIT (3%)
        this.emitProgress(io, userId, `Starting job ${stats.completed + 1}/${stats.total}...`, 3);

        const vehicleData = await Vehicle.findById(vehicleId);
        if (!vehicleData) {
            this.emitProgress(io, userId, `Skipping missing vehicle...`, 100); // Fail fast
            return; 
        }

        // DUPLICATE/EXISTENCE CHECK
        // If it's a schedule run, we check if already scheduled
        // If it's Post Now, we usually bypass or queue duplicate? 
        // Let's stick to original logic: check if 'scheduled' exists.
        const activePosting = await Posting.findOne({
            userId: userId,
            vehicleId: vehicleId,
            profileId: profileId,
            status: 'scheduled'
        });

        if (activePosting) {
             this.emitProgress(io, userId, `Vehicle already scheduled for this profile. Skipping.`, 100);
             return;
        }

        // 2. IMAGE PREP (50%)
        let sourceImages = [];
        if (selectedImages && selectedImages.length > 0) {
             sourceImages = selectedImages;
        } else if (vehicleData.images && vehicleData.images.length > 0) {
             sourceImages = vehicleData.images.slice(0, 8);
        }

        let finalImages = [];
        if (sourceImages.length > 0) {
            this.emitProgress(io, userId, `Processing images for ${vehicleData.make} ${vehicleData.model}...`, 50);
            
            try {
                const gps = (user.organization && user.organization.settings && user.organization.settings.gpsLocation) 
                            ? user.organization.settings.gpsLocation 
                            : DEFAULT_GPS;
                
                const stealthResult = await prepareImageBatch(sourceImages, {
                    gps: gps,
                    camera: null, 
                    folder: 'stealth'
                });

                if (stealthResult.success || stealthResult.successCount > 0) {
                    finalImages = stealthResult.results.map(r => {
                        const url = r.preparedUrl;
                        if (url.startsWith('http')) return url;
                        return 'https://api-flash.adaptusgroup.ca' + url;
                    });
                } else {
                    finalImages = sourceImages;
                }
            } catch (err) {
                console.error('[Queue] Stealth processing error:', err);
                finalImages = sourceImages;
            }
        }
        
        // Normalize URLs
        finalImages = finalImages.map(url => {
             if (!url) return url;
             if (url.startsWith('http')) return url;
             return 'https://api-flash.adaptusgroup.ca' + url;
        });

        // 3. AI GENERATION (80%)
        let customDescription = null;
        if (prompt) { // prompt is passed from schedule/input
            this.emitProgress(io, userId, `Generating AI description...`, 80);
            try {
                const aiContent = await generateVehicleContent(vehicleData, prompt, 'professional', contactNumber);
                if (aiContent && aiContent.description) {
                    customDescription = aiContent.description;
                }
            } catch (e) {
                console.error('AI Gen Error', e);
            }
        }

        // 4. SCHEDULING / SAVING (100%)
        this.emitProgress(io, userId, `Finalizing schedule...`, 90);

        let scheduledTime = new Date();
        const MIN_GAP_MS = 4 * 60 * 1000; // 4 minutes

        if (isPostNow) {
            // POST NOW: Smart scheduling to prevent rate limits
            // Check if there are scheduled posts for this profile in next 5 minutes
            const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
            
                const fourMinutesAgo = new Date(Date.now() - MIN_GAP_MS);
            
            const conflictingPosts = await Posting.find({
                userId: userId,
                profileId: profileId,
                status: 'scheduled',
                scheduledTime: {
                    $gte: fourMinutesAgo, // Check explicitly for conflicts in the "danger zone" (recent past)
                    $lte: fiveMinutesFromNow 
                }
            }).sort({ scheduledTime: 1 }); // Ascending order

            if (conflictingPosts.length > 0) {
                // There are upcoming posts in the next 5 minutes
                // Find the LAST scheduled post for this profile (not just in next 5 min, but overall)
                const lastScheduledPost = await Posting.findOne({
                    userId: userId,
                    profileId: profileId,
                    status: 'scheduled'
                }).sort({ scheduledTime: -1 }); // Latest one

                if (lastScheduledPost) {
                    // Schedule after the last post with 4-minute gap
                    scheduledTime = new Date(lastScheduledPost.scheduledTime.getTime() + MIN_GAP_MS);
                    console.log(`[Queue] Post Now: Found upcoming posts. Scheduling after last post with 4-min gap: ${scheduledTime}`);
                } else {
                    // Fallback (shouldn't happen since upcomingPosts.length > 0)
                    scheduledTime = new Date();
                }
            } else {
                // No posts in next 5 minutes, schedule immediately
                scheduledTime = new Date();
            }
        } else {
            // REGULAR SCHEDULE: Chain to last scheduled post with intervals
            const lastScheduledPost = await Posting.findOne({
                userId: userId,
                profileId: profileId,
                status: 'scheduled'
            }).sort({ scheduledTime: -1 });

            let baseTime = lastScheduledPost ? new Date(lastScheduledPost.scheduledTime) : new Date();
            
            // User-defined Interval
            let userIntervalMs = intervalMinutes * 60000;
            
            // Random scatter (2-5 minutes)
            const randomMinutes = 2 + Math.random() * 3;
            const randomDelay = Math.floor(randomMinutes * 60000);
            
            // Calculate total delay
            let totalDelay = userIntervalMs + randomDelay;
            
            // Add optional randomization variance
            if (randomize) {
                const variance = Math.floor(Math.random() * 1 * 60000);
                totalDelay += variance;
            }

            // Enforce minimum gap for chained posts
            if (lastScheduledPost) {
                // Ensure at least 4 minutes between posts
                if (totalDelay < MIN_GAP_MS) {
                    totalDelay = MIN_GAP_MS;
                }
                scheduledTime = new Date(baseTime.getTime() + totalDelay);
            } else {
                // First post: just add random delay from now
                scheduledTime = new Date(baseTime.getTime() + randomDelay);
            }
        }



        await Posting.create({
            vehicleId: vehicleId,
            userId: userId,
            orgId: orgId,
            profileId: profileId,
            status: 'scheduled', 
            scheduledTime: scheduledTime,
            selectedImages: finalImages,
            prompt: prompt || null,
            customDescription: customDescription,
            schedulerOptions: { delay: 0, stealth: useStealth },
            completedAt: null,
            logs: [{ message: `Scheduled via Queue (Job ${stats.completed + 1}/${stats.total})`, timestamp: new Date() }]
        });
        
        // Done with this item
        this.emitProgress(io, userId, `Scheduled ${vehicleData.make} ${vehicleData.model} for ${profileId ? 'Profile' : 'Default'}`, 100);
    }
}

export default new QueueManager();
