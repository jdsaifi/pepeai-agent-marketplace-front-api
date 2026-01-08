// models/Job.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IJob {
    jobId: string;
    knowledgeBaseId: Types.ObjectId;
    agentId: Types.ObjectId;
    userId: Types.ObjectId;
    type: 'parse' | 'chunk' | 'embed';
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
    progress: number;
    attempt: number;
    maxAttempts: number;
    payload: Record<string, any>;
    result?: Record<string, any>;
    error?: {
        message: string;
        code?: string;
        stack?: string;
    };
    startedAt?: Date;
    completedAt?: Date;
    processingTime?: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface IJobDocument extends IJob, Document {
    _id: Types.ObjectId;
}

const jobSchema = new Schema<IJobDocument>(
    {
        jobId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        knowledgeBaseId: {
            type: Schema.Types.ObjectId,
            ref: 'KnowledgeBase',
            required: true,
            index: true,
        },
        agentId: {
            type: Schema.Types.ObjectId,
            ref: 'Agent',
            required: true,
            index: true,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        type: {
            type: String,
            enum: ['parse', 'chunk', 'embed', 'uploaded'],
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed', 'retrying'],
            default: 'pending',
        },
        progress: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        attempt: {
            type: Number,
            default: 1,
        },
        maxAttempts: {
            type: Number,
            default: 3,
        },
        payload: {
            type: Schema.Types.Mixed,
            required: true,
        },
        result: Schema.Types.Mixed,
        error: {
            message: String,
            code: String,
            stack: String,
        },
        startedAt: Date,
        completedAt: Date,
        processingTime: Number,
    },
    {
        timestamps: true,
    }
);

// Compound indexes
jobSchema.index({ knowledgeBaseId: 1, type: 1 });
jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ agentId: 1, status: 1 });

export const JobModel = model<IJobDocument>('Job', jobSchema, 'jobs');
