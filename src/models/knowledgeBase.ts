import mongoose, { Schema, model } from 'mongoose';
import { IKnowledgeBaseDocument } from '../types/kb';

const knowledgeBaseSchema = new Schema<IKnowledgeBaseDocument>(
    {
        // Reference to Agent
        agentId: {
            type: Schema.Types.ObjectId,
            ref: 'Agent',
            required: true,
            index: true,
        },

        // Source Information
        sourceType: {
            type: String,
            enum: [
                'pdf',
                'doc',
                'docx',
                'txt',
                'url',
                'sitemap',
                'manual',
                'csv',
                'json',
            ],
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: String,

        // Original File Details (for uploads)
        file: {
            originalName: String,
            mimeType: String,
            size: Number, // in bytes
            storageKey: String, // S3/storage path
            storageUrl: String,
            checksum: String, // for duplicate detection
        },

        // URL Details (for web sources)
        url: {
            original: String,
            canonical: String,
            domain: String,
            lastCrawledAt: Date,
            crawlFrequency: {
                type: String,
                enum: ['once', 'daily', 'weekly', 'monthly'],
                default: 'once',
            },
        },

        // Manual Content (for text input)
        manualContent: {
            text: String,
            title: String,
        },

        // Processing Status
        processing: {
            status: {
                type: String,
                enum: [
                    'pending',
                    'uploading',
                    'processing',
                    'chunking',
                    'embedding',
                    'completed',
                    'failed',
                ],
                default: 'pending',
            },
            progress: {
                type: Number,
                default: 0,
                min: 0,
                max: 100,
            },
            startedAt: Date,
            completedAt: Date,
            error: {
                message: String,
                code: String,
                occurredAt: Date,
                retryCount: { type: Number, default: 0 },
            },
        },

        // Chunking Results
        chunking: {
            strategy: {
                type: String,
                enum: ['fixed', 'semantic', 'paragraph', 'sentence'],
                default: 'fixed',
            },
            chunkSize: Number,
            chunkOverlap: Number,
            totalChunks: { type: Number, default: 0 },
            totalCharacters: { type: Number, default: 0 },
            totalTokens: { type: Number, default: 0 },
        },

        // Embedding Status
        embedding: {
            model: {
                type: String,
                default: 'text-embedding-3-small',
            },
            dimensions: Number,
            vectorDbCollection: String, // collection/index name in vector DB
            embeddedAt: Date,
        },

        // Content Metadata (extracted after processing)
        metadata: {
            title: String,
            author: String,
            pageCount: Number,
            language: String,
            keywords: [String],
            summary: String, // AI-generated summary
            extractedAt: Date,
        },

        // Access & Versioning
        version: {
            type: Number,
            default: 1,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        priority: {
            type: Number,
            default: 0, // higher = more relevant in RAG
        },

        // Ownership
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
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

// Compound Indexes
knowledgeBaseSchema.index({ agentId: 1, 'processing.status': 1 });
knowledgeBaseSchema.index({ agentId: 1, isActive: 1 });
knowledgeBaseSchema.index({ 'sourceFile.checksum': 1 }); // duplicate detection
knowledgeBaseSchema.index({ 'sourceUrl.domain': 1 });

// Pre-save middleware to update agent's kbStatus
knowledgeBaseSchema.post('save', async function () {
    const Agent = mongoose.model('Agent');
    const stats = await mongoose.model('KnowledgeBase').aggregate([
        { $match: { agentId: this.agentId, isActive: true } },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                processed: {
                    $sum: {
                        $cond: [
                            { $eq: ['$processing.status', 'completed'] },
                            1,
                            0,
                        ],
                    },
                },
                totalChunks: { $sum: '$chunking.totalChunks' },
            },
        },
    ]);

    if (stats.length > 0) {
        await Agent.findByIdAndUpdate(this.agentId, {
            'kbStatus.totalDocuments': stats[0].total,
            'kbStatus.processedDocuments': stats[0].processed,
            'kbStatus.totalChunks': stats[0].totalChunks,
            'kbStatus.lastProcessedAt': new Date(),
        });
    }
});

export const KnowledgeBaseModel: mongoose.Model<IKnowledgeBaseDocument> =
    model<IKnowledgeBaseDocument>(
        'KnowledgeBase',
        knowledgeBaseSchema,
        'knowledgeBases'
    );
