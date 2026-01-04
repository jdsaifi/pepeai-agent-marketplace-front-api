import mongoose, { ConnectOptions } from 'mongoose';
import { dbConfig } from '../config/database';
/**
 * Database Connection Class
 */
class Database {
    private connection: mongoose.Connection | null = null;
    private isConnected: boolean;
    private connectionAttempts: number;

    constructor() {
        this.connection = null;
        this.isConnected = false;
        this.connectionAttempts = 0;
    }

    /**
     * Connect to MongoDB with retry logic
     */
    async connect() {
        const uri = dbConfig.mongoURI;
        const dbName = dbConfig.databaseName;
        const { options, retry } = dbConfig;

        // Mask password in logs
        const maskedUri = uri.replace(/:([^@]+)@/, ':****@');

        console.log(`📦 Connecting to MongoDB: ${maskedUri}`);

        while (this.connectionAttempts < retry.maxAttempts) {
            try {
                this.connectionAttempts++;

                await mongoose.connect(uri, {
                    ...options,
                    dbName,
                } as ConnectOptions);
                this.connection = mongoose.connection;
                this.isConnected = true;

                console.log(`✅ MongoDB connected successfully`);
                console.log(`   Host: ${this.connection?.host}`);
                console.log(`   Database: ${this.connection?.name}`);
                console.log(`   Pool Size: ${options.maxPoolSize}`);

                // Setup event listeners
                this.setupEventListeners();

                // Reset attempts on successful connection
                this.connectionAttempts = 0;

                return this.connection;
            } catch (error: any) {
                console.error(
                    `❌ MongoDB connection attempt ${this.connectionAttempts} failed:`,
                    error.message
                );

                if (this.connectionAttempts >= retry.maxAttempts) {
                    console.error(
                        '🚨 Max connection attempts reached. Exiting...'
                    );
                    throw error;
                }

                // Calculate delay with exponential backoff
                const delay = Math.min(
                    retry.initialDelayMs *
                        Math.pow(2, this.connectionAttempts - 1),
                    retry.maxDelayMs
                );

                console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
                await this.sleep(delay);
            }
        }
    }

    /**
     * Setup Mongoose event listeners
     */
    setupEventListeners() {
        const db = mongoose.connection;

        db.on('connected', () => {
            this.isConnected = true;
            console.log('📗 MongoDB connected');
        });

        db.on('disconnected', () => {
            this.isConnected = false;
            console.log('📕 MongoDB disconnected');
        });

        db.on('reconnected', () => {
            this.isConnected = true;
            console.log('📘 MongoDB reconnected');
        });

        db.on('error', (error) => {
            this.isConnected = false;
            console.error('📙 MongoDB error:', error.message);
        });

        // Monitor connection pool
        if (process.env.NODE_ENV === 'development') {
            db.on('open', () => {
                console.log('📂 MongoDB connection opened');
            });

            db.on('close', () => {
                console.log('📁 MongoDB connection closed');
            });
        }
    }

    /**
     * Graceful disconnect
     */
    async disconnect() {
        if (!this.isConnected) {
            console.log('MongoDB already disconnected');
            return;
        }

        try {
            await mongoose.connection.close();
            this.isConnected = false;
            console.log('✅ MongoDB disconnected gracefully');
        } catch (error: any) {
            console.error(
                '❌ Error disconnecting from MongoDB:',
                error.message
            );
            throw error;
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            if (!this.isConnected) {
                return {
                    status: 'disconnected',
                    healthy: false,
                };
            }

            // Ping the database
            const db = mongoose.connection.db;
            if (!db) {
                return {
                    status: 'error',
                    healthy: false,
                    error: 'Database connection not available',
                };
            }
            const adminDb = db.admin();
            const result = await adminDb.ping();

            // Get server status
            const serverStatus = await adminDb.serverStatus();

            return {
                status: 'connected',
                healthy: result.ok === 1,
                details: {
                    host: mongoose.connection.host,
                    port: mongoose.connection.port,
                    database: mongoose.connection.name,
                    readyState: mongoose.connection.readyState,
                    connections: serverStatus.connections,
                    uptime: serverStatus.uptime,
                    version: serverStatus.version,
                },
            };
        } catch (error: any) {
            return {
                status: 'error',
                healthy: false,
                error: error.message,
            };
        }
    }

    /**
     * Get connection stats
     */
    getStats() {
        if (!this.isConnected) {
            return null;
        }

        return {
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            port: mongoose.connection.port,
            database: mongoose.connection.name,
            models: Object.keys(mongoose.models),
        };
    }

    /**
     * Sleep helper for retry delays
     */
    sleep(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

// Create singleton instance
const database = new Database();

export default database;
