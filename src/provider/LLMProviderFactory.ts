/**
 * LLM Provider Factory
 * Creates the appropriate LLM provider based on configuration
 */

import env from '../config/env';
import {
    LLMProvider,
    LLMProviderConfig,
    LLMProviderType,
    OpenAILLMConfig,
    AnthropicLLMConfig,
    GoogleLLMConfig,
    LLMError,
} from '../types/llm';

import { OpenAILLMProvider, defaultOpenAILLMConfig } from './openaiLLMProvider';
import {
    AnthropicLLMProvider,
    defaultAnthropicLLMConfig,
} from './anthropicLLMProvider';
import {
    GoogleLLMProvider,
    defaultGoogleLLMConfig,
} from './googleGeminiLLMProvider';
import {
    OllamaLLMProvider,
    OllamaLLMConfig,
    defaultOllamaLLMConfig,
} from './ollamaLLMProvider';

/**
 * Factory to create LLM providers
 */
export class LLMProviderFactory {
    private static providers: Map<string, LLMProvider> = new Map();

    /**
     * Create a provider instance from config
     */
    static create(config: LLMProviderConfig): LLMProvider {
        switch (config.provider) {
            case 'openai':
                return new OpenAILLMProvider(config as OpenAILLMConfig);

            case 'anthropic':
                return new AnthropicLLMProvider(config as AnthropicLLMConfig);

            case 'google':
                return new GoogleLLMProvider(config as GoogleLLMConfig);

            case 'ollama':
                return new OllamaLLMProvider(config as OllamaLLMConfig);

            default:
                throw new LLMError(
                    `Unknown provider: ${config.provider}`,
                    'factory',
                    'UNKNOWN_PROVIDER',
                    false
                );
        }
    }

    /**
     * Create provider from agent config
     */
    static createFromAgentConfig(
        llmConfig: { provider: LLMProviderType; model: string },
        apiKeys?: { openai?: string; anthropic?: string; google?: string }
    ): LLMProvider {
        const keys = apiKeys || {
            openai: env.OPENAI_API_KEY,
            anthropic: env.ANTHROPIC_API_KEY,
            google: env.GOOGLE_GEMINI_API_KEY,
        };

        switch (llmConfig.provider) {
            case 'openai':
                if (!keys.openai) {
                    throw new LLMError(
                        'OPENAI_API_KEY is required for OpenAI provider',
                        'factory',
                        'MISSING_API_KEY',
                        false
                    );
                }
                return new OpenAILLMProvider({
                    ...defaultOpenAILLMConfig,
                    apiKey: keys.openai,
                    defaultModel: llmConfig.model,
                });

            case 'anthropic':
                if (!keys.anthropic) {
                    throw new LLMError(
                        'ANTHROPIC_API_KEY is required for Anthropic provider',
                        'factory',
                        'MISSING_API_KEY',
                        false
                    );
                }
                return new AnthropicLLMProvider({
                    ...defaultAnthropicLLMConfig,
                    apiKey: keys.anthropic,
                    defaultModel: llmConfig.model,
                });

            case 'google':
                if (!keys.google) {
                    throw new LLMError(
                        'GOOGLE_API_KEY is required for Google provider',
                        'factory',
                        'MISSING_API_KEY',
                        false
                    );
                }
                return new GoogleLLMProvider({
                    ...defaultGoogleLLMConfig,
                    apiKey: keys.google,
                    defaultModel: llmConfig.model,
                });

            case 'ollama':
                // Ollama doesn't need API key
                return new OllamaLLMProvider({
                    ...defaultOllamaLLMConfig,
                    defaultModel: llmConfig.model,
                });

            default:
                throw new LLMError(
                    `Unknown provider: ${llmConfig.provider}`,
                    'factory',
                    'UNKNOWN_PROVIDER',
                    false
                );
        }
    }

    /**
     * Get or create a singleton provider instance
     */
    static getOrCreate(config: LLMProviderConfig, key?: string): LLMProvider {
        const cacheKey = key || `${config.provider}:${config.defaultModel}`;

        if (!this.providers.has(cacheKey)) {
            this.providers.set(cacheKey, this.create(config));
        }

        return this.providers.get(cacheKey)!;
    }

    /**
     * Create default provider based on environment
     * Prefers Ollama for local development
     */
    static createDefault(): LLMProvider {
        // In development, prefer Ollama
        if (env.NODE_ENV !== 'production') {
            try {
                return new OllamaLLMProvider(defaultOllamaLLMConfig);
            } catch {
                // Fall through to cloud providers
            }
        }

        // Try cloud providers in order of preference
        if (env.OPENAI_API_KEY) {
            return new OpenAILLMProvider({
                ...defaultOpenAILLMConfig,
                apiKey: env.OPENAI_API_KEY,
            });
        }

        if (env.ANTHROPIC_API_KEY) {
            return new AnthropicLLMProvider({
                ...defaultAnthropicLLMConfig,
                apiKey: env.ANTHROPIC_API_KEY,
            });
        }

        if (env.GOOGLE_GEMINI_API_KEY) {
            return new GoogleLLMProvider({
                ...defaultGoogleLLMConfig,
                apiKey: env.GOOGLE_GEMINI_API_KEY,
            });
        }

        // Default to Ollama as fallback
        return new OllamaLLMProvider(defaultOllamaLLMConfig);
    }

    /**
     * Clear cached providers (useful for testing)
     */
    static clearCache(): void {
        this.providers.clear();
    }
}
