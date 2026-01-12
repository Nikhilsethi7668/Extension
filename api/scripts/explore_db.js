
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import util from 'util';

// Load env
dotenv.config();

// Configuration
const MONGO_URI = process.env.MONGO_URI || 'mongodb://extension:Password1234@45.137.194.145:27017/facebookmark?authSource=admin';

async function exploreDatabase() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        console.log(`Target: ${MONGO_URI.replace(/:([^:@]+)@/, ':****@')}`); // Hide password in logs

        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected successfully!');

        const admin = mongoose.connection.db.admin();

        // 1. List Databases
        console.log('\n📂 DATABASES:');
        const dbs = await admin.listDatabases();
        dbs.databases.forEach(db => console.log(` - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`));

        // 2. List Collections in current DB
        console.log(`\n📑 COLLECTIONS in '${mongoose.connection.db.databaseName}':`);
        const collections = await mongoose.connection.db.listCollections().toArray();

        for (const col of collections) {
            const count = await mongoose.connection.db.collection(col.name).countDocuments();
            console.log(` - ${col.name} (${count} documents)`);
        }

        // 3. Inspect Schemas (Sample Data)
        console.log('\n🔍 SAMPLE DATA (First document from each collection):');
        for (const col of collections) {
            // Skip system collections if needed
            if (col.name.startsWith('system.')) continue;

            const sample = await mongoose.connection.db.collection(col.name).findOne({});
            if (sample) {
                console.log(`\n--- [${col.name}] Sample ---`);
                // Print keys only to show schema structure
                console.log(util.inspect(sample, { showHidden: false, depth: 1, colors: true }));
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.cause) console.error('Cause:', error.cause);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected.');
    }
}

exploreDatabase();
