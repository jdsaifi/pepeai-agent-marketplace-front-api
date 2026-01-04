// lib/storage/index.ts
import { localStorageService, IStorageService } from './localStorage';
import { storageConfig } from '../../config/storage';

// Factory pattern for storage providers
export const getStorageService = (): IStorageService => {
    switch (storageConfig.provider) {
        case 'local':
            return localStorageService;
        // case 's3':
        //     return s3StorageService;
        default:
            return localStorageService;
    }
};

export const storageService = getStorageService();

export type { IStorageService, IStorageResult } from './localStorage';
