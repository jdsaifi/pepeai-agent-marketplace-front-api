import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { sendError } from '../lib/apiResponse';
import { APIError } from '../lib/APIError';
import { getRequestId } from './requestId';
import { dd } from '../lib/dd';

export const errorHandler = (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.error('Error:', error);

    const requestId = getRequestId(req);

    // Handle custom APIError instances
    if (error instanceof APIError) {
        const response = {
            success: false,
            error: {
                code: error.errorCode,
                message: error.message,
                ...(error.data && { details: error.data }),
            },
            meta: {
                requestId,
                timestamp: new Date().toISOString(),
                ...error.meta,
            },
        };
        return res.status(error.statusCode).json(response);
    }

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
                errors: messages ?? 'Validation failed',
            }
        );
    }

    if (error.name === 'UnauthorizedError') {
        return sendError(req, res, 401, 'UNAUTHORIZED', error.message);
    }

    // Handle generic Error instances - use the error message
    // Determine status code based on error message patterns
    let statusCode = 500;
    let errorCode = 'ERROR';

    if (error.message.toLowerCase().includes('not found')) {
        statusCode = 404;
        errorCode = 'NOT_FOUND';
    } else if (
        error.message.toLowerCase().includes('invalid password') ||
        error.message.toLowerCase().includes('unauthorized') ||
        error.message.toLowerCase().includes('authentication')
    ) {
        statusCode = 401;
        errorCode = 'UNAUTHORIZED';
    } else if (
        error.message.toLowerCase().includes('forbidden') ||
        error.message.toLowerCase().includes('permission')
    ) {
        statusCode = 403;
        errorCode = 'FORBIDDEN';
    } else if (
        error.message.toLowerCase().includes('bad request') ||
        error.message.toLowerCase().includes('invalid')
    ) {
        statusCode = 400;
        errorCode = 'BAD_REQUEST';
    }

    return sendError(
        req,
        res,
        statusCode,
        errorCode,
        error.message || 'An unexpected error occurred'
    );
};

export const notFoundHandler = (req: Request, res: Response) => {
    sendError(
        req,
        res,
        404,
        'NOT_FOUND',
        `Route ${req.method} ${req.path} not found`
    );
};
