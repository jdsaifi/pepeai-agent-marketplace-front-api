/**
 * Google Gemini LLM Provider
 * Supports Gemini Pro, Gemini Flash, etc.
 */

import env from '../config/env';
import { BaseLLMProvider } from './baseLLMProvider';
import {
    GoogleLLMConfig,
    ChatMessage,
    ChatCompletionOptions,
    ChatCompletionResponse,
    StreamCallback,
    LLMError,
    LLMRateLimitError,
    LLMContextLengthError,
    LLMContentFilterError,
} from '../types/llm';

interface GeminiContent {
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
}

interface GeminiResponse {
    candidates: Array<{
        content: {
            parts: Array<{ text: string }>;
            role: string;
        };
        finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
        safetyRatings?: Array<{
            category: string;
            probability: string;
        }>;
    }>;
    usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
    };
    modelVersion?: string;
}

export class GoogleLLMProvider extends BaseLLMProvider {
    readonly name = 'google' as const;
    private readonly apiKey: string;
    private readonly baseUrl: string;

    constructor(config: GoogleLLMConfig) {
        super(config);
        this.apiKey = config.apiKey;
        this.baseUrl =
            config.baseUrl ||
            'https://generativelanguage.googleapis.com/v1beta';
    }

    /**
     * Generate a chat completion
     */
    async complete(
        messages: ChatMessage[],
        options?: ChatCompletionOptions
    ): Promise<ChatCompletionResponse> {
        return this.withRetry(async () => {
            const { systemInstruction, contents } =
                this.formatMessages(messages);
            const model = this.getModel(options);

            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                        this.buildRequestBody(
                            systemInstruction,
                            contents,
                            options
                        )
                    ),
                }
            );

            if (!response.ok) {
                await this.handleErrorResponse(response);
            }

            const data: GeminiResponse = await response.json();

            return this.parseResponse(data, model);
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
            const { systemInstruction, contents } =
                this.formatMessages(messages);
            const model = this.getModel(options);

            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                        this.buildRequestBody(
                            systemInstruction,
                            contents,
                            options
                        )
                    ),
                }
            );

            if (!response.ok) {
                await this.handleErrorResponse(response);
            }

            return this.processStream(response, model, onChunk);
        }, 'stream');
    }

    /**
     * Check if API is accessible
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/models?key=${this.apiKey}`,
                { method: 'GET' }
            );
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Format messages for Gemini API
     */
    private formatMessages(messages: ChatMessage[]): {
        systemInstruction: string | undefined;
        contents: GeminiContent[];
    } {
        let systemInstruction: string | undefined;
        const contents: GeminiContent[] = [];

        for (const message of messages) {
            if (message.role === 'system') {
                systemInstruction = systemInstruction
                    ? `${systemInstruction}\n\n${message.content}`
                    : message.content;
            } else {
                contents.push({
                    role: message.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: message.content }],
                });
            }
        }

        // Ensure contents start with user
        if (contents.length > 0 && contents[0].role !== 'user') {
            contents.unshift({
                role: 'user',
                parts: [{ text: 'Hello' }],
            });
        }

        return { systemInstruction, contents };
    }

    /**
     * Build request body
     */
    private buildRequestBody(
        systemInstruction: string | undefined,
        contents: GeminiContent[],
        options?: ChatCompletionOptions
    ): Record<string, unknown> {
        const body: Record<string, unknown> = {
            contents,
            generationConfig: {},
        };

        if (systemInstruction) {
            body.systemInstruction = {
                parts: [{ text: systemInstruction }],
            };
        }

        const generationConfig: Record<string, unknown> = {};

        if (options?.temperature !== undefined) {
            generationConfig.temperature = options.temperature;
        }

        if (options?.maxTokens !== undefined) {
            generationConfig.maxOutputTokens = options.maxTokens;
        }

        if (options?.topP !== undefined) {
            generationConfig.topP = options.topP;
        }

        if (options?.stop) {
            generationConfig.stopSequences = options.stop;
        }

        if (Object.keys(generationConfig).length > 0) {
            body.generationConfig = generationConfig;
        }

        return body;
    }

    /**
     * Parse Gemini response
     */
    private parseResponse(
        data: GeminiResponse,
        model: string
    ): ChatCompletionResponse {
        const candidate = data.candidates?.[0];

        if (!candidate) {
            throw new LLMError(
                'No response candidates',
                this.name,
                'NO_CANDIDATES',
                false
            );
        }

        const content =
            candidate.content?.parts?.map((part) => part.text).join('') || '';

        return {
            content,
            model,
            finishReason: this.mapFinishReason(candidate.finishReason),
            usage: {
                promptTokens: data.usageMetadata?.promptTokenCount || 0,
                completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata?.totalTokenCount || 0,
            },
        };
    }

    /**
     * Map Gemini finish reason to our format
     */
    private mapFinishReason(
        reason: string
    ): 'stop' | 'length' | 'content_filter' | null {
        switch (reason) {
            case 'STOP':
                return 'stop';
            case 'MAX_TOKENS':
                return 'length';
            case 'SAFETY':
            case 'RECITATION':
                return 'content_filter';
            default:
                return null;
        }
    }

    /**
     * Process streaming response
     */
    private async processStream(
        response: Response,
        model: string,
        onChunk?: StreamCallback
    ): Promise<ChatCompletionResponse> {
        const reader = response.body?.getReader();
        if (!reader) {
            throw new LLMError('No response body', this.name, 'NO_BODY', false);
        }

        const decoder = new TextDecoder();
        let content = '';
        let finishReason: string | null = null;
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

                        try {
                            const parsed: GeminiResponse = JSON.parse(data);
                            const candidate = parsed.candidates?.[0];

                            if (candidate?.content?.parts) {
                                const text = candidate.content.parts
                                    .map((part) => part.text)
                                    .join('');

                                if (text) {
                                    content += text;
                                    onChunk?.({
                                        content: text,
                                        done: false,
                                    });
                                }
                            }

                            if (candidate?.finishReason) {
                                finishReason = candidate.finishReason;
                            }

                            if (parsed.usageMetadata) {
                                usage = {
                                    promptTokens:
                                        parsed.usageMetadata.promptTokenCount ||
                                        0,
                                    completionTokens:
                                        parsed.usageMetadata
                                            .candidatesTokenCount || 0,
                                    totalTokens:
                                        parsed.usageMetadata.totalTokenCount ||
                                        0,
                                };
                            }
                        } catch {
                            // Skip malformed JSON
                        }
                    }
                }
            }

            onChunk?.({
                content: '',
                done: true,
                finishReason: finishReason || undefined,
            });
        } finally {
            reader.releaseLock();
        }

        return {
            content,
            model,
            finishReason: this.mapFinishReason(finishReason || ''),
            usage,
        };
    }

    /**
     * Handle error responses
     */
    private async handleErrorResponse(response: Response): Promise<never> {
        let errorMessage = `Google error: ${response.status}`;

        try {
            const errorBody = await response.json();
            errorMessage = errorBody.error?.message || errorMessage;
        } catch {
            // Ignore JSON parse errors
        }

        // Rate limiting
        if (response.status === 429) {
            throw new LLMRateLimitError(this.name);
        }

        // Content filter
        if (
            errorMessage.includes('SAFETY') ||
            errorMessage.includes('blocked')
        ) {
            throw new LLMContentFilterError(this.name);
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
 * Default Google config
 */
export const defaultGoogleLLMConfig: GoogleLLMConfig = {
    provider: 'google',
    apiKey: env.GOOGLE_GEMINI_API_KEY,
    defaultModel: env.GOOGLE_GEMINI_LLM_MODEL,
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 60000,
};
