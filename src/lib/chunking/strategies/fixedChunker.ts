// lib/chunking/strategies/fixedChunker.ts
import { IChunkData, IChunkingOptions } from '../../../types/chunk';
import {
    estimateTokens,
    findBreakPoint,
    cleanTextForChunking,
} from '../../textUtils';

export interface IPageContent {
    pageNumber: number;
    text: string;
}

export function fixedChunk(
    text: string,
    options: IChunkingOptions,
    pages?: IPageContent[]
): IChunkData[] {
    const {
        chunkSize = 1000,
        chunkOverlap = 200,
        minChunkSize = 100,
        preserveSentences = true,
    } = options;

    const cleanedText = cleanTextForChunking(text);
    const chunks: IChunkData[] = [];

    let startPos = 0;
    let chunkIndex = 0;

    while (startPos < cleanedText.length) {
        let endPos = startPos + chunkSize;

        // Find better break point if preserving sentences
        if (preserveSentences && endPos < cleanedText.length) {
            endPos = findBreakPoint(cleanedText, endPos);
        }

        // Extract chunk content
        let chunkContent = cleanedText.substring(startPos, endPos).trim();

        // Skip if too small (unless it's the last chunk)
        if (
            chunkContent.length < minChunkSize &&
            startPos + chunkSize < cleanedText.length
        ) {
            startPos = endPos - chunkOverlap;
            continue;
        }

        // Find page number if pages provided
        const pageNumber = pages ? findPageNumber(startPos, pages) : undefined;

        chunks.push({
            content: chunkContent,
            charCount: chunkContent.length,
            tokenCount: estimateTokens(chunkContent),
            metadata: {
                startChar: startPos,
                endChar: endPos,
                pageNumber,
            },
        });

        chunkIndex++;

        // Move start position (with overlap)
        startPos = endPos - chunkOverlap;

        // Ensure we make progress
        if (startPos <= chunks[chunks.length - 1].metadata.startChar!) {
            startPos = endPos;
        }
    }

    return chunks;
}

function findPageNumber(
    charPos: number,
    pages: IPageContent[]
): number | undefined {
    let currentPos = 0;

    for (const page of pages) {
        if (charPos >= currentPos && charPos < currentPos + page.text.length) {
            return page.pageNumber;
        }
        currentPos += page.text.length + 1; // +1 for separator
    }

    return pages[pages.length - 1]?.pageNumber;
}
