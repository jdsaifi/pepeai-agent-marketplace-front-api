// modules/knowledgeBase/service.ts
import { Types } from 'mongoose';
import { KnowledgeBaseModel } from '../../models/knowledgeBase';
import { AgentModel } from '../../models/agent';
import { storageService } from '../../lib/storage';
import { getParser, IParsedDocument } from '../../lib/parsers';
import {
    SourceType,
    ProcessingStatus,
    IKnowledgeBaseDocument,
} from '../../types/kb';
import { IDocumentContent } from '../../types/documentContent';
import { APIError } from '../../lib/APIError';
import { ddl } from '../../lib/dd';
import { chunkingService } from '../../lib/chunking/chunkingService';
import { IChunkingOptions, IChunkingResult } from '../../types/chunk';
import { queueProducer } from '../../lib/queue/producer';
import { JobModel } from '../../models/job';

export interface ICreateKBFromFileParams {
    agentId: string;
    userId: string;
    file: Express.Multer.File;
    name?: string;
    description?: string;
}

export interface ICreateKBFromUrlParams {
    agentId: string;
    userId: string;
    url: string;
    name?: string;
    description?: string;
}

export interface ICreateKBFromTextParams {
    agentId: string;
    userId: string;
    text: string;
    title: string;
    description?: string;
}

class KnowledgeBaseService {
    /**
     * upload kb/document file
     */
    async createByFileUpload(params: ICreateKBFromFileParams): Promise<{
        knowledgeBase: IKnowledgeBaseDocument;
        jobId: string;
    }> {
        const { agentId, userId, file, name, description } = params;

        // Validate agent exists and user has access
        const agent = await AgentModel.findOne({
            _id: agentId,
            createdBy: userId,
        });

        if (!agent) {
            throw new APIError({
                code: 404,
                message: 'Agent not found or access denied',
                errorCode: 'AGENT_NOT_FOUND_OR_ACCESS_DENIED',
            });
        }

        // Determine source type from mime type
        const sourceType = this.getSourceTypeFromMime(file.mimetype);

        try {
            // Upload file to storage
            // await this.updateStatus(knowledgeBase._id, 'uploading', 10);

            const storageResult = await storageService.upload(
                file,
                `agents/${agentId}/kb`
            );

            // Check for duplicate
            const duplicate = await this.findDuplicateByChecksumForFile(
                agentId,
                storageResult.checksum
            );

            if (duplicate) {
                // Clean up and throw
                await storageService.delete(storageResult.storageKey);
                throw new APIError({
                    code: 400,
                    message: `Duplicate file detected: "${duplicate.name}"`,
                    errorCode: 'DUPLICATE_FILE_DETECTED',
                });
            }

            // Create KB record with queued status
            const knowledgeBase = await KnowledgeBaseModel.create({
                agentId: new Types.ObjectId(agentId),
                sourceType,
                name: name || file.originalname,
                description,
                file: {
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    size: file.size,
                    storageKey: storageResult.storageKey,
                    storageUrl: storageResult.storageUrl,
                    checksum: storageResult.checksum,
                },
                processing: {
                    status: 'pending',
                    progress: 0,
                },
                createdBy: new Types.ObjectId(userId),
            });

            // Queue for file upload
            const jobId = await queueProducer.queueFileUpload({
                knowledgeBaseId: knowledgeBase._id.toString(),
                agentId,
                userId,
                file: {
                    storageKey: storageResult.storageKey,
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    size: file.size,
                },
            });

            return {
                knowledgeBase,
                jobId,
            };
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Create knowledge base from uploaded file
     */
    async createFromFile(
        params: ICreateKBFromFileParams
    ): Promise<IKnowledgeBaseDocument> {
        const { agentId, userId, file, name, description } = params;

        // Validate agent exists and user has access
        const agent = await AgentModel.findOne({
            _id: agentId,
            createdBy: userId,
        });

        if (!agent) {
            throw new APIError({
                code: 404,
                message: 'Agent not found or access denied',
                errorCode: 'AGENT_NOT_FOUND_OR_ACCESS_DENIED',
            });
        }

        // Determine source type from mime type
        const sourceType = this.getSourceTypeFromMime(file.mimetype);

        // Create initial KB record with pending status
        const knowledgeBase = await KnowledgeBaseModel.create({
            agentId: new Types.ObjectId(agentId),
            sourceType,
            name: name || file.originalname,
            description,
            file: {
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
            },
            processing: {
                status: 'uploading' as ProcessingStatus,
                progress: 0,
            },
            createdBy: new Types.ObjectId(userId),
        });

        try {
            // Upload file to storage
            await this.updateStatus(knowledgeBase._id, 'uploading', 10);

            const storageResult = await storageService.upload(
                file,
                `agents/${agentId}/kb`
            );

            // Update KB with storage info
            knowledgeBase.file!.storageKey = storageResult.storageKey;
            knowledgeBase.file!.storageUrl = storageResult.storageUrl;
            knowledgeBase.file!.checksum = storageResult.checksum;
            await knowledgeBase.save();

            // Check for duplicate
            const duplicate = await this.findDuplicateByChecksum(
                agentId,
                storageResult.checksum,
                knowledgeBase._id.toString()
            );

            if (duplicate) {
                // Clean up and throw
                await storageService.delete(storageResult.storageKey);
                await KnowledgeBaseModel.findByIdAndDelete(knowledgeBase._id);
                throw new APIError({
                    code: 400,
                    message: `Duplicate file detected: "${duplicate.name}"`,
                    errorCode: 'DUPLICATE_FILE_DETECTED',
                });
            }

            // Parse document
            await this.updateStatus(knowledgeBase._id, 'processing', 30);

            const parsedContent = await this.parseDocument(
                storageResult.storageKey,
                sourceType
            );

            // Store parsed content
            await this.updateStatus(knowledgeBase._id, 'processing', 60);

            await this.storeContent(knowledgeBase._id, parsedContent);

            // Update KB with metadata
            knowledgeBase.metadata = {
                title: parsedContent.metadata.title,
                author: parsedContent.metadata.author,
                pageCount: parsedContent.metadata.pageCount,
                language: parsedContent.metadata.language,
                extractedAt: new Date(),
            };

            knowledgeBase.chunking = {
                ...knowledgeBase.chunking,
                totalCharacters: parsedContent.totalCharacters,
                totalTokens: this.estimateTokens(parsedContent.totalCharacters),
            };

            // Mark as ready for chunking (we'll do chunking in next step)
            knowledgeBase.processing = {
                status: 'completed' as ProcessingStatus,
                progress: 100,
                completedAt: new Date(),
            };

            await knowledgeBase.save();

            // Update agent's KB stats
            await this.updateAgentKBStats(agentId);

            return knowledgeBase;
        } catch (error: any) {
            // Update status to failed
            await this.updateStatus(
                knowledgeBase._id,
                'failed',
                0,
                error.message
            );
            throw error;
        }
    }

    /**
     * Create knowledge base from manual text input
     */
    async createFromText(
        params: ICreateKBFromTextParams
    ): Promise<IKnowledgeBaseDocument> {
        const { agentId, userId, text, title, description } = params;

        // Validate agent
        const agent = await AgentModel.findOne({
            _id: agentId,
            createdBy: userId,
        });

        if (!agent) {
            throw new Error('Agent not found or access denied');
        }

        const knowledgeBase = await KnowledgeBaseModel.create({
            agentId: new Types.ObjectId(agentId),
            sourceType: 'manual' as SourceType,
            name: title,
            description,
            manualContent: {
                text,
                title,
            },
            processing: {
                status: 'completed' as ProcessingStatus,
                progress: 100,
                completedAt: new Date(),
            },
            chunking: {
                strategy: 'fixed',
                totalCharacters: text.length,
                totalTokens: this.estimateTokens(text.length),
                totalChunks: 0,
            },
            createdBy: new Types.ObjectId(userId),
        });

        // Store content
        await this.storeContent(knowledgeBase._id, {
            text,
            metadata: { pageCount: 1 },
            pages: [{ pageNumber: 1, text, charCount: text.length }],
            totalCharacters: text.length,
            totalWords: text.split(/\s+/).length,
        });

        await this.updateAgentKBStats(agentId);

        return knowledgeBase;
    }

    /**
     * Parse document based on type
     */
    private async parseDocument(
        storageKey: string,
        sourceType: SourceType
    ): Promise<IParsedDocument> {
        const filePath = storageService.getPath(storageKey);
        const parser = getParser(sourceType as any);
        return parser.parseFromPath(filePath);
    }

    /**
     * Store parsed content in MongoDB
     * For now, we store in a separate collection
     * Later this will be chunked and embedded
     */
    private async storeContent(
        kbId: Types.ObjectId,
        content: IParsedDocument
    ): Promise<void> {
        // We'll create a DocumentContent model for this
        const DocumentContent = await this.getDocumentContentModel();

        await DocumentContent.findOneAndUpdate(
            { knowledgeBaseId: kbId },
            {
                knowledgeBaseId: kbId,
                fullText: content.text,
                pages: content.pages,
                metadata: content.metadata,
                updatedAt: new Date(),
            },
            { upsert: true, new: true }
        );
    }

    /**
     * Get or create DocumentContent model
     */
    private async getDocumentContentModel() {
        const mongoose = await import('mongoose');

        // Check if model exists
        if (mongoose.models.DocumentContent) {
            return mongoose.models.DocumentContent;
        }

        const documentContentSchema = new mongoose.Schema(
            {
                knowledgeBaseId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'KnowledgeBase',
                    required: true,
                    unique: true,
                    index: true,
                },
                fullText: {
                    type: String,
                    required: true,
                },
                pages: [
                    {
                        pageNumber: Number,
                        text: String,
                        charCount: Number,
                    },
                ],
                metadata: {
                    title: String,
                    author: String,
                    pageCount: Number,
                    language: String,
                },
            },
            {
                timestamps: true,
            }
        );

        return mongoose.model(
            'DocumentContent',
            documentContentSchema,
            'document_contents'
        );
    }

    /**
     * Update processing status
     */
    private async updateStatus(
        kbId: Types.ObjectId,
        status: ProcessingStatus,
        progress: number,
        errorMessage?: string
    ): Promise<void> {
        const update: any = {
            'processing.status': status,
            'processing.progress': progress,
        };

        if (status === 'failed' && errorMessage) {
            update['processing.error'] = {
                message: errorMessage,
                occurredAt: new Date(),
            };
        }

        if (status === 'processing' && progress === 0) {
            update['processing.startedAt'] = new Date();
        }

        await KnowledgeBaseModel.findByIdAndUpdate(kbId, update);
    }

    /**
     * Find duplicate by checksum
     */
    private async findDuplicateByChecksum(
        agentId: string,
        checksum: string,
        excludeId: string
    ): Promise<IKnowledgeBaseDocument | null> {
        return KnowledgeBaseModel.findOne({
            agentId: new Types.ObjectId(agentId),
            'file.checksum': checksum,
            _id: { $ne: new Types.ObjectId(excludeId) },
            isActive: true,
        });
    }

    /**
     * Find duplicate by checksum for file
     */
    private async findDuplicateByChecksumForFile(
        agentId: string,
        checksum: string
    ): Promise<IKnowledgeBaseDocument | null> {
        return KnowledgeBaseModel.findOne({
            agentId: new Types.ObjectId(agentId),
            'file.checksum': checksum,
            isActive: true,
        });
    }

    /**
     * Update agent's KB statistics
     */
    private async updateAgentKBStats(agentId: string): Promise<void> {
        const stats = await KnowledgeBaseModel.aggregate([
            {
                $match: {
                    agentId: new Types.ObjectId(agentId),
                    isActive: true,
                },
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    processed: {
                        $sum: {
                            $cond: [
                                { $eq: ['$processing.status', 'completed'] },
                                1,
                                0,
                            ],
                        },
                    },
                    totalChunks: { $sum: '$chunking.totalChunks' },
                },
            },
        ]);

        if (stats.length > 0) {
            await AgentModel.findByIdAndUpdate(agentId, {
                'kbStatus.totalDocuments': stats[0].total,
                'kbStatus.processedDocuments': stats[0].processed,
                'kbStatus.totalChunks': stats[0].totalChunks,
                'kbStatus.lastProcessedAt': new Date(),
            });
        }
    }

    /**
     * Get source type from MIME type
     */
    private getSourceTypeFromMime(mimeType: string): SourceType {
        const mimeMap: Record<string, SourceType> = {
            'application/pdf': 'pdf',
            'application/msword': 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                'docx',
            'text/plain': 'txt',
            'text/csv': 'csv',
            'application/json': 'json',
        };

        return mimeMap[mimeType] || 'txt';
    }

    /**
     * Estimate token count (rough: 1 token ≈ 4 chars for English)
     */
    private estimateTokens(charCount: number): number {
        return Math.ceil(charCount / 4);
    }

    /**
     * Get knowledge base by ID
     */
    async getById(
        kbId: string,
        userId: string
    ): Promise<IKnowledgeBaseDocument | null> {
        console.log('\n\n\n\n\n\n');
        console.log('kbId ->', kbId);
        console.log('userId ->', userId);
        const kb = await KnowledgeBaseModel.findById(kbId);

        if (!kb) return null;

        // Check access
        const agent = await AgentModel.findOne({
            _id: kb.agentId,
            createdBy: userId,
        });

        if (!agent) return null;

        return kb;
    }

    /**
     * Get all knowledge bases for an agent
     */
    async getByAgentId(
        agentId: string,
        userId: string
    ): Promise<IKnowledgeBaseDocument[]> {
        // Verify access
        const agent = await AgentModel.findOne({
            _id: agentId,
            createdBy: userId,
        });

        if (!agent) {
            throw new APIError({
                code: 404,
                message: 'Agent not found or access denied',
                errorCode: 'AGENT_NOT_FOUND_OR_ACCESS_DENIED',
            });
        }

        return KnowledgeBaseModel.find({
            agentId: new Types.ObjectId(agentId),
            isActive: true,
        }).sort({ createdAt: -1 });
    }

    /**
     * Delete knowledge base
     */
    async delete(kbId: string, userId: string): Promise<void> {
        const kb = await this.getById(kbId, userId);

        if (!kb) {
            throw new APIError({
                code: 404,
                message: 'Knowledge base not found or access denied',
                errorCode: 'KNOWLEDGE_BASE_NOT_FOUND_OR_ACCESS_DENIED',
            });
        }

        // Delete from storage
        if (kb.file?.storageKey) {
            await storageService.delete(kb.file.storageKey);
        }

        // Delete content
        const DocumentContent = await this.getDocumentContentModel();
        await DocumentContent.deleteOne({ knowledgeBaseId: kb._id });

        // Soft delete KB record
        kb.isActive = false;
        await kb.save();

        // Update agent stats
        await this.updateAgentKBStats(kb.agentId.toString());
    }

    /**
     * Get document content
     */
    async getContent(
        kbId: string,
        userId: string
    ): Promise<IDocumentContent | null> {
        const kb = await this.getById(kbId, userId);

        if (!kb) return null;

        const DocumentContent = await this.getDocumentContentModel();
        return DocumentContent.findOne({ knowledgeBaseId: kb._id });
    }

    /**
     * Process document: parse and chunk
     * Call this after upload or to reprocess
     */
    async processDocument(
        knowledgeBaseId: string,
        userId: string,
        chunkingOptions?: Partial<IChunkingOptions>
    ): Promise<IChunkingResult> {
        const kb = await this.getById(knowledgeBaseId, userId);

        if (!kb) {
            throw new APIError({
                code: 404,
                message: 'Knowledge base not found or access denied',
                errorCode: 'KNOWLEDGE_BASE_NOT_FOUND_OR_ACCESS_DENIED',
            });
        }

        // Chunk the document
        const result = await chunkingService.chunkDocument({
            knowledgeBaseId,
            options: chunkingOptions,
        });

        // Update agent stats
        await this.updateAgentKBStats(kb.agentId.toString());

        return result;
    }

    /**
     * Get processing status for a knowledge base
     */
    async getProcessingStatus(
        kbId: string,
        userId: string
    ): Promise<{
        knowledgeBase: IKnowledgeBaseDocument | null;
        jobs: any[];
    }> {
        const kb = await this.getById(kbId, userId);

        if (!kb) {
            return { knowledgeBase: null, jobs: [] };
        }

        const jobs = await JobModel.find({
            knowledgeBaseId: new Types.ObjectId(kbId),
        }).sort({ createdAt: -1 });

        return {
            knowledgeBase: kb,
            jobs,
        };
    }
}

export const knowledgeBaseService = new KnowledgeBaseService();
