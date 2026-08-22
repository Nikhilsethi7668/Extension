import Posting from '../models/posting.model.js';
import Vehicle from '../models/Vehicle.js';
import { generateVehicleContent } from './ai.service.js';
import { prepareImageBatch, DEFAULT_GPS } from './image-processor.service.js';
import { resolvePostingSchedule } from './postingScheduling.service.js';
import { forceTriggerPosting } from '../cron/posting.cron.js';

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

        // Variation Counter
        let variationCounter = 1;
        
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
                        intervalMinutes: intervalMinutes || (schedule?.intervalMinutes || 5),
                        randomize: randomize !== false && (schedule?.randomize !== false),
                        useStealth: schedule?.stealth === true || data.useStealth === true,
                        // Content Override
                        selectedImages: selectedImages,
                        prompt: prompt || schedule?.prompt,
                        contactNumber: contactNumber || schedule?.contactNumber,
                        user: user,
                        isPostNow: type === 'post-now',
                        variationIndex: variationCounter++ // Track which variation this is
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
            stats: { completed, total },
            data: arguments[5] || null // Allow passing extra data
        };

        io.to(desktopRoom).emit('queue-progress', payload);
        io.to(dashboardRoom).emit('queue-progress', payload);
    }

    async handleSingleJob(userId, job, io, stats) {
        const { vehicleId, profileId, user, selectedImages, prompt, contactNumber, schedule, isPostNow, orgId, intervalMinutes, randomize, useStealth, forcePost } = job.data;
        
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
            status: { $in: ['scheduled', 'triggered', 'processing'] }
        });

        if (activePosting) {
             this.emitProgress(io, userId, `Vehicle ${vehicleData.make} ${vehicleData.model} is already scheduled/active for this profile. Skipping.`, 100, 'progress', {
                 action: 'schedule-skip',
                 vehicleName: `${vehicleData.make} ${vehicleData.model}`
             });
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
                        const baseUrl = process.env.BACKEND_URL || process.env.BASE_URL || 'http://localhost:5573';
                        return baseUrl.replace(/\/$/, '') + url;
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
             const baseUrl = process.env.BACKEND_URL || process.env.BASE_URL || 'http://localhost:5573';
             return baseUrl.replace(/\/$/, '') + url;
        });

        // 3. AI GENERATION (80%)
        let customDescription = null;
        if (prompt) { // prompt is passed from schedule/input
            this.emitProgress(io, userId, `Generating AI description...`, 80);
            try {
                // INJECT VARIATION if index > 1 or just to ensure uniqueness
                let finalPrompt = prompt;
                if (job.data.variationIndex && job.data.variationIndex > 1) {
                     finalPrompt += `\n\n[System: This is variation #${job.data.variationIndex}. Please generate a unique description different from previous versions.]`;
                } else if (job.data.variationIndex) {
                     // Even for the first one, adding ID helps tracking
                     finalPrompt += `\n\n[System: Variation #${job.data.variationIndex}]`;
                }

                const aiContent = await generateVehicleContent(vehicleData, finalPrompt, 'professional', contactNumber);
                if (aiContent && aiContent.description) {
                    customDescription = aiContent.description;
                }
            } catch (e) {
                console.error('AI Gen Error', e);
            }
        }

        // 4. SCHEDULING / SAVING (100%)
        this.emitProgress(io, userId, `Finalizing schedule...`, 90);

        let requestedTime = new Date();

        if (!isPostNow) {
            // REGULAR SCHEDULE: Calculate desired interval-based time
            const MIN_GAP_MS = 5 * 60 * 1000;

            // Determine the user-requested start time. If in the past, use now.
            let userStartTime = (schedule && schedule.startTime) ? new Date(schedule.startTime) : new Date();
            if (userStartTime.getTime() < Date.now()) {
                userStartTime = new Date();
            }

            // Find the latest active (non-terminal) post for this user+profile
            const lastScheduledPost = await Posting.findOne({
                userId: userId,
                profileId: profileId,
                status: { $in: ['scheduled', 'rescheduled', 'triggered', 'processing'] }
            }).sort({ scheduledTime: -1 });

            // User-defined interval (minimum 5 minutes enforced)
            let userIntervalMs = Math.max((intervalMinutes || 5) * 60000, MIN_GAP_MS);

            // Optional randomization variance (0-1 minute)
            let variance = 0;
            if (randomize) {
                variance = Math.floor(Math.random() * 60000);
            }

            let baseTime;

            if (lastScheduledPost) {
                const lastPostTime = new Date(lastScheduledPost.scheduledTime);

                if (userStartTime.getTime() > lastPostTime.getTime() + userIntervalMs) {
                    // userStartTime is already far enough ahead — honour it
                    baseTime = userStartTime;
                } else {
                    // Chain: place this post after the last active post + interval
                    baseTime = new Date(lastPostTime.getTime() + userIntervalMs + variance);
                }
            } else {
                // No existing active post — use userStartTime as the base.
                // If a specific startTime was NOT provided, add one interval so the
                // very first post isn't executed immediately.
                if (!schedule?.startTime) {
                    baseTime = new Date(userStartTime.getTime() + userIntervalMs + variance);
                } else {
                    baseTime = new Date(userStartTime.getTime() + variance);
                }
            }

            // Ensure we never schedule in the past
            if (baseTime.getTime() < Date.now()) {
                baseTime = new Date(Date.now() + MIN_GAP_MS);
            }

            requestedTime = baseTime;
        }

        // Use central scheduling service for conflict resolution and atomic lock
        const scheduleResult = await resolvePostingSchedule({
            userId,
            profileId,
            requestedTime,
            isQuickPost: isPostNow
        });

        let scheduledTime = scheduleResult.scheduledTime;
        let triggerInstantly = scheduleResult.action === 'immediate';

        console.log(`[POSTING-SCHEDULE-TRACE] Creating Posting
  vehicleId: ${vehicleId}
  profileId: ${profileId}
  isQuickPost: ${isPostNow}
  requestedTime: ${requestedTime.toISOString()}
  resolvedTime: ${scheduledTime.toISOString()}
  action: ${scheduleResult.action}
  wasAdjusted: ${scheduleResult.wasAdjusted}
`);

        const savedPosting = await Posting.create({
            vehicleId: vehicleId,
            userId: userId,
            orgId: orgId,
            profileId: profileId,
            status: 'scheduled', 
            scheduledTime: scheduledTime,
            forcePost: forcePost === true,
            selectedImages: finalImages,
            prompt: prompt || null,
            customDescription: customDescription,
            schedulerOptions: { delay: 0, stealth: useStealth },
            completedAt: null,
            logs: [{ message: `Scheduled via Queue (Job ${stats.completed + 1}/${stats.total})`, timestamp: new Date() }]
        });

        if (triggerInstantly) {
            const delayMs = Math.max(500, new Date(scheduledTime).getTime() - Date.now());
            console.log(`[QUEUE] Quick Post will trigger in ${Math.round(delayMs/1000)}s at ${scheduledTime.toISOString()}`);
            
            setTimeout(async () => {
                // Final safety re-check: verify no other post was written for this profile
                // in the window between scheduling and now (closes the TOCTOU race window)
                const nowTime = new Date();
                const windowEnd = new Date(nowTime.getTime() + 5 * 60 * 1000);
                const conflictingNow = await Posting.findOne({
                    userId,
                    profileId,
                    status: { $nin: ['failed', 'completed', 'already-posted', 'timeout'] },
                    scheduledTime: { $gt: nowTime, $lte: windowEnd },
                    _id: { $ne: savedPosting._id } // Exclude this posting itself
                });
                
                if (conflictingNow) {
                    // A conflict appeared during the 30s wait — reschedule this post
                    const newTime = new Date(new Date(conflictingNow.scheduledTime).getTime() + 5 * 60 * 1000);
                    console.warn(`[QUEUE] Quick Post final-check conflict found (${conflictingNow._id} at ${conflictingNow.scheduledTime}). Rescheduling to ${newTime.toISOString()}`);
                    await Posting.findByIdAndUpdate(savedPosting._id, {
                        scheduledTime: newTime,
                        status: 'rescheduled',
                        $push: { logs: { message: `Rescheduled to ${newTime.toISOString()} — conflict detected at trigger time`, timestamp: new Date() } }
                    });
                    return; // Don't trigger — cron will pick it up at newTime
                }
                
                console.log(`[QUEUE] Quick Post final-check passed — triggering now.`);
                forceTriggerPosting(io, savedPosting._id);
            }, delayMs);
        }
        
        // Done with this item
        this.emitProgress(io, userId, `Scheduled ${vehicleData.make} ${vehicleData.model} for ${profileId ? 'Profile' : 'Default'}`, 100, 'progress', {
            action: 'schedule-success',
            vehicleName: `${vehicleData.make} ${vehicleData.model}`,
            scheduledTime: scheduledTime
        });
    }
}

export default new QueueManager();
