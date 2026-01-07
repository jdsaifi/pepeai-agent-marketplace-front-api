/**
 * RAG Service
 * Combines embedding generation and vector search for retrieval
 */

import { EmbeddingService, getEmbeddingService } from './embeddingService';
import { QdrantService, getQdrantService } from './qdrantService';
import { SearchOptions, ScoredPoint, PointPayload } from '../../types/qdrant';

export interface RAGSearchOptions extends Omit<SearchOptions, 'filter'> {
    /**
     * Filter by document ID
     */
    documentId?: string;

    /**
     * Filter by knowledge base ID
     */
    knowledgeBaseId?: string;

    /**
     * Additional filter conditions
     */
    filters?: Record<string, string | number | boolean>;
}

export interface RAGSearchResult {
    query: string;
    results: Array<{
        content: string;
        score: number;
        metadata: PointPayload;
    }>;
    searchTimeMs: number;
    embeddingTimeMs: number;
    totalTimeMs: number;
}

export interface RAGContext {
    content: string;
    sources: Array<{
        documentId?: string;
        pageNumber?: number;
        chunkIndex?: number;
        score: number;
    }>;
}

export class RAGService {
    private readonly embeddingService: EmbeddingService;
    private readonly qdrantService: QdrantService;

    constructor(
        embeddingService?: EmbeddingService,
        qdrantService?: QdrantService
    ) {
        this.embeddingService = embeddingService || getEmbeddingService();
        this.qdrantService = qdrantService || getQdrantService();
    }

    /**
     * Search for relevant content using a text query
     * This is the main method for RAG retrieval
     */
    async search(
        agentId: string,
        query: string,
        options: RAGSearchOptions = {}
    ): Promise<RAGSearchResult> {
        const totalStart = Date.now();

        // 1. Generate query embedding
        const embeddingStart = Date.now();
        const queryVector = await this.embeddingService.embed(query);
        const embeddingTimeMs = Date.now() - embeddingStart;

        // 2. Build search options with filters
        const { documentId, knowledgeBaseId, filters, ...searchOptions } =
            options;

        const searchOpts: SearchOptions = {
            ...searchOptions,
            limit: options.limit || 5,
        };

        // Build filter if needed
        if (documentId || knowledgeBaseId || filters) {
            searchOpts.filter = {
                must: [
                    ...(documentId
                        ? [{ key: 'documentId', match: { value: documentId } }]
                        : []),
                    ...(knowledgeBaseId
                        ? [
                              {
                                  key: 'knowledgeBaseId',
                                  match: { value: knowledgeBaseId },
                              },
                          ]
                        : []),
                    ...Object.entries(filters || {}).map(([key, value]) => ({
                        key,
                        match: { value },
                    })),
                ],
            };
        }

        // 3. Search in Qdrant
        const collectionName =
            this.qdrantService.getAgentCollectionName(agentId);
        const searchResult = await this.qdrantService.search(
            collectionName,
            queryVector,
            searchOpts
        );

        // 4. Format results
        const results = searchResult.points.map((point) => ({
            content: point.payload.content,
            score: point.score,
            metadata: point.payload,
        }));

        return {
            query,
            results,
            searchTimeMs: searchResult.searchTimeMs,
            embeddingTimeMs,
            totalTimeMs: Date.now() - totalStart,
        };
    }

    /**
     * Get context string for LLM prompt
     * Combines top results into a formatted context
     */
    async getContext(
        agentId: string,
        query: string,
        options: RAGSearchOptions & {
            maxTokens?: number;
            separator?: string;
        } = {}
    ): Promise<RAGContext> {
        const {
            maxTokens = 4000,
            separator = '\n\n---\n\n',
            ...searchOptions
        } = options;

        const searchResult = await this.search(agentId, query, searchOptions);

        // Build context string with approximate token limit
        // Rough estimate: 1 token ≈ 4 characters
        const maxChars = maxTokens * 4;

        let totalChars = 0;
        const includedResults: typeof searchResult.results = [];

        for (const result of searchResult.results) {
            const contentLength = result.content.length + separator.length;
            if (totalChars + contentLength > maxChars) {
                break;
            }
            includedResults.push(result);
            totalChars += contentLength;
        }

        const content = includedResults.map((r) => r.content).join(separator);

        const sources = includedResults.map((r) => ({
            documentId: r.metadata.documentId,
            pageNumber: r.metadata.pageNumber,
            chunkIndex: r.metadata.chunkIndex,
            score: r.score,
        }));

        return { content, sources };
    }

    /**
     * Search across multiple agents
     */
    async searchMultiAgent(
        agentIds: string[],
        query: string,
        options: RAGSearchOptions = {}
    ): Promise<Map<string, RAGSearchResult>> {
        const results = new Map<string, RAGSearchResult>();

        // Search all agents in parallel
        const searches = agentIds.map(async (agentId) => {
            try {
                const result = await this.search(agentId, query, options);
                return { agentId, result };
            } catch (error) {
                console.error(`Search failed for agent ${agentId}:`, error);
                return { agentId, result: null };
            }
        });

        const searchResults = await Promise.all(searches);

        for (const { agentId, result } of searchResults) {
            if (result) {
                results.set(agentId, result);
            }
        }

        return results;
    }

    /**
     * Health check for all services
     */
    async healthCheck(): Promise<{
        healthy: boolean;
        embedding: { healthy: boolean; provider: string };
        qdrant: { healthy: boolean; version?: string };
    }> {
        const [embeddingHealth, qdrantHealth] = await Promise.all([
            this.embeddingService.healthCheck(),
            this.qdrantService.healthCheck(),
        ]);

        return {
            healthy: embeddingHealth.healthy && qdrantHealth.healthy,
            embedding: {
                healthy: embeddingHealth.healthy,
                provider: embeddingHealth.provider,
            },
            qdrant: qdrantHealth,
        };
    }

    /**
     * Get embedding dimensions (for collection creation)
     */
    get embeddingDimensions(): number {
        return this.embeddingService.dimensions;
    }
}

// ============================================
// Singleton
// ============================================

let defaultRAGService: RAGService | null = null;

export function getRAGService(): RAGService {
    if (!defaultRAGService) {
        defaultRAGService = new RAGService();
    }
    return defaultRAGService;
}

export function resetRAGService(): void {
    defaultRAGService = null;
}
