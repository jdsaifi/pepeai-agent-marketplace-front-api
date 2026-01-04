import { Schema, model } from 'mongoose';
import { IDocumentContentDocument } from '../types/documentContent';

export const documentContentSchema = new Schema<IDocumentContentDocument>(
    {
        knowledgeBaseId: {
            type: Schema.Types.ObjectId,
            ref: 'KnowledgeBase',
            required: true,
            unique: true,
            index: true,
        },
        fullText: {
            type: String,
            required: true,
        },
        pages: [
            {
                pageNumber: Number,
                text: String,
                charCount: Number,
            },
        ],
        metadata: {
            title: String,
            author: String,
            pageCount: Number,
            language: String,
        },
    },
    {
        timestamps: true,
    }
);

export const DocumentContentModel = model<IDocumentContentDocument>(
    'DocumentContent',
    documentContentSchema,
    'document_contents'
);
