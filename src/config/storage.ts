// config/storage.ts
import env from './env';
import path from 'path';

export const storageConfig = {
    provider: env.STORAGE_PROVIDER || 'local', // 'local' | 's3'

    local: {
        uploadDir: env.LOCAL_UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
        maxFileSize: 50 * 1024 * 1024, // 50MB
        allowedMimeTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'text/csv',
            'application/json',
        ],
    },

    s3: {
        bucket: env.AWS_S3_BUCKET || '',
        region: env.AWS_S3_REGION || 'us-east-1',
        accessKeyId: env.AWS_S3_ACCESS_KEY_ID || '',
        secretAccessKey: env.AWS_S3_SECRET_ACCESS_KEY || '',
    },
};
