import mongoose from 'mongoose';
import Vehicle from './src/models/Vehicle.js';

mongoose.connect('mongodb://localhost:27017/facebookmark')
    .then(async () => {
        console.log('Connected to MongoDB\n');

        // Get recent 15 vehicles
        const vehicles = await Vehicle.find({})
            .sort({ createdAt: -1 })
            .limit(15)
            .lean();

        console.log(`Total vehicles in database: ${await Vehicle.countDocuments({})}\n`);
        console.log(`Recent 15 vehicles:\n`);

        vehicles.forEach((v, i) => {
            console.log(`${i + 1}. ${v.year} ${v.make} ${v.model}`);
            console.log(`   VIN: ${v.vin}`);
            console.log(`   Images: ${v.images?.length || 0}`);
            console.log(`   Features: ${v.features?.length || 0}`);
            console.log(`   Exterior Color: ${v.exteriorColor || 'NOT SET'}`);
            console.log(`   Interior Color: ${v.interiorColor || 'NOT SET'}`);
            console.log(`   Source: ${v.sourceUrl}`);
            console.log('');
        });

        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
