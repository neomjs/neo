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
    let originalModel, originalModelUnavailable, originalQueryDocuments;

    test.beforeAll(async () => {
        SearchService            = (await import('../../../../../../ai/services/knowledge-base/SearchService.mjs')).default;
        QueryService             = (await import('../../../../../../ai/services/knowledge-base/QueryService.mjs')).default;
        originalModel            = SearchService.model;
        originalModelUnavailable = SearchService.modelUnavailable;
        originalQueryDocuments   = QueryService.queryDocuments;
    });

    test.afterEach(() => {
        SearchService.model            = originalModel;
        SearchService.modelUnavailable = originalModelUnavailable;
        QueryService.queryDocuments    = originalQueryDocuments;
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
            degradedCode: 'no_provider',
            reason    : 'GEMINI_API_KEY is required for RAG features.',
            references: [{
                name  : 'KnowledgeBase.md',
                score : 100,
                source: 'learn/agentos/KnowledgeBase.md'
            }]
        });
    });

    test('ask threads the construct-time stale-config reason into the degraded envelope (#12846 AC1)', async () => {
        // The stale-overlay state construct produces: null model + the remembered remediation.
        // ask() must surface THAT reason (actionable: names --migrate-config) — not the generic
        // missing-key message — and tag the cause distinctly for diagnostics.
        const staleReason = 'askSynthesis config leaves missing: provider, model — sync the askSynthesis block from config.template.mjs into the local config.mjs (node ai/scripts/setup/initServerConfigs.mjs --migrate-config) and restart knowledge-base.';

        SearchService.model            = null;
        SearchService.modelUnavailable = {code: 'stale_config', reason: staleReason};
        QueryService.queryDocuments    = async () => ({
            results: [{source: 'learn/agentos/KnowledgeBase.md', score: '100', metadata: {}}]
        });

        const result = await SearchService.ask({query: 'How does KB work?'});

        expect(result.degraded).toBe(true);
        expect(result.degradedCode).toBe('stale_config');
        expect(result.reason).toContain('--migrate-config');
        expect(result.answer).toContain('Use the references directly');
        expect(result.references).toHaveLength(1);
        // No top-level `error` key — degradation must stay a SUCCESS content payload, or the MCP
        // boundary discards the references + remediation (the whole point of degrading).
        expect('error' in result).toBe(false);
    });
});

test.describe('Neo.ai.services.knowledge-base.helpers.askSynthesisGuard', () => {
    let getMissingAskSynthesisLeaves;

    test.beforeAll(async () => {
        ({getMissingAskSynthesisLeaves} = await import('../../../../../../ai/services/knowledge-base/helpers/askSynthesisGuard.mjs'));
    });

    test('names exactly the absent leaves (stale-overlay guard, pure predicate — #12846 AC1)', () => {
        const required = ['provider', 'model', 'timeoutMs', 'maxCallsPerMinute'];

        // Block absent entirely (overlay predates the askSynthesis block): every leaf missing.
        expect(getMissingAskSynthesisLeaves(undefined, required)).toEqual(required);

        // Partially stale overlay (block exists, newer leaves predate it): only those surface.
        expect(getMissingAskSynthesisLeaves({provider: 'gemini', model: 'gemini-2.5-flash'}, required))
            .toEqual(['timeoutMs', 'maxCallsPerMinute']);

        // Current slice: nothing missing — construct proceeds to build the model.
        expect(getMissingAskSynthesisLeaves(
            {provider: 'gemini', model: 'gemini-2.5-flash', timeoutMs: 60000, maxCallsPerMinute: 20},
            required
        )).toEqual([]);

        // `null` is treated as absent (no hidden fallback may paper over it).
        expect(getMissingAskSynthesisLeaves({provider: null, model: 'm', timeoutMs: 1, maxCallsPerMinute: 1}, required))
            .toEqual(['provider']);
    });
});
