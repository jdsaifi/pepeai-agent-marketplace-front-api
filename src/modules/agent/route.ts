import { Router } from 'express';
import { agentController } from './controller';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createAgentSchema, getAgentBySlugSchema } from './schema';
import { uploadDocuments, uploadDocument } from '../../middleware/upload';
import { knowledgeBaseController } from '../knowledgeBase/controller';

const router = Router();

// list of agents route
router.get('/', [authenticate], asyncHandler(agentController.listAgents));

// list of public agents route
router.get('/public', asyncHandler(agentController.listPublicAgents));

// Create agent route
router.post(
    '/',
    [authenticate, validate(createAgentSchema)],
    asyncHandler(agentController.createAgent)
);

// Get agent by slug route
router.get(
    '/:slug',
    [authenticate, validate(getAgentBySlugSchema)],
    asyncHandler(agentController.getAgentBySlug)
);

// // Upload document route
// router.post(
//     '/:agentId/kbs',
//     [authenticate, uploadDocument],
//     asyncHandler(knowledgeBaseController.uploadDocument)
// );

export default router;
