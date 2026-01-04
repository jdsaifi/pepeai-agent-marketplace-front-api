import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
    PORT: z.number().default(3000),
    NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .default('development'),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),
    JWT_SECRET: z
        .string()
        .default('QcclwvZw7hKXCOTouIYOlZt8cHOhyj881iLwZ0zX98A='),
    JWT_EXPIRES_IN: z.string().default('10h'),
    MONGO_URI: z
        .string()
        .default('mongodb://localhost:27017/pepeai_ai_marketplace'),
    MONGO_DB_NAME: z.string().default('pepeai_ai_marketplace'),
    MONGO_MAX_POOL_SIZE: z.string().default('10'),
    MONGO_MIN_POOL_SIZE: z.string().default('2'),

    ENABLE_LOGS: z.string().default('true'),

    STORAGE_PROVIDER: z.string().default('local'),
    LOCAL_UPLOAD_DIR: z.string().default(path.join(process.cwd(), 'uploads')),
    AWS_S3_BUCKET: z.string().default(''),
    AWS_S3_REGION: z.string().default('us-east-1'),
    AWS_S3_ACCESS_KEY_ID: z.string().default(''),
    AWS_S3_SECRET_ACCESS_KEY: z.string().default(''),
});

const env = envSchema.parse(process.env);

export default env;
