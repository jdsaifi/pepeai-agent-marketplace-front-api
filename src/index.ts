// console.log('starting with the name of Allah');
import app from './app';
import env from './config/env';
import database from './lib/database';

const main = async () => {
    try {
        await database.connect();
        console.log('Database connected successfully');
        // Start Express server
        const server = app.listen(env.PORT, () => {
            console.log(`🚀 API server running on port ${env.PORT}`);
            console.log(`📊 Environment: ${env.NODE_ENV}`);
            console.log(`🔗 Health check: http://localhost:${env.PORT}/health`);
        });

        // Graceful shutdown handlers
        const gracefulShutdown = async (signal: string) => {
            console.log(`\n${signal} received. Starting graceful shutdown...`);

            // Stop accepting new connections
            server.close(async () => {
                console.log('✅ HTTP server closed');

                try {
                    // Disconnect from MongoDB
                    await database.disconnect();

                    console.log('✅ Graceful shutdown completed');
                    process.exit(0);
                } catch (error) {
                    console.error('❌ Error during shutdown:', error);
                    process.exit(1);
                }
            });

            // Force shutdown after 30 seconds
            setTimeout(() => {
                console.error('⚠️ Forced shutdown after timeout');
                process.exit(1);
            }, 30000);
        };

        // Listen for termination signals
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught Exception:', error);
            gracefulShutdown('UNCAUGHT_EXCEPTION');
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.error(
                '❌ Unhandled Rejection at:',
                promise,
                'reason:',
                reason
            );
            gracefulShutdown('UNHANDLED_REJECTION');
        });
    } catch (error: any) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

main();
