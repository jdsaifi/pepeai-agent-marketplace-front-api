import { Router } from 'express';
// // Route imports
import authRoutes from './modules/auth/route';
import agentRoutes from './modules/agent/route';
import knowledgeBaseRoutes from './modules/knowledgeBase/route';
import chatbotRoutes from './modules/chatbot/route';

const router = Router();

router.use('/chatbot', chatbotRoutes);

router.use('/auth', authRoutes);
router.use('/agents', agentRoutes);
router.use(knowledgeBaseRoutes);

export default router;
