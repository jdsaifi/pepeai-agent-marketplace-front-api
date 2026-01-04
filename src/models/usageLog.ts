// models/UsageLog.js - For billing & analytics
import { Schema, model } from 'mongoose';
import { IUsageLogDocument } from '../types/usage';

const usageLogSchema = new Schema<IUsageLogDocument>(
    {
        // What
        agentId: {
            type: Schema.Types.ObjectId,
            ref: 'Agent',
            required: true,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        conversationId: {
            type: Schema.Types.ObjectId,
            ref: 'Conversation',
        },
        messageId: {
            type: Schema.Types.ObjectId,
            ref: 'Message',
        },

        // Usage Type
        type: {
            type: String,
            enum: ['llm_call', 'embedding', 'retrieval', 'tool_call'],
            required: true,
        },

        // LLM Usage
        llm: {
            provider: String,
            model: String,
            promptTokens: Number,
            completionTokens: Number,
            totalTokens: Number,
        },

        // Embedding Usage
        embedding: {
            model: String,
            tokenCount: Number,
            chunkCount: Number,
        },

        // Costs
        cost: {
            amount: Number, // in USD cents
            currency: { type: String, default: 'USD' },
        },

        // Timing
        latency: Number,

        // Date bucketing for aggregation
        date: {
            type: Date,
            default: () => new Date().setHours(0, 0, 0, 0),
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
        },
        toObject: {
            virtuals: true,
        },
    }
);

// Indexes for analytics queries
usageLogSchema.index({ agentId: 1, date: 1 });
usageLogSchema.index({ userId: 1, date: 1 });
usageLogSchema.index({ date: 1, type: 1 });

// Static method for daily aggregation
usageLogSchema.statics.getDailyStats = async function (
    agentId: string,
    startDate: string,
    endDate: string
) {
    return this.aggregate([
        {
            $match: {
                agentId: new Schema.Types.ObjectId(agentId),
                date: { $gte: startDate, $lte: endDate },
            },
        },
        {
            $group: {
                _id: { date: '$date', type: '$type' },
                totalTokens: { $sum: '$llm.totalTokens' },
                totalCost: { $sum: '$cost.amount' },
                count: { $sum: 1 },
            },
        },
        { $sort: { '_id.date': 1 } },
    ]);
};

export const UsageLogModel = model<IUsageLogDocument>(
    'UsageLog',
    usageLogSchema,
    'usageLogs'
);
