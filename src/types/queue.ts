// types/queue.ts
export type JobType = 'uploaded' | 'parse' | 'chunk' | 'embed';
export type JobStatus =
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'retrying';

export interface IBaseJobPayload {
    jobId: string;
    knowledgeBaseId: string;
    agentId: string;
    userId: string;
    timestamp: number;
    attempt: number;
    maxAttempts: number;
}

export interface IFileUploadJobPayload extends IBaseJobPayload {
    type: 'uploaded';
    file: {
        storageKey: string;
        originalName: string;
        mimeType: string;
        size: number;
    };
}

export interface IParseJobPayload extends IBaseJobPayload {
    type: 'parse';
    file: {
        storageKey: string;
        originalName: string;
        mimeType: string;
        size: number;
    };
}

export interface IChunkJobPayload extends IBaseJobPayload {
    type: 'chunk';
    options: {
        strategy: 'fixed' | 'recursive' | 'semantic' | 'page';
        chunkSize: number;
        chunkOverlap: number;
    };
}

export interface IEmbedJobPayload extends IBaseJobPayload {
    type: 'embed';
    options: {
        model: string;
        batchSize: number;
    };
}

export type JobPayload =
    | IFileUploadJobPayload
    | IParseJobPayload
    | IChunkJobPayload
    | IEmbedJobPayload;

export interface IJobResult {
    jobId: string;
    knowledgeBaseId: string;
    type: JobType;
    status: JobStatus;
    result?: any;
    error?: {
        message: string;
        code?: string;
        stack?: string;
    };
    processingTime: number;
    completedAt: Date;
}

export interface IJobProgress {
    jobId: string;
    knowledgeBaseId: string;
    type: JobType;
    progress: number;
    message?: string;
}
