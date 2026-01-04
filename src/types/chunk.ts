// types/chunk.ts
import { Document, Types } from 'mongoose';

export type ChunkingStrategy = 'fixed' | 'recursive' | 'semantic' | 'page';

export interface IChunkMetadata {
    pageNumber?: number;
    section?: string;
    header?: string;
    startChar?: number;
    endChar?: number;
    source?: string;
}

export interface IChunk {
    knowledgeBaseId: Types.ObjectId;
    agentId: Types.ObjectId;
    chunkIndex: number;
    content: string;
    charCount: number;
    tokenCount: number;
    metadata: IChunkMetadata;
    // Embedding will be added later
    embedding?: number[];
    embeddedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface IChunkDocument extends IChunk, Document {
    _id: Types.ObjectId;
}

export interface IChunkingOptions {
    strategy: ChunkingStrategy;
    chunkSize: number; // Target size in characters
    chunkOverlap: number; // Overlap in characters
    minChunkSize?: number; // Minimum chunk size (skip smaller)
    maxChunkSize?: number; // Maximum chunk size (force split)
    preserveSentences?: boolean; // Try not to break mid-sentence
}

export interface IChunkingResult {
    chunks: IChunkData[];
    totalChunks: number;
    totalCharacters: number;
    totalTokens: number;
    strategy: ChunkingStrategy;
}

export interface IChunkData {
    content: string;
    charCount: number;
    tokenCount: number;
    metadata: IChunkMetadata;
}
