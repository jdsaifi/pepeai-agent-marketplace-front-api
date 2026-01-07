import { APIError } from '../../lib/APIError';
import BaseService from '../../lib/baseService';
import { AgentModel } from '../../models/agent';
import { IAgentDocument } from '../../types/agent';
import { CreateAgentInput } from './schema';

class AgentService extends BaseService {
    constructor() {
        super(AgentModel);
    }

    async getOne(agentId: string) {
        const agent = await this.model.findById(agentId);
        if (!agent) {
            throw new APIError({ code: 404, message: 'Agent not found' });
        }
        return agent;
    }

    async getAgentBySlug(slug: string) {
        const agent = (await this.get({ slug })).populate(
            'createdBy',
            'name email'
        );
        if (!agent) {
            throw new APIError({ code: 404, message: 'Agent not found' });
        }
        return agent;
    }

    async getAgent(agentId: string, userId: string) {
        return await this.model.findOne({
            _id: agentId,
            createdBy: userId,
        });
    }

    // Create agent
    async createAgent(input: CreateAgentInput) {
        const agent = await this.model.create(input);
        return agent as unknown as IAgentDocument;
    }
}

export const agentService = new AgentService();
