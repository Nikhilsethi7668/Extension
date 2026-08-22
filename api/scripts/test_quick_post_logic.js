import mongoose from 'mongoose';
import Posting from '../api/src/models/posting.model.js';
import { acquireLock } from '../api/src/services/postingScheduling.service.js';

async function runTest() {
    console.log('--- STARTING QUICK POST SCHEDULING TESTS ---');
    
    // Connect to test db (or production since we need to verify logic, but use test db to be safe)
    await mongoose.connect('mongodb://127.0.0.1:27017/test_fb_mark_db');
    await Posting.deleteMany({});
    
    const userId = new mongoose.Types.ObjectId().toString();
    const orgId = new mongoose.Types.ObjectId().toString();
    const profileId = "profile-1";
    const MIN_GAP_MS = 5 * 60 * 1000;
    const now = Date.now();
    const activeStatuses = ['scheduled', 'rescheduled', 'triggered', 'processing'];

    // 1. Create an active post scheduled for exactly NOW
    await Posting.create({
        vehicleId: new mongoose.Types.ObjectId(),
        userId,
        orgId,
        profileId,
        status: 'scheduled',
        scheduledTime: new Date(now)
    });

    console.log(`[Setup] Created active post for profile-1 at ${new Date(now).toISOString()}`);

    // 2. Simulate Pre-flight check (!forceSchedule)
    console.log('\n--- TEST 1: Pre-flight check (No forceSchedule) ---');
    const conflict = await Posting.findOne({
        userId,
        profileId,
        status: { $in: activeStatuses },
        scheduledTime: { $gte: new Date(now - MIN_GAP_MS), $lte: new Date(now + MIN_GAP_MS) }
    });

    if (conflict) {
        console.log('✅ TEST 1 PASSED: Conflict detected successfully. (Returns 409)');
    } else {
        console.error('❌ TEST 1 FAILED: Expected conflict not found.');
    }

    // 3. Simulate forceSchedule = true
    console.log('\n--- TEST 2: Schedule for Later (forceSchedule = true) ---');
    const lockKey = `${userId}:${profileId}`;
    const release = await acquireLock(lockKey);
    try {
        const latestPost = await Posting.findOne({
            userId,
            profileId,
            status: { $in: activeStatuses }
        }).sort({ scheduledTime: -1 });

        const newTime = latestPost ? new Date(latestPost.scheduledTime.getTime() + MIN_GAP_MS) : new Date();

        const savedPosting = await Posting.create({
            vehicleId: new mongoose.Types.ObjectId(),
            userId,
            orgId,
            profileId,
            status: 'processing',
            scheduledTime: newTime,
            forcePost: false,
            schedulerOptions: { delay: 0 },
            logs: [{ message: `Placeholder created for forced schedule`, timestamp: new Date() }]
        });

        console.log(`Calculated new time: ${newTime.toISOString()}`);
        console.log(`Expected new time:   ${new Date(now + MIN_GAP_MS).toISOString()}`);
        
        if (newTime.getTime() === now + MIN_GAP_MS) {
            console.log('✅ TEST 2 PASSED: Successfully scheduled for latest + 5 mins.');
        } else {
            console.error('❌ TEST 2 FAILED: Time calculation incorrect.');
        }
    } finally {
        release();
    }

    await mongoose.disconnect();
}

runTest().catch(console.error);
