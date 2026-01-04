import { Router } from 'express';
// // Route imports
import authRoutes from './modules/auth/route';
import agentRoutes from './modules/agent/route';
import knowledgeBaseRoutes from './modules/knowledgeBase/route';

const router = Router();

router.use('/auth', authRoutes);
router.use('/agents', agentRoutes);
router.use(knowledgeBaseRoutes);

export default router;
