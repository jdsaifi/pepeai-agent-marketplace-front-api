export interface APIErrorOptions {
    code: number;
    message: string;
    errorCode?: string;
    data?: any;
    meta?: {
        requestId?: string;
        timestamp?: string;
        [key: string]: any;
    };
}

export class APIError extends Error {
    public readonly statusCode: number;
    public readonly errorCode: string;
    public readonly data?: any;
    public readonly meta?: {
        requestId?: string;
        timestamp?: string;
        [key: string]: any;
    };

    constructor(options: APIErrorOptions) {
        super(options.message);
        this.name = 'APIError';
        this.statusCode = options.code;
        this.errorCode = options.errorCode || this.getDefaultErrorCode(options.code);
        this.data = options.data;
        
        // Set up meta with timestamp and optional requestId
        this.meta = {
            timestamp: new Date().toISOString(),
            ...(options.meta?.requestId && { requestId: options.meta.requestId }),
            ...options.meta,
        };

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, APIError);
        }
    }

    private getDefaultErrorCode(statusCode: number): string {
        const errorCodeMap: Record<number, string> = {
            400: 'BAD_REQUEST',
            401: 'UNAUTHORIZED',
            403: 'FORBIDDEN',
            404: 'NOT_FOUND',
            409: 'CONFLICT',
            422: 'UNPROCESSABLE_ENTITY',
            429: 'TOO_MANY_REQUESTS',
            500: 'INTERNAL_ERROR',
            502: 'BAD_GATEWAY',
            503: 'SERVICE_UNAVAILABLE',
        };

        return errorCodeMap[statusCode] || 'ERROR';
    }
}

