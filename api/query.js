import mongoose from 'mongoose';
import Posting from './src/models/posting.model.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const posts = await Posting.find({}).sort({ createdAt: -1 }).limit(10);
    for (const p of posts) {
        console.log(`ID: ${p._id}, Status: ${p.status}, Created: ${p.createdAt.toISOString()}, Sched: ${p.scheduledTime.toISOString()}, Vehicle: ${p.vehicleId?.make || p.vehicleId}`);
    }
    process.exit(0);
});
