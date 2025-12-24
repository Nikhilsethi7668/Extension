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
    },
    {
        timestamps: true,
    }
);

const Organization = mongoose.model('Organization', organizationSchema);

export default Organization;
