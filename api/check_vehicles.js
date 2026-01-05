import mongoose from 'mongoose';
import Vehicle from './src/models/Vehicle.js';

const vins = ['WBA5R7C57KAJ87730', 'SALZP2FX5LH021881'];

mongoose.connect('mongodb://localhost:27017/facebookmark')
    .then(async () => {
        console.log('Connected to MongoDB\n');

        for (const vin of vins) {
            const vehicle = await Vehicle.findOne({ vin }).lean();

            if (vehicle) {
                console.log(`\n========== VIN: ${vin} ==========`);
                console.log(`Year/Make/Model: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
                console.log(`Source URL: ${vehicle.sourceUrl}`);
                console.log(`Stock#: ${vehicle.stockNumber}`);
                console.log(`Price: $${vehicle.price}`);
                console.log(`Mileage: ${vehicle.mileage}`);
                console.log(`\nColors:`);
                console.log(`  Exterior: ${vehicle.exteriorColor || 'NOT SET'}`);
                console.log(`  Interior: ${vehicle.interiorColor || 'NOT SET'}`);
                console.log(`\nImages: ${vehicle.images?.length || 0} images`);
                if (vehicle.images && vehicle.images.length > 0) {
                    vehicle.images.forEach((img, i) => console.log(`  ${i + 1}. ${img}`));
                }
                console.log(`\nFeatures: ${vehicle.features?.length || 0} features`);
                if (vehicle.features && vehicle.features.length > 0) {
                    console.log(`  First 5: ${vehicle.features.slice(0, 5).join(', ')}`);
                }
                console.log(`\nDescription: ${vehicle.description ? vehicle.description.substring(0, 100) + '...' : 'NOT SET'}`);
                console.log(`\nOther fields:`);
                console.log(`  Transmission: ${vehicle.transmission || 'NOT SET'}`);
                console.log(`  Drivetrain: ${vehicle.drivetrain || 'NOT SET'}`);
                console.log(`  Body Style: ${vehicle.bodyStyle || 'NOT SET'}`);
                console.log(`  Fuel Type: ${vehicle.fuelType || 'NOT SET'}`);
                console.log(`  Engine: ${vehicle.engine || 'NOT SET'}`);
                console.log(`  Engine Size: ${vehicle.engineSize || 'NOT SET'}`);
            } else {
                console.log(`\n❌ VIN ${vin} NOT FOUND in database`);
            }
        }

        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
