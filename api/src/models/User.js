import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = mongoose.Schema(
    {
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: true,
        },
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
        },
        password: {
            type: String,
            required: function () { return this.role !== 'agent'; }, // Agents might only use API keys
        },
        role: {
            type: String,
            enum: ['super_admin', 'org_admin', 'agent'],
            default: 'agent',
        },
        apiKey: {
            type: String,
            unique: true,
            sparse: true, // Only agents/users who need it will have it
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
        },
        lastLogin: Date,
    },
    {
        timestamps: true,
    }
);

userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        next();
    }

    if (this.password) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }
});

const User = mongoose.model('User', userSchema);

export default User;
