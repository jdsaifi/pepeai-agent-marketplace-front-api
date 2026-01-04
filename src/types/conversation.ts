import { IAgent } from './agent';
import { IUser } from './user';
import { Types } from 'mongoose';

export interface IConversation {
    agentId: string | IAgent;
    user: string | IUser;
    title: string;
    platform: 'web' | 'telegram' | 'api' | 'embed' | 'whatsapp';
    platformMeta: {
        telegramChatId: string;
        telegramUserId: string;
        telegramUsername: string;
        sessionId: string;
        ipAddress: string;
        userAgent: string;
    };
    context: {
        summary: string;
        summaryUpdatedAt: Date;
        keyPoints: string[];
        lastSummarizedAt: Date;
        messageCountAtSummary: number;
    };
    stats: {
        messageCount: number;
        userMessageCount: number;
        assistantMessageCount: number;
        totalTokens: number;
        promptTokens: number;
        completionTokens: number;
        estimatedCost: number;
    };
    feedback: {
        rating: number;
        comment: string;
        ratedAt: Date;
    };
    tags: string[];
    metadata: {
        [key: string]: any;
    };
    lastMessageAt: Date;
    firstMessageAt: Date;

    status: 'active' | 'archived' | 'deleted';
    deletedAt: Date | null;
    deletedBy: string | IUser | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface IConversationDocument extends IConversation, Document {
    _id: Types.ObjectId;
    generateTitle(): Promise<string>;
}
