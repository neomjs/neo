import {setup} from '../../../../setup.mjs';

const appName = 'KBDocumentServiceTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

test.describe('Neo.ai.services.knowledge-base.DocumentService', () => {
    let ChromaManager;
    let DocumentService;
    let originalGetKnowledgeBaseCollection;

    test.beforeAll(async () => {
        ChromaManager   = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
        DocumentService = (await import('../../../../../../ai/services/knowledge-base/DocumentService.mjs')).default;

        originalGetKnowledgeBaseCollection = ChromaManager.getKnowledgeBaseCollection;
    });

    test.afterEach(() => {
        ChromaManager.getKnowledgeBaseCollection = originalGetKnowledgeBaseCollection;
    });

    test('listDocuments maps Chroma ids, metadatas, and documents into MCP payload rows', async () => {
        let capturedOptions;

        ChromaManager.getKnowledgeBaseCollection = async () => ({
            get: async options => {
                capturedOptions = options;

                return {
                    ids      : ['doc-1', 'doc-2'],
                    metadatas: [{type: 'guide'}, {type: 'src'}],
                    documents: ['Guide body', 'Source body']
                };
            }
        });

        const result = await DocumentService.listDocuments({limit: 2, offset: 5});

        expect(capturedOptions).toEqual({
            limit  : 2,
            offset : 5,
            include: ['metadatas', 'documents']
        });
        expect(result).toEqual({
            count    : 2,
            documents: [
                {id: 'doc-1', metadata: {type: 'guide'}, content: 'Guide body'},
                {id: 'doc-2', metadata: {type: 'src'}, content: 'Source body'}
            ]
        });
    });

    test('getDocumentById returns the first matching Chroma record', async () => {
        let capturedOptions;

        ChromaManager.getKnowledgeBaseCollection = async () => ({
            get: async options => {
                capturedOptions = options;

                return {
                    ids      : ['doc-42'],
                    metadatas: [{source: 'learn/agentos/KnowledgeBase.md'}],
                    documents: ['Knowledge Base guide']
                };
            }
        });

        const result = await DocumentService.getDocumentById({id: 'doc-42'});

        expect(capturedOptions).toEqual({
            ids    : ['doc-42'],
            include: ['metadatas', 'documents']
        });
        expect(result).toEqual({
            id      : 'doc-42',
            metadata: {source: 'learn/agentos/KnowledgeBase.md'},
            content : 'Knowledge Base guide'
        });
    });

    test('getDocumentById throws a precise not-found error for empty Chroma results', async () => {
        ChromaManager.getKnowledgeBaseCollection = async () => ({
            get: async () => ({
                ids      : [],
                metadatas: [],
                documents: []
            })
        });

        await expect(DocumentService.getDocumentById({id: 'missing-doc'}))
            .rejects.toThrow("Document with id 'missing-doc' not found.");
    });
});
