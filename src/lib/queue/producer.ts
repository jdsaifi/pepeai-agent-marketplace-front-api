// services/queue/producer.ts
import { v4 as uuidv4 } from 'uuid';
import { Types } from 'mongoose';
import { rabbitMQConnection } from './connection';
import { queueConfig } from '../../config/queue';
import { JobModel } from '../../models/job';
import {
    JobPayload,
    IParseJobPayload,
    IChunkJobPayload,
    IEmbedJobPayload,
    JobType,
    IFileUploadJobPayload,
} from '../../types/queue';
import { ddl } from '../dd';

class QueueProducer {
    /**
     * Publish a job to the queue
     */
    private async publish(
        routingKey: string,
        payload: JobPayload
    ): Promise<string> {
        await rabbitMQConnection.connect();
        const channel = rabbitMQConnection.getChannel();

        const message = Buffer.from(JSON.stringify(payload));

        return new Promise((resolve, reject) => {
            channel.publish(
                queueConfig.exchange.name,
                routingKey,
                message,
                {
                    persistent: true,
                    contentType: 'application/json',
                    messageId: payload.jobId,
                    timestamp: payload.timestamp,
                    headers: {
                        'x-retry-count': payload.attempt,
                    },
                },
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(payload.jobId);
                    }
                }
            );
        });
    }

    /** Queue document file upload */
    async queueFileUpload(params: {
        knowledgeBaseId: string;
        agentId: string;
        userId: string;
        file: {
            storageKey: string;
            originalName: string;
            mimeType: string;
            size: number;
        };
    }) {
        const { knowledgeBaseId, agentId, userId, file } = params;
        const queue = queueConfig.queues.fileUpload;

        const payload: IFileUploadJobPayload = {
            jobId: uuidv4(),
            type: 'uploaded',
            knowledgeBaseId,
            agentId,
            userId,
            file,
            timestamp: Date.now(),
            attempt: 1,
            maxAttempts: queue.retryAttempts,
        };

        await this.createJob('uploaded', payload);
        await this.publish(queue.routingKey, payload);

        ddl(`Queued file upload job: ${payload.jobId}`);
        return payload.jobId;
    }

    /**
     * Create and track a job
     */
    private async createJob(
        type: JobType,
        payload: JobPayload
    ): Promise<string> {
        // Save job to database for tracking
        await JobModel.create({
            jobId: payload.jobId,
            knowledgeBaseId: new Types.ObjectId(payload.knowledgeBaseId),
            agentId: new Types.ObjectId(payload.agentId),
            userId: new Types.ObjectId(payload.userId),
            type,
            status: 'pending',
            attempt: payload.attempt,
            maxAttempts: payload.maxAttempts,
            payload,
        });

        return payload.jobId;
    }

    /**
     * Queue document for parsing
     */
    async queueParse(params: {
        knowledgeBaseId: string;
        agentId: string;
        userId: string;
        file: {
            storageKey: string;
            originalName: string;
            mimeType: string;
            size: number;
        };
    }): Promise<string> {
        const { knowledgeBaseId, agentId, userId, file } = params;
        const queue = queueConfig.queues.parse;

        const payload: IParseJobPayload = {
            jobId: uuidv4(),
            type: 'parse',
            knowledgeBaseId,
            agentId,
            userId,
            file,
            timestamp: Date.now(),
            attempt: 1,
            maxAttempts: queue.retryAttempts,
        };

        await this.createJob('parse', payload);
        await this.publish(queue.routingKey, payload);

        console.log(`Queued parse job: ${payload.jobId}`);
        return payload.jobId;
    }

    /**
     * Queue document for chunking
     */
    async queueChunk(params: {
        knowledgeBaseId: string;
        agentId: string;
        userId: string;
        options?: {
            strategy?: 'fixed' | 'recursive' | 'semantic' | 'page';
            chunkSize?: number;
            chunkOverlap?: number;
        };
    }): Promise<string> {
        const { knowledgeBaseId, agentId, userId, options = {} } = params;
        const queue = queueConfig.queues.chunk;

        const payload: IChunkJobPayload = {
            jobId: uuidv4(),
            type: 'chunk',
            knowledgeBaseId,
            agentId,
            userId,
            options: {
                strategy: options.strategy || 'recursive',
                chunkSize: options.chunkSize || 1000,
                chunkOverlap: options.chunkOverlap || 200,
            },
            timestamp: Date.now(),
            attempt: 1,
            maxAttempts: queue.retryAttempts,
        };

        await this.createJob('chunk', payload);
        await this.publish(queue.routingKey, payload);

        console.log(`Queued chunk job: ${payload.jobId}`);
        return payload.jobId;
    }

    /**
     * Queue document for embedding
     */
    async queueEmbed(params: {
        knowledgeBaseId: string;
        agentId: string;
        userId: string;
        options?: {
            model?: string;
            batchSize?: number;
        };
    }): Promise<string> {
        const { knowledgeBaseId, agentId, userId, options = {} } = params;
        const queue = queueConfig.queues.embed;

        const payload: IEmbedJobPayload = {
            jobId: uuidv4(),
            type: 'embed',
            knowledgeBaseId,
            agentId,
            userId,
            options: {
                model: options.model || 'text-embedding-3-small',
                batchSize: options.batchSize || 100,
            },
            timestamp: Date.now(),
            attempt: 1,
            maxAttempts: queue.retryAttempts,
        };

        await this.createJob('embed', payload);
        await this.publish(queue.routingKey, payload);

        console.log(`Queued embed job: ${payload.jobId}`);
        return payload.jobId;
    }

    /**
     * Retry a failed job
     */
    async retryJob(jobId: string): Promise<string | null> {
        const job = await JobModel.findOne({ jobId });

        if (!job) {
            throw new Error('Job not found');
        }

        if (job.attempt >= job.maxAttempts) {
            throw new Error('Max retry attempts reached');
        }

        // Update job for retry
        job.attempt += 1;
        job.status = 'retrying';
        job.error = undefined;
        await job.save();

        // Determine queue and rebuild payload
        const queueMap = {
            parse: queueConfig.queues.parse,
            chunk: queueConfig.queues.chunk,
            embed: queueConfig.queues.embed,
        };

        const queue = queueMap[job.type];
        const payload = {
            ...job.payload,
            jobId: job.jobId,
            attempt: job.attempt,
            timestamp: Date.now(),
        } as JobPayload;

        await this.publish(queue.routingKey, payload);

        console.log(`Retried job: ${jobId} (attempt ${job.attempt})`);
        return jobId;
    }

    /**
     * Queue full pipeline (parse → chunk → embed)
     */
    async queueFullPipeline(params: {
        knowledgeBaseId: string;
        agentId: string;
        userId: string;
        file: {
            storageKey: string;
            originalName: string;
            mimeType: string;
            size: number;
        };
        chunkOptions?: {
            strategy?: 'fixed' | 'recursive' | 'semantic' | 'page';
            chunkSize?: number;
            chunkOverlap?: number;
        };
    }): Promise<string> {
        // Only queue parse - chunk and embed will be triggered automatically
        return this.queueParse({
            knowledgeBaseId: params.knowledgeBaseId,
            agentId: params.agentId,
            userId: params.userId,
            file: params.file,
        });
    }
}

export const queueProducer = new QueueProducer();
