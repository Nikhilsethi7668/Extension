import mongoose from 'mongoose';
import Posting from './src/models/posting.model.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const posts = await Posting.find({}).sort({ createdAt: -1 }).limit(3);
    for (const p of posts) {
        console.log(`ID: ${p._id}, Message: ${p.message}`);
    }
    process.exit(0);
});
