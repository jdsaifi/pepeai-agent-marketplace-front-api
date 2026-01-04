import { Types, Document } from 'mongoose';

export type SourceType =
    | 'pdf'
    | 'doc'
    | 'docx'
    | 'txt'
    | 'url'
    | 'sitemap'
    | 'manual'
    | 'csv'
    | 'json';
export type ProcessingStatus =
    | 'pending'
    | 'uploading'
    | 'processing'
    | 'chunking'
    | 'embedding'
    | 'completed'
    | 'failed';
export type ChunkingStrategy = 'fixed' | 'semantic' | 'paragraph' | 'sentence';
export type CrawlFrequency = 'once' | 'daily' | 'weekly' | 'monthly';

// export interface IKnowledgeBase {
//     agentId: Types.ObjectId | IAgent;
//     name: string;
//     description: string;
//     sourceType:
//         | 'pdf'
//         | 'doc'
//         | 'docx'
//         | 'txt'
//         | 'url'
//         | 'sitemap'
//         | 'manual'
//         | 'csv'
//         | 'json';

//     sourceUrl: string;
//     sourceFile: string;
//     sourceFileUrl: string;
//     sourceFileChecksum: string;
//     sourceFileSize: number;
//     sourceFileCreatedAt: Date;
//     sourceFileUpdatedAt: Date;
//     processing: {
//         status: 'pending' | 'processing' | 'completed' | 'failed';
//         progress: number;
//         startedAt: Date;
//         completedAt: Date;
//         error: string;
//     };
//     chunking: {
//         strategy: 'fixed' | 'semantic' | 'paragraph' | 'sentence';
//         chunkSize: number;
//         chunkOverlap: number;
//         totalChunks: number;
//         totalCharacters: number;
//         totalTokens: number;
//     };
//     embedding: {
//         model: string;
//         dimensions: number;
//         vectorDbCollection: string;
//         embeddedAt: Date;
//     };
//     metadata: {
//         title: string;
//         author: string;
//         pageCount: number;
//         language: string;
//         keywords: string[];
//         summary: string;
//         extractedAt: Date;
//     };
//     version: number;
//     isActive: boolean;
//     priority: number;
//     createdBy: string | IUser;
//     createdAt: Date;
//     updatedAt: Date;
// }

// export interface IKnowledgeBaseDocument extends IKnowledgeBase, Document {
//     _id: Types.ObjectId;
// }

export interface IKBFile {
    originalName?: string;
    mimeType?: string;
    size?: number;
    storageKey?: string;
    storageUrl?: string;
    checksum?: string;
}

export interface IKBUrl {
    original?: string;
    canonical?: string;
    domain?: string;
    lastCrawledAt?: Date;
    crawlFrequency: CrawlFrequency;
}

export interface IKBProcessing {
    status: ProcessingStatus;
    progress: number;
    startedAt?: Date;
    completedAt?: Date;
    error?: {
        message?: string;
        code?: string;
        occurredAt?: Date;
        retryCount: number;
    };
}

export interface IKBChunking {
    strategy: ChunkingStrategy;
    chunkSize?: number;
    chunkOverlap?: number;
    totalChunks: number;
    totalCharacters: number;
    totalTokens: number;
}

export interface IKBEmbedding {
    model: string;
    dimensions?: number;
    vectorDbCollection?: string;
    embeddedAt?: Date;
}

export interface IKBMetadata {
    title?: string;
    author?: string;
    pageCount?: number;
    language?: string;
    keywords?: string[];
    summary?: string;
    extractedAt?: Date;
}

export interface IKnowledgeBase {
    agentId: Types.ObjectId;
    sourceType: SourceType;
    name: string;
    description?: string;
    file?: IKBFile;
    url?: IKBUrl;
    manualContent?: {
        text?: string;
        title?: string;
    };
    processing: IKBProcessing;
    chunking: IKBChunking;
    embedding: IKBEmbedding;
    metadata: IKBMetadata;
    version: number;
    isActive: boolean;
    priority: number;
    createdBy: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

export interface IKnowledgeBaseDocument extends IKnowledgeBase, Document {
    _id: Types.ObjectId;
}
