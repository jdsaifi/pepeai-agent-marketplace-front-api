// lib/chunking/strategies/semanticChunker.ts
import { IChunkData, IChunkingOptions } from '../../../types/chunk';
import {
    estimateTokens,
    splitIntoParagraphs,
    splitIntoSentences,
    extractSections,
    cleanTextForChunking,
} from '../../textUtils';

export function semanticChunk(
    text: string,
    options: IChunkingOptions
): IChunkData[] {
    const {
        chunkSize = 1000,
        chunkOverlap = 200,
        minChunkSize = 100,
    } = options;

    const cleanedText = cleanTextForChunking(text);
    const chunks: IChunkData[] = [];

    // First, try to extract sections
    const sections = extractSections(cleanedText);

    for (const section of sections) {
        const paragraphs = splitIntoParagraphs(section.content);

        let currentChunk = '';
        let currentHeader = section.header;

        for (const paragraph of paragraphs) {
            // If paragraph itself is too large, split into sentences
            if (paragraph.length > chunkSize) {
                // Save current chunk first
                if (currentChunk.length >= minChunkSize) {
                    chunks.push(createChunkData(currentChunk, currentHeader));
                }

                // Split large paragraph by sentences
                const sentenceChunks = chunkBySentences(
                    paragraph,
                    chunkSize,
                    chunkOverlap,
                    minChunkSize
                );
                for (const sc of sentenceChunks) {
                    chunks.push({
                        ...sc,
                        metadata: { ...sc.metadata, header: currentHeader },
                    });
                }

                currentChunk = '';
                continue;
            }

            // Check if adding paragraph exceeds chunk size
            if (currentChunk.length + paragraph.length + 2 > chunkSize) {
                // Save current chunk
                if (currentChunk.length >= minChunkSize) {
                    chunks.push(createChunkData(currentChunk, currentHeader));
                }

                // Get overlap from previous chunk
                const overlap = getSemanticOverlap(currentChunk, chunkOverlap);
                currentChunk = overlap + (overlap ? '\n\n' : '') + paragraph;
            } else {
                currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
            }
        }

        // Save remaining chunk
        if (currentChunk.length >= minChunkSize) {
            chunks.push(createChunkData(currentChunk, currentHeader));
        }
    }

    return chunks;
}

function chunkBySentences(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
    minChunkSize: number
): IChunkData[] {
    const sentences = splitIntoSentences(text);
    const chunks: IChunkData[] = [];

    let currentChunk = '';

    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length + 1 > chunkSize) {
            if (currentChunk.length >= minChunkSize) {
                chunks.push(createChunkData(currentChunk));
            }

            // Start new chunk with overlap
            const lastSentences = getLastSentences(currentChunk, chunkOverlap);
            currentChunk =
                lastSentences + (lastSentences ? ' ' : '') + sentence;
        } else {
            currentChunk += (currentChunk ? ' ' : '') + sentence;
        }
    }

    if (currentChunk.length >= minChunkSize) {
        chunks.push(createChunkData(currentChunk));
    }

    return chunks;
}

function getLastSentences(text: string, targetLength: number): string {
    const sentences = splitIntoSentences(text);
    let result = '';

    for (let i = sentences.length - 1; i >= 0; i--) {
        const newResult = sentences[i] + (result ? ' ' + result : '');
        if (newResult.length > targetLength) break;
        result = newResult;
    }

    return result;
}

function getSemanticOverlap(text: string, targetLength: number): string {
    const paragraphs = splitIntoParagraphs(text);

    // Try to get last paragraph if it fits
    if (paragraphs.length > 0) {
        const lastParagraph = paragraphs[paragraphs.length - 1];
        if (lastParagraph.length <= targetLength) {
            return lastParagraph;
        }
    }

    // Fall back to last sentences
    return getLastSentences(text, targetLength);
}

function createChunkData(content: string, header?: string): IChunkData {
    const trimmed = content.trim();
    return {
        content: trimmed,
        charCount: trimmed.length,
        tokenCount: estimateTokens(trimmed),
        metadata: {
            header,
        },
    };
}
