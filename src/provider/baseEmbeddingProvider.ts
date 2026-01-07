/**
 * Base Embedding Provider
 * Abstract class with common functionality for all providers
 */

import {
    EmbeddingProvider,
    EmbeddingProviderConfig,
    EmbeddingResponse,
    EmbeddingError,
    EmbeddingTimeoutError,
    EmbeddingRateLimitError,
} from '../types/embadding';

export abstract class BaseEmbeddingProvider implements EmbeddingProvider {
    abstract readonly name: string;

    constructor(protected readonly config: EmbeddingProviderConfig) {}

    get dimensions(): number {
        return this.config.dimensions;
    }

    abstract embed(text: string): Promise<number[]>;
    abstract embedBatch(texts: string[]): Promise<EmbeddingResponse>;
    abstract healthCheck(): Promise<boolean>;

    /**
     * Execute with retry logic and exponential backoff
     */
    protected async withRetry<T>(
        operation: () => Promise<T>,
        context: string
    ): Promise<T> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;

                // Don't retry non-retryable errors
                if (error instanceof EmbeddingError && !error.retryable) {
                    throw error;
                }

                // Check for rate limit with retry-after
                if (
                    error instanceof EmbeddingRateLimitError &&
                    error.retryAfterMs
                ) {
                    console.warn(
                        `[${this.name}] Rate limited on ${context}, waiting ${error.retryAfterMs}ms`
                    );
                    await this.sleep(error.retryAfterMs);
                    continue;
                }

                // Last attempt - throw
                if (attempt === this.config.maxRetries) {
                    break;
                }

                // Calculate delay with exponential backoff + jitter
                const delay = this.calculateBackoff(attempt);
                console.warn(
                    `[${this.name}] Attempt ${attempt + 1}/${
                        this.config.maxRetries + 1
                    } failed for ${context}, ` +
                        `retrying in ${delay}ms: ${lastError.message}`
                );

                await this.sleep(delay);
            }
        }

        throw new EmbeddingError(
            `Failed after ${this.config.maxRetries + 1} attempts: ${
                lastError?.message
            }`,
            this.name,
            'MAX_RETRIES_EXCEEDED',
            false,
            lastError
        );
    }

    /**
     * Calculate exponential backoff with jitter
     */
    protected calculateBackoff(attempt: number): number {
        const baseDelay = this.config.retryDelayMs;
        const exponentialDelay = baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * baseDelay;
        return Math.min(exponentialDelay + jitter, 30000); // Cap at 30s
    }

    /**
     * Sleep utility
     */
    protected sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Fetch with timeout wrapper
     */
    protected async fetchWithTimeout(
        url: string,
        options: RequestInit
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(
            () => controller.abort(),
            this.config.timeoutMs
        );

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });
            return response;
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                throw new EmbeddingTimeoutError(this.name);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Process batch in chunks respecting maxBatchSize
     */
    protected async processBatches<T>(
        items: T[],
        processor: (batch: T[]) => Promise<EmbeddingResponse>
    ): Promise<EmbeddingResponse> {
        const batches: T[][] = [];

        for (let i = 0; i < items.length; i += this.config.maxBatchSize) {
            batches.push(items.slice(i, i + this.config.maxBatchSize));
        }

        const results: EmbeddingResponse[] = [];

        for (const batch of batches) {
            const result = await processor(batch);
            results.push(result);
        }

        // Merge results
        return this.mergeResponses(results);
    }

    /**
     * Merge multiple embedding responses into one
     */
    protected mergeResponses(
        responses: EmbeddingResponse[]
    ): EmbeddingResponse {
        if (responses.length === 0) {
            throw new EmbeddingError(
                'No responses to merge',
                this.name,
                'EMPTY_RESPONSE',
                false
            );
        }

        if (responses.length === 1) {
            return responses[0];
        }

        let currentIndex = 0;
        const allEmbeddings = responses.flatMap((r) =>
            r.embeddings.map((e) => ({
                ...e,
                index: currentIndex++,
            }))
        );

        const totalUsage = responses.reduce(
            (acc, r) => ({
                promptTokens: acc.promptTokens + (r.usage?.promptTokens || 0),
                totalTokens: acc.totalTokens + (r.usage?.totalTokens || 0),
            }),
            { promptTokens: 0, totalTokens: 0 }
        );

        return {
            embeddings: allEmbeddings,
            model: responses[0].model,
            dimensions: responses[0].dimensions,
            usage: totalUsage,
        };
    }
}
