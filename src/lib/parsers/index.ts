// lib/parsers/index.ts
import { pdfParser, IParsedDocument, IPageContent } from './pdfParser';

export type ParserType = 'pdf' | 'doc' | 'docx' | 'txt' | 'csv' | 'json';

export interface IParser {
    parseFromPath(filePath: string): Promise<IParsedDocument>;
    parseFromBuffer(buffer: Buffer): Promise<IParsedDocument>;
}

export const getParser = (type: ParserType): IParser => {
    switch (type) {
        case 'pdf':
            return pdfParser;
        // Add more parsers later
        // case 'doc':
        // case 'docx':
        //     return docParser;
        // case 'txt':
        //     return txtParser;
        default:
            throw new Error(`Unsupported parser type: ${type}`);
    }
};

export { pdfParser, IParsedDocument, IPageContent };
