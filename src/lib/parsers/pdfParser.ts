// lib/parsers/pdfParser.ts
import { PDFParse } from 'pdf-parse';
import newPdfParse from 'pdf-parse';
import fs from 'fs/promises';
import { ddl } from '../dd';

export interface IParsedDocument {
    text: string;
    metadata: {
        title?: string;
        author?: string;
        pageCount: number;
        language?: string;
        createdAt?: Date;
        modifiedAt?: Date;
    };
    pages: IPageContent[];
    totalCharacters: number;
    totalWords: number;
}

export interface IPageContent {
    pageNumber: number;
    text: string;
    charCount: number;
}

class PDFParserService {
    /**
     * Parse PDF from file path
     */
    async parseFromPath(filePath: string): Promise<IParsedDocument> {
        const buffer = await fs.readFile(filePath);
        ddl('buffer ->', buffer);
        const uint8Array = new Uint8Array(buffer);
        return this.parseFromBuffer(uint8Array);
    }

    /**
     * Parse PDF from buffer
     */
    async parseFromBuffer(buffer: Uint8Array): Promise<IParsedDocument> {
        // const pages: IPageContent[] = [];
        // let currentPage = 0;

        // Custom page renderer to capture per-page text
        ////// V1 Code //////
        // const options = {
        //     pagerender: (pageData: any) => {
        //         return pageData.getTextContent().then((textContent: any) => {
        //             currentPage++;
        //             let pageText = '';

        //             for (const item of textContent.items) {
        //                 pageText += item.str + ' ';
        //             }

        //             pageText = this.cleanText(pageText);

        //             pages.push({
        //                 pageNumber: currentPage,
        //                 text: pageText,
        //                 charCount: pageText.length,
        //             });

        //             return pageText;
        //         });
        //     },
        // };

        // const newPdf = await newPdfParse(buffer, options);
        let pdf: PDFParse | null = null;
        try {
            pdf = new PDFParse(buffer);
            const info = await pdf.getInfo();
            const textData = await pdf.getText();

            // v2 returns per-page text in result.pages
            const pages: IPageContent[] = textData.pages.map((page, index) => ({
                pageNumber: index + 1,
                text: this.cleanText(page.text), // apply your cleanText function
                charCount: page.text.length,
            }));

            // Extract and clean full text
            const fullText = this.cleanText(textData.text);

            return {
                text: fullText,
                metadata: {
                    title: info.info?.Title || undefined,
                    author: info.info?.Author || undefined,
                    pageCount: info.total,
                    createdAt: info.info?.CreationDate
                        ? this.parsePdfDate(info.info.CreationDate)
                        : undefined,
                    modifiedAt: info.info?.ModDate
                        ? this.parsePdfDate(info.info.ModDate)
                        : undefined,
                },
                pages,
                totalCharacters: fullText.length,
                totalWords: this.countWords(fullText),
            };
        } finally {
            if (pdf) {
                pdf.destroy();
            }
        }
    }

    /**
     * Clean extracted text
     */
    private cleanText(text: string): string {
        return (
            text
                // Normalize whitespace
                .replace(/\s+/g, ' ')
                // Remove control characters
                .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
                // Fix common OCR issues
                .replace(/\s+([.,!?;:])/g, '$1')
                // Trim
                .trim()
        );
    }

    /**
     * Count words in text
     */
    private countWords(text: string): number {
        return text.split(/\s+/).filter((word) => word.length > 0).length;
    }

    /**
     * Parse PDF date format (D:YYYYMMDDHHmmSS)
     */
    private parsePdfDate(dateStr: string): Date | undefined {
        try {
            // PDF dates look like: D:20231215120000+00'00'
            const match = dateStr.match(
                /D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/
            );
            if (match) {
                const [
                    ,
                    year,
                    month,
                    day,
                    hour = '00',
                    min = '00',
                    sec = '00',
                ] = match;
                return new Date(
                    `${year}-${month}-${day}T${hour}:${min}:${sec}Z`
                );
            }
        } catch {
            // Ignore parse errors
        }
        return undefined;
    }
}

export const pdfParser = new PDFParserService();
