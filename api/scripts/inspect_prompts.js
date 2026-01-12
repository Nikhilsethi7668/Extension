
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const MONGO_URI = 'mongodb://extension:Password1234@45.137.194.145:27017/facebookmark?authSource=admin';

async function inspectPrompts() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('Connected!');

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));

        // specific check for Prompts
        for (const col of collections) {
            if (col.name.toLowerCase().includes('prompt') || col.name.toLowerCase().includes('instruction')) {
                console.log(`\n--- Inspecting ${col.name} ---`);
                const data = await mongoose.connection.db.collection(col.name).find({}).limit(5).toArray();
                console.log(JSON.stringify(data, null, 2));
            }
        }

        // Check Organization settings for any prompt config
        console.log('\n--- Inspecting Organizations for Settings.prompt ---');
        const orgs = await mongoose.connection.db.collection('organizations').find({}).limit(1).toArray();
        if (orgs.length > 0) {
            console.log(JSON.stringify(orgs[0], null, 2));
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

inspectPrompts();
