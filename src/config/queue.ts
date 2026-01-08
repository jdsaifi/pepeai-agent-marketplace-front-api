// config/queue.ts
import env from './env';

export const queueConfig = {
    rabbitmq: {
        url: env.RABBITMQ_URL,
        heartbeat: 60,
        reconnectDelay: 5000,
        maxReconnectAttempts: 10,
    },

    // Exchange for KB processing
    exchange: {
        name: 'kb_processing',
        type: 'direct' as const,
        durable: true,
    },

    // Queue definitions

    queues: {
        fileUpload: {
            name: 'kb.file.upload',
            routingKey: 'kb.file.upload',
            durable: true,
            prefetch: 2, // Process 2 docs at a time per worker
            retryAttempts: 3,
            retryDelay: 5000,
        },
        parse: {
            name: 'kb.parse',
            routingKey: 'kb.parse',
            durable: true,
            prefetch: 2, // Process 2 docs at a time per worker
            retryAttempts: 3,
            retryDelay: 5000,
        },
        chunk: {
            name: 'kb.chunk',
            routingKey: 'kb.chunk',
            durable: true,
            prefetch: 5,
            retryAttempts: 3,
            retryDelay: 3000,
        },
        embed: {
            name: 'kb.embed',
            routingKey: 'kb.embed',
            durable: true,
            prefetch: 3, // Limited by API rate limits
            retryAttempts: 5,
            retryDelay: 10000,
        },
    },

    // Dead letter exchange
    deadLetter: {
        exchange: 'kb_processing_dlx',
        queue: 'kb.failed',
        routingKey: 'kb.failed',
    },
};
