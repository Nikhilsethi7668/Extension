import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
    try {
        // Use MONGO_URI directly from environment
        const mongoUri = process.env.MONGO_URI;
        console.log(`[DB] Attempting to connect to MongoDB...`);
        console.log(`[DB] Connection string: ${mongoUri.replace(/:[^:]*@/, ':****@')}`); // Hide password
        
        const conn = await mongoose.connect(mongoUri);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        process.exit(1);
    }
};

export default connectDB;
