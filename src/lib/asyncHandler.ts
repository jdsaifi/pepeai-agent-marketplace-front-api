// utils/asyncHandler.ts
import { Request, Response, NextFunction } from 'express';
/**
 * Async handler to wrap async route handlers
 * Eliminates the need for try-catch blocks in every controller
 *
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
export const asyncHandler =
    (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
