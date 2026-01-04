import { Router } from 'express';
import { knowledgeBaseController } from './controller';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { uploadDocument, uploadDocuments } from '../../middleware/upload';
import {
    getAllKBSchema,
    getContentSchema,
    getOneKBSchema,
    chunkDocumentSchema,
    getChunksSchema,
    previewChunkingSchema,
    getChunkStatsSchema,
} from './schema';
// import { createKnowledgeBaseSchema } from './schema';

const router = Router();

// validate(createKnowledgeBaseSchema)
// router.post(
//     '/',
//     [authenticate],
//     uploadDocuments,
//     asyncHandler(knowledgeBaseController.uploadDocument)
// );

// Upload document route
router.post(
    '/agents/:agentId/kbs',
    [authenticate, uploadDocument],
    asyncHandler(knowledgeBaseController.uploadDocument)
);

// Get all knowledge bases for agent
router.get(
    '/agents/:agentId/kbs',
    [authenticate, validate(getAllKBSchema)],
    asyncHandler(knowledgeBaseController.getAllKB)
);

// Get single knowledge base
router.get(
    '/agents/:agentId/kbs/:kbId',
    [authenticate, validate(getOneKBSchema)],
    asyncHandler(knowledgeBaseController.getOne)
);

// Get document content
router.get(
    '/agents/:agentId/kbs/:kbId/content',
    [authenticate, validate(getContentSchema)],
    asyncHandler(knowledgeBaseController.getContent)
);

// Delete knowledge base
// router.delete(
//     '/agents/:agentId/knowledge-base/:kbId',
//     knowledgeBaseController.delete
// );

// Chunk document
router.post(
    '/agents/:agentId/kbs/:kbId/chunk',
    [authenticate, validate(chunkDocumentSchema)],
    asyncHandler(knowledgeBaseController.chunkDocument)
);

// // Get chunks
router.get(
    '/agents/:agentId/kbs/:kbId/chunks',
    [authenticate, validate(getChunksSchema)],
    asyncHandler(knowledgeBaseController.getChunks)
);

// // Preview chunking (utility endpoint)
// router.post(
//     '/knowledge-base/preview-chunking',
//     knowledgeBaseController.previewChunking
// );

// Get agent chunk stats
router.get(
    '/agents/:agentId/kbs/chunks/stats',
    [authenticate, validate(getChunkStatsSchema)],
    asyncHandler(knowledgeBaseController.getChunkStats)
);

export default router;
