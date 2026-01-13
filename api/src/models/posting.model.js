import mongoose from 'mongoose';

const postingSchema = new mongoose.Schema({
    vehicleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vehicle',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true
    },
    profileId: {
        type: String,
        required: false, // Optional for now, but used if selected
        default: null
    },
    status: {
        type: String,
        enum: ['queued', 'processing', 'completed', 'failed', 'timeout'],
        default: 'queued'
    },
    jobId: {
        type: String // BullMQ Job ID
    },
    startedAt: {
        type: Date
    },
    completedAt: {
        type: Date
    },
    error: {
        type: String
    },
    logs: [{
        message: String,
        timestamp: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true
});

// Index for finding active postings for a user/org
postingSchema.index({ orgId: 1, status: 1 });
postingSchema.index({ userId: 1, status: 1 });

const Posting = mongoose.model('Posting', postingSchema);

export default Posting;
