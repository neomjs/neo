import {setup} from '../../../../setup.mjs';

const appName = 'KBSearchServiceNoModelTest';

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

test.describe('Neo.ai.services.knowledge-base.SearchService model guard', () => {
    let SearchService, QueryService;
    let originalModel, originalQueryDocuments;

    test.beforeAll(async () => {
        SearchService          = (await import('../../../../../../ai/services/knowledge-base/SearchService.mjs')).default;
        QueryService           = (await import('../../../../../../ai/services/knowledge-base/QueryService.mjs')).default;
        originalModel          = SearchService.model;
        originalQueryDocuments = QueryService.queryDocuments;
    });

    test.afterEach(() => {
        SearchService.model         = originalModel;
        QueryService.queryDocuments = originalQueryDocuments;
    });

    test('ask returns the no-documents response before requiring a Gemini model', async () => {
        SearchService.model         = null;
        QueryService.queryDocuments = async () => ({message: 'No results found for your query and type.'});

        await expect(SearchService.ask({query: 'How does KB work?'})).resolves.toEqual({
            answer    : 'No relevant documents found in the knowledge base.',
            references: []
        });
    });

    test('ask returns degraded references when retrieval finds references without a Gemini model', async () => {
        SearchService.model         = null;
        QueryService.queryDocuments = async () => ({
            results: [{source: 'learn/agentos/KnowledgeBase.md', score: '100', metadata: {}}]
        });

        await expect(SearchService.ask({query: 'How does KB work?'})).resolves.toEqual({
            answer    : 'Knowledge-base retrieval succeeded, but answer synthesis is currently unavailable (GEMINI_API_KEY is required for RAG features.). Use the references directly while the synthesis provider recovers.',
            degraded  : true,
            error     : 'synthesis_failed',
            reason    : 'GEMINI_API_KEY is required for RAG features.',
            references: [{
                name  : 'KnowledgeBase.md',
                score : 100,
                source: 'learn/agentos/KnowledgeBase.md'
            }]
        });
    });
});
