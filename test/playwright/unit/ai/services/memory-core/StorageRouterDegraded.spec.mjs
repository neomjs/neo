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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import StorageRouter  from '../../../../../../ai/services/memory-core/managers/StorageRouter.mjs';

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
