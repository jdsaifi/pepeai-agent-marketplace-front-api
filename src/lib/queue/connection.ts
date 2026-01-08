// services/queue/connection.ts
// import amqp, { Connection, Channel, ConfirmChannel } from 'amqplib';
import * as amqp from 'amqplib';
import type { Connection, ConfirmChannel } from 'amqplib';
import { EventEmitter } from 'events';
import { queueConfig } from '../../config/queue';

class RabbitMQConnection extends EventEmitter {
    private connection: any | Connection | null = null;
    private channel: ConfirmChannel | null = null;
    private isConnecting: boolean = false;
    private reconnectAttempts: number = 0;

    /**
     * Connect to RabbitMQ
     */
    async connect(): Promise<void> {
        if (this.connection && this.channel) {
            return;
        }

        if (this.isConnecting) {
            // Wait for existing connection attempt
            return new Promise((resolve, reject) => {
                this.once('connected', resolve);
                this.once('error', reject);
            });
        }

        this.isConnecting = true;

        try {
            console.log('Connecting to RabbitMQ...');

            this.connection = await amqp.connect(queueConfig.rabbitmq.url, {
                heartbeat: queueConfig.rabbitmq.heartbeat,
            });

            if (!this.connection) {
                return;
            }

            this.connection.on('error', (err: any) => {
                console.error('RabbitMQ connection error:', err.message);
                this.handleDisconnect();
            });

            this.connection.on('close', () => {
                console.warn('RabbitMQ connection closed');
                this.handleDisconnect();
            });

            // Create confirm channel for reliable publishing
            this.channel = await this.connection.createConfirmChannel();

            if (!this.channel) {
                return;
            }

            this.channel.on('error', (err) => {
                console.error('RabbitMQ channel error:', err.message);
            });

            this.channel.on('close', () => {
                console.warn('RabbitMQ channel closed');
                this.channel = null;
            });

            // Setup exchanges and queues
            await this.setupTopology();

            this.isConnecting = false;
            this.reconnectAttempts = 0;
            console.log('RabbitMQ connected successfully');
            this.emit('connected');
        } catch (error) {
            this.isConnecting = false;
            console.error('Failed to connect to RabbitMQ:', error);
            this.emit('error', error);
            await this.handleDisconnect();
            throw error;
        }
    }

    /**
     * Setup exchanges and queues
     */
    private async setupTopology(): Promise<void> {
        if (!this.channel) throw new Error('Channel not available');

        const { exchange, queues, deadLetter } = queueConfig;

        // Setup dead letter exchange
        await this.channel.assertExchange(deadLetter.exchange, 'direct', {
            durable: true,
        });

        // Setup dead letter queue
        await this.channel.assertQueue(deadLetter.queue, {
            durable: true,
        });

        await this.channel.bindQueue(
            deadLetter.queue,
            deadLetter.exchange,
            deadLetter.routingKey
        );

        // Setup main exchange
        await this.channel.assertExchange(exchange.name, exchange.type, {
            durable: exchange.durable,
        });

        // Setup processing queues
        for (const [key, queue] of Object.entries(queues)) {
            await this.channel.assertQueue(queue.name, {
                durable: queue.durable,
                deadLetterExchange: deadLetter.exchange,
                deadLetterRoutingKey: deadLetter.routingKey,
                arguments: {
                    'x-message-ttl': 24 * 60 * 60 * 1000, // 24 hours
                },
            });

            await this.channel.bindQueue(
                queue.name,
                exchange.name,
                queue.routingKey
            );

            console.log(`Queue setup: ${queue.name}`);
        }
    }

    /**
     * Handle disconnection
     */
    private async handleDisconnect(): Promise<void> {
        this.channel = null;
        this.connection = null;

        if (
            this.reconnectAttempts >= queueConfig.rabbitmq.maxReconnectAttempts
        ) {
            console.error('Max reconnect attempts reached');
            this.emit('maxReconnectAttempts');
            return;
        }

        this.reconnectAttempts++;
        console.log(
            `Reconnecting to RabbitMQ (attempt ${this.reconnectAttempts})...`
        );

        await this.delay(queueConfig.rabbitmq.reconnectDelay);

        try {
            await this.connect();
        } catch (error) {
            // Will retry via handleDisconnect
        }
    }

    /**
     * Get channel
     */
    getChannel(): ConfirmChannel {
        if (!this.channel) {
            throw new Error('RabbitMQ channel not available');
        }
        return this.channel;
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.connection !== null && this.channel !== null;
    }

    /**
     * Close connection
     */
    async close(): Promise<void> {
        try {
            if (this.channel) {
                await this.channel.close();
                this.channel = null;
            }
            if (this.connection) {
                await this.connection.close();
                this.connection = null;
            }
            console.log('RabbitMQ connection closed');
        } catch (error) {
            console.error('Error closing RabbitMQ connection:', error);
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

// Singleton instance
export const rabbitMQConnection = new RabbitMQConnection();
