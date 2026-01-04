// config/database.js
import env from './env';

/**
 * MongoDB Connection Configuration
 */
export const dbConfig = {
    mongoURI: env.MONGO_URI,
    databaseName: env.MONGO_DB_NAME,
    // Connection options
    options: {
        // Connection pool size
        maxPoolSize: parseInt(env.MONGO_MAX_POOL_SIZE, 10) || 10,
        minPoolSize: parseInt(env.MONGO_MIN_POOL_SIZE, 10) || 2,

        // Timeouts
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,

        // Heartbeat
        heartbeatFrequencyMS: 10000,

        // Write concern
        w: 'majority',
        wtimeoutMS: 2500,

        // Read preference
        readPreference: 'primaryPreferred',

        // Auto index in development only
        autoIndex: process.env.NODE_ENV !== 'production',

        // Retry writes
        retryWrites: true,
        retryReads: true,

        // Compression
        compressors: ['zlib'],
    },

    // Retry configuration
    retry: {
        maxAttempts: 5,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
    },
};
