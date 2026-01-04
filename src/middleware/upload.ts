// middlewares/upload.ts
import multer from 'multer';
import { storageConfig } from '../config/storage';
import { Request } from 'express';

// Use memory storage to get buffer for processing
const storage = multer.memoryStorage();

const fileFilter = (
    req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) => {
    if (storageConfig.local.allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
};

export const uploadMiddleware = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: storageConfig.local.maxFileSize,
    },
});

// Specific upload handlers
export const uploadDocument = uploadMiddleware.single('document');
export const uploadDocuments = uploadMiddleware.array('documents', 10);
