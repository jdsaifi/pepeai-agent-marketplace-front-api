// models/Chunk.ts
import { Schema, model } from 'mongoose';
import { IChunkDocument } from '../types/chunk';

const chunkSchema = new Schema<IChunkDocument>(
    {
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
        chunkIndex: {
            type: Number,
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        charCount: {
            type: Number,
            required: true,
        },
        tokenCount: {
            type: Number,
            required: true,
        },
        metadata: {
            pageNumber: Number,
            section: String,
            header: String,
            startChar: Number,
            endChar: Number,
            source: String,
        },
        // For embedding (will be used later)
        embedding: {
            type: [Number],
            select: false, // Don't include by default in queries
        },
        embeddedAt: Date,
    },
    {
        timestamps: true,
    }
);

// Compound indexes
chunkSchema.index({ knowledgeBaseId: 1, chunkIndex: 1 });
chunkSchema.index({ agentId: 1, embeddedAt: 1 });

// Text index for basic search (before vector search)
chunkSchema.index({ content: 'text' });

export const ChunkModel = model<IChunkDocument>('Chunk', chunkSchema, 'chunks');
