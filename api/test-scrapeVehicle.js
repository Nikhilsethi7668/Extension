import { scrapeVehicle } from './src/services/scraper.service.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
    // We don't necessarily need DB connection if we're just testing the extraction logic, 
    // but let's see.
    const url = 'https://www.brownboysauto.com/cars/used/2023-Honda-Civic-579589';
    try {
        const result = await scrapeVehicle(url);
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
})();
