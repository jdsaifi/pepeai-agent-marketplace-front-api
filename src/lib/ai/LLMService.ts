/**
 * LLM Service
 * High-level service for chat completions with agent integration
 */

import env from '../../config/env';
import {
    LLMProvider,
    LLMProviderType,
    ChatMessage,
    ChatCompletionOptions,
    ChatCompletionResponse,
    StreamCallback,
    AgentContext,
    AgentPersonality,
    LLMError,
} from '../../types/llm';
import { LLMProviderFactory } from '../../provider/LLMProviderFactory';

// ============================================
// Service Types
// ============================================

export interface LLMServiceConfig {
    apiKeys?: {
        openai?: string;
        anthropic?: string;
        google?: string;
        ollama?: string;
    };
}

export interface ChatOptions extends ChatCompletionOptions {
    /**
     * Include RAG context in the prompt
     */
    context?: string;

    /**
     * Conversation history
     */
    history?: ChatMessage[];

    /**
     * Stream the response
     */
    stream?: boolean;

    /**
     * Callback for streaming chunks
     */
    onChunk?: StreamCallback;
}

export interface AgentChatOptions
    extends Omit<ChatOptions, 'model' | 'temperature' | 'maxTokens'> {
    /**
     * Override agent's default settings
     */
    overrides?: {
        temperature?: number;
        maxTokens?: number;
    };
}

// ============================================
// LLM Service
// ============================================

export class LLMService {
    private providers: Map<LLMProviderType, LLMProvider> = new Map();
    private apiKeys: LLMServiceConfig['apiKeys'];

    constructor(config?: LLMServiceConfig) {
        this.apiKeys = config?.apiKeys || {
            openai: env.OPENAI_API_KEY,
            anthropic: env.ANTHROPIC_API_KEY,
            google: env.GOOGLE_GEMINI_API_KEY,
        };
    }

    /**
     * Get or create a provider instance
     */
    private getProvider(
        providerType: LLMProviderType,
        model: string
    ): LLMProvider {
        const key = `${providerType}:${model}`;

        if (!this.providers.has(providerType)) {
            const provider = LLMProviderFactory.createFromAgentConfig(
                { provider: providerType, model },
                this.apiKeys
            );
            this.providers.set(providerType, provider);
        }

        return this.providers.get(providerType)!;
    }

    /**
     * Chat with an agent
     * Main method for agent-based conversations
     */
    async chatWithAgent(
        agent: AgentContext,
        userMessage: string,
        options: AgentChatOptions = {}
    ): Promise<ChatCompletionResponse> {
        const {
            context,
            history = [],
            stream = false,
            onChunk,
            overrides,
        } = options;

        // Build messages array
        const messages = this.buildAgentMessages(
            agent,
            userMessage,
            history,
            context
        );

        // Get completion options from agent config
        const completionOptions: ChatCompletionOptions = {
            model: agent.llmConfig.model,
            temperature: overrides?.temperature ?? agent.llmConfig.temperature,
            maxTokens: overrides?.maxTokens ?? agent.llmConfig.maxTokens,
            user: agent.agentId,
        };

        // Get provider
        const provider = this.getProvider(
            agent.llmConfig.provider,
            agent.llmConfig.model
        );

        // Generate response
        if (stream && onChunk) {
            return provider.stream(messages, completionOptions, onChunk);
        }

        return provider.complete(messages, completionOptions);
    }

    /**
     * Simple chat without agent context
     */
    async chat(
        providerType: LLMProviderType,
        messages: ChatMessage[],
        options: ChatOptions = {}
    ): Promise<ChatCompletionResponse> {
        const {
            stream = false,
            onChunk,
            context,
            history = [],
            ...completionOptions
        } = options;

        // Add context if provided
        let finalMessages = [...messages];
        if (context) {
            finalMessages = this.injectContext(finalMessages, context);
        }

        // Add history if provided
        if (history.length > 0) {
            finalMessages = [...history, ...finalMessages];
        }

        const provider = this.getProvider(
            providerType,
            completionOptions.model || 'gpt-4o-mini'
        );

        if (stream && onChunk) {
            return provider.stream(finalMessages, completionOptions, onChunk);
        }

        return provider.complete(finalMessages, completionOptions);
    }

    /**
     * Build messages array for agent conversation
     */
    private buildAgentMessages(
        agent: AgentContext,
        userMessage: string,
        history: ChatMessage[],
        context?: string
    ): ChatMessage[] {
        const messages: ChatMessage[] = [];

        // 1. System prompt with personality
        let systemPrompt = agent.systemPrompt;

        // Add personality instructions if defined
        if (agent.personality) {
            systemPrompt += this.buildPersonalityInstructions(
                agent.personality
            );
        }

        // Add RAG context if provided
        if (context) {
            systemPrompt += this.buildContextInstructions(context);
        }

        messages.push({
            role: 'system',
            content: systemPrompt,
        });

        // 2. Conversation history
        for (const msg of history) {
            if (msg.role !== 'system') {
                messages.push(msg);
            }
        }

        // 3. Current user message
        messages.push({
            role: 'user',
            content: userMessage,
        });

        return messages;
    }

    /**
     * Build personality instructions
     */
    private buildPersonalityInstructions(
        personality: AgentPersonality
    ): string {
        const toneInstructions: Record<string, string> = {
            formal: 'Maintain a formal, professional tone.',
            casual: 'Use a casual, conversational tone.',
            friendly: 'Be warm and friendly in your responses.',
            professional: 'Keep a professional and business-like demeanor.',
            playful: 'Be playful and engaging with humor when appropriate.',
        };

        const styleInstructions: Record<string, string> = {
            concise: 'Keep responses brief and to the point.',
            detailed: 'Provide comprehensive, detailed responses.',
            balanced: 'Balance detail with clarity.',
        };

        return `\n\n## Communication Style
  ${toneInstructions[personality.tone] || ''}
  ${styleInstructions[personality.responseStyle] || ''}`;
    }

    /**
     * Build context injection instructions
     */
    private buildContextInstructions(context: string): string {
        return `\n\n## Reference Information
  Use the following information to answer the user's question. If the answer is not in this information, say so honestly.
  
  <context>
  ${context}
  </context>

  ### NOTE ###
  if user asked any out of context question then simply refused to answer them.
  do not try to use your own knowledge to answer.
  do not reply with general knowledge.
  your task is to reply only and only under the context provided to you.
  `;
    }

    /**
     * Inject context into existing messages
     */
    private injectContext(
        messages: ChatMessage[],
        context: string
    ): ChatMessage[] {
        const result = [...messages];

        // Find system message or create one
        const systemIndex = result.findIndex((m) => m.role === 'system');

        if (systemIndex >= 0) {
            result[systemIndex] = {
                ...result[systemIndex],
                content:
                    result[systemIndex].content +
                    this.buildContextInstructions(context),
            };
        } else {
            result.unshift({
                role: 'system',
                content: `Answer based on the following context:\n\n${context}`,
            });
        }

        return result;
    }

    /**
     * Health check for a specific provider
     */
    async healthCheck(providerType: LLMProviderType): Promise<{
        provider: string;
        healthy: boolean;
    }> {
        try {
            const provider = this.getProvider(providerType, 'default');
            const healthy = await provider.healthCheck();
            return { provider: providerType, healthy };
        } catch (error) {
            return { provider: providerType, healthy: false };
        }
    }

    /**
     * Health check for all configured providers
     */
    async healthCheckAll(): Promise<
        Array<{ provider: string; healthy: boolean }>
    > {
        const checks: Promise<{ provider: string; healthy: boolean }>[] = [];

        if (this.apiKeys?.openai) {
            checks.push(this.healthCheck('openai'));
        }
        if (this.apiKeys?.anthropic) {
            checks.push(this.healthCheck('anthropic'));
        }
        if (this.apiKeys?.google) {
            checks.push(this.healthCheck('google'));
        }

        if (this.apiKeys?.ollama) {
            checks.push(this.healthCheck('ollama'));
        }

        return Promise.all(checks);
    }

    /**
     * Estimate token count (rough approximation)
     * For accurate counts, use tiktoken or provider-specific tokenizers
     */
    estimateTokens(text: string): number {
        // Rough estimate: ~4 characters per token
        return Math.ceil(text.length / 4);
    }

    /**
     * Truncate messages to fit context window
     */
    truncateHistory(
        messages: ChatMessage[],
        maxTokens: number,
        preserveSystem: boolean = true
    ): ChatMessage[] {
        const result: ChatMessage[] = [];
        let currentTokens = 0;

        // Always include system message first if preserving
        if (preserveSystem) {
            const systemMsg = messages.find((m) => m.role === 'system');
            if (systemMsg) {
                result.push(systemMsg);
                currentTokens += this.estimateTokens(systemMsg.content);
            }
        }

        // Add messages from newest to oldest until we hit the limit
        const nonSystemMessages = messages.filter((m) => m.role !== 'system');

        for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
            const msg = nonSystemMessages[i];
            const msgTokens = this.estimateTokens(msg.content);

            if (currentTokens + msgTokens > maxTokens) {
                break;
            }

            result.splice(preserveSystem ? 1 : 0, 0, msg);
            currentTokens += msgTokens;
        }

        return result;
    }
}

// ============================================
// Singleton
// ============================================

let defaultLLMService: LLMService | null = null;

export function getLLMService(): LLMService {
    if (!defaultLLMService) {
        defaultLLMService = new LLMService();
    }
    return defaultLLMService;
}

export function resetLLMService(): void {
    defaultLLMService = null;
}
