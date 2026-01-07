/**
 * Base LLM Provider
 * Abstract class with common functionality for all LLM providers
 */

import {
    LLMProvider,
    LLMProviderConfig,
    LLMProviderType,
    ChatMessage,
    ChatCompletionOptions,
    ChatCompletionResponse,
    StreamCallback,
    LLMError,
    LLMRateLimitError,
} from '../types/llm';

export abstract class BaseLLMProvider implements LLMProvider {
    abstract readonly name: LLMProviderType;

    constructor(protected readonly config: LLMProviderConfig) {}

    abstract complete(
        messages: ChatMessage[],
        options?: ChatCompletionOptions
    ): Promise<ChatCompletionResponse>;

    abstract stream(
        messages: ChatMessage[],
        options?: ChatCompletionOptions,
        onChunk?: StreamCallback
    ): Promise<ChatCompletionResponse>;

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
                if (error instanceof LLMError && !error.retryable) {
                    throw error;
                }

                // Check for rate limit with retry-after
                if (error instanceof LLMRateLimitError && error.retryAfterMs) {
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

        throw new LLMError(
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
        return Math.min(exponentialDelay + jitter, 60000); // Cap at 60s
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
                throw new LLMError(
                    'Request timed out',
                    this.name,
                    'TIMEOUT',
                    true
                );
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Get default model
     */
    protected getModel(options?: ChatCompletionOptions): string {
        return options?.model || this.config.defaultModel;
    }
}
