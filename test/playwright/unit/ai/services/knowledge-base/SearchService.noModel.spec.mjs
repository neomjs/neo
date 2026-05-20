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
    let SearchService;
    let originalModel;

    test.beforeAll(async () => {
        SearchService = (await import('../../../../../../ai/services/knowledge-base/SearchService.mjs')).default;
        originalModel = SearchService.model;
    });

    test.afterEach(() => {
        SearchService.model = originalModel;
    });

    test('ask fails fast when no Gemini model is configured', async () => {
        SearchService.model = null;

        await expect(SearchService.ask({query: 'How does KB work?'}))
            .rejects.toThrow('GEMINI_API_KEY is required for RAG features.');
    });
});
