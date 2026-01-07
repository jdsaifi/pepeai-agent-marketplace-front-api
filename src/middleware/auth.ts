import { Request, Response, NextFunction } from 'express';
import { sendError } from '../lib/apiResponse';
import Helpers from '../lib/helpers';
import { authService } from '../modules/auth/service';
import { ddl } from '../lib/dd';

export interface AuthRequest extends Request {
    user?: {
        _id?: string;
        id?: string;
        email?: string;
        role?: string;
    };
}

export const authenticate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        // allow auth token from cookie or header
        const token =
            req.cookies.authToken || req.headers.authorization?.split(' ')[1];
        ddl('token: ', token);
        if (!token) {
            return sendError(
                req,
                res,
                401,
                'UNAUTHORIZED',
                'Missing or invalid authorization header'
            );
        }

        const decoded = Helpers.verifyJWTToken(token);

        const user = await authService.get({ _id: decoded.sub });

        if (!user) {
            return sendError(
                req,
                res,
                401,
                'UNAUTHORIZED',
                'Invalid or expired token'
            );
        }

        req.user = user;

        next();
    } catch (error) {
        return sendError(
            req,
            res,
            500,
            'INTERNAL_ERROR',
            'Authentication failed'
        );
    }
};
