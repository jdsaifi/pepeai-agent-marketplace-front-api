import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Middleware to generate and attach a unique request ID to each request
 * The requestId can be accessed via req.id or req.headers['x-request-id']
 */
export const requestIdMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // Check if request ID is already present in headers (e.g., from a load balancer)
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();

    // Attach to request object for easy access
    (req as any).id = requestId;

    // Set response header
    res.setHeader('X-Request-ID', requestId);

    next();
};

/**
 * Helper function to get requestId from request object
 */
export const getRequestId = (req: Request): string => {
    return (req as any).id || req.headers['x-request-id'] || randomUUID();
};
