import { Schema, model } from 'mongoose';
import { IAgentDocument } from '../types/agent';
import Helpers from '../lib/helpers';
import { ddl } from '../lib/dd';

const agentSchema = new Schema<IAgentDocument>(
    {
        name: { type: String, required: true },
        slug: { type: String, required: true },
        description: { type: String, required: true },
        category: {
            type: String,
            enum: [
                'religious',
                'location',
                'education',
                'entertainment',
                'lifestyle',
                'business',
                'other',
            ],
            default: 'other',
        },
        persona: { type: String, required: false },
        tags: { type: [String], required: false },
        // Avatar & Branding
        avatar: {
            url: String,
            publicId: String, // for cloudinary or s3
        },
        themeColor: {
            type: String,
            default: '#6366f1',
        },

        // LLM Configuration
        llmConfig: {
            provider: {
                type: String,
                enum: ['openai', 'anthropic', 'google'],
                default: 'openai',
            },
            model: {
                type: String,
                default: 'gpt-4o-mini',
            },
            temperature: {
                type: Number,
                default: 0.7,
                min: 0,
                max: 2,
            },
            maxTokens: {
                type: Number,
                default: 1024,
            },
        },

        // Personality & Behavior
        systemPrompt: {
            type: String,
            required: true,
            maxlength: 10000,
        },
        welcomeMessage: {
            type: String,
            maxlength: 1000,
        },
        personality: {
            tone: {
                type: String,
                enum: [
                    'formal',
                    'casual',
                    'friendly',
                    'professional',
                    'playful',
                ],
                default: 'friendly',
            },
            responseStyle: {
                type: String,
                enum: ['concise', 'detailed', 'balanced'],
                default: 'balanced',
            },
        },

        // RAG Configuration
        ragConfig: {
            enabled: {
                type: Boolean,
                default: true,
            },
            chunkSize: {
                type: Number,
                default: 1000,
            },
            chunkOverlap: {
                type: Number,
                default: 200,
            },
            topK: {
                type: Number,
                default: 5,
            },
            similarityThreshold: {
                type: Number,
                default: 0.7,
            },
        },

        // Access Control
        visibility: {
            type: String,
            enum: ['public', 'private', 'unlisted'],
            default: 'private',
        },
        allowedUsers: [
            {
                type: Schema.Types.ObjectId,
                ref: 'User',
            },
        ],

        // Usage & Limits
        usage: {
            totalConversations: { type: Number, default: 0 },
            totalMessages: { type: Number, default: 0 },
            totalTokensUsed: { type: Number, default: 0 },
        },
        limits: {
            maxMessagesPerDay: { type: Number, default: 1000 },
            maxTokensPerMessage: { type: Number, default: 4096 },
            rateLimitPerMinute: { type: Number, default: 20 },
        },

        // Status & Metadata
        status: {
            type: String,
            enum: ['draft', 'active', 'paused', 'archived'],
            default: 'draft',
        },
        kbStatus: {
            totalDocuments: { type: Number, default: 0 },
            processedDocuments: { type: Number, default: 0 },
            totalChunks: { type: Number, default: 0 },
            lastProcessedAt: Date,
        },

        followersCount: {
            type: Number,
            default: 0,
        },

        publishedAt: { type: Date, default: null },
        publishedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },

        // Ownership
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        isActive: { type: Boolean, default: true },
        isDeleted: { type: Boolean, default: false },
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

// indexes
agentSchema.index({ slug: 1 }, { unique: true });
agentSchema.index({ user: 1, slug: 1 }, { unique: true });

agentSchema.index({ createdBy: 1, status: 1 });
agentSchema.index({ createdBy: 1, slug: 1 }, { unique: true });
agentSchema.index({ category: 1, visibility: 1 });
// agentSchema.index({ 'integrations.telegram.botUsername': 1 });

// Virtual for knowledge bases
agentSchema.virtual('knowledgeBases', {
    ref: 'KnowledgeBase',
    localField: '_id',
    foreignField: 'agentId',
});

/**
 * Pre-validate hook to generate slug synchronously before validation
 */
agentSchema.pre('validate', function () {
    // Always generate slug if name exists and slug is missing or name is modified
    if (this.name && (!this.slug || this.isModified('name'))) {
        const baseSlug = Helpers.generateSlug(this.name);
        // Set slug synchronously to pass validation
        this.slug = baseSlug;
        ddl('generated slug (validate) ->', this.slug);
    }
});

/**
 * Pre-save hook to check for duplicate slugs and append timestamp if needed
 */
agentSchema.pre('save', async function () {
    // Check if slug already exists and append timestamp if needed
    if (this.slug && this.name && (this.isNew || this.isModified('name'))) {
        const Model = this.constructor as any;
        const query: any = { slug: this.slug };
        // Exclude current document if updating
        if (!this.isNew && this._id) {
            query._id = { $ne: this._id };
        }

        const existingAgent = await Model.findOne(query);
        if (existingAgent) {
            // Regenerate base slug from name to ensure we have the correct base
            const baseSlug = Helpers.generateSlug(this.name);
            const timestamp = Date.now();
            this.slug = `${baseSlug}-${timestamp}`;
            ddl('updated slug with timestamp ->', this.slug);
        }
    }
});

export const AgentModel = model<IAgentDocument>('Agent', agentSchema, 'agents');
