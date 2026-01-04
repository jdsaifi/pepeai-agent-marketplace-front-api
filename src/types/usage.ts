import { IConversation } from './conversation';
import { IUser } from './user';
import { IAgent } from './agent';
import { IMessage } from './message';

export interface IUsageLog {
    _id: string;
    agentId: string | IAgent;
    userId: string | IUser;
    conversationId: string | IConversation;
    messageId: string | IMessage;
    type: 'llm_call' | 'embedding' | 'retrieval' | 'tool_call';
    llm: {
        provider: string;
        model: string;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    embedding: {
        model: string;
        tokenCount: number;
        chunkCount: number;
    };
    retrieval: {
        model: string;
        tokenCount: number;
        chunkCount: number;
    };
    toolCall: {
        name: string;
        arguments: Record<string, any>;
        result: Record<string, any>;
        status: 'pending' | 'success' | 'error';
    };
    cost: {
        amount: number;
        currency: string;
    };
    latency: number;
    date: Date;
}

export interface IUsageLogDocument extends IUsageLog, Document {}
