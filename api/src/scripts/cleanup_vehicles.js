import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Vehicle from '../models/Vehicle.js';
import connectDB from '../config/db.js';

dotenv.config();

const cleanupVehicles = async () => {
    try {
        await connectDB();
        console.log('Connected to DB...');

        // Delete vehicles that have:
        // 1. Empty VIN string ""
        // 2. OR sourceURL that is just a generic homepage (basic check)
        // 3. OR Null price AND Default description (strong indicator of bad scrape)

        const result = await Vehicle.deleteMany({
            $or: [
                { vin: "" },
                { vin: null },
                { sourceUrl: "https://www.autotrader.com/" },
                { sourceUrl: "https://www.cars.com/" },
                { sourceUrl: "https://www.cargurus.com/" },
                { price: null }
            ]
        });

        console.log(`Deleted ${result.deletedCount} invalid vehicle records.`);
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

cleanupVehicles();
