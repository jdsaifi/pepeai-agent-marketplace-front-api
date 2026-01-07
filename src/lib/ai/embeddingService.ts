/**
 * Embedding Service
 * High-level service for generating embeddings with provider abstraction
 */

import {
    EmbeddingProvider,
    EmbeddingResponse,
    EmbeddingServiceConfig,
    EmbeddingError,
} from '../../types/embadding';
import { EmbeddingProviderFactory } from '../../provider/embeddingProviderFactory';

export interface EmbedOptions {
    /**
     * Skip cache lookup (force fresh embedding)
     */
    skipCache?: boolean;
}

export interface EmbedBatchOptions extends EmbedOptions {
    /**
     * Continue processing remaining texts if some fail
     */
    continueOnError?: boolean;

    /**
     * Callback for progress tracking
     */
    onProgress?: (completed: number, total: number) => void;
}

export class EmbeddingService {
    private readonly provider: EmbeddingProvider;
    private cache: Map<string, number[]> | null = null;

    constructor(config?: EmbeddingServiceConfig) {
        if (config?.provider) {
            this.provider = EmbeddingProviderFactory.create(config.provider);
        } else {
            // Auto-configure from environment
            this.provider = EmbeddingProviderFactory.createFromEnv();
        }

        // Simple in-memory cache (replace with Redis in production)
        if (config?.enableCaching) {
            this.cache = new Map();
        }
    }

    /**
     * Get the provider name
     */
    get providerName(): string {
        return this.provider.name;
    }

    /**
     * Get embedding dimensions for this provider
     */
    get dimensions(): number {
        return this.provider.dimensions;
    }

    /**
     * Generate embedding for a single text
     */
    async embed(text: string, options?: EmbedOptions): Promise<number[]> {
        // Normalize text
        const normalizedText = this.normalizeText(text);

        if (!normalizedText) {
            throw new EmbeddingError(
                'Cannot embed empty text',
                this.provider.name,
                'EMPTY_TEXT',
                false
            );
        }

        // Check cache
        if (this.cache && !options?.skipCache) {
            const cacheKey = this.getCacheKey(normalizedText);
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return cached;
            }
        }

        // Generate embedding
        const embedding = await this.provider.embed(normalizedText);

        // Cache result
        if (this.cache) {
            this.cache.set(this.getCacheKey(normalizedText), embedding);
        }

        return embedding;
    }

    /**
     * Generate embeddings for multiple texts
     */
    async embedBatch(
        texts: string[],
        options?: EmbedBatchOptions
    ): Promise<EmbeddingResponse> {
        if (texts.length === 0) {
            return {
                embeddings: [],
                model: this.provider.name,
                dimensions: this.dimensions,
            };
        }

        // Normalize texts and track indices
        const normalized: Array<{ text: string; originalIndex: number }> = [];
        const cachedResults: Array<{ embedding: number[]; index: number }> = [];

        for (let i = 0; i < texts.length; i++) {
            const normalizedText = this.normalizeText(texts[i]);

            if (!normalizedText) {
                if (options?.continueOnError) {
                    // Skip empty texts
                    continue;
                }
                throw new EmbeddingError(
                    `Cannot embed empty text at index ${i}`,
                    this.provider.name,
                    'EMPTY_TEXT',
                    false
                );
            }

            // Check cache
            if (this.cache && !options?.skipCache) {
                const cached = this.cache.get(this.getCacheKey(normalizedText));
                if (cached) {
                    cachedResults.push({ embedding: cached, index: i });
                    continue;
                }
            }

            normalized.push({ text: normalizedText, originalIndex: i });
        }

        // If all cached, return early
        if (normalized.length === 0) {
            return {
                embeddings: cachedResults,
                model: this.provider.name,
                dimensions: this.dimensions,
            };
        }

        // Generate embeddings for non-cached texts
        const textsToEmbed = normalized.map((n) => n.text);
        const response = await this.provider.embedBatch(textsToEmbed);

        // Map back to original indices and cache
        const newResults = response.embeddings.map((result, idx) => {
            const originalIndex = normalized[idx].originalIndex;
            const normalizedText = normalized[idx].text;

            // Cache result
            if (this.cache) {
                this.cache.set(
                    this.getCacheKey(normalizedText),
                    result.embedding
                );
            }

            return {
                embedding: result.embedding,
                index: originalIndex,
                tokenCount: result.tokenCount,
            };
        });

        // Merge cached and new results
        const allResults = [...cachedResults, ...newResults].sort(
            (a, b) => a.index - b.index
        );

        // Report progress
        options?.onProgress?.(allResults.length, texts.length);

        return {
            embeddings: allResults,
            model: response.model,
            dimensions: response.dimensions,
            usage: response.usage,
        };
    }

    /**
     * Generate embeddings for document chunks (convenience method)
     */
    async embedChunks(
        chunks: Array<{ content: string; [key: string]: unknown }>,
        options?: EmbedBatchOptions
    ): Promise<Array<{ chunk: (typeof chunks)[0]; embedding: number[] }>> {
        const texts = chunks.map((c) => c.content);
        const response = await this.embedBatch(texts, options);

        return response.embeddings.map((result) => ({
            chunk: chunks[result.index],
            embedding: result.embedding,
        }));
    }

    /**
     * Check provider health
     */
    async healthCheck(): Promise<{
        healthy: boolean;
        provider: string;
        dimensions: number;
    }> {
        const healthy = await this.provider.healthCheck();
        return {
            healthy,
            provider: this.provider.name,
            dimensions: this.dimensions,
        };
    }

    /**
     * Normalize text for embedding
     */
    private normalizeText(text: string): string {
        return text
            .trim()
            .replace(/\s+/g, ' ') // Collapse whitespace
            .slice(0, 8000); // Reasonable max length
    }

    /**
     * Generate cache key for text
     */
    private getCacheKey(text: string): string {
        // Simple hash for cache key
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return `${this.provider.name}:${hash}`;
    }

    /**
     * Clear the embedding cache
     */
    clearCache(): void {
        this.cache?.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { size: number; enabled: boolean } {
        return {
            size: this.cache?.size || 0,
            enabled: this.cache !== null,
        };
    }
}

/**
 * Singleton instance for convenience
 * Use when you don't need custom configuration
 */
let defaultService: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
    if (!defaultService) {
        defaultService = new EmbeddingService();
    }
    return defaultService;
}

/**
 * Reset default service (useful for testing)
 */
export function resetEmbeddingService(): void {
    defaultService = null;
}
