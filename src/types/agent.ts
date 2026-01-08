import { IUser } from './user';
import { Types } from 'mongoose';

export interface IAgent {
    name: string;
    slug: string;
    description: string;
    persona: string;
    category:
        | 'religious'
        | 'location'
        | 'education'
        | 'entertainment'
        | 'lifestyle'
        | 'business'
        | 'other';
    tags: string[];
    avatar: {
        url: string;
        publicId: string;
    };
    themeColor: string;
    llmConfig: {
        provider: 'openai' | 'anthropic' | 'google';
        model: string;
        temperature: number;
        maxTokens: number;
    };
    systemPrompt: string;
    welcomeMessage: string;
    personality: {
        tone: 'formal' | 'casual' | 'friendly' | 'professional' | 'playful';
        responseStyle: 'concise' | 'detailed' | 'balanced';
    };
    ragConfig: {
        enabled: boolean;
        chunkSize: number;
        chunkOverlap: number;
        topK: number;
        similarityThreshold: number;
    };
    visibility: 'public' | 'private' | 'unlisted';
    allowedUsers: string[];
    usage: {
        totalConversations: number;
        totalMessages: number;
        totalTokensUsed: number;
    };
    limits: {
        maxMessagesPerDay: number;
        maxTokensPerMessage: number;
        rateLimitPerMinute: number;
    };
    status: 'draft' | 'active' | 'paused' | 'archived';
    kbStatus: {
        totalDocuments: number;
        processedDocuments: number;
        totalChunks: number;
        lastProcessedAt: Date | null;
    };
    followersCount: number;
    createdBy: string | IUser;
    publishedAt: Date | null;
    publishedBy: IUser | null;
    isActive: boolean;
    isDeleted: boolean;
    deletedAt: Date | null;
    deletedBy: IUser | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface IAgentDocument extends IAgent, Document {
    _id: Types.ObjectId;
}
