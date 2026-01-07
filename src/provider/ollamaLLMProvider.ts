/**
 * Ollama LLM Provider
 * For local development and testing without API costs
 * Supports Llama, Mistral, Phi, Gemma, and other local models
 */

import env from '../config/env';
import { BaseLLMProvider } from './baseLLMProvider';
import {
    LLMProviderConfig,
    ChatMessage,
    ChatCompletionOptions,
    ChatCompletionResponse,
    StreamCallback,
    LLMError,
} from '../types/llm';

// ============================================
// Ollama-specific Types
// ============================================

export interface OllamaLLMConfig extends LLMProviderConfig {
    provider: 'ollama';
    baseUrl: string;
}

interface OllamaChatRequest {
    model: string;
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    stream: boolean;
    options?: {
        temperature?: number;
        num_predict?: number;
        top_p?: number;
        stop?: string[];
    };
}

interface OllamaChatResponse {
    model: string;
    created_at: string;
    message: {
        role: string;
        content: string;
    };
    done: boolean;
    done_reason?: string;
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
}

interface OllamaModelInfo {
    name: string;
    modified_at: string;
    size: number;
}

// ============================================
// Provider Implementation
// ============================================

export class OllamaLLMProvider extends BaseLLMProvider {
    readonly name = 'ollama' as const;
    private readonly baseUrl: string;

    constructor(config: OllamaLLMConfig) {
        super(config);
        this.baseUrl = config.baseUrl.replace(/\/$/, '');
    }

    /**
     * Generate a chat completion
     */
    async complete(
        messages: ChatMessage[],
        options?: ChatCompletionOptions
    ): Promise<ChatCompletionResponse> {
        return this.withRetry(async () => {
            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/api/chat`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                        this.buildRequestBody(messages, options, false)
                    ),
                }
            );

            if (!response.ok) {
                await this.handleErrorResponse(response);
            }

            const data: OllamaChatResponse = await response.json();

            return this.parseResponse(data);
        }, 'complete');
    }

    /**
     * Stream a chat completion
     */
    async stream(
        messages: ChatMessage[],
        options?: ChatCompletionOptions,
        onChunk?: StreamCallback
    ): Promise<ChatCompletionResponse> {
        return this.withRetry(async () => {
            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/api/chat`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                        this.buildRequestBody(messages, options, true)
                    ),
                }
            );

            if (!response.ok) {
                await this.handleErrorResponse(response);
            }

            return this.processStream(response, onChunk);
        }, 'stream');
    }

    /**
     * Check if Ollama is running and model is available
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/api/tags`,
                { method: 'GET' }
            );

            if (!response.ok) {
                console.error(
                    '[Ollama LLM] Health check failed: API not responding'
                );
                return false;
            }

            const data = await response.json();
            const models: OllamaModelInfo[] = data.models || [];
            const model = this.config.defaultModel;

            // Check if model is available
            const modelExists = models.some(
                (m) => m.name === model || m.name.startsWith(`${model}:`)
            );

            if (!modelExists) {
                console.warn(
                    `[Ollama LLM] Model '${model}' not found. Available:`,
                    models.map((m) => m.name)
                );
                console.warn(`[Ollama LLM] Run: ollama pull ${model}`);
                return false;
            }

            return true;
        } catch (error) {
            console.error(
                '[Ollama LLM] Health check failed:',
                (error as Error).message
            );
            return false;
        }
    }

    /**
     * List available models
     */
    async listModels(): Promise<string[]> {
        try {
            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/api/tags`,
                { method: 'GET' }
            );

            if (!response.ok) {
                return [];
            }

            const data = await response.json();
            return (data.models || []).map((m: OllamaModelInfo) => m.name);
        } catch {
            return [];
        }
    }

    /**
     * Build request body for Ollama API
     */
    private buildRequestBody(
        messages: ChatMessage[],
        options?: ChatCompletionOptions,
        stream: boolean = false
    ): OllamaChatRequest {
        const body: OllamaChatRequest = {
            model: this.getModel(options),
            messages: messages.map((msg) => ({
                role: msg.role,
                content: msg.content,
            })),
            stream,
        };

        // Build options object
        const ollamaOptions: OllamaChatRequest['options'] = {};

        if (options?.temperature !== undefined) {
            ollamaOptions.temperature = options.temperature;
        }

        if (options?.maxTokens !== undefined) {
            ollamaOptions.num_predict = options.maxTokens;
        }

        if (options?.topP !== undefined) {
            ollamaOptions.top_p = options.topP;
        }

        if (options?.stop) {
            ollamaOptions.stop = options.stop;
        }

        if (Object.keys(ollamaOptions).length > 0) {
            body.options = ollamaOptions;
        }

        return body;
    }

    /**
     * Parse Ollama response
     */
    private parseResponse(data: OllamaChatResponse): ChatCompletionResponse {
        return {
            content: data.message?.content || '',
            model: data.model,
            finishReason: this.mapFinishReason(data.done_reason),
            usage: {
                promptTokens: data.prompt_eval_count || 0,
                completionTokens: data.eval_count || 0,
                totalTokens:
                    (data.prompt_eval_count || 0) + (data.eval_count || 0),
            },
        };
    }

    /**
     * Map Ollama finish reason
     */
    private mapFinishReason(
        reason?: string
    ): 'stop' | 'length' | 'content_filter' | null {
        switch (reason) {
            case 'stop':
                return 'stop';
            case 'length':
                return 'length';
            default:
                return null;
        }
    }

    /**
     * Process streaming response
     */
    private async processStream(
        response: Response,
        onChunk?: StreamCallback
    ): Promise<ChatCompletionResponse> {
        const reader = response.body?.getReader();
        if (!reader) {
            throw new LLMError('No response body', this.name, 'NO_BODY', false);
        }

        const decoder = new TextDecoder();
        let content = '';
        let model = '';
        let finishReason: string | undefined;
        let promptTokens = 0;
        let completionTokens = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk
                    .split('\n')
                    .filter((line) => line.trim() !== '');

                for (const line of lines) {
                    try {
                        const data: OllamaChatResponse = JSON.parse(line);
                        model = data.model;

                        if (data.message?.content) {
                            content += data.message.content;
                            onChunk?.({
                                content: data.message.content,
                                done: false,
                            });
                        }

                        if (data.done) {
                            finishReason = data.done_reason;
                            promptTokens = data.prompt_eval_count || 0;
                            completionTokens = data.eval_count || 0;

                            onChunk?.({
                                content: '',
                                done: true,
                                finishReason,
                            });
                        }
                    } catch {
                        // Skip malformed JSON lines
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        return {
            content,
            model,
            finishReason: this.mapFinishReason(finishReason),
            usage: {
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens,
            },
        };
    }

    /**
     * Handle error responses
     */
    private async handleErrorResponse(response: Response): Promise<never> {
        let errorMessage = `Ollama error: ${response.status}`;

        try {
            const errorBody = await response.json();
            errorMessage = errorBody.error || errorMessage;
        } catch {
            // Ignore JSON parse errors
        }

        // Model not found
        if (response.status === 404) {
            throw new LLMError(
                `Model not found. Run: ollama pull ${this.config.defaultModel}`,
                this.name,
                'MODEL_NOT_FOUND',
                false
            );
        }

        throw new LLMError(
            errorMessage,
            this.name,
            `HTTP_${response.status}`,
            response.status >= 500
        );
    }
}

/**
 * Default Ollama LLM config for local development
 */
export const defaultOllamaLLMConfig: OllamaLLMConfig = {
    provider: 'ollama',
    baseUrl: env.OLLAMA_BASE_URL,
    defaultModel: env.OLLAMA_LLM_MODEL,
    apiKey: '', // Not needed for Ollama
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 120000, // Longer timeout for local inference
};

/**
 * Popular Ollama models for different use cases
 */
export const OllamaModels = {
    // General purpose
    LLAMA3_2: 'llama3.2', // 3B - Fast, good quality
    LLAMA3_2_1B: 'llama3.2:1b', // 1B - Fastest
    LLAMA3_1: 'llama3.1', // 8B - Better quality
    LLAMA3_1_70B: 'llama3.1:70b', // 70B - Best quality (needs GPU)

    // Coding
    CODELLAMA: 'codellama',
    DEEPSEEK_CODER: 'deepseek-coder',
    QWEN2_5_CODER: 'qwen2.5-coder',

    // Small & Fast
    PHI3: 'phi3', // 3.8B - Microsoft
    GEMMA2: 'gemma2', // 9B - Google
    GEMMA2_2B: 'gemma2:2b', // 2B - Fast
    MISTRAL: 'mistral', // 7B - Good balance

    // Specialized
    LLAVA: 'llava', // Vision model
    NOMIC_EMBED: 'nomic-embed-text', // Embeddings only
} as const;
