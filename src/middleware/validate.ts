import { Request, Response, NextFunction } from 'express';
import { ZodObject, ZodError } from 'zod';
import { sendError } from '../lib/apiResponse';
import { dd, ddl } from '../lib/dd';

export const validate =
    (schema: ZodObject) =>
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const messages = error.issues.map(
                    (e: any) => `${e.path.join('.')}: ${e.message}`
                );
                return sendError(
                    req,
                    res,
                    400,
                    'VALIDATION_ERROR',
                    'Validation failed',
                    {
                        errors: messages,
                    }
                );
            }
            next(error);
        }
    };
