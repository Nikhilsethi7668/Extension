import mongoose from 'mongoose';

const vehicleSchema = mongoose.Schema(
    {
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: true,
        },
        assignedUsers: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        }],
        /* Deprecated: assignedUser */
        vin: {
            type: String,
            // unique: true, // REMOVED: Replaced by compound index below
            sparse: true,
            validate: {
                validator: function(v) {
                    return !v || /^[A-Z0-9]{17}$/.test(v);
                },
                message: props => `${props.value} is not a valid 17-character alphanumeric VIN!`
            }
        },
        year: { type: Number, min: 0 },
        make: { type: String, maxlength: 15 },
        model: { type: String, maxlength: 10 },
        trim: String,
        price: { type: Number, min: 0 },
        mileage: { type: Number, min: 0 },
        location: String,
        description: {
            type: String,
            validate: {
                validator: function(v) {
                    return !v || v.trim().split(/\s+/).length <= 100;
                },
                message: 'Description exceeds the maximum limit of 100 words.'
            }
        },
        images: [String], // URLs to images
        aiImages: [String], // URLs to AI processed images
        sourceUrl: String,
        imageSource: String, // 'api_standard', 'api_deep_search', 'puppeteer_fallback'
        fuelType: String,
        condition: String, // New/Used
        transmission: String,
        exteriorColor: { type: String, maxlength: 20 },
        interiorColor: { type: String, maxlength: 20 },
        bodyStyle: String,
        drivetrain: String,
        engine: String,
        engineSize: String,
        doors: Number,
        passengers: Number,
        stockNumber: String,
        cityFuel: String,
        hwyFuel: String,
        specialPrice: Number,
        msrp: Number,
        features: [String], // Vehicle features from detail API
        engineCylinders: String,
        carfaxLink: String,
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
        // Isolated AI content per user
        userAIContent: [{
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            aiImages: [String], // User-specific AI images list
            imageMappings: [{   // Map original URL to processed URL for replacement
                originalUrl: String,
                processedUrl: String
            }],
            aiContent: {        // User-specific AI text
                title: String,
                description: String,
                lastGenerated: Date
            },
            updatedAt: { type: Date, default: Date.now }
        }],
        postingHistory: [
            {
                userId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                },
                platform: { type: String, default: 'facebook_marketplace' },
                listingUrl: String,
                action: String, // 'post', 'repost', 'renew'
                agentName: String,
                profileId: String, // Chrome Profile ID used for posting
                timestamp: { type: Date, default: Date.now },
            },
        ],
        // Marketplace-ready images (processed with humanized metadata)
        preparedImages: [String],
        preparationStatus: {
            type: String,
            enum: ['pending', 'processing', 'ready', 'failed'],
            default: 'pending',
        },
        lastPreparedAt: Date,
        preparationMetadata: {
            camera: String,
            software: String,
            gpsLocation: {
                latitude: Number,
                longitude: Number,
            },
        },
    },
    {
        timestamps: true,
    }
);

// Compound Index: Unique VIN per Organization
vehicleSchema.index({ organization: 1, vin: 1 }, { unique: true, sparse: true });

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

// Sync indexes to ensure old unique index is removed and new one is added
// Note: This operation can be resource intensive on large datasets but is necessary for this migration.
// Usage: Check if run in a production environment before auto-syncing if data is massive.
Vehicle.syncIndexes().then(() => {
    console.log('Vehicle Indexes Synced');
}).catch(err => {
    console.error('Vehicle Index Sync Error:', err);
});

export default Vehicle;
