/**
 * LLM Service Types
 * Defines contracts for LLM providers and service interfaces
 */

// ============================================
// Provider Configuration
// ============================================

export type LLMProviderType = 'openai' | 'anthropic' | 'google' | 'ollama';

export interface LLMProviderConfig {
    provider: LLMProviderType;
    apiKey: string;
    baseUrl?: string;
    defaultModel: string;
    maxRetries: number;
    retryDelayMs: number;
    timeoutMs: number;
}

export interface OpenAILLMConfig extends LLMProviderConfig {
    provider: 'openai';
    organization?: string;
}

export interface AnthropicLLMConfig extends LLMProviderConfig {
    provider: 'anthropic';
}

export interface GoogleLLMConfig extends LLMProviderConfig {
    provider: 'google';
    projectId?: string;
}

// ============================================
// Message Types
// ============================================

export type MessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
    role: MessageRole;
    content: string;
    name?: string;
}

export interface ChatCompletionOptions {
    /**
     * Model to use (overrides default)
     */
    model?: string;

    /**
     * Temperature (0-2)
     */
    temperature?: number;

    /**
     * Maximum tokens to generate
     */
    maxTokens?: number;

    /**
     * Stop sequences
     */
    stop?: string[];

    /**
     * Top-p sampling
     */
    topP?: number;

    /**
     * Frequency penalty (OpenAI)
     */
    frequencyPenalty?: number;

    /**
     * Presence penalty (OpenAI)
     */
    presencePenalty?: number;

    /**
     * User identifier for tracking
     */
    user?: string;
}

// ============================================
// Response Types
// ============================================

export interface ChatCompletionResponse {
    content: string;
    model: string;
    finishReason: 'stop' | 'length' | 'content_filter' | 'error' | null;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface StreamChunk {
    content: string;
    done: boolean;
    finishReason?: string;
}

export type StreamCallback = (chunk: StreamChunk) => void;

// ============================================
// Agent-Specific Types (from your model)
// ============================================

export interface AgentLLMConfig {
    provider: LLMProviderType;
    model: string;
    temperature: number;
    maxTokens: number;
}

export interface AgentPersonality {
    tone: 'formal' | 'casual' | 'friendly' | 'professional' | 'playful';
    responseStyle: 'concise' | 'detailed' | 'balanced';
}

export interface AgentContext {
    agentId: string;
    name: string;
    systemPrompt: string;
    llmConfig: AgentLLMConfig;
    personality?: AgentPersonality;
    welcomeMessage?: string;
}

// ============================================
// Provider Interface
// ============================================

export interface LLMProvider {
    readonly name: LLMProviderType;

    /**
     * Generate a chat completion
     */
    complete(
        messages: ChatMessage[],
        options?: ChatCompletionOptions
    ): Promise<ChatCompletionResponse>;

    /**
     * Stream a chat completion
     */
    stream(
        messages: ChatMessage[],
        options?: ChatCompletionOptions,
        onChunk?: StreamCallback
    ): Promise<ChatCompletionResponse>;

    /**
     * Check if the provider is available
     */
    healthCheck(): Promise<boolean>;
}

// ============================================
// Error Types
// ============================================

export class LLMError extends Error {
    constructor(
        message: string,
        public readonly provider: string,
        public readonly code: string,
        public readonly retryable: boolean = false,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = 'LLMError';
    }
}

export class LLMRateLimitError extends LLMError {
    constructor(provider: string, public readonly retryAfterMs?: number) {
        super('Rate limit exceeded', provider, 'RATE_LIMIT', true);
        this.name = 'LLMRateLimitError';
    }
}

export class LLMContextLengthError extends LLMError {
    constructor(provider: string, maxTokens: number) {
        super(
            `Context length exceeded. Maximum: ${maxTokens} tokens`,
            provider,
            'CONTEXT_LENGTH',
            false
        );
        this.name = 'LLMContextLengthError';
    }
}

export class LLMContentFilterError extends LLMError {
    constructor(provider: string) {
        super(
            'Content filtered by safety system',
            provider,
            'CONTENT_FILTER',
            false
        );
        this.name = 'LLMContentFilterError';
    }
}
