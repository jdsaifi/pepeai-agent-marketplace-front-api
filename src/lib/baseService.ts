import { Model } from 'mongoose';
import { ddl } from './dd';

class BaseService {
    model: Model<any>;

    constructor(model: Model<any>) {
        this.model = model;
    }

    async get(query: any) {
        ddl('get query ->', query);
        return this.model.findOne(query);
    }

    async getAll(query: any, options: any = {}) {
        ddl('getAll query ->', query);
        return this.model
            .find(query)
            .populate(options.populate || [])
            .select(options.select || '')
            .sort(options.sort || { createdAt: -1 });
    }

    async create(data: any) {
        ddl('create data ->', data);
        return this.model.create(data);
    }

    async update(query: any, data: any) {
        ddl('update query ->', query);
        ddl('update data ->', data);
        return this.model.updateOne(query, data);
    }
}

export default BaseService;
