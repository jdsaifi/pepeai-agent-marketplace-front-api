import { Request, Response } from 'express';
import { sendSuccess } from '../../lib/apiResponse';
import { ddl } from '../../lib/dd';
import { AuthRequest } from '../../middleware/auth';
import { agentService } from './service';
import { CreateAgentInput, GetAgentBySlugInput } from './schema';
import Helpers from '../../lib/helpers';

class AgentController {
    // list of agents
    async listAgents(req: AuthRequest, res: Response) {
        ddl('route: GET /api/v1/agents');
        ddl('user ->', req.user);
        const userId = req.user?._id as string;
        const agents = await agentService.getAll(
            {
                createdBy: userId,
            },
            {
                select: 'name slug description tags createdBy',
                populate: {
                    path: 'createdBy',
                    select: 'name email',
                },
            }
        );
        return sendSuccess(req, res, agents, 200);
    }

    // list public agents
    async listPublicAgents(req: Request, res: Response) {
        ddl('route: GET /api/v1/agents/public');
        const agents = await agentService.getAll(
            {
                visibility: 'public',
            },
            {
                select: 'name slug description category avatar themeColor tags createdBy',
                populate: {
                    path: 'createdBy',
                    select: 'name email',
                },
            }
        );
        return sendSuccess(req, res, agents, 200);
    }

    // Create agent
    async createAgent(req: AuthRequest, res: Response) {
        ddl('route: POST /api/v1/agent');
        // ddl('user ->', req.user);
        ddl('body ->', req.body);
        // const { name, description, tags } = req.body;
        // const agent = await AgentModel.create({ name, description, tags });
        const input: CreateAgentInput = {
            createdBy: req.user?._id as string,
            ...req.body,
        };
        ddl('input ->', input);
        const agent = await agentService.createAgent(input);
        ddl('agent ->', agent);

        return sendSuccess(
            req,
            res,
            {
                id: agent._id,
                name: agent.name,
                slug: agent.slug,
                description: agent.description,
                tags: agent.tags,
            },
            201
        );
    }

    // Get agent by slug
    async getAgentBySlug(req: AuthRequest, res: Response) {
        ddl('route: GET /api/v1/agent/:slug');
        const { slug } = req.params as GetAgentBySlugInput;
        const agent = await agentService.getAgentBySlug(slug);
        return sendSuccess(req, res, agent, 200);
    }
}

export const agentController = new AgentController();
