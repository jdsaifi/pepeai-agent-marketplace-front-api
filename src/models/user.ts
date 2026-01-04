import { Schema, model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUserDocument } from '../types/user';

const userSchema = new Schema<IUserDocument>(
    {
        name: { type: String, required: true },
        email: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        role: {
            type: String,
            enum: ['user', 'admin'],
            default: 'user',
        },

        // Profile
        avatar: {
            url: String,
            publicId: String,
        },

        // Platform connections (for Telegram, etc.)
        connections: {
            telegram: {
                userId: String,
                username: String,
                connectedAt: Date,
            },
        },

        // Usage & Limits
        usage: {
            totalMessages: { type: Number, default: 0 },
            totalTokens: { type: Number, default: 0 },
            lastActiveAt: Date,
        },
        limits: {
            maxMessagesPerDay: { type: Number, default: 100 },
            maxAgents: { type: Number, default: 5 }, // for creators
        },

        // Subscription (if you add paid tiers later)
        subscription: {
            plan: {
                type: String,
                enum: ['free', 'pro', 'enterprise'],
                default: 'free',
            },
            expiresAt: Date,
        },

        // Status
        status: {
            type: String,
            enum: ['active', 'suspended', 'deleted'],
            default: 'active',
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (_: any, ret: any) => {
                delete (ret as any).password;
                return ret;
            },
        },
        toObject: {
            virtuals: true,
        },
    }
);

/*
 * Pre-save hook to hash password
 */
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 10);
});

// Compare password method
userSchema.methods.comparePassword = async function (
    candidatePassword: string
): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
};

// Virtual for user's agents
userSchema.virtual('agents', {
    ref: 'Agent',
    localField: '_id',
    foreignField: 'createdBy',
});

export const UserModel = model<IUserDocument>('User', userSchema, 'users');
