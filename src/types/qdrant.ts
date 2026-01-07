/**
 * Qdrant Service Types
 * Defines contracts for vector search operations
 */

// ============================================
// Configuration Types
// ============================================

export interface QdrantConfig {
    url: string;
    apiKey?: string;
    timeout?: number;
    https?: boolean;
}

// ============================================
// Point Types
// ============================================

export interface PointPayload {
    content: string;
    chunkIndex?: number;
    pageNumber?: number;
    documentId?: string;
    knowledgeBaseId?: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface ScoredPoint {
    id: string | number;
    score: number;
    payload: PointPayload;
    vector?: number[];
}

export interface PointStruct {
    id: string | number;
    vector: number[];
    payload: PointPayload;
}

// ============================================
// Search Types
// ============================================

export interface SearchOptions {
    /**
     * Number of results to return
     */
    limit?: number;

    /**
     * Minimum score threshold (0-1)
     */
    scoreThreshold?: number;

    /**
     * Include vector in results
     */
    withVector?: boolean;

    /**
     * Filter conditions
     */
    filter?: SearchFilter;

    /**
     * Offset for pagination
     */
    offset?: number;
}

export interface SearchFilter {
    must?: FilterCondition[];
    should?: FilterCondition[];
    must_not?: FilterCondition[];
}

export interface FilterCondition {
    key: string;
    match?: { value: string | number | boolean };
    range?: { gte?: number; lte?: number; gt?: number; lt?: number };
}

export interface SearchResult {
    points: ScoredPoint[];
    searchTimeMs: number;
}

// ============================================
// Collection Types
// ============================================

export interface CollectionConfig {
    vectorSize: number;
    distance?: 'Cosine' | 'Euclid' | 'Dot';
    onDiskPayload?: boolean;
    replicationFactor?: number;
    writeConsistencyFactor?: number;
}

export interface CollectionInfo {
    name: string;
    vectorsCount: number;
    pointsCount: number;
    status: 'green' | 'yellow' | 'red';
    config: {
        vectorSize: number;
        distance: string;
    };
}

// ============================================
// Upsert Types
// ============================================

export interface UpsertOptions {
    wait?: boolean;
}

export interface UpsertResult {
    operationId: number;
    status: 'acknowledged' | 'completed';
}

// ============================================
// Error Types
// ============================================

export class QdrantError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly statusCode?: number,
        public readonly retryable: boolean = false
    ) {
        super(message);
        this.name = 'QdrantError';
    }
}

export class QdrantConnectionError extends QdrantError {
    constructor(message: string) {
        super(message, 'CONNECTION_ERROR', undefined, true);
        this.name = 'QdrantConnectionError';
    }
}

export class QdrantCollectionNotFoundError extends QdrantError {
    constructor(collectionName: string) {
        super(
            `Collection '${collectionName}' not found`,
            'COLLECTION_NOT_FOUND',
            404,
            false
        );
        this.name = 'QdrantCollectionNotFoundError';
    }
}
