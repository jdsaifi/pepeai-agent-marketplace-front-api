import { Request, Response } from 'express';
import { getRequestId } from '../middleware/requestId';

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: any;
    };
    meta?: {
        requestId?: string;
        timestamp?: string;
        page?: number;
        limit?: number;
        total?: number;
        [key: string]: any;
    };
}

export const sendSuccess = <T>(
    req: Request,
    res: Response,
    data: T,
    statusCode = 200,
    meta?: Omit<ApiResponse['meta'], 'requestId' | 'timestamp'>
): Response => {
    const requestId = getRequestId(req);
    const response: ApiResponse<T> = {
        success: true,
        data,
        meta: {
            requestId,
            timestamp: new Date().toISOString(),
            ...meta,
        },
    };
    return res.status(statusCode).json(response);
};

export const sendError = (
    req: Request,
    res: Response,
    statusCode: number,
    code: string,
    message: string,
    details?: any
): Response => {
    const requestId = getRequestId(req);
    const response: ApiResponse = {
        success: false,
        error: {
            code,
            message,
            ...(details && { details }),
        },
        meta: {
            requestId,
            timestamp: new Date().toISOString(),
        },
    };
    return res.status(statusCode).json(response);
};
