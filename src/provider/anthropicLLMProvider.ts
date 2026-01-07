/**
 * Anthropic LLM Provider
 * Supports Claude 3.5 Sonnet, Claude 3 Opus, etc.
 */

import { BaseLLMProvider } from './baseLLMProvider';
import {
    AnthropicLLMConfig,
    ChatMessage,
    ChatCompletionOptions,
    ChatCompletionResponse,
    StreamCallback,
    LLMError,
    LLMRateLimitError,
    LLMContextLengthError,
    LLMContentFilterError,
} from '../types/llm';
import env from '../config/env';

interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface AnthropicResponse {
    id: string;
    type: string;
    role: string;
    content: Array<{
        type: 'text';
        text: string;
    }>;
    model: string;
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}

interface AnthropicStreamEvent {
    type: string;
    message?: AnthropicResponse;
    index?: number;
    content_block?: { type: string; text: string };
    delta?: { type: string; text?: string; stop_reason?: string };
    usage?: { output_tokens: number };
}

export class AnthropicLLMProvider extends BaseLLMProvider {
    readonly name = 'anthropic' as const;
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly apiVersion = '2023-06-01';

    constructor(config: AnthropicLLMConfig) {
        super(config);
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
    }

    /**
     * Generate a chat completion
     */
    async complete(
        messages: ChatMessage[],
        options?: ChatCompletionOptions
    ): Promise<ChatCompletionResponse> {
        return this.withRetry(async () => {
            const { systemPrompt, formattedMessages } =
                this.formatMessages(messages);

            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/messages`,
                {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify(
                        this.buildRequestBody(
                            systemPrompt,
                            formattedMessages,
                            options,
                            false
                        )
                    ),
                }
            );

            if (!response.ok) {
                await this.handleErrorResponse(response);
            }

            const data: AnthropicResponse = await response.json();

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
            const { systemPrompt, formattedMessages } =
                this.formatMessages(messages);

            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/messages`,
                {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify(
                        this.buildRequestBody(
                            systemPrompt,
                            formattedMessages,
                            options,
                            true
                        )
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
            // Anthropic doesn't have a simple health endpoint, so we make a minimal request
            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/messages`,
                {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({
                        model: this.config.defaultModel,
                        max_tokens: 1,
                        messages: [{ role: 'user', content: 'Hi' }],
                    }),
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
        return {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': this.apiVersion,
        };
    }

    /**
     * Format messages for Anthropic API
     * Anthropic handles system prompts separately
     */
    private formatMessages(messages: ChatMessage[]): {
        systemPrompt: string | undefined;
        formattedMessages: AnthropicMessage[];
    } {
        let systemPrompt: string | undefined;
        const formattedMessages: AnthropicMessage[] = [];

        for (const message of messages) {
            if (message.role === 'system') {
                // Concatenate system messages
                systemPrompt = systemPrompt
                    ? `${systemPrompt}\n\n${message.content}`
                    : message.content;
            } else {
                formattedMessages.push({
                    role: message.role as 'user' | 'assistant',
                    content: message.content,
                });
            }
        }

        // Ensure messages start with user (Anthropic requirement)
        if (
            formattedMessages.length > 0 &&
            formattedMessages[0].role !== 'user'
        ) {
            formattedMessages.unshift({
                role: 'user',
                content: 'Hello',
            });
        }

        return { systemPrompt, formattedMessages };
    }

    /**
     * Build request body
     */
    private buildRequestBody(
        systemPrompt: string | undefined,
        messages: AnthropicMessage[],
        options?: ChatCompletionOptions,
        stream: boolean = false
    ): Record<string, unknown> {
        const body: Record<string, unknown> = {
            model: this.getModel(options),
            messages,
            max_tokens: options?.maxTokens || 1024,
            stream,
        };

        if (systemPrompt) {
            body.system = systemPrompt;
        }

        if (options?.temperature !== undefined) {
            body.temperature = options.temperature;
        }

        if (options?.topP !== undefined) {
            body.top_p = options.topP;
        }

        if (options?.stop) {
            body.stop_sequences = options.stop;
        }

        return body;
    }

    /**
     * Parse Anthropic response
     */
    private parseResponse(data: AnthropicResponse): ChatCompletionResponse {
        const content = data.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('');

        return {
            content,
            model: data.model,
            finishReason: this.mapFinishReason(data.stop_reason),
            usage: {
                promptTokens: data.usage?.input_tokens || 0,
                completionTokens: data.usage?.output_tokens || 0,
                totalTokens:
                    (data.usage?.input_tokens || 0) +
                    (data.usage?.output_tokens || 0),
            },
        };
    }

    /**
     * Map Anthropic stop reason to our format
     */
    private mapFinishReason(
        reason: string | null
    ): 'stop' | 'length' | 'content_filter' | null {
        switch (reason) {
            case 'end_turn':
            case 'stop_sequence':
                return 'stop';
            case 'max_tokens':
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
        let finishReason: string | null = null;
        let model = '';
        let inputTokens = 0;
        let outputTokens = 0;

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

                        try {
                            const event: AnthropicStreamEvent =
                                JSON.parse(data);

                            switch (event.type) {
                                case 'message_start':
                                    if (event.message) {
                                        model = event.message.model;
                                        inputTokens =
                                            event.message.usage?.input_tokens ||
                                            0;
                                    }
                                    break;

                                case 'content_block_delta':
                                    if (event.delta?.text) {
                                        content += event.delta.text;
                                        onChunk?.({
                                            content: event.delta.text,
                                            done: false,
                                        });
                                    }
                                    break;

                                case 'message_delta':
                                    if (event.delta?.stop_reason) {
                                        finishReason = event.delta.stop_reason;
                                    }
                                    if (event.usage?.output_tokens) {
                                        outputTokens =
                                            event.usage.output_tokens;
                                    }
                                    break;

                                case 'message_stop':
                                    onChunk?.({
                                        content: '',
                                        done: true,
                                        finishReason: finishReason || undefined,
                                    });
                                    break;
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
            finishReason: this.mapFinishReason(finishReason),
            usage: {
                promptTokens: inputTokens,
                completionTokens: outputTokens,
                totalTokens: inputTokens + outputTokens,
            },
        };
    }

    /**
     * Handle error responses
     */
    private async handleErrorResponse(response: Response): Promise<never> {
        let errorMessage = `Anthropic error: ${response.status}`;
        let errorType = '';

        try {
            const errorBody = await response.json();
            errorMessage = errorBody.error?.message || errorMessage;
            errorType = errorBody.error?.type || '';
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
        if (
            errorType === 'invalid_request_error' &&
            errorMessage.includes('token')
        ) {
            throw new LLMContextLengthError(this.name, 0);
        }

        // Auth errors
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
 * Default Anthropic config
 */
export const defaultAnthropicLLMConfig: AnthropicLLMConfig = {
    provider: 'anthropic',
    apiKey: env.ANTHROPIC_API_KEY,
    defaultModel: env.ANTHROPIC_LLM_MODEL,
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 60000,
};
