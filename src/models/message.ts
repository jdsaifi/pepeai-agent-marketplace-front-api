// models/Message.js
import mongoose, { Schema, model } from 'mongoose';
import { IMessageDocument } from '../types/message';

const messageSchema = new Schema<IMessageDocument>(
    {
        // References
        conversationId: {
            type: Schema.Types.ObjectId,
            ref: 'Conversation',
            required: true,
            index: true,
        },
        agentId: {
            type: Schema.Types.ObjectId,
            ref: 'Agent',
            required: true,
            index: true,
        },

        // Message Content
        role: {
            type: String,
            enum: ['user', 'assistant', 'system'],
            required: true,
        },
        content: {
            type: String,
            required: true,
        },

        // For Rich Content
        messageContentType: {
            type: String,
            enum: ['text', 'image', 'audio', 'file', 'mixed'],
            default: 'text',
        },
        attachments: [
            {
                type: {
                    type: String,
                    enum: ['image', 'audio', 'file', 'voice'],
                },
                url: String,
                mimeType: String,
                fileName: String,
                size: Number,
                // For voice messages
                duration: Number,
                transcription: String,
            },
        ],

        // RAG Context (what knowledge was used)
        ragContext: {
            used: { type: Boolean, default: false },
            chunks: [
                {
                    kbId: mongoose.Schema.Types.ObjectId,
                    chunkId: String,
                    content: String,
                    score: Number,
                    source: String,
                },
            ],
            searchQuery: String,
            retrievalTime: Number, // ms
        },

        // LLM Details
        llm: {
            model: String,
            promptTokens: Number,
            completionTokens: Number,
            totalTokens: Number,
            latency: Number, // ms for response
            finishReason: String, // 'stop', 'length', 'tool_calls'
            cost: Number, // in USD cents
        },

        // Tool/Function Calls (for agentic features)
        toolCalls: [
            {
                id: String,
                name: String,
                arguments: mongoose.Schema.Types.Mixed,
                result: mongoose.Schema.Types.Mixed,
                status: {
                    type: String,
                    enum: ['pending', 'success', 'error'],
                },
            },
        ],

        // Message Status
        status: {
            type: String,
            enum: ['sending', 'sent', 'delivered', 'read', 'failed'],
            default: 'sent',
        },
        error: {
            code: String,
            message: String,
        },

        // Feedback on specific message
        feedback: {
            type: {
                type: String,
                enum: ['positive', 'negative', 'report'],
            },
            reason: String,
            comment: String,
        },

        // Versioning (for edits/regenerations)
        version: { type: Number, default: 1 },
        parentMessageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
        },
        isRegenerated: { type: Boolean, default: false },

        // Platform specific
        platformMessageId: String, // Telegram message_id, etc.

        // Soft delete
        isDeleted: { type: Boolean, default: false },
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

// Indexes
messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ conversationId: 1, role: 1 });
messageSchema.index({ agentId: 1, createdAt: -1 });
messageSchema.index({ 'feedback.type': 1 }, { sparse: true });

// Post-save hook to update conversation stats
messageSchema.post('save', async function () {
    const Conversation = model('Conversation');

    const updateData = {
        lastMessageAt: this.createdAt,
        $inc: {
            'stats.messageCount': 1,
            'stats.totalTokens': this.llm?.totalTokens || 0,
            'stats.promptTokens': this.llm?.promptTokens || 0,
            'stats.completionTokens': this.llm?.completionTokens || 0,
            'stats.estimatedCost': this.llm?.cost || 0,
        },
    };

    if (this.role === 'user') {
        (updateData.$inc as any)['stats.userMessageCount'] = 1;
    } else if (this.role === 'assistant') {
        (updateData.$inc as any)['stats.assistantMessageCount'] = 1;
    }

    await Conversation.findByIdAndUpdate(this.conversationId, updateData);
});

export const MessageModel = model<IMessageDocument>(
    'Message',
    messageSchema,
    'messages'
);
