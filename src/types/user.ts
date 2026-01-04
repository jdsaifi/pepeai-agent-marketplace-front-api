// export interface IUser {
//     _id: string;
//     name: string;
//     email: string;
//     password: string;
//     role: 'user' | 'admin';
//     createdAt: Date;
//     updatedAt: Date;
// }

// export interface IUserDocument extends IUser, Document {}

// types/user.ts
import { Document, Types } from 'mongoose';

export interface IUserConnections {
    telegram?: {
        userId?: string;
        username?: string;
        connectedAt?: Date;
    };
}

export interface IUserUsage {
    totalMessages: number;
    totalTokens: number;
    lastActiveAt?: Date;
}

export interface IUserLimits {
    maxMessagesPerDay: number;
    maxAgents: number;
}

export interface IUserSubscription {
    plan: 'free' | 'pro' | 'enterprise';
    expiresAt?: Date;
}

export interface IUser {
    name: string;
    email: string;
    password: string;
    role: 'user' | 'admin';
    avatar?: {
        url?: string;
        publicId?: string;
    };
    connections?: IUserConnections;
    usage?: IUserUsage;
    limits?: IUserLimits;
    subscription?: IUserSubscription;
    status: 'active' | 'suspended' | 'deleted';
    createdAt: Date;
    updatedAt: Date;
}

export interface IUserDocument extends IUser, Document {
    _id: Types.ObjectId;
    comparePassword(candidatePassword: string): Promise<boolean>;
}
