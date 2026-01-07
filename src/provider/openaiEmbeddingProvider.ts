/**
 * OpenAI Embedding Provider
 * For production deployments using OpenAI's API
 */

import env from '../config/env';
import { BaseEmbeddingProvider } from './baseEmbeddingProvider';
import {
    OpenAIConfig,
    EmbeddingResponse,
    EmbeddingError,
    EmbeddingRateLimitError,
} from '../types/embadding';

interface OpenAIEmbeddingResponse {
    object: string;
    data: Array<{
        object: string;
        index: number;
        embedding: number[];
    }>;
    model: string;
    usage: {
        prompt_tokens: number;
        total_tokens: number;
    };
}

interface OpenAIErrorResponse {
    error: {
        message: string;
        type: string;
        code: string;
    };
}

export class OpenAIEmbeddingProvider extends BaseEmbeddingProvider {
    readonly name = 'openai';
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly model: string;

    constructor(config: OpenAIConfig) {
        super(config);
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        this.model = config.defaultModel;
    }

    /**
     * Generate embedding for a single text
     */
    async embed(text: string): Promise<number[]> {
        const response = await this.embedBatch([text]);
        return response.embeddings[0].embedding;
    }

    /**
     * Generate embeddings for multiple texts
     * OpenAI natively supports batch embeddings
     */
    async embedBatch(texts: string[]): Promise<EmbeddingResponse> {
        if (texts.length === 0) {
            return {
                embeddings: [],
                model: this.model,
                dimensions: this.config.dimensions,
            };
        }

        // Process in chunks if exceeding max batch size
        if (texts.length > this.config.maxBatchSize) {
            return this.processBatches(texts, (batch) =>
                this.embedBatchInternal(batch)
            );
        }

        return this.embedBatchInternal(texts);
    }

    /**
     * Internal batch embedding call
     */
    private async embedBatchInternal(
        texts: string[]
    ): Promise<EmbeddingResponse> {
        return this.withRetry(async () => {
            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/embeddings`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.apiKey}`,
                    },
                    body: JSON.stringify({
                        model: this.model,
                        input: texts,
                        encoding_format: 'float',
                    }),
                }
            );

            if (!response.ok) {
                await this.handleErrorResponse(response);
            }

            const data: OpenAIEmbeddingResponse = await response.json();

            return {
                embeddings: data.data.map((item) => ({
                    embedding: item.embedding,
                    index: item.index,
                })),
                model: data.model,
                dimensions:
                    data.data[0]?.embedding.length || this.config.dimensions,
                usage: {
                    promptTokens: data.usage.prompt_tokens,
                    totalTokens: data.usage.total_tokens,
                },
            };
        }, 'embedBatch');
    }

    /**
     * Handle OpenAI error responses
     */
    private async handleErrorResponse(response: Response): Promise<never> {
        const errorText = await response.text();
        let errorData: OpenAIErrorResponse | null = null;

        try {
            errorData = JSON.parse(errorText);
        } catch {
            // Not JSON, use raw text
        }

        const errorMessage = errorData?.error?.message || errorText;
        const errorCode = errorData?.error?.code || `HTTP_${response.status}`;

        // Handle rate limiting
        if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after');
            const retryAfterMs = retryAfter
                ? parseInt(retryAfter) * 1000
                : undefined;
            throw new EmbeddingRateLimitError(this.name, retryAfterMs);
        }

        // Handle auth errors (not retryable)
        if (response.status === 401 || response.status === 403) {
            throw new EmbeddingError(
                `OpenAI authentication error: ${errorMessage}`,
                this.name,
                errorCode,
                false
            );
        }

        // Handle other errors
        throw new EmbeddingError(
            `OpenAI API error: ${response.status} - ${errorMessage}`,
            this.name,
            errorCode,
            response.status >= 500 // Retry on 5xx
        );
    }

    /**
     * Check if API is accessible and key is valid
     */
    async healthCheck(): Promise<boolean> {
        try {
            // Make a minimal embedding request to verify connectivity
            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/models`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                    },
                }
            );

            if (!response.ok) {
                console.error('[OpenAI] Health check failed:', response.status);
                return false;
            }

            return true;
        } catch (error) {
            console.error(
                '[OpenAI] Health check failed:',
                (error as Error).message
            );
            return false;
        }
    }
}

/**
 * Default OpenAI config for production
 */
export const defaultOpenAIConfig: OpenAIConfig = {
    provider: 'openai',
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL,
    defaultModel: env.OPENAI_EMBEDDING_MODEL,
    dimensions: 1536, // text-embedding-3-small default
    maxBatchSize: 2048, // OpenAI supports up to 2048 texts per request
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 30000,
};

/**
 * Config for text-embedding-3-large
 */
export const openAILargeConfig: Partial<OpenAIConfig> = {
    defaultModel: 'text-embedding-3-large',
    dimensions: 3072,
};
