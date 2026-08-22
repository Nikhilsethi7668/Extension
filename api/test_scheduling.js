import mongoose from 'mongoose';
import { resolvePostingSchedule } from './src/services/postingScheduling.service.js';
import Posting from './src/models/posting.model.js';

// Mock DB
const activePosts = [];

Posting.find = function(query) {
    return {
        sort: () => Promise.resolve(activePosts)
    };
};

Posting.create = function(data) {
    activePosts.push(data);
    return Promise.resolve(data);
};

async function runTest() {
    console.log('--- STARTING MOCKED SCHEDULING TESTS ---');
    const userId = new mongoose.Types.ObjectId();
    const orgId = new mongoose.Types.ObjectId();
    const vehicleId = new mongoose.Types.ObjectId();
    const profileId = "profile-1";
    
    // SIMULATE QUEUE SERVICE LOGIC
    // Test 1: First Post with intervalMinutes
    console.log('\n--- TEST 1: First Post with Delay ---');
    let userIntervalMs = 5 * 60000;
    
    // First post has no lastScheduledPost
    let baseTime = new Date();
    // Simulate what queue.service.js would do
    let totalDelay = userIntervalMs; 
    let requestedTime1 = new Date(baseTime.getTime() + totalDelay);
    
    console.log('Base Time (Now):', baseTime.toISOString());
    console.log('Requested Time (First Post):', requestedTime1.toISOString());
    
    const result1 = await resolvePostingSchedule({
        userId,
        profileId,
        requestedTime: requestedTime1,
        isQuickPost: false
    });
    
    console.log('Resolved Time (First Post):', result1.scheduledTime.toISOString());
    console.log('Action:', result1.action);
    console.log('Was Adjusted:', result1.wasAdjusted);
    
    // Save to DB so Test 2 can see it
    await Posting.create({
        vehicleId,
        userId,
        orgId,
        profileId,
        status: 'scheduled',
        scheduledTime: result1.scheduledTime
    });
    
    // Test 2: Quick Post immediately after
    console.log('\n--- TEST 2: Second Post (Quick Post) ---');
    let requestedTime2 = new Date();
    console.log('Requested Time (Second Post):', requestedTime2.toISOString());
    
    const result2 = await resolvePostingSchedule({
        userId,
        profileId,
        requestedTime: requestedTime2,
        isQuickPost: true
    });
    
    console.log('Resolved Time (Second Post):', result2.scheduledTime.toISOString());
    console.log('Action:', result2.action);
    console.log('Was Adjusted:', result2.wasAdjusted);
    
    // Verify constraints
    const diffMs = result2.scheduledTime.getTime() - result1.scheduledTime.getTime();
    if (diffMs < 5 * 60000 && diffMs > -5 * 60000) {
        console.error('ERROR: Gap is less than 5 minutes!');
    } else {
        console.log('SUCCESS: Profile Occupancy Respected. Gap is', diffMs / 60000, 'minutes.');
    }
}

runTest().catch(console.error);
