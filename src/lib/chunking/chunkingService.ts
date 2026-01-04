// lib/chunking/chunkingService.ts
import { Types } from 'mongoose';
import { ChunkModel } from '../../models/chunk';
import {
    IChunkDocument,
    IChunkingOptions,
    IChunkingResult,
    IChunkData,
} from '../../types/chunk';
import { KnowledgeBaseModel } from '../../models/knowledgeBase';
import { DocumentContentModel } from '../../models/documentContent';
import { fixedChunk } from './strategies/fixedChunker';
import { recursiveChunk } from './strategies/recursiveChunker';
import { semanticChunk } from './strategies/semanticChunker';
import { pageChunk, IPageContent } from './strategies/pageChunker';
import { APIError } from '../APIError';

export interface IChunkDocumentParams {
    knowledgeBaseId: string;
    options?: Partial<IChunkingOptions>;
}

class ChunkingService {
    // Default options
    private defaultOptions: IChunkingOptions = {
        strategy: 'recursive',
        chunkSize: 1000,
        chunkOverlap: 200,
        minChunkSize: 100,
        maxChunkSize: 2000,
        preserveSentences: true,
    };

    /**
     * Chunk a document from knowledge base
     */
    async chunkDocument(
        params: IChunkDocumentParams
    ): Promise<IChunkingResult> {
        const { knowledgeBaseId, options: customOptions } = params;

        // Get knowledge base
        const kb = await KnowledgeBaseModel.findById(knowledgeBaseId);
        if (!kb) {
            throw new APIError({
                code: 404,
                message: 'Knowledge base not found',
                errorCode: 'KNOWLEDGE_BASE_NOT_FOUND',
            });
        }

        // Get document content
        const content = await DocumentContentModel.findOne({
            knowledgeBaseId: new Types.ObjectId(knowledgeBaseId),
        });

        if (!content) {
            throw new APIError({
                code: 404,
                message: 'Document content not found',
                errorCode: 'DOCUMENT_CONTENT_NOT_FOUND',
            });
        }

        // Merge options with defaults and agent config
        const options: IChunkingOptions = {
            ...this.defaultOptions,
            ...customOptions,
        };

        // Update KB status
        await KnowledgeBaseModel.findByIdAndUpdate(knowledgeBaseId, {
            'processing.status': 'chunking',
            'processing.progress': 50,
        });

        try {
            // Delete existing chunks for this KB
            await ChunkModel.deleteMany({
                knowledgeBaseId: new Types.ObjectId(knowledgeBaseId),
            });

            // Perform chunking based on strategy
            let chunkDataList: IChunkData[];

            switch (options.strategy) {
                case 'fixed':
                    chunkDataList = fixedChunk(
                        content.fullText,
                        options,
                        content.pages as IPageContent[]
                    );
                    break;

                case 'recursive':
                    chunkDataList = recursiveChunk(content.fullText, options);
                    break;

                case 'semantic':
                    chunkDataList = semanticChunk(content.fullText, options);
                    break;

                case 'page':
                    chunkDataList = pageChunk(
                        content.pages as IPageContent[],
                        options
                    );
                    break;

                default:
                    chunkDataList = recursiveChunk(content.fullText, options);
            }

            // Add source info to metadata
            const sourceName = kb.name || kb.file?.originalName || 'Unknown';
            chunkDataList = chunkDataList.map((chunk) => ({
                ...chunk,
                metadata: {
                    ...chunk.metadata,
                    source: sourceName,
                },
            }));

            // Save chunks to database
            const savedChunks = await this.saveChunks(
                new Types.ObjectId(knowledgeBaseId),
                kb.agentId,
                chunkDataList
            );

            // Calculate totals
            const totalCharacters = chunkDataList.reduce(
                (sum, c) => sum + c.charCount,
                0
            );
            const totalTokens = chunkDataList.reduce(
                (sum, c) => sum + c.tokenCount,
                0
            );

            // Update KB with chunking results
            await KnowledgeBaseModel.findByIdAndUpdate(knowledgeBaseId, {
                'processing.status': 'completed',
                'processing.progress': 100,
                'processing.completedAt': new Date(),
                'chunking.strategy': options.strategy,
                'chunking.chunkSize': options.chunkSize,
                'chunking.chunkOverlap': options.chunkOverlap,
                'chunking.totalChunks': chunkDataList.length,
                'chunking.totalCharacters': totalCharacters,
                'chunking.totalTokens': totalTokens,
            });

            return {
                chunks: chunkDataList,
                totalChunks: chunkDataList.length,
                totalCharacters,
                totalTokens,
                strategy: options.strategy,
            };
        } catch (error: any) {
            // Update status to failed
            await KnowledgeBaseModel.findByIdAndUpdate(knowledgeBaseId, {
                'processing.status': 'failed',
                'processing.error': {
                    message: error.message,
                    occurredAt: new Date(),
                },
            });
            throw error;
        }
    }

    /**
     * Save chunks to database
     */
    private async saveChunks(
        knowledgeBaseId: Types.ObjectId,
        agentId: Types.ObjectId,
        chunks: IChunkData[]
    ): Promise<IChunkDocument[]> {
        const chunkDocs = chunks.map((chunk, index) => ({
            knowledgeBaseId,
            agentId,
            chunkIndex: index,
            content: chunk.content,
            charCount: chunk.charCount,
            tokenCount: chunk.tokenCount,
            metadata: chunk.metadata,
        }));

        // Bulk insert for performance
        return ChunkModel.insertMany(chunkDocs);
    }

    /**
     * Get chunks for a knowledge base
     */
    async getChunks(knowledgeBaseId: string): Promise<IChunkDocument[]> {
        return ChunkModel.find({
            knowledgeBaseId: new Types.ObjectId(knowledgeBaseId),
        }).sort({ chunkIndex: 1 });
    }

    /**
     * Get chunks for an agent (all KBs)
     */
    async getAgentChunks(
        agentId: string,
        options?: { limit?: number; offset?: number }
    ): Promise<IChunkDocument[]> {
        const { limit = 100, offset = 0 } = options || {};

        return ChunkModel.find({
            agentId: new Types.ObjectId(agentId),
        })
            .sort({ knowledgeBaseId: 1, chunkIndex: 1 })
            .skip(offset)
            .limit(limit);
    }

    /**
     * Get chunk by ID
     */
    async getChunkById(chunkId: string): Promise<IChunkDocument | null> {
        return ChunkModel.findById(chunkId);
    }

    /**
     * Delete chunks for a knowledge base
     */
    async deleteChunks(knowledgeBaseId: string): Promise<number> {
        const result = await ChunkModel.deleteMany({
            knowledgeBaseId: new Types.ObjectId(knowledgeBaseId),
        });
        return result.deletedCount;
    }

    /**
     * Get chunking statistics for an agent
     */
    async getAgentChunkStats(agentId: string): Promise<{
        totalChunks: number;
        totalCharacters: number;
        totalTokens: number;
        byKnowledgeBase: {
            kbId: string;
            name: string;
            chunks: number;
            tokens: number;
        }[];
    }> {
        const stats = await ChunkModel.aggregate([
            {
                $match: { agentId: new Types.ObjectId(agentId) },
            },
            {
                $group: {
                    _id: '$knowledgeBaseId',
                    chunks: { $sum: 1 },
                    characters: { $sum: '$charCount' },
                    tokens: { $sum: '$tokenCount' },
                },
            },
            {
                $lookup: {
                    from: 'knowledgeBases',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'kb',
                },
            },
            {
                $unwind: '$kb',
            },
            {
                $project: {
                    kbId: '$_id',
                    name: '$kb.name',
                    chunks: 1,
                    characters: 1,
                    tokens: 1,
                },
            },
        ]);

        const totals = stats.reduce(
            (acc, s) => ({
                totalChunks: acc.totalChunks + s.chunks,
                totalCharacters: acc.totalCharacters + s.characters,
                totalTokens: acc.totalTokens + s.tokens,
            }),
            { totalChunks: 0, totalCharacters: 0, totalTokens: 0 }
        );

        return {
            ...totals,
            byKnowledgeBase: stats.map((s) => ({
                kbId: s.kbId.toString(),
                name: s.name,
                chunks: s.chunks,
                tokens: s.tokens,
            })),
        };
    }

    /**
     * Re-chunk a document with new options
     */
    async rechunkDocument(
        knowledgeBaseId: string,
        options: Partial<IChunkingOptions>
    ): Promise<IChunkingResult> {
        return this.chunkDocument({
            knowledgeBaseId,
            options,
        });
    }

    /**
     * Preview chunking without saving
     */
    async previewChunking(
        text: string,
        options?: Partial<IChunkingOptions>
    ): Promise<IChunkingResult> {
        const mergedOptions: IChunkingOptions = {
            ...this.defaultOptions,
            ...options,
        };

        let chunks: IChunkData[];

        switch (mergedOptions.strategy) {
            case 'fixed':
                chunks = fixedChunk(text, mergedOptions);
                break;
            case 'recursive':
                chunks = recursiveChunk(text, mergedOptions);
                break;
            case 'semantic':
                chunks = semanticChunk(text, mergedOptions);
                break;
            default:
                chunks = recursiveChunk(text, mergedOptions);
        }

        const totalCharacters = chunks.reduce((sum, c) => sum + c.charCount, 0);
        const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);

        return {
            chunks,
            totalChunks: chunks.length,
            totalCharacters,
            totalTokens,
            strategy: mergedOptions.strategy,
        };
    }
}

export const chunkingService = new ChunkingService();
