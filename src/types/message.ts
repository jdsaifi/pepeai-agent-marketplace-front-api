import { IAgent } from './agent';
import { IConversation } from './conversation';
import { IKnowledgeBase } from './kb';
import { Types } from 'mongoose';

export interface IAttachment {
    type: 'image' | 'audio' | 'file' | 'voice';
    url: string;
    mimeType: string;
    fileName: string;
    size: number;
    duration: number;
    transcription: string;
}

export interface IChunk {
    kbId: string | IKnowledgeBase;
    chunkId: string;
    content: string;
    score: number;
    source: string;
}

export interface IRagContext {
    used: boolean;
    chunks: IChunk[];
    searchQuery: string;
    retrievalTime: number;
}

export interface IToolCall {
    id: string;
    name: string;
    arguments: any;
    result: any;
    status: 'pending' | 'success' | 'error';
}

export interface IFeedback {
    type: 'positive' | 'negative' | 'report';
    reason: string;
    comment: string;
}

export interface IMessage {
    conversationId: string | IConversation;
    agentId: string | IAgent;
    role: 'user' | 'assistant' | 'system';
    content: string;
    messageContentType: 'text' | 'image' | 'audio' | 'file' | 'mixed';
    attachments: IAttachment[];
    ragContext: IRagContext;
    llm: {
        model: string;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        latency: number;
        finishReason: string;
        cost: number;
    };
    toolCalls: IToolCall[];
    status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
    error: {
        code: string;
        message: string;
    };
    feedback: IFeedback;
    version: number;
    parentMessageId: string | IMessage;
    isRegenerated: boolean;
    platformMessageId: string;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface IMessageDocument extends IMessage, Document {
    _id: Types.ObjectId;
}
