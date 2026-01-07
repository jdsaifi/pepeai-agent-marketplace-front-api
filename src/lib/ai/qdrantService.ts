/**
 * Qdrant Service
 * Vector database operations for RAG retrieval
 */

import env from '../../config/env';
import {
    QdrantConfig,
    QdrantError,
    QdrantConnectionError,
    QdrantCollectionNotFoundError,
    SearchOptions,
    SearchResult,
    SearchFilter,
    ScoredPoint,
    PointStruct,
    PointPayload,
    CollectionConfig,
    CollectionInfo,
    UpsertOptions,
    UpsertResult,
} from '../../types/qdrant';

// Default configuration
const DEFAULT_CONFIG: Partial<QdrantConfig> = {
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY,
    timeout: 30000,
};

export class QdrantService {
    private readonly baseUrl: string;
    private readonly apiKey?: string;
    private readonly timeout: number;

    constructor(config?: Partial<QdrantConfig>) {
        const mergedConfig = { ...DEFAULT_CONFIG, ...config };
        this.baseUrl = mergedConfig.url!.replace(/\/$/, '');
        this.apiKey = mergedConfig.apiKey;
        this.timeout = mergedConfig.timeout!;
    }

    // ============================================
    // Search Operations
    // ============================================

    /**
     * Search for similar vectors in a collection
     * Equivalent to Python's query_points()
     */
    async search(
        collectionName: string,
        queryVector: number[],
        options: SearchOptions = {}
    ): Promise<SearchResult> {
        const {
            limit = 5,
            scoreThreshold,
            withVector = false,
            filter,
            offset = 0,
        } = options;

        const startTime = Date.now();

        const body: Record<string, unknown> = {
            vector: queryVector,
            limit,
            offset,
            with_payload: true,
            with_vector: withVector,
        };

        if (scoreThreshold !== undefined) {
            body.score_threshold = scoreThreshold;
        }

        if (filter) {
            body.filter = this.buildFilter(filter);
        }

        const response = await this.request<{ result: QdrantSearchResult[] }>(
            'POST',
            `/collections/${collectionName}/points/search`,
            body
        );

        const points: ScoredPoint[] = response.result.map((point) => ({
            id: point.id,
            score: point.score,
            payload: point.payload as PointPayload,
            vector: point.vector,
        }));

        return {
            points,
            searchTimeMs: Date.now() - startTime,
        };
    }

    /**
     * Search by agent ID (convenience method)
     * Uses collection naming convention: agent_{agentId}
     */
    async searchByAgent(
        agentId: string,
        queryVector: number[],
        options: SearchOptions = {}
    ): Promise<SearchResult> {
        const collectionName = this.getAgentCollectionName(agentId);
        return this.search(collectionName, queryVector, options);
    }

    /**
     * Search with text query (requires EmbeddingService)
     * This is a convenience method - you can also embed externally
     */
    async searchWithFilter(
        collectionName: string,
        queryVector: number[],
        filterConditions: {
            documentId?: string;
            knowledgeBaseId?: string;
            [key: string]: string | number | boolean | undefined;
        },
        options: Omit<SearchOptions, 'filter'> = {}
    ): Promise<SearchResult> {
        const must: SearchFilter['must'] = [];

        for (const [key, value] of Object.entries(filterConditions)) {
            if (value !== undefined) {
                must.push({ key, match: { value } });
            }
        }

        return this.search(collectionName, queryVector, {
            ...options,
            filter: must.length > 0 ? { must } : undefined,
        });
    }

    // ============================================
    // Point Operations
    // ============================================

    /**
     * Upsert points into a collection
     */
    async upsertPoints(
        collectionName: string,
        points: PointStruct[],
        options: UpsertOptions = {}
    ): Promise<UpsertResult> {
        const { wait = true } = options;

        const body = {
            points: points.map((point) => ({
                id: point.id,
                vector: point.vector,
                payload: point.payload,
            })),
        };

        const response = await this.request<{
            result: { operation_id: number; status: string };
        }>('PUT', `/collections/${collectionName}/points?wait=${wait}`, body);

        return {
            operationId: response.result.operation_id,
            status: response.result.status as 'acknowledged' | 'completed',
        };
    }

    /**
     * Upsert points in batches
     */
    async upsertPointsBatch(
        collectionName: string,
        points: PointStruct[],
        batchSize: number = 100,
        options: UpsertOptions = {}
    ): Promise<{ totalUpserted: number; batches: number }> {
        let totalUpserted = 0;
        let batches = 0;

        for (let i = 0; i < points.length; i += batchSize) {
            const batch = points.slice(i, i + batchSize);
            await this.upsertPoints(collectionName, batch, options);
            totalUpserted += batch.length;
            batches++;
        }

        return { totalUpserted, batches };
    }

    /**
     * Delete points by IDs
     */
    async deletePoints(
        collectionName: string,
        pointIds: (string | number)[]
    ): Promise<void> {
        await this.request(
            'POST',
            `/collections/${collectionName}/points/delete`,
            { points: pointIds }
        );
    }

    /**
     * Delete points by filter
     */
    async deletePointsByFilter(
        collectionName: string,
        filter: SearchFilter
    ): Promise<void> {
        await this.request(
            'POST',
            `/collections/${collectionName}/points/delete`,
            { filter: this.buildFilter(filter) }
        );
    }

    /**
     * Get points by IDs
     */
    async getPoints(
        collectionName: string,
        pointIds: (string | number)[],
        withVector: boolean = false
    ): Promise<ScoredPoint[]> {
        const response = await this.request<{ result: QdrantPoint[] }>(
            'POST',
            `/collections/${collectionName}/points`,
            {
                ids: pointIds,
                with_payload: true,
                with_vector: withVector,
            }
        );

        return response.result.map((point) => ({
            id: point.id,
            score: 1, // No score for direct retrieval
            payload: point.payload as PointPayload,
            vector: point.vector,
        }));
    }

    // ============================================
    // Collection Operations
    // ============================================

    /**
     * Create a new collection
     */
    async createCollection(
        collectionName: string,
        config: CollectionConfig
    ): Promise<void> {
        const {
            vectorSize,
            distance = 'Cosine',
            onDiskPayload = false,
        } = config;

        await this.request('PUT', `/collections/${collectionName}`, {
            vectors: {
                size: vectorSize,
                distance,
                on_disk: false,
            },
            on_disk_payload: onDiskPayload,
        });
    }

    /**
     * Create collection for an agent
     */
    async createAgentCollection(
        agentId: string,
        vectorSize: number
    ): Promise<string> {
        const collectionName = this.getAgentCollectionName(agentId);

        // Check if exists first
        const exists = await this.collectionExists(collectionName);
        if (!exists) {
            await this.createCollection(collectionName, {
                vectorSize,
                distance: 'Cosine',
            });
        }

        return collectionName;
    }

    /**
     * Check if collection exists
     */
    async collectionExists(collectionName: string): Promise<boolean> {
        try {
            await this.request('GET', `/collections/${collectionName}`);
            return true;
        } catch (error) {
            if (error instanceof QdrantCollectionNotFoundError) {
                return false;
            }
            throw error;
        }
    }

    /**
     * Get collection info
     */
    async getCollectionInfo(collectionName: string): Promise<CollectionInfo> {
        const response = await this.request<{ result: QdrantCollectionInfo }>(
            'GET',
            `/collections/${collectionName}`
        );

        const info = response.result;
        return {
            name: collectionName,
            vectorsCount: info.vectors_count || 0,
            pointsCount: info.points_count || 0,
            status: info.status as 'green' | 'yellow' | 'red',
            config: {
                vectorSize: info.config.params.vectors.size,
                distance: info.config.params.vectors.distance,
            },
        };
    }

    /**
     * Delete a collection
     */
    async deleteCollection(collectionName: string): Promise<void> {
        await this.request('DELETE', `/collections/${collectionName}`);
    }

    /**
     * List all collections
     */
    async listCollections(): Promise<string[]> {
        const response = await this.request<{
            result: { collections: { name: string }[] };
        }>('GET', '/collections');
        return response.result.collections.map((c) => c.name);
    }

    // ============================================
    // Health & Utility
    // ============================================

    /**
     * Check if Qdrant is healthy
     */
    async healthCheck(): Promise<{ healthy: boolean; version?: string }> {
        try {
            const response = await this.request<{ version: string }>(
                'GET',
                '/'
            );
            return { healthy: true, version: response.version };
        } catch (error) {
            return { healthy: false };
        }
    }

    /**
     * Get agent collection name
     */
    getAgentCollectionName(agentId: string): string {
        return `agent_${agentId}`;
    }

    // ============================================
    // Private Methods
    // ============================================

    /**
     * Build Qdrant filter from SearchFilter
     */
    private buildFilter(filter: SearchFilter): Record<string, unknown> {
        const result: Record<string, unknown> = {};

        if (filter.must && filter.must.length > 0) {
            result.must = filter.must.map(this.buildCondition);
        }

        if (filter.should && filter.should.length > 0) {
            result.should = filter.should.map(this.buildCondition);
        }

        if (filter.must_not && filter.must_not.length > 0) {
            result.must_not = filter.must_not.map(this.buildCondition);
        }

        return result;
    }

    /**
     * Build a single filter condition
     */
    private buildCondition = (condition: {
        key: string;
        match?: { value: unknown };
        range?: Record<string, number>;
    }) => {
        if (condition.match) {
            return {
                key: condition.key,
                match: condition.match,
            };
        }

        if (condition.range) {
            return {
                key: condition.key,
                range: condition.range,
            };
        }

        return { key: condition.key };
    };

    /**
     * Make HTTP request to Qdrant
     */
    private async request<T>(
        method: string,
        path: string,
        body?: unknown
    ): Promise<T> {
        const url = `${this.baseUrl}${path}`;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.apiKey) {
            headers['api-key'] = this.apiKey;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                await this.handleErrorResponse(response, path);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);

            if ((error as Error).name === 'AbortError') {
                throw new QdrantError(
                    'Request timed out',
                    'TIMEOUT',
                    undefined,
                    true
                );
            }

            if (error instanceof QdrantError) {
                throw error;
            }

            throw new QdrantConnectionError(
                `Failed to connect to Qdrant: ${(error as Error).message}`
            );
        }
    }

    /**
     * Handle error responses from Qdrant
     */
    private async handleErrorResponse(
        response: Response,
        path: string
    ): Promise<never> {
        let errorMessage = `Qdrant error: ${response.status}`;

        try {
            const errorBody = await response.json();
            errorMessage =
                errorBody.status?.error || errorBody.message || errorMessage;
        } catch {
            // Ignore JSON parse errors
        }

        // Check for collection not found
        if (response.status === 404 && path.includes('/collections/')) {
            const collectionMatch = path.match(/\/collections\/([^/]+)/);
            if (collectionMatch) {
                throw new QdrantCollectionNotFoundError(collectionMatch[1]);
            }
        }

        throw new QdrantError(
            errorMessage,
            `HTTP_${response.status}`,
            response.status,
            response.status >= 500
        );
    }
}

// ============================================
// Internal Qdrant Response Types
// ============================================

interface QdrantSearchResult {
    id: string | number;
    score: number;
    payload: Record<string, unknown>;
    vector?: number[];
}

interface QdrantPoint {
    id: string | number;
    payload: Record<string, unknown>;
    vector?: number[];
}

interface QdrantCollectionInfo {
    status: string;
    vectors_count: number;
    points_count: number;
    config: {
        params: {
            vectors: {
                size: number;
                distance: string;
            };
        };
    };
}

// ============================================
// Singleton & Factory
// ============================================

let defaultQdrantService: QdrantService | null = null;

/**
 * Get default Qdrant service instance
 */
export function getQdrantService(): QdrantService {
    if (!defaultQdrantService) {
        defaultQdrantService = new QdrantService({
            url: env.QDRANT_URL,
            apiKey: env.QDRANT_API_KEY,
        });
    }
    return defaultQdrantService;
}

/**
 * Reset default service (for testing)
 */
export function resetQdrantService(): void {
    defaultQdrantService = null;
}
