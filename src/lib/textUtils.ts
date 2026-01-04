// lib/textUtils.ts

/**
 * Estimate token count (rough approximation)
 * More accurate: use tiktoken library
 */
export function estimateTokens(text: string): number {
    // GPT models: ~4 chars per token for English
    // More conservative estimate for mixed content
    return Math.ceil(text.length / 4);
}

/**
 * Split text into sentences
 */
export function splitIntoSentences(text: string): string[] {
    // Handle common abbreviations to avoid false splits
    const abbreviations = [
        'Mr.',
        'Mrs.',
        'Ms.',
        'Dr.',
        'Prof.',
        'Sr.',
        'Jr.',
        'vs.',
        'etc.',
        'e.g.',
        'i.e.',
    ];

    let processedText = text;
    const placeholders: Map<string, string> = new Map();

    // Replace abbreviations with placeholders
    abbreviations.forEach((abbr, idx) => {
        const placeholder = `__ABBR${idx}__`;
        placeholders.set(placeholder, abbr);
        processedText = processedText.split(abbr).join(placeholder);
    });

    // Split by sentence-ending punctuation
    const sentences = processedText
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    // Restore abbreviations
    return sentences.map((sentence) => {
        let restored = sentence;
        placeholders.forEach((original, placeholder) => {
            restored = restored.split(placeholder).join(original);
        });
        return restored;
    });
}

/**
 * Split text into paragraphs
 */
export function splitIntoParagraphs(text: string): string[] {
    return text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
}

/**
 * Find section headers in text (markdown style)
 */
export function extractSections(
    text: string
): { header: string; content: string }[] {
    const sections: { header: string; content: string }[] = [];

    // Match markdown headers or uppercase lines
    const headerPattern = /^(#{1,6}\s+.+|[A-Z][A-Z\s]{2,}[A-Z])$/gm;

    const parts = text.split(headerPattern);
    let currentHeader = '';

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();

        if (part.match(/^#{1,6}\s+/) || part.match(/^[A-Z][A-Z\s]{2,}[A-Z]$/)) {
            currentHeader = part.replace(/^#+\s*/, '');
        } else if (part.length > 0) {
            sections.push({
                header: currentHeader,
                content: part,
            });
        }
    }

    // If no sections found, return whole text
    if (sections.length === 0 && text.trim().length > 0) {
        sections.push({ header: '', content: text.trim() });
    }

    return sections;
}

/**
 * Clean and normalize text for chunking
 */
export function cleanTextForChunking(text: string): string {
    return (
        text
            // Normalize line breaks
            .replace(/\r\n/g, '\n')
            // Remove excessive whitespace but preserve paragraph breaks
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            // Trim
            .trim()
    );
}

/**
 * Find the best break point near a position
 */
export function findBreakPoint(
    text: string,
    targetPos: number,
    searchRange: number = 100
): number {
    if (targetPos >= text.length) return text.length;

    const start = Math.max(0, targetPos - searchRange);
    const end = Math.min(text.length, targetPos + searchRange);
    const searchText = text.substring(start, end);

    // Priority: paragraph break > sentence end > word boundary
    const relativeTarget = targetPos - start;

    // Look for paragraph break
    const paragraphBreak = searchText.lastIndexOf(
        '\n\n',
        relativeTarget + searchRange
    );
    if (
        paragraphBreak !== -1 &&
        paragraphBreak > relativeTarget - searchRange
    ) {
        return start + paragraphBreak + 2;
    }

    // Look for sentence end
    const sentenceEndPattern = /[.!?]\s+/g;
    let match;
    let bestSentenceEnd = -1;

    while ((match = sentenceEndPattern.exec(searchText)) !== null) {
        const pos = match.index + match[0].length;
        if (pos <= relativeTarget + searchRange) {
            bestSentenceEnd = pos;
        }
    }

    if (
        bestSentenceEnd !== -1 &&
        bestSentenceEnd > relativeTarget - searchRange
    ) {
        return start + bestSentenceEnd;
    }

    // Fall back to word boundary
    const wordBoundary = searchText.lastIndexOf(' ', relativeTarget + 20);
    if (wordBoundary !== -1) {
        return start + wordBoundary + 1;
    }

    return targetPos;
}
