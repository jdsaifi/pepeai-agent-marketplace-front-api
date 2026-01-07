/**
 * Embedding Provider Factory
 * Creates the appropriate provider based on configuration
 */

import {
    EmbeddingProvider,
    EmbeddingProviderConfig,
    OllamaConfig,
    OpenAIConfig,
    EmbeddingError,
} from '../types/embadding';

import {
    OllamaEmbeddingProvider,
    defaultOllamaConfig,
} from './ollamaEmbeddingProvider';
import {
    OpenAIEmbeddingProvider,
    defaultOpenAIConfig,
} from './openaiEmbeddingProvider';

export type ProviderType = 'ollama' | 'openai' | 'groq' | 'anthropic';

/**
 * Factory to create embedding providers
 */
export class EmbeddingProviderFactory {
    private static providers: Map<string, EmbeddingProvider> = new Map();

    /**
     * Create a provider instance from config
     */
    static create(config: EmbeddingProviderConfig): EmbeddingProvider {
        switch (config.provider) {
            case 'ollama':
                return new OllamaEmbeddingProvider(config as OllamaConfig);

            case 'openai':
                return new OpenAIEmbeddingProvider(config as OpenAIConfig);

            // Future providers
            case 'groq':
                throw new EmbeddingError(
                    'Groq provider not yet implemented',
                    'factory',
                    'NOT_IMPLEMENTED',
                    false
                );

            case 'anthropic':
                throw new EmbeddingError(
                    'Anthropic does not provide embedding models',
                    'factory',
                    'NOT_SUPPORTED',
                    false
                );

            default:
                throw new EmbeddingError(
                    `Unknown provider: ${config.provider}`,
                    'factory',
                    'UNKNOWN_PROVIDER',
                    false
                );
        }
    }

    /**
     * Get or create a singleton provider instance
     * Useful for reusing providers across services
     */
    static getOrCreate(
        config: EmbeddingProviderConfig,
        key?: string
    ): EmbeddingProvider {
        const cacheKey = key || `${config.provider}:${config.defaultModel}`;

        if (!this.providers.has(cacheKey)) {
            this.providers.set(cacheKey, this.create(config));
        }

        return this.providers.get(cacheKey)!;
    }

    /**
     * Create provider from environment configuration
     * Automatically selects based on NODE_ENV or EMBEDDING_PROVIDER
     */
    static createFromEnv(): EmbeddingProvider {
        const provider =
            process.env.EMBEDDING_PROVIDER ||
            (process.env.NODE_ENV === 'production' ? 'openai' : 'ollama');

        switch (provider) {
            case 'ollama':
                return this.create({
                    ...defaultOllamaConfig,
                    baseUrl:
                        process.env.OLLAMA_BASE_URL ||
                        defaultOllamaConfig.baseUrl,
                    defaultModel:
                        process.env.OLLAMA_EMBEDDING_MODEL ||
                        defaultOllamaConfig.defaultModel,
                });

            case 'openai':
                const apiKey = process.env.OPENAI_API_KEY;
                if (!apiKey) {
                    throw new EmbeddingError(
                        'OPENAI_API_KEY environment variable is required for OpenAI provider',
                        'factory',
                        'MISSING_API_KEY',
                        false
                    );
                }
                return this.create({
                    ...defaultOpenAIConfig,
                    apiKey,
                });

            default:
                throw new EmbeddingError(
                    `Unknown EMBEDDING_PROVIDER: ${provider}`,
                    'factory',
                    'UNKNOWN_PROVIDER',
                    false
                );
        }
    }

    /**
     * Clear cached providers (useful for testing)
     */
    static clearCache(): void {
        this.providers.clear();
    }
}
