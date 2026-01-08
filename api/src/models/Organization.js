import mongoose from 'mongoose';

const organizationSchema = mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        slug: {
            type: String,
            required: true,
            unique: true,
        },
        settings: {
            aiProvider: {
                type: String,
                default: 'gemini',
            },
            geminiApiKey: String,
            openaiApiKey: String,
            scrapingConfig: {
                type: Map,
                of: String,
            },
            postingLimits: {
                daily: { type: Number, default: 50 },
            },
            gpsLocation: {
                latitude: { type: Number, default: 25.2048 }, // Default Dubai
                longitude: { type: Number, default: 55.2708 },
                city: { type: String, default: 'Dubai' },
                country: { type: String, default: 'UAE' }
            },
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
        },
        maxAgents: {
            type: Number,
            default: 10,
        },
        apiKey: {
            type: String,
            unique: true,
            sparse: true,
        },
        apiKeyStatus: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
        },
        subscriptionDuration: {
            type: String,
            enum: ['7-days', '14-days', 'lifetime'],
            default: 'lifetime',
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

const Organization = mongoose.model('Organization', organizationSchema);

export default Organization;
