/**
 * OpenAI LLM Provider
 * Supports GPT-4, GPT-4o, GPT-4o-mini, etc.
 */

import env from '../config/env';
import { BaseLLMProvider } from './baseLLMProvider';
import {
    OpenAILLMConfig,
    ChatMessage,
    ChatCompletionOptions,
    ChatCompletionResponse,
    StreamCallback,
    LLMError,
    LLMRateLimitError,
    LLMContextLengthError,
    LLMContentFilterError,
} from '../types/llm';

interface OpenAIChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    name?: string;
}

interface OpenAIResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: 'stop' | 'length' | 'content_filter' | null;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

interface OpenAIStreamChunk {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        delta: {
            role?: string;
            content?: string;
        };
        finish_reason: 'stop' | 'length' | 'content_filter' | null;
    }>;
}

export class OpenAILLMProvider extends BaseLLMProvider {
    readonly name = 'openai' as const;
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly organization?: string;

    constructor(config: OpenAILLMConfig) {
        super(config);
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        this.organization = config.organization;
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
                `${this.baseUrl}/chat/completions`,
                {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify(
                        this.buildRequestBody(messages, options, false)
                    ),
                }
            );

            if (!response.ok) {
                await this.handleErrorResponse(response);
            }

            const data: OpenAIResponse = await response.json();

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
                `${this.baseUrl}/chat/completions`,
                {
                    method: 'POST',
                    headers: this.getHeaders(),
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
     * Check if API is accessible
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/models`,
                {
                    method: 'GET',
                    headers: this.getHeaders(),
                }
            );
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Build request headers
     */
    private getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
        };

        if (this.organization) {
            headers['OpenAI-Organization'] = this.organization;
        }

        return headers;
    }

    /**
     * Build request body
     */
    private buildRequestBody(
        messages: ChatMessage[],
        options?: ChatCompletionOptions,
        stream: boolean = false
    ): Record<string, unknown> {
        const body: Record<string, unknown> = {
            model: this.getModel(options),
            messages: messages.map(this.formatMessage),
            stream,
        };

        if (options?.temperature !== undefined) {
            body.temperature = options.temperature;
        }

        if (options?.maxTokens !== undefined) {
            body.max_tokens = options.maxTokens;
        }

        if (options?.topP !== undefined) {
            body.top_p = options.topP;
        }

        if (options?.stop) {
            body.stop = options.stop;
        }

        if (options?.frequencyPenalty !== undefined) {
            body.frequency_penalty = options.frequencyPenalty;
        }

        if (options?.presencePenalty !== undefined) {
            body.presence_penalty = options.presencePenalty;
        }

        if (options?.user) {
            body.user = options.user;
        }

        if (stream) {
            body.stream_options = { include_usage: true };
        }

        return body;
    }

    /**
     * Format message for OpenAI API
     */
    private formatMessage(message: ChatMessage): OpenAIChatMessage {
        return {
            role: message.role,
            content: message.content,
            ...(message.name && { name: message.name }),
        };
    }

    /**
     * Parse OpenAI response
     */
    private parseResponse(data: OpenAIResponse): ChatCompletionResponse {
        const choice = data.choices[0];

        return {
            content: choice?.message?.content || '',
            model: data.model,
            finishReason: choice?.finish_reason || null,
            usage: {
                promptTokens: data.usage?.prompt_tokens || 0,
                completionTokens: data.usage?.completion_tokens || 0,
                totalTokens: data.usage?.total_tokens || 0,
            },
        };
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
        let finishReason: string | null = null;
        let model = '';
        let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk
                    .split('\n')
                    .filter((line) => line.trim() !== '');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);

                        if (data === '[DONE]') {
                            onChunk?.({
                                content: '',
                                done: true,
                                finishReason: finishReason || undefined,
                            });
                            continue;
                        }

                        try {
                            const parsed: OpenAIStreamChunk = JSON.parse(data);
                            model = parsed.model;

                            const choice = parsed.choices[0];
                            if (choice?.delta?.content) {
                                content += choice.delta.content;
                                onChunk?.({
                                    content: choice.delta.content,
                                    done: false,
                                });
                            }

                            if (choice?.finish_reason) {
                                finishReason = choice.finish_reason;
                            }

                            // Check for usage in final chunk (with stream_options)
                            if ((parsed as any).usage) {
                                usage = {
                                    promptTokens:
                                        (parsed as any).usage.prompt_tokens ||
                                        0,
                                    completionTokens:
                                        (parsed as any).usage
                                            .completion_tokens || 0,
                                    totalTokens:
                                        (parsed as any).usage.total_tokens || 0,
                                };
                            }
                        } catch {
                            // Skip malformed JSON
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        return {
            content,
            model,
            finishReason: finishReason as any,
            usage,
        };
    }

    /**
     * Handle error responses
     */
    private async handleErrorResponse(response: Response): Promise<never> {
        let errorMessage = `OpenAI error: ${response.status}`;
        let errorCode = '';

        try {
            const errorBody = await response.json();
            errorMessage = errorBody.error?.message || errorMessage;
            errorCode = errorBody.error?.code || '';
        } catch {
            // Ignore JSON parse errors
        }

        // Rate limiting
        if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after');
            const retryAfterMs = retryAfter
                ? parseInt(retryAfter) * 1000
                : undefined;
            throw new LLMRateLimitError(this.name, retryAfterMs);
        }

        // Context length
        if (errorCode === 'context_length_exceeded') {
            throw new LLMContextLengthError(this.name, 0);
        }

        // Content filter
        if (errorCode === 'content_filter') {
            throw new LLMContentFilterError(this.name);
        }

        // Auth errors (not retryable)
        if (response.status === 401 || response.status === 403) {
            throw new LLMError(
                `Authentication error: ${errorMessage}`,
                this.name,
                'AUTH_ERROR',
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
 * Default OpenAI config
 */
export const defaultOpenAILLMConfig: OpenAILLMConfig = {
    provider: 'openai',
    apiKey: env.OPENAI_API_KEY,
    defaultModel: env.OPENAI_LLM_MODEL,
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 60000,
};
