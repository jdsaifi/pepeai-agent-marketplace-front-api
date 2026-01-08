import { Response } from 'express';
import { sendError, sendSuccess } from '../../lib/apiResponse';
import { AuthRequest } from '../../middleware/auth';
import { ddl } from '../../lib/dd';
import { knowledgeBaseService } from './service';
import { chunkingService } from '../../lib/chunking/chunkingService';
import { agentService } from '../agent/service';

class KnowledgeBaseController {
    async uploadDocument(req: AuthRequest, res: Response) {
        ddl('route: POST /api/v1/agents/:agentId/kbs');
        ddl('params ->', req.params);
        ddl('has file ->', !req.file);
        ddl('body ->', req.body);

        const { agentId } = req.params;
        const { name, description } = req.body;
        const userId = req.user!._id as string;

        if (!req.file) {
            return sendError(
                req,
                res,
                400,
                'NO_FILE_UPLOADED',
                'No file uploaded'
            );
        }

        const result = await knowledgeBaseService.createByFileUpload({
            agentId,
            userId,
            file: req.file,
            name,
            description,
        });

        // todo: publish message to rabbitmq about new document upload

        return sendSuccess(req, res, result, 201);
    }

    /**
     * Get processing status
     * GET /api/agents/:agentId/knowledge-base/:kbId/status
     */
    async getStatus(req: AuthRequest, res: Response) {
        const { kbId } = req.params;
        const userId = req.user!._id as string;

        const { knowledgeBase, jobs } =
            await knowledgeBaseService.getProcessingStatus(kbId, userId);

        if (!knowledgeBase) {
            return res.status(404).json({
                success: false,
                message: 'Knowledge base not found',
            });
        }

        const data = {
            knowledgeBase: {
                id: knowledgeBase._id,
                name: knowledgeBase.name,
                status: knowledgeBase.processing.status,
                progress: knowledgeBase.processing.progress,
                error: knowledgeBase.processing.error,
            },
            jobs: jobs.map((job) => ({
                jobId: job.jobId,
                type: job.type,
                status: job.status,
                progress: job.progress,
                attempt: job.attempt,
                error: job.error,
                createdAt: job.createdAt,
                completedAt: job.completedAt,
                processingTime: job.processingTime,
            })),
        };

        return sendSuccess(req, res, data, 200);
    }

    ///////////////////////////////
    //////////////////////////////
    ////////////////////////////
    ////////////////////////

    async getAllKB(req: AuthRequest, res: Response) {
        ddl('route: GET /api/v1/agents/:agentId/kbs');
        ddl('params ->', req.params);
        const { agentId } = req.params;
        const userId = req.user!._id as string;
        const knowledgeBases = await knowledgeBaseService.getByAgentId(
            agentId,
            userId
        );
        return sendSuccess(req, res, knowledgeBases, 200);
    }

    async getOne(req: AuthRequest, res: Response) {
        ddl('route: GET /api/v1/agents/:agentId/knowledge-base/:kbId');
        ddl('params ->', req.params);
        const { kbId } = req.params;
        const userId = req.user!._id as string;
        const knowledgeBase = await knowledgeBaseService.getById(kbId, userId);
        if (!knowledgeBase) {
            return sendError(
                req,
                res,
                404,
                'KNOWLEDGE_BASE_NOT_FOUND',
                'Knowledge base not found'
            );
        }
        return sendSuccess(req, res, knowledgeBase, 200);
    }

    async getContent(req: AuthRequest, res: Response) {
        ddl('route: GET /api/v1/agents/:agentId/knowledge-base/:kbId/content');
        ddl('params ->', req.params);
        const { kbId } = req.params;
        const userId = req.user!._id as string;
        const content = await knowledgeBaseService.getContent(kbId, userId);
        if (!content) {
            return sendError(
                req,
                res,
                404,
                'CONTENT_NOT_FOUND',
                'Content not found'
            );
        }
        return sendSuccess(req, res, content, 200);
    }

    async delete(req: AuthRequest, res: Response) {
        ddl('route: DELETE /api/v1/agents/:agentId/knowledge-base/:kbId');
        ddl('params ->', req.params);
        const { kbId } = req.params;
        const userId = req.user!._id as string;
        await knowledgeBaseService.delete(kbId, userId);
        return sendSuccess(req, res, null, 201);
    }

    async chunkDocument(req: AuthRequest, res: Response) {
        ddl('route: POST /api/v1/agents/:agentId/kbs/:kbId/chunk');
        ddl('params ->', req.params);
        ddl('body ->', req.body);
        const { kbId } = req.params;
        const { strategy, chunkSize, chunkOverlap } = req.body;
        const userId = req.user!._id as string;

        const result = await knowledgeBaseService.processDocument(
            kbId,
            userId,
            { strategy, chunkSize, chunkOverlap }
        );

        return sendSuccess(req, res, result, 200);
    }

    async getChunks(req: AuthRequest, res: Response) {
        ddl('route: GET /api/v1/agents/:agentId/kbs/:kbId/chunks');
        ddl('params ->', req.params);
        const { kbId } = req.params;
        const userId = req.user!._id as string;

        // Verify access
        const kb = await knowledgeBaseService.getById(kbId, userId);
        if (!kb) {
            return sendError(
                req,
                res,
                404,
                'KNOWLEDGE_BASE_NOT_FOUND',
                'Knowledge base not found'
            );
        }

        const chunks = await chunkingService.getChunks(kbId);

        return sendSuccess(req, res, chunks, 200);
    }

    async previewChunking(req: AuthRequest, res: Response) {
        ddl('route: POST /api/v1/preview-chunking');
        ddl('body ->', req.body);
        const { text, strategy, chunkSize, chunkOverlap } = req.body;

        if (!text) {
            return sendError(
                req,
                res,
                400,
                'TEXT_REQUIRED',
                'Text is required'
            );
        }

        const result = await chunkingService.previewChunking(text, {
            strategy,
            chunkSize,
            chunkOverlap,
        });

        return sendSuccess(req, res, result, 200);
    }

    async getChunkStats(req: AuthRequest, res: Response) {
        ddl('route: GET /api/v1/agents/:agentId/kbs/chunks/stats');
        ddl('params ->', req.params);
        const { agentId } = req.params;
        const userId = req.user!._id as string;

        // Verify access
        const agent = await agentService.getAgent(agentId, userId);

        if (!agent) {
            return sendError(
                req,
                res,
                404,
                'AGENT_NOT_FOUND',
                'Agent not found'
            );
        }

        const stats = await chunkingService.getAgentChunkStats(agentId);

        res.json({
            success: true,
            data: stats,
        });
    }
}

export const knowledgeBaseController = new KnowledgeBaseController();
