/**
 * Embedding Service Types
 * Defines contracts for embedding providers and service interfaces
 */

export interface EmbeddingRequest {
    texts: string[];
    model?: string;
}

export interface EmbeddingResult {
    embedding: number[];
    index: number;
    tokenCount?: number;
}

export interface EmbeddingResponse {
    embeddings: EmbeddingResult[];
    model: string;
    dimensions: number;
    usage?: {
        promptTokens: number;
        totalTokens: number;
    };
}

export interface EmbeddingProviderConfig {
    provider: 'ollama' | 'openai' | 'groq' | 'anthropic';
    apiKey?: string;
    baseUrl?: string;
    defaultModel: string;
    dimensions: number;
    maxBatchSize: number;
    maxRetries: number;
    retryDelayMs: number;
    timeoutMs: number;
}

export interface EmbeddingProvider {
    readonly name: string;
    readonly dimensions: number;

    /**
     * Generate embeddings for a single text
     */
    embed(text: string): Promise<number[]>;

    /**
     * Generate embeddings for multiple texts (batch)
     */
    embedBatch(texts: string[]): Promise<EmbeddingResponse>;

    /**
     * Check if the provider is available/healthy
     */
    healthCheck(): Promise<boolean>;
}

export interface EmbeddingServiceConfig {
    provider: EmbeddingProviderConfig;
    enableCaching?: boolean;
    cachePrefix?: string;
}

// Provider-specific configs
export interface OllamaConfig extends EmbeddingProviderConfig {
    provider: 'ollama';
    baseUrl: string; // e.g., 'http://localhost:11434'
}

export interface OpenAIConfig extends EmbeddingProviderConfig {
    provider: 'openai';
    apiKey: string;
    baseUrl?: string; // defaults to OpenAI API
}

export interface GroqConfig extends EmbeddingProviderConfig {
    provider: 'groq';
    apiKey: string;
}

// Error types
export class EmbeddingError extends Error {
    constructor(
        message: string,
        public readonly provider: string,
        public readonly code: string,
        public readonly retryable: boolean = false,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = 'EmbeddingError';
    }
}

export class EmbeddingRateLimitError extends EmbeddingError {
    constructor(provider: string, public readonly retryAfterMs?: number) {
        super('Rate limit exceeded', provider, 'RATE_LIMIT', true);
        this.name = 'EmbeddingRateLimitError';
    }
}

export class EmbeddingTimeoutError extends EmbeddingError {
    constructor(provider: string) {
        super('Request timed out', provider, 'TIMEOUT', true);
        this.name = 'EmbeddingTimeoutError';
    }
}
