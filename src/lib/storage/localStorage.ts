// lib/storage/localStorage.ts
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { storageConfig } from '../../config/storage';

export interface IStorageResult {
    storageKey: string;
    storageUrl: string;
    checksum: string;
}

export interface IStorageService {
    upload(file: Express.Multer.File, folder: string): Promise<IStorageResult>;
    delete(storageKey: string): Promise<void>;
    getUrl(storageKey: string): string;
    getPath(storageKey: string): string;
}

class LocalStorageService implements IStorageService {
    private baseDir: string;

    constructor() {
        this.baseDir = storageConfig.local.uploadDir;
        this.ensureBaseDir();
    }

    private async ensureBaseDir(): Promise<void> {
        try {
            await fs.access(this.baseDir);
        } catch {
            await fs.mkdir(this.baseDir, { recursive: true });
        }
    }

    private async ensureDir(dir: string): Promise<void> {
        try {
            await fs.access(dir);
        } catch {
            await fs.mkdir(dir, { recursive: true });
        }
    }

    private generateChecksum(buffer: Buffer): string {
        return crypto.createHash('md5').update(buffer).digest('hex');
    }

    async upload(
        file: Express.Multer.File,
        folder: string
    ): Promise<IStorageResult> {
        const folderPath = path.join(this.baseDir, folder);
        await this.ensureDir(folderPath);

        // Generate unique filename
        const timestamp = Date.now();
        const randomStr = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(file.originalname);
        const filename = `${timestamp}-${randomStr}${ext}`;

        const storageKey = path.join(folder, filename);
        const fullPath = path.join(this.baseDir, storageKey);

        // Calculate checksum
        const checksum = this.generateChecksum(file.buffer);

        // Write file
        await fs.writeFile(fullPath, file.buffer);

        return {
            storageKey,
            storageUrl: this.getUrl(storageKey),
            checksum,
        };
    }

    async delete(storageKey: string): Promise<void> {
        const fullPath = path.join(this.baseDir, storageKey);
        try {
            await fs.unlink(fullPath);
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    getUrl(storageKey: string): string {
        // For local, return a relative URL that your server can serve
        return `/uploads/${storageKey}`;
    }

    getPath(storageKey: string): string {
        return path.join(this.baseDir, storageKey);
    }
}

export const localStorageService = new LocalStorageService();
