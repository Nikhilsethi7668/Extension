import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Posting from './src/models/posting.model.js';
import Vehicle from './src/models/Vehicle.js';

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/facebookmark').then(async () => {
    const lastPosting = await Posting.findOne().sort({ createdAt: -1 });
    const vehicle = await Vehicle.findById(lastPosting.vehicleId);
    console.log("Selected Images:", JSON.stringify(lastPosting.selectedImages, null, 2));
    process.exit(0);
});
