import { Router } from 'express';
import { chatbotController } from './controller';
import { asyncHandler } from '../../lib/asyncHandler';

const router = Router();

router.post('/agents/:agentId/chat', asyncHandler(chatbotController.chat));

export default router;
