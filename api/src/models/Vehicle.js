import mongoose from 'mongoose';

const vehicleSchema = mongoose.Schema(
    {
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: true,
        },
        assignedUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        vin: {
            type: String,
            unique: true,
            sparse: true,
        },
        year: Number,
        make: String,
        model: String,
        trim: String,
        price: Number,
        mileage: Number,
        location: String,
        description: String,
        images: [String], // URLs to images
        sourceUrl: String,
        fuelType: String,
        condition: String, // New/Used
        transmission: String,
        exteriorColor: String,
        interiorColor: String,
        bodyStyle: String,
        status: {
            type: String,
            enum: ['available', 'posted', 'sold_pending_removal', 'sold'],
            default: 'available',
        },
        aiContent: {
            title: String,
            description: String,
            lastGenerated: Date,
        },
        postingHistory: [
            {
                platform: { type: String, default: 'facebook_marketplace' },
                listingUrl: String,
                action: String, // 'post', 'repost', 'renew'
                agentName: String,
                timestamp: { type: Date, default: Date.now },
            },
        ],
    },
    {
        timestamps: true,
    }
);

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

export default Vehicle;
