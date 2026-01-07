import { Request, Response } from 'express';
import { ddl } from '../../lib/dd';
import { AuthRequest } from '../../middleware/auth';
import { sendError, sendSuccess } from '../../lib/apiResponse';
import { agentService } from '../agent/service';
// import { getEmbeddingService } from '../../lib/ai/embeddingService';
import { getRAGService } from '../../lib/ai/RAGService';
import { getLLMService } from '../../lib/ai/LLMService';

class ChatbotController {
    async chat(req: Request, res: Response) {
        ddl('route: POST /api/v1/chatbot');
        ddl('params ->', req.params);
        ddl('body ->', req.body);
        const { agentId } = req.params;
        const { query } = req.body;
        // const userId = req.user!._id as string;
        if (!agentId || !query) {
            return sendError(
                req,
                res,
                400,
                'INVALID_REQUEST',
                'Invalid request'
            );
        }

        const agent = await agentService.getOne(agentId);

        if (agent.visibility === 'private') {
            // if (!agent.allowedUsers.includes(userId)) {
            return sendError(req, res, 403, 'FORBIDDEN', 'Forbidden');
            // }
        }

        // get the conversation

        // todos:
        /*
            1. convert query to embedding
            2. search the chunks
            3. get the chunks
            4. get the context
            5. generate the response
            6. save the conversation
            7. return the response
        */

        // convert query into embedding
        // const embeddingService = getEmbeddingService();
        // const embedding = await embeddingService.embed(query);
        // ddl('embedding ->', embedding);

        const ragService = getRAGService();
        // Health check
        const ragHealth = await ragService.healthCheck();
        ddl('ragHealth ->', ragHealth);

        if (!ragHealth.healthy) {
            console.log(
                '\n⚠️  Some services unavailable. Running in demo mode.\n'
            );
            return sendError(
                req,
                res,
                500,
                'SERVICE_UNAVAILABLE',
                'Service unavailable'
            );
        }

        // 1. Search for relevant context
        const searchResult = await ragService.search(agent.id, query, {
            limit: 5,
        });

        ddl(`   [Found ${searchResult.results.length} relevant chunks]`);

        // 2. Get formatted context
        const ragContext = await ragService.getContext(agent.id, query, {
            limit: 5,
            maxTokens: 2000,
        });

        // 3. Generate response with context
        const llmService = getLLMService();
        const response = await llmService.chatWithAgent(agent, query, {
            context: ragContext.content,
            stream: false,
        });
        ddl('response ->', response);

        // const result = await ragService.search(agent.id, query);
        // ddl('result ->', result);

        // search the chunks from vector database

        // const result = await chatbotService.chat(agentId, userId, query);
        // return sendSuccess(req, res, result, 200);

        return sendSuccess(
            req,
            res,
            { message: 'Chat successful', response },
            200
        );
    }
}

export const chatbotController = new ChatbotController();
