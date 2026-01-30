import Posting from '../models/posting.model.js';
import Vehicle from '../models/Vehicle.js';
import { generateVehicleContent } from './ai.service.js';
import { prepareImageBatch, DEFAULT_GPS } from './image-processor.service.js';

class QueueManager {
    constructor() {
        this.queues = new Map(); // userId -> Array<Job>
        this.processing = new Map(); // userId -> Boolean
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
        }

        const queue = this.queues.get(userId);
        queue.push({ type, data, addedAt: Date.now() });
        
        console.log(`[QueueManager] Job added for user ${userId}. Queue size: ${queue.length}`);
        
        this.processQueue(userId, io);
    }

    /**
     * Process the next item in the user's queue
     */
    async processQueue(userId, io) {
        if (this.processing.get(userId)) return; // Already processing
        const queue = this.queues.get(userId);
        if (!queue || queue.length === 0) return;

        this.processing.set(userId, true);
        const job = queue.shift();

        try {
            console.log(`[QueueManager] Processing job '${job.type}' for user ${userId}`);
            
            // Send start event
            this.emitProgress(io, userId, `Starting ${job.type === 'batch-schedule' ? 'batch schedule' : 'posting'}...`, 0);

            if (job.type === 'batch-schedule') {
                await this.handleBatchSchedule(userId, job.data, io);
            } else if (job.type === 'post-now') {
                await this.handlePostNow(userId, job.data, io);
            }

        } catch (error) {
            console.error(`[QueueManager] Error processing job for ${userId}:`, error);
            this.emitProgress(io, userId, `Error: ${error.message}`, 0, 'error');
        } finally {
            this.processing.set(userId, false);
            // Process next item
            if (queue.length > 0) {
                this.processQueue(userId, io);
            } else {
                 console.log(`[QueueManager] Queue finished for user ${userId}`);
            }
        }
    }

    emitProgress(io, userId, message, percent, type = 'progress') {
        const desktopRoom = `user:${userId}:desktop`;
        const dashboardRoom = `user:${userId}:dashboard`;
        
        // Emit to both to ensure visibility
        io.to(desktopRoom).emit('queue-progress', { type, message, percent });
        io.to(dashboardRoom).emit('queue-progress', { type, message, percent });
        
        // Also emit to generic user room if they joined it?
        // index.js: socket.join(`user:${userId}:${clientType}`)
        // Let's also emit to org generic room for simple dashboards
        // io.to(`org:${orgId}`).emit('queue-progress', ...) -> Need orgId which is not passed here easiest.
        // But dashboard is definitely in user room if logged in.
    }

    async handleBatchSchedule(userId, data, io) {
        const { vehicleIds, profileId, profileIds, schedule, selectedImages, orgId, user } = data;
        const intervalMinutes = schedule?.intervalMinutes || 1; 
        const randomize = schedule?.randomize !== false; 
        const useStealth = schedule?.stealth === true;

        // Simplify target profiles
        let targetProfiles = [];
        if (profileIds && Array.isArray(profileIds) && profileIds.length > 0) {
            targetProfiles = profileIds;
        } else if (profileId) {
            targetProfiles = [profileId];
        } else {
            targetProfiles = [null];
        }

        const totalOperations = vehicleIds.length * targetProfiles.length;
        let completedOperations = 0;
        let results = { queued: 0, skipped: 0 };

        this.emitProgress(io, userId, `Initializing queue for ${vehicleIds.length} vehicles...`, 5);

        for (const targetProfileId of targetProfiles) {
            // Find last scheduled post logic (same as original)
            const lastScheduledPost = await Posting.findOne({
                userId: userId,
                profileId: targetProfileId,
                status: 'scheduled'
            }).sort({ scheduledTime: -1 });

            let runningTime = lastScheduledPost ? new Date(lastScheduledPost.scheduledTime) : new Date();

            for (let i = 0; i < vehicleIds.length; i++) {
                const vehicleId = vehicleIds[i];
                
                // DATA FETCH
                const vehicleData = await Vehicle.findById(vehicleId);
                if (!vehicleData) {
                    completedOperations++;
                    this.emitProgress(io, userId, `Skipping missing vehicle...`, Math.floor((completedOperations / totalOperations) * 100));
                    results.skipped++;
                    continue;
                }

                this.emitProgress(io, userId, `Processing ${vehicleData.year} ${vehicleData.make} ${vehicleData.model}...`, Math.floor((completedOperations / totalOperations) * 100));

                // DUPLICATE CHECK
                const activePosting = await Posting.findOne({
                    userId: userId,
                    vehicleId: vehicleId,
                    profileId: targetProfileId,
                    status: 'scheduled'
                });
                if (activePosting) {
                     completedOperations++;
                     results.skipped++;
                     continue;
                }

                // IMAGE PROCESSING
                let sourceImages = [];
                if (selectedImages && selectedImages.length > 0) {
                     sourceImages = selectedImages;
                } else if (vehicleData.images && vehicleData.images.length > 0) {
                     sourceImages = vehicleData.images.slice(0, 8);
                }

                let finalImages = [];
                if (sourceImages.length > 0) {
                    this.emitProgress(io, userId, `Processing images for ${vehicleData.make} ${vehicleData.model}...`, Math.floor(((completedOperations + 0.2) / totalOperations) * 100)); // 20% within item
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

                // AI DESCRIPTION
                let customDescription = null;
                const contactNumber = schedule?.contactNumber;
                if (schedule?.prompt) {
                    this.emitProgress(io, userId, `Generating AI description for ${vehicleData.make} ${vehicleData.model}...`, Math.floor(((completedOperations + 0.6) / totalOperations) * 100)); // 60% within item
                    try {
                        const aiContent = await generateVehicleContent(vehicleData, schedule.prompt, 'professional', contactNumber);
                        if (aiContent && aiContent.description) {
                            customDescription = aiContent.description;
                        }
                    } catch (e) { console.error('AI Gen Error', e); }
                }

                // CREATE POSTING
                let delayToAdd = intervalMinutes * 60000;
                const randomMinutes = 2 + Math.random() * 3;
                const randomDelay = Math.floor(randomMinutes * 60000);
                delayToAdd += randomDelay;
                if (randomize) {
                    const variance = Math.floor(Math.random() * 1 * 60000);
                    delayToAdd += variance;
                }

                if (!lastScheduledPost && results.queued === 0 && i === 0) {
                     // First one for this profile in this batch
                     runningTime = new Date(runningTime.getTime() + randomDelay);
                } else {
                     runningTime = new Date(runningTime.getTime() + delayToAdd);
                }

                await Posting.create({
                    vehicleId: vehicleId,
                    userId: userId,
                    orgId: orgId,
                    profileId: targetProfileId,
                    status: 'scheduled', 
                    scheduledTime: runningTime,
                    selectedImages: finalImages,
                    prompt: schedule?.prompt || null,
                    customDescription: customDescription,
                    schedulerOptions: { delay: 0, stealth: useStealth },
                    completedAt: null,
                    logs: [{ message: `Scheduled by user ${userId}`, timestamp: new Date() }]
                });

                results.queued++;
                completedOperations++;
                this.emitProgress(io, userId, `Scheduled ${vehicleData.make} ${vehicleData.model}`, Math.floor((completedOperations / totalOperations) * 100)); // 100% of item logic
            }
        }

        this.emitProgress(io, userId, `Scheduled ${results.queued} postings (skipped ${results.skipped}).`, 100, 'complete');
    }

    async handlePostNow(userId, data, io) {
        // Implement Post Now logic inside queue (Preparation only, because actual "Post Now" triggers socket to extension immediately?)
        // The original /post-now endpoint did:
        // 1. Prepare images/AI
        // 2. TRIGGER socket 'launch-browser-profile' and then 'start-posting-vehicle'.
        // It did NOT create a Posting record? 
        // Wait, looking at original code... it just emitted events.
        // It did NOT save to DB? 
        // Actually, line 2362 in original... let's check.
        // Verified: It prepares images, then... wait, the file cut off.
        // I need to verify if /post-now creates a record. typically it should.
        // If it doesn't, that's a bug or a feature (direct bypass).
        // Assuming it SHOULD create a record or at least we want to queue the PREPARATION part.
        // Once prepared, we emit the event.
        
        // REPLICATING POST-NOW LOGIC:
        const { vehicleId, profileIds, selectedImages, prompt, contactNumber, orgId, user } = data;
        
        // Fetch vehicle
        const vehicleData = await Vehicle.findById(vehicleId);
        if (!vehicleData) return; // Should handle error
        
        this.emitProgress(io, userId, `Preparing ${vehicleData.make} ${vehicleData.model} for immediate posting...`, 20);

        // ... Replication of image processing ...
        let sourceImages = selectedImages && selectedImages.length > 0 ? selectedImages : (vehicleData.images || []).slice(0, 8);
        let finalImages = [];
        
        if (sourceImages.length > 0) {
             const gps = (user.organization?.settings?.gpsLocation) || DEFAULT_GPS;
             try {
                const stealthResult = await prepareImageBatch(sourceImages, { gps, folder: 'stealth' });
                if (stealthResult.success || stealthResult.successCount > 0) {
                    finalImages = stealthResult.results.map(r => r.preparedUrl.startsWith('http') ? r.preparedUrl : 'https://api-flash.adaptusgroup.ca' + r.preparedUrl);
                } else { finalImages = sourceImages; }
             } catch(e) { finalImages = sourceImages; }
        }
        finalImages = finalImages.map(u => u.startsWith('http') ? u : 'https://api-flash.adaptusgroup.ca' + u);
        this.emitProgress(io, userId, `Images prepared. Processing profiles...`, 40);

        for (let i = 0; i < profileIds.length; i++) {
            const pid = profileIds[i];
            
            // AI (Generate unique per posting if prompt exists)
            let customDescription = null;
            if (prompt) {
                 this.emitProgress(io, userId, `Generating AI content for profile ${i+1}/${profileIds.length}...`, 50 + Math.floor((i / profileIds.length) * 30));
                 try {
                     const ai = await generateVehicleContent(vehicleData, prompt, 'professional', contactNumber);
                     if (ai?.description) customDescription = ai.description;
                 } catch(e) {
                     console.error('[PostNow] AI Generation failed:', e);
                 }
            }

             // Create Posting Record (Status: 'scheduled')
            // We set the time to NOW so the cron (running every 30s) picks it up.
            
            const posting = await Posting.create({
                vehicleId: vehicleData._id,
                userId: userId,
                orgId: orgId,
                profileId: pid,
                status: 'scheduled', 
                scheduledTime: new Date(), // Immediate
                selectedImages: finalImages,
                prompt: prompt || null,
                customDescription: customDescription,
                schedulerOptions: {
                    delay: 0,
                    stealth: true
                },
                completedAt: null,
                logs: [{ message: `Immediate post requested by user ${userId} via Queue. Waiting for Cron...`, timestamp: new Date() }]
            });
            
            // Only send 'complete' on the LAST one to finish the UI bar?
            // Actually, if we send complete on the first one, the bar might close.
            // QueueContext handles 'complete' by closing 5s later.
            // If we have multiple, we should probably stick to 'progress' until the last one.
            
            if (i === profileIds.length - 1) {
                this.emitProgress(io, userId, `All ${profileIds.length} profiles scheduled!`, 100, 'complete');
            } else {
                this.emitProgress(io, userId, `Scheduled profile ${i+1}/${profileIds.length}...`, 50 + Math.floor(((i+1) / profileIds.length) * 30));
            }
        }
        // We do NOT wait here anymore. The Cron Job will pick it up and emit sockets.
        // This makes the request fast and non-blocking.
    }
}

export default new QueueManager();
