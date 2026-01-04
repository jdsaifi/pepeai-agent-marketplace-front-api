// lib/chunking/strategies/pageChunker.ts
import { IChunkData, IChunkingOptions } from '../../../types/chunk';
import { estimateTokens, cleanTextForChunking } from '../../textUtils';
import { fixedChunk } from './fixedChunker';

export interface IPageContent {
    pageNumber: number;
    text: string;
}

export function pageChunk(
    pages: IPageContent[],
    options: IChunkingOptions
): IChunkData[] {
    const { chunkSize = 1000, chunkOverlap = 200 } = options;
    const chunks: IChunkData[] = [];

    for (const page of pages) {
        const cleanedText = cleanTextForChunking(page.text);

        // If page fits in one chunk
        if (cleanedText.length <= chunkSize) {
            if (cleanedText.length > 0) {
                chunks.push({
                    content: cleanedText,
                    charCount: cleanedText.length,
                    tokenCount: estimateTokens(cleanedText),
                    metadata: {
                        pageNumber: page.pageNumber,
                    },
                });
            }
        } else {
            // Page too large, split it but keep page reference
            const pageChunks = fixedChunk(cleanedText, {
                ...options,
                chunkSize,
                chunkOverlap,
            });

            for (const chunk of pageChunks) {
                chunks.push({
                    ...chunk,
                    metadata: {
                        ...chunk.metadata,
                        pageNumber: page.pageNumber,
                    },
                });
            }
        }
    }

    return chunks;
}
