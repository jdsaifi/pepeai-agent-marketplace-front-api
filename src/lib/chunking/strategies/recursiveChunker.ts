// services/chunking/strategies/recursiveChunker.ts
import { IChunkData, IChunkingOptions } from '../../../types/chunk';
import {
    estimateTokens,
    splitIntoParagraphs,
    splitIntoSentences,
    cleanTextForChunking,
} from '../../textUtils';

// Separators in order of priority
const SEPARATORS = [
    '\n\n\n', // Multiple line breaks (sections)
    '\n\n', // Paragraphs
    '\n', // Single line break
    '. ', // Sentences
    ', ', // Clauses
    ' ', // Words
    '', // Characters (last resort)
];

export function recursiveChunk(
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

    const rawChunks = splitRecursively(cleanedText, chunkSize, SEPARATORS);

    // Merge small chunks and add overlap
    let currentChunk = '';
    let startChar = 0;

    for (let i = 0; i < rawChunks.length; i++) {
        const piece = rawChunks[i];

        if (currentChunk.length + piece.length <= chunkSize) {
            currentChunk += (currentChunk ? ' ' : '') + piece;
        } else {
            // Save current chunk if big enough
            if (currentChunk.length >= minChunkSize) {
                chunks.push({
                    content: currentChunk.trim(),
                    charCount: currentChunk.trim().length,
                    tokenCount: estimateTokens(currentChunk),
                    metadata: {
                        startChar,
                    },
                });
            }

            // Start new chunk with overlap from previous
            const overlapText = getOverlapText(currentChunk, chunkOverlap);
            startChar = cleanedText.indexOf(piece, startChar);
            currentChunk = overlapText + (overlapText ? ' ' : '') + piece;
        }
    }

    // Don't forget the last chunk
    if (currentChunk.trim().length >= minChunkSize) {
        chunks.push({
            content: currentChunk.trim(),
            charCount: currentChunk.trim().length,
            tokenCount: estimateTokens(currentChunk),
            metadata: {
                startChar,
            },
        });
    }

    return chunks;
}

function splitRecursively(
    text: string,
    chunkSize: number,
    separators: string[]
): string[] {
    if (text.length <= chunkSize) {
        return [text];
    }

    const separator = separators[0];
    const remainingSeparators = separators.slice(1);

    if (separator === '') {
        // Last resort: split by character count
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.substring(i, i + chunkSize));
        }
        return chunks;
    }

    const parts = text.split(separator).filter((p) => p.trim().length > 0);

    if (parts.length === 1) {
        // Separator not found, try next one
        return splitRecursively(text, chunkSize, remainingSeparators);
    }

    const chunks: string[] = [];

    for (const part of parts) {
        if (part.length <= chunkSize) {
            chunks.push(part);
        } else {
            // Part too large, split with remaining separators
            chunks.push(
                ...splitRecursively(part, chunkSize, remainingSeparators)
            );
        }
    }

    return chunks;
}

function getOverlapText(text: string, overlapSize: number): string {
    if (text.length <= overlapSize) return text;

    // Try to find a good break point for overlap
    const overlapStart = text.length - overlapSize;
    const sentences = splitIntoSentences(text.substring(overlapStart));

    if (sentences.length > 1) {
        // Return from the last complete sentence
        return sentences.slice(-1).join(' ');
    }

    // Fall back to word boundary
    const lastSpace = text.lastIndexOf(' ', overlapStart + 50);
    if (lastSpace > overlapStart - 50) {
        return text.substring(lastSpace + 1);
    }

    return text.substring(overlapStart);
}
