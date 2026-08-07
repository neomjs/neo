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
    let SearchService, QueryService, GraphService, ChromaManager;
    let originalModel, originalModelUnavailable, originalQueryDocuments, originalListNodeRecordsByType, originalReady;
    let originalGetCollection;

    test.beforeAll(async () => {
        SearchService            = (await import('../../../../../../ai/services/knowledge-base/SearchService.mjs')).default;
        QueryService             = (await import('../../../../../../ai/services/knowledge-base/QueryService.mjs')).default;
        GraphService             = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        ChromaManager            = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
        originalModel            = SearchService.model;
        originalModelUnavailable = SearchService.modelUnavailable;
        originalQueryDocuments   = QueryService.queryDocuments;
        originalListNodeRecordsByType = GraphService.listNodeRecordsByType;
        originalReady                 = GraphService.ready;
        originalGetCollection         = ChromaManager.getKnowledgeBaseCollection;
    });

    test.afterEach(() => {
        SearchService.model                = originalModel;
        SearchService.modelUnavailable     = originalModelUnavailable;
        QueryService.queryDocuments        = originalQueryDocuments;
        GraphService.listNodeRecordsByType = originalListNodeRecordsByType;
        GraphService.ready                 = originalReady;
        ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
    });

    /**
     * Makes the FIXTURE own the collection row count.
     *
     * `SearchService#emptyFlatResponse` selects between the empty-collection answer and the
     * no-relevant-documents answer by calling `collection.count()` on the LIVE canonical collection.
     * Mocking `QueryService.queryDocuments` alone looks like full isolation and is not: the emptiness
     * probe is a second, separate read straight through to the plane.
     *
     * So this spec's verdict tracked corpus fill rather than the code. It passed on 2026-08-07 while
     * the canonical collection was near-empty during a rebuild, then failed at ~19,000 rows, and would
     * flip back if the collection were ever emptied — reporting a defect in whatever diff happened to
     * be checked out. CI never saw it, because CI has no populated plane, so there was no upstream
     * signal and it landed on whoever was holding a change.
     *
     * Owning the count is strictly better than removing the coupling: the branch is now selectable, so
     * BOTH arms get asserted where previously only whichever one the plane happened to select could be.
     *
     * @param {Number} count The row count the fixture reports.
     */
    function withCollectionCount(count) {
        ChromaManager.getKnowledgeBaseCollection = async () => ({count: async () => count});
    }

    test('ask returns the empty-collection response before requiring a Gemini model', async () => {
        SearchService.model         = null;
        QueryService.queryDocuments = async () => ({message: 'No results found for your query and type.'});
        withCollectionCount(0);

        await expect(SearchService.ask({query: 'How does KB work?'})).resolves.toEqual({
            answer    : "The knowledge base collection is empty. Populate it with the release artifact via 'npm run ai:download-kb' (or build locally with 'npm run ai:sync-kb').",
            references: []
        });
    });

    test('a POPULATED collection with no matches gets the no-results answer, not the empty-collection one', async () => {
        // The arm the plane used to select for us, now asserted deliberately. These two answers say
        // very different things to an agent — "populate the corpus" versus "your query matched
        // nothing" — and before this only one of them was ever exercised on a given machine.
        SearchService.model         = null;
        QueryService.queryDocuments = async () => ({message: 'No results found for your query and type.'});
        withCollectionCount(19_000);

        await expect(SearchService.ask({query: 'How does KB work?'})).resolves.toEqual({
            answer    : 'No relevant documents found in the knowledge base.',
            references: []
        });
    });

    test('an UNREADABLE collection is not reported as empty', async () => {
        // The count read is `.catch(() => null)`, so a Chroma failure yields null rather than 0 — and
        // null must NOT take the empty-collection branch. Telling an agent to repopulate a corpus
        // because the store was briefly unreachable is a diagnosis pointing at the wrong subsystem.
        SearchService.model         = null;
        QueryService.queryDocuments = async () => ({message: 'No results found for your query and type.'});
        ChromaManager.getKnowledgeBaseCollection = async () => { throw new Error('chroma unreachable') };

        const result = await SearchService.ask({query: 'How does KB work?'});

        expect(result.answer, 'unknown is not empty').toBe('No relevant documents found in the knowledge base.');
    });

    test('ask returns degraded references when retrieval finds references without a Gemini model', async () => {
        SearchService.model         = null;
        QueryService.queryDocuments = async () => ({
            results: [{source: 'learn/agentos/KnowledgeBase.md', score: '100', metadata: {}}]
        });

        await expect(SearchService.ask({query: 'How does KB work?'})).resolves.toEqual({
            answer      : 'Knowledge-base retrieval succeeded, but answer synthesis is currently unavailable (GEMINI_API_KEY is required for RAG features.). Use the references directly while the synthesis provider recovers.',
            degraded    : true,
            degradedCode: 'no_provider',
            reason      : 'GEMINI_API_KEY is required for RAG features.',
            references  : [{
                name  : 'KnowledgeBase.md',
                score : 100,
                source: 'learn/agentos/KnowledgeBase.md'
            }]
        });
    });

    test('ask({conceptWalk}) is opt-in: the walk event threads through the envelope; the default path omits it — byte-identical (#14504)', async () => {
        SearchService.model         = null;
        QueryService.queryDocuments = async () => ({
            results: [{source: 'learn/agentos/KnowledgeBase.md', score: '100', metadata: {}}]
        });
        // No CONCEPT nodes → the walk resolves nothing and short-circuits to an honest zero event
        // (never reaching the raw-edge reader), so the ask-level wiring is provable without a live graph.
        GraphService.listNodeRecordsByType = () => ({records: []});

        // opt-in ON: the response carries the concept-walk event; the flat references stay untouched
        const walked = await SearchService.ask({query: 'How does KB work?', conceptWalk: true});
        expect(walked.conceptWalk).toBeTruthy();
        expect(walked.conceptWalk.walkContributed).toBe(false);
        expect(walked.conceptWalk.candidatesAdded).toBe(0);
        expect(walked.conceptWalk.resolvedConcepts).toEqual([]);
        expect(walked.references).toHaveLength(1);

        // default (opt-out): NO conceptWalk key — the envelope is byte-identical to the pre-wrap shape
        const flat = await SearchService.ask({query: 'How does KB work?'});
        expect('conceptWalk' in flat).toBe(false);
    });

    test('ask({conceptWalk}) awaits GraphService.ready() BEFORE the graph read — the lifecycle gate that stops a transient-init silent no-op; completed-unavailable still degrades flat (#14504 gate 4)', async () => {
        SearchService.model         = null;
        QueryService.queryDocuments = async () => ({
            results: [{source: 'learn/agentos/KnowledgeBase.md', score: '100', metadata: {}}]
        });

        let readyAwaited = false, readReachedAfterReady = false;
        // Pre-init `db===null` makes graph reads return empty WITHOUT throwing, so the wait is what lets
        // a delayed-ready graph contribute instead of silently no-op'ing. Here ready() resolves and the
        // graph is empty (completed-unavailable / db===null) → the walk contributes nothing and the flat
        // path is preserved. The read must observe ready() as already awaited.
        GraphService.ready                 = async () => { readyAwaited = true };
        GraphService.listNodeRecordsByType = () => { readReachedAfterReady = readyAwaited; return {records: []} };

        const walked = await SearchService.ask({query: 'How does KB work?', conceptWalk: true});

        expect(readyAwaited).toBe(true);             // the opt-in path awaited the lifecycle gate
        expect(readReachedAfterReady).toBe(true);    // and did so BEFORE reading the graph
        expect(walked.conceptWalk.walkContributed).toBe(false); // completed-unavailable → flat
        expect(walked.references).toHaveLength(1);               // flat references intact

        // the flat (opt-out) path never touches the graph lifecycle gate — the wait is inside the opt-in branch
        readyAwaited = false;
        const flat = await SearchService.ask({query: 'How does KB work?'});
        expect(readyAwaited).toBe(false);
        expect('conceptWalk' in flat).toBe(false);
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
