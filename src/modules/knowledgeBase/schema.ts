import { z } from 'zod';

export const getAllKBSchema = z.object({
    params: z.object({
        agentId: z.string().min(1, 'Agent ID is required'),
    }),
});

export const getOneKBSchema = z.object({
    params: z.object({
        agentId: z.string().min(1, 'Agent ID is required'),
        kbId: z.string().min(1, 'Knowledge base ID is required'),
    }),
});

export const getContentSchema = z.object({
    params: z.object({
        agentId: z.string().min(1, 'Agent ID is required'),
        kbId: z.string().min(1, 'Knowledge base ID is required'),
    }),
});

export const chunkDocumentSchema = z.object({
    params: z.object({
        agentId: z.string().min(1, 'Agent ID is required'),
        kbId: z.string().min(1, 'Knowledge base ID is required'),
    }),
    body: z
        .object({
            strategy: z.enum(['fixed', 'recursive', 'semantic', 'page']),
            chunkSize: z
                .number()
                .min(1, 'Chunk size is required')
                .max(10000, 'Chunk size must be less than 10000'),
            chunkOverlap: z
                .number()
                .min(1, 'Chunk overlap is required')
                .max(1000, 'Chunk overlap must be less than 1000'),
        })
        .strict(),
});

export const getChunksSchema = z.object({
    params: z.object({
        agentId: z.string().min(1, 'Agent ID is required'),
        kbId: z.string().min(1, 'Knowledge base ID is required'),
    }),
});

export const previewChunkingSchema = z.object({
    body: z
        .object({
            text: z.string().min(1, 'Text is required'),
            strategy: z.enum(['fixed', 'recursive', 'semantic', 'page']),
            chunkSize: z
                .number()
                .min(1, 'Chunk size is required')
                .max(10000, 'Chunk size must be less than 10000'),
            chunkOverlap: z
                .number()
                .min(1, 'Chunk overlap is required')
                .max(1000, 'Chunk overlap must be less than 1000'),
        })
        .strict(),
});

export const getChunkStatsSchema = z.object({
    params: z.object({
        agentId: z.string().min(1, 'Agent ID is required'),
    }),
});
