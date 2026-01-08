import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
    PORT: z.number().default(3000),
    NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .default('development'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
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

    RABBITMQ_URL: z.string().default('amqp://127.0.0.1:5672'),

    STORAGE_PROVIDER: z.string().default('local'),
    LOCAL_UPLOAD_DIR: z.string().default(path.join(process.cwd(), 'uploads')),
    AWS_S3_BUCKET: z.string().default(''),
    AWS_S3_REGION: z.string().default('us-east-1'),
    AWS_S3_ACCESS_KEY_ID: z.string().default(''),
    AWS_S3_SECRET_ACCESS_KEY: z.string().default(''),

    EMBEDDING_PROVIDER: z.string().default('ollama'),
    OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
    OLLAMA_EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
    OLLAMA_LLM_MODEL: z.string().default('llama3.2'),

    OPENAI_API_KEY: z.string().default(''),
    OPENAI_LLM_MODEL: z.string().default('gpt-4o-mini'),
    OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),

    OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

    QDRANT_URL: z.string().default('http://localhost:6333'),
    QDRANT_API_KEY: z.string().default(''),

    ANTHROPIC_API_KEY: z.string().default(''),
    ANTHROPIC_LLM_MODEL: z.string().default('claude-sonnet-4-20250514'),

    GOOGLE_GEMINI_API_KEY: z.string().default(''),
    GOOGLE_GEMINI_LLM_MODEL: z.string().default('gemini-1.5-flash'),
});

const env = envSchema.parse(process.env);

export default env;
