import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Posting from './src/models/posting.model.js';

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/facebookmark').then(async () => {
    const lastPosting = await Posting.findOne().sort({ createdAt: -1 });
    console.log("Last Posting ID:", lastPosting._id);
    console.log("Vehicle ID:", lastPosting.vehicleId);
    console.log("Status:", lastPosting.status);
    console.log("Selected Images Length:", lastPosting.selectedImages?.length);
    console.log("Logs:", JSON.stringify(lastPosting.logs, null, 2));
    process.exit(0);
});
