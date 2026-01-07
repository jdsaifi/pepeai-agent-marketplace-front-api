/**
 * Ollama Embedding Provider
 * For local development and self-hosted deployments
 */

import env from '../config/env';
import { BaseEmbeddingProvider } from './baseEmbeddingProvider';
import {
    OllamaConfig,
    EmbeddingResponse,
    EmbeddingError,
} from '../types/embadding';

interface OllamaEmbeddingResponse {
    embedding: number[];
}

interface OllamaEmbeddingsResponse {
    embeddings: number[][];
}

export class OllamaEmbeddingProvider extends BaseEmbeddingProvider {
    readonly name = 'ollama';
    private readonly baseUrl: string;
    private readonly model: string;

    constructor(config: OllamaConfig) {
        super(config);
        this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
        this.model = config.defaultModel;
    }

    /**
     * Generate embedding for a single text
     */
    async embed(text: string): Promise<number[]> {
        return this.withRetry(async () => {
            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/api/embeddings`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: this.model,
                        prompt: text,
                    }),
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new EmbeddingError(
                    `Ollama API error: ${response.status} - ${errorText}`,
                    this.name,
                    `HTTP_${response.status}`,
                    response.status >= 500 // Retry on 5xx
                );
            }

            const data: OllamaEmbeddingResponse = await response.json();
            return data.embedding;
        }, 'embed');
    }

    /**
     * Generate embeddings for multiple texts
     * Note: Ollama's batch endpoint may vary by version
     */
    async embedBatch(texts: string[]): Promise<EmbeddingResponse> {
        if (texts.length === 0) {
            return {
                embeddings: [],
                model: this.model,
                dimensions: this.config.dimensions,
            };
        }

        // Check if Ollama supports batch embeddings (v0.1.44+)
        // Fall back to sequential if not available
        try {
            return await this.embedBatchNative(texts);
        } catch (error) {
            // If batch endpoint fails, fall back to sequential processing
            console.warn(
                '[Ollama] Batch endpoint not available, using sequential processing'
            );
            return this.embedBatchSequential(texts);
        }
    }

    /**
     * Native batch embedding (Ollama v0.1.44+)
     */
    private async embedBatchNative(
        texts: string[]
    ): Promise<EmbeddingResponse> {
        return this.withRetry(async () => {
            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/api/embed`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: this.model,
                        input: texts,
                    }),
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new EmbeddingError(
                    `Ollama batch API error: ${response.status} - ${errorText}`,
                    this.name,
                    `HTTP_${response.status}`,
                    response.status >= 500
                );
            }

            const data: OllamaEmbeddingsResponse = await response.json();

            return {
                embeddings: data.embeddings.map((embedding, index) => ({
                    embedding,
                    index,
                })),
                model: this.model,
                dimensions:
                    data.embeddings[0]?.length || this.config.dimensions,
            };
        }, 'embedBatchNative');
    }

    /**
     * Sequential batch processing fallback
     */
    private async embedBatchSequential(
        texts: string[]
    ): Promise<EmbeddingResponse> {
        const embeddings = await Promise.all(
            texts.map(async (text, index) => {
                const embedding = await this.embed(text);
                return { embedding, index };
            })
        );

        return {
            embeddings,
            model: this.model,
            dimensions:
                embeddings[0]?.embedding.length || this.config.dimensions,
        };
    }

    /**
     * Check if Ollama is running and the model is available
     */
    async healthCheck(): Promise<boolean> {
        try {
            // Check Ollama is running
            const tagsResponse = await this.fetchWithTimeout(
                `${this.baseUrl}/api/tags`,
                { method: 'GET' }
            );

            if (!tagsResponse.ok) {
                console.error(
                    '[Ollama] Health check failed: API not responding'
                );
                return false;
            }

            const tags = await tagsResponse.json();
            const models = tags.models || [];

            // Check if our model is available
            const modelExists = models.some(
                (m: { name: string }) =>
                    m.name === this.model || m.name.startsWith(`${this.model}:`)
            );

            if (!modelExists) {
                console.warn(
                    `[Ollama] Model '${this.model}' not found. Available models:`,
                    models.map((m: { name: string }) => m.name)
                );
                console.warn(`[Ollama] Run: ollama pull ${this.model}`);
                return false;
            }

            return true;
        } catch (error) {
            console.error(
                '[Ollama] Health check failed:',
                (error as Error).message
            );
            return false;
        }
    }
}

/**
 * Default Ollama config for local development
 */
export const defaultOllamaConfig: OllamaConfig = {
    provider: 'ollama',
    baseUrl: env.OLLAMA_BASE_URL,
    defaultModel: env.OLLAMA_EMBEDDING_MODEL,
    dimensions: 768, // nomic-embed-text default
    maxBatchSize: 32,
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 60000, // Longer timeout for local
};
