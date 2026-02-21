
import mongoose from 'mongoose';
import User from './src/models/User.js';
import Organization from './src/models/Organization.js';

(async () => {
    try {
        console.log('Connecting to MongoDB...');
        // Use MONGODB_URI from env, or default to mongo container name
        const uri = process.env.MONGODB_URI || 'mongodb://mongo:27017/flash-fender';
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        const email = 'admin@flashfender.com';
        console.log('Admin Email: ', email);
        const password = 'Admin123!';
        const name = 'Admin User';

        let user = await User.findOne({ email });

        if (user) {
            console.log('User found, updating password...');
            user.password = password;
            await user.save();
            console.log('Password updated successfully.');
        } else {
            console.log('User not found, creating new admin...');

            // Ensure organization exists
            let org = await Organization.findOne({ name: 'Flash Fender Admin' });
            if (!org) {
                console.log('Creating Admin Organization...');
                org = await Organization.create({
                    name: 'Flash Fender Admin',
                    slug: 'flash-fender-admin',
                    email: 'admin@flashfender.com',
                    subscriptionDuration: 'lifetime',
                    maxAgents: 100,
                    status: 'active'
                });
            }

            user = await User.create({
                name,
                email,
                password,
                role: 'super_admin',
                organization: org._id,
                status: 'active'
            });
            console.log('Admin user created successfully.');
        }
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
})();
