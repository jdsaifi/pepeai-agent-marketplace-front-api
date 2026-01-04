import { z } from 'zod';

export const createAgentSchema = z.object({
    body: z.object({
        name: z.string().min(1, 'Name is required'),
        description: z.string().min(1, 'Description is required'),
        tags: z.array(z.string()).optional(),
    }),
});

export const getAgentBySlugSchema = z.object({
    params: z.object({
        slug: z.string().min(1, 'Slug is required'),
    }),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>['body'];
export type GetAgentBySlugInput = z.infer<
    typeof getAgentBySlugSchema
>['params'];
