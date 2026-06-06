import {setup} from '../../../../setup.mjs';

const appName = 'StorageRouterDegradedTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../src/core/_export.mjs';
import StorageRouter         from '../../../../../../ai/services/memory-core/managers/StorageRouter.mjs';
import SummaryService        from '../../../../../../ai/services/memory-core/SummaryService.mjs';
import MemoryService         from '../../../../../../ai/services/memory-core/MemoryService.mjs';
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

// Pure unit coverage for the degraded-query observability contract: injectQueryReRanker must stay
// non-throwing on a Pass-1 query failure (preserving the Pass-2 resilience the catch exists for) but
// stamp a _degraded marker instead of a silent clean-empty, so a corrupt/unqueryable collection is
// distinguishable from a genuine no-match. No Chroma substrate needed — a mock proxy whose query()
// throws (or returns a real empty) exercises the catch and early-return branches directly, so this
// runs in CI rather than the bucket-C substrate gate that the sibling re-ranker spec sits behind.
test.describe('StorageRouter degraded-query observability', () => {
    const makeRerankedProxy = (collectionType, queryImpl) => {
        const proxy = {query: queryImpl};
        StorageRouter.injectQueryReRanker(proxy, collectionType);
        return proxy;
    };

    test('stamps a _degraded marker (not a silent empty) when Pass-1 throws the corruption signature', async () => {
        const proxy = makeRerankedProxy('summary', async () => {
            throw new Error('Error executing plan: Internal error: Error finding id');
        });

        const res = await proxy.query({queryEmbeddings: [[1, 0, 0]], nResults: 1});

        // Non-throwing + still shaped like an empty result (Pass-2 pipeline resilience preserved)...
        expect(res.ids).toEqual([[]]);
        // ...but explicitly marked degraded, so a corrupt collection is NOT a silent no-match.
        expect(res._degraded).toBe(true);
        expect(res._degradedCollection).toBe('summary');
        expect(res._degradedSignature).toBe('chroma-error-finding-id');
        expect(res._degradedReason).toContain('Error finding id');
    });

    test('tags a non-corruption query error with the generic signature, still named by collection', async () => {
        const proxy = makeRerankedProxy('memory', async () => {
            throw new Error('connection refused');
        });

        const res = await proxy.query({queryEmbeddings: [[1, 0, 0]], nResults: 1});

        expect(res._degraded).toBe(true);
        expect(res._degradedCollection).toBe('memory');
        expect(res._degradedSignature).toBe('chroma-query-error');
    });

    test('does NOT mark a genuine empty result as degraded', async () => {
        const proxy = makeRerankedProxy('summary', async () => ({
            ids: [[]], distances: [[]], metadatas: [[]], documents: undefined
        }));

        const res = await proxy.query({queryEmbeddings: [[1, 0, 0]], nResults: 1});

        // A real no-match returns the raw empty result WITHOUT a _degraded marker — this is the
        // distinction the whole fix exists to preserve (degraded query path vs genuine no-match).
        expect(res._degraded).toBeUndefined();
        expect(res.ids).toEqual([[]]);
    });
});

// Consumer-surface coverage: the tool-facing readers must translate the _degraded marker into an
// explicit QUERY_PATH_DEGRADED envelope, so a degraded query path is distinguishable from a genuine
// no-match (which returns count:0 WITHOUT `degraded`). Pure unit — a degraded collection is mocked at
// the StorageRouter boundary; no Chroma substrate.
test.describe('memory-core degraded-query tool envelopes', () => {
    const degradedCollection = collectionType => ({
        query: async () => ({
            ids: [[]], distances: [[]], metadatas: [[]], documents: undefined,
            _degraded          : true,
            _degradedReason    : 'Error executing plan: Internal error: Error finding id',
            _degradedCollection: collectionType,
            _degradedSignature : 'chroma-error-finding-id'
        })
    });

    const runAs = fn => RequestContextService.run(
        {agentIdentityNodeId: '@neo-claude-opus', source: 'unit-test', userId: 'neo-claude-opus'}, fn
    );

    test('querySummaries returns a QUERY_PATH_DEGRADED envelope (not a silent {count:0}) on a degraded collection', async () => {
        const orig = StorageRouter.getSummaryCollection;
        StorageRouter.getSummaryCollection = async () => degradedCollection('summary');

        try {
            const res = await runAs(() => SummaryService.querySummaries({query: 'anything', nResults: 3}));

            expect(res.degraded).toBe(true);
            expect(res.code).toBe('QUERY_PATH_DEGRADED');
            expect(res.collection).toBe('summary');
            expect(res.count).toBe(0);
            expect(res.results).toEqual([]);
            expect(res.message).toContain('Error finding id');
        } finally {
            StorageRouter.getSummaryCollection = orig;
        }
    });

    test('queryMemories returns a QUERY_PATH_DEGRADED envelope (not a silent {count:0}) on a degraded collection', async () => {
        const orig = StorageRouter.getMemoryCollection;
        StorageRouter.getMemoryCollection = async () => degradedCollection('memory');

        try {
            const res = await runAs(() => MemoryService.queryMemories({query: 'anything', nResults: 3}));

            expect(res.degraded).toBe(true);
            expect(res.code).toBe('QUERY_PATH_DEGRADED');
            expect(res.collection).toBe('memory');
            expect(res.count).toBe(0);
            expect(res.results).toEqual([]);
        } finally {
            StorageRouter.getMemoryCollection = orig;
        }
    });

    // The healthcheck query-canary was removed (it bloated the always-on payload); the same detection
    // now lives as an on-demand StorageRouter method (+ ai/scripts/maintenance/probeCollectionQueryHealth.mjs).
    // This proves the capability survives the move: a populated-but-unqueryable collection still surfaces
    // as degraded (named, with signature) when an operator opts in to probe.
    test('StorageRouter.probeCollectionQueryHealth() surfaces a degraded collection on-demand (off the healthcheck path)', async () => {
        const origMem = StorageRouter.getMemoryCollection,
              origSum = StorageRouter.getSummaryCollection;

        StorageRouter.getMemoryCollection  = async () => ({
            count: async () => 5,
            query: async () => ({ids: [[]], distances: [[]], metadatas: [[]], documents: undefined})
        });
        StorageRouter.getSummaryCollection = async () => ({
            count: async () => 20,
            query: async () => ({
                ids: [[]], distances: [[]], metadatas: [[]], documents: undefined,
                _degraded          : true,
                _degradedReason    : 'Error executing plan: Internal error: Error finding id',
                _degradedCollection: 'summary',
                _degradedSignature : 'chroma-error-finding-id'
            })
        });

        try {
            const res = await StorageRouter.probeCollectionQueryHealth();

            expect(res.status).toBe('degraded');
            expect(res.collections.memory.status).toBe('healthy');
            expect(res.collections.summary.status).toBe('degraded');
            expect(res.collections.summary.signature).toBe('chroma-error-finding-id');
        } finally {
            StorageRouter.getMemoryCollection  = origMem;
            StorageRouter.getSummaryCollection = origSum;
        }
    });
});
