// models/Conversation.js
import { Schema, model } from 'mongoose';
import { IConversationDocument } from '../types/conversation';

const conversationSchema = new Schema<IConversationDocument>(
    {
        // References
        agentId: {
            type: Schema.Types.ObjectId,
            ref: 'Agent',
            required: true,
            index: true,
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            index: true,
        },

        // Platform & Session Info
        platform: {
            type: String,
            enum: ['web', 'telegram', 'api', 'embed', 'whatsapp'],
            required: true,
        },
        platformMeta: {
            // Telegram specific
            telegramChatId: String,
            telegramUserId: String,
            telegramUsername: String,
            // Web specific
            sessionId: String,
            ipAddress: String,
            userAgent: String,
            // Embed specific
            embedDomain: String,
        },

        // Conversation State
        status: {
            type: String,
            enum: ['active', 'archived', 'deleted'],
            default: 'active',
        },
        title: {
            type: String,
            maxlength: 200,
        },

        // For Long Conversations - Context Management
        context: {
            summary: String, // AI-generated summary of conversation
            summaryUpdatedAt: Date,
            keyPoints: [String], // Extracted key information
            lastSummarizedAt: Date,
            messageCountAtSummary: Number,
        },

        // Usage Statistics
        stats: {
            messageCount: { type: Number, default: 0 },
            userMessageCount: { type: Number, default: 0 },
            assistantMessageCount: { type: Number, default: 0 },
            totalTokens: { type: Number, default: 0 },
            promptTokens: { type: Number, default: 0 },
            completionTokens: { type: Number, default: 0 },
            estimatedCost: { type: Number, default: 0 }, // in USD cents
        },

        // Timing
        lastMessageAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
        firstMessageAt: Date,

        // Feedback & Rating
        feedback: {
            rating: { type: Number, min: 1, max: 5 },
            comment: String,
            ratedAt: Date,
        },

        // Tags & Organization
        tags: [String],
        metadata: {
            type: Map,
            of: Schema.Types.Mixed,
        },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
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

// Compound Indexes
conversationSchema.index({ agentId: 1, user: 1, lastMessageAt: -1 });
conversationSchema.index({ agentId: 1, status: 1, lastMessageAt: -1 });
conversationSchema.index(
    { 'platformMeta.telegramChatId': 1 },
    { sparse: true }
);
conversationSchema.index({ user: 1, lastMessageAt: -1 });

// Auto-generate title from first message if not set
conversationSchema.methods.generateTitle = async function () {
    if (!this.title) {
        const Message = model('Message');
        const firstUserMsg = await Message.findOne({
            conversationId: this._id,
            role: 'user',
        }).sort({ createdAt: 1 });

        if (firstUserMsg) {
            this.title =
                firstUserMsg.content.substring(0, 100) +
                (firstUserMsg.content.length > 100 ? '...' : '');
            await this.save();
        }
    }
    return this.title;
};

export const ConversationModel = model<IConversationDocument>(
    'Conversation',
    conversationSchema,
    'conversations'
);
