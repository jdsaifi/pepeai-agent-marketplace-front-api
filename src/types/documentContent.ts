import { Types } from 'mongoose';

export interface IPageContent {
    pageNumber: number;
    text: string;
    charCount: number;
}

export interface IDocumentContent {
    knowledgeBaseId: Types.ObjectId;
    fullText: string;
    pages: IPageContent[];
    metadata: {
        title?: string;
        author?: string;
        pageCount: number;
        language?: string;
    };
    createdAt: Date;
    updatedAt: Date;
}

export interface IDocumentContentDocument extends IDocumentContent, Document {
    _id: Types.ObjectId;
}
