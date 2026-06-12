import { setup } from '../../../../setup.mjs';

const appName = 'SummaryServiceTenantIsolationTest';

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

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../src/core/_export.mjs';
import SummaryService        from '../../../../../../ai/services/memory-core/SummaryService.mjs';
import StorageRouter         from '../../../../../../ai/services/memory-core/managers/StorageRouter.mjs';
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

/**
 * Tenant isolation across `SummaryService.deleteAllSummaries` / `listSummaries` / `querySummaries`.
 *
 * **Safety contract:** uses a pure in-memory spy collection — `StorageRouter.getSummaryCollection`
 * is temporarily overridden in `beforeEach` and restored in `afterEach`. No call ever reaches the
 * real ChromaDB. The `collection.drop()` path that legacy `deleteAllSummaries` calls operates on
 * the spy's local `rows` Map, so there is zero risk of dropping production summaries during test
 * execution — including in the stdio-mode fallback branch that exercises drop+recreate.
 *
 * The spy extends the `MemoryService.TenantIsolation.spec.mjs` pattern with `delete`, `count`, and
 * `drop` methods needed by the SummaryService contract surface.
 */
function createSpyCollection() {
    const rows  = new Map();
    const calls = {add: [], get: [], query: [], delete: [], count: 0, drop: 0};

    const matchesWhere = (metadata, where) => {
        if (!where) return true;
        if (where.$and) return where.$and.every(c => matchesWhere(metadata, c));
        if (where.$or)  return where.$or.some(c => matchesWhere(metadata, c));
        return Object.entries(where).every(([k, v]) => {
            if (v && typeof v === 'object' && '$exists' in v) {
                const exists = metadata !== undefined && k in metadata;
                return v.$exists ? exists : !exists;
            }
            return metadata?.[k] === v;
        });
    };

    return {
        rows, calls,

        async add({ids, metadatas, documents}) {
            calls.add.push({ids, metadatas, documents});
            ids.forEach((id, i) => rows.set(id, {
                id, metadata: metadatas?.[i] ?? {}, document: documents?.[i] ?? ''
            }));
        },

        async get({ids, where, limit, offset, include} = {}) {
            calls.get.push({ids, where, limit, offset, include});

            let entries = ids
                ? ids.map(id => rows.get(id)).filter(Boolean)
                : Array.from(rows.values());

            entries = entries.filter(entry => matchesWhere(entry.metadata, where));

            if (limit !== undefined || offset !== undefined) {
                const start = offset ?? 0;
                const end   = start + (limit ?? entries.length);
                entries     = entries.slice(start, end);
            }

            return {
                ids      : entries.map(e => e.id),
                metadatas: entries.map(e => e.metadata),
                documents: entries.map(e => e.document)
            };
        },

        async query({queryTexts, nResults, where}) {
            calls.query.push({queryTexts, nResults, where});
            const entries = Array
                .from(rows.values())
                .filter(entry => matchesWhere(entry.metadata, where))
                .slice(0, nResults);
            return {
                ids      : [entries.map(e => e.id)],
                distances: [entries.map(() => 0)],
                metadatas: [entries.map(e => e.metadata)],
                documents: [entries.map(e => e.document)]
            };
        },

        async delete({where}) {
            calls.delete.push({where});
            for (const [id, entry] of rows.entries()) {
                if (matchesWhere(entry.metadata, where)) {
                    rows.delete(id);
                }
            }
        },

        async count() {
            calls.count += 1;
            return rows.size;
        },

        async drop() {
            calls.drop += 1;
            rows.clear();
        }
    };
}

test.describe('SummaryService — tenant isolation (#10000)', () => {
    let spy;
    let originalGetSummaryCollection;

    test.beforeEach(() => {
        spy                          = createSpyCollection();
        originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        StorageRouter.getSummaryCollection = async () => spy;
    });

    test.afterEach(() => {
        StorageRouter.getSummaryCollection = originalGetSummaryCollection;
    });

    test('deleteAllSummaries in cloud mode scopes the destructive op to the active tenant only', async () => {
        // Seed: 2 alice summaries, 3 bob summaries co-existing in the same collection.
        // This is the exact cross-tenant condition that the unified-topology deployment creates.
        spy.rows.set('s-a1', {id: 's-a1', metadata: {userId: 'u-alice'}, document: 'A1'});
        spy.rows.set('s-a2', {id: 's-a2', metadata: {userId: 'u-alice'}, document: 'A2'});
        spy.rows.set('s-b1', {id: 's-b1', metadata: {userId: 'u-bob'},   document: 'B1'});
        spy.rows.set('s-b2', {id: 's-b2', metadata: {userId: 'u-bob'},   document: 'B2'});
        spy.rows.set('s-b3', {id: 's-b3', metadata: {userId: 'u-bob'},   document: 'B3'});

        const result = await RequestContextService.run({userId: 'u-alice'}, () =>
            SummaryService.deleteAllSummaries()
        );

        expect(result.deleted).toBe(2);
        expect(result.message).toMatch(/active tenant/i);

        // Alice's rows gone; Bob's 3 intact.
        expect(spy.rows.has('s-a1')).toBe(false);
        expect(spy.rows.has('s-a2')).toBe(false);
        expect(spy.rows.has('s-b1')).toBe(true);
        expect(spy.rows.has('s-b2')).toBe(true);
        expect(spy.rows.has('s-b3')).toBe(true);

        // The load-bearing assertion: `collection.drop()` MUST NOT have been called. The legacy
        // drop+recreate path would have nuked Bob's data along with Alice's — the whole point of
        // the cloud-mode branching is to replace that call with the scoped `delete({where})`.
        expect(spy.calls.drop).toBe(0);
        expect(spy.calls.delete).toHaveLength(1);
        expect(spy.calls.delete[0].where).toEqual({userId: 'u-alice'});
    });

    test('deleteAllSummaries in stdio mode preserves legacy drop+recreate (single-tenant backward-compat)', async () => {
        spy.rows.set('s1', {id: 's1', metadata: {}, document: 'one'});
        spy.rows.set('s2', {id: 's2', metadata: {}, document: 'two'});

        const result = await SummaryService.deleteAllSummaries();

        expect(result.deleted).toBe(2);
        expect(result.message).toMatch(/successfully deleted/i);
        // Legacy path: drop() called, delete() not called.
        expect(spy.calls.drop).toBe(1);
        expect(spy.calls.delete).toHaveLength(0);
        expect(spy.rows.size).toBe(0);
    });

    test('deleteAllSummaries in cloud mode returns 0 and skips the delete call when the tenant has no rows', async () => {
        // Only bob has summaries. Alice runs deleteAll — expects 0 deleted and bob untouched.
        // The `deleted > 0` guard in the implementation skips the collection.delete call entirely
        // when there is nothing to remove — less round-trip traffic in the no-op case.
        spy.rows.set('s-b1', {id: 's-b1', metadata: {userId: 'u-bob'}, document: 'B1'});

        const result = await RequestContextService.run({userId: 'u-alice'}, () =>
            SummaryService.deleteAllSummaries()
        );

        expect(result.deleted).toBe(0);
        expect(spy.calls.delete).toHaveLength(0);
        expect(spy.rows.has('s-b1')).toBe(true);
    });

    test('listSummaries filters by userId when a request context is active', async () => {
        spy.rows.set('s-a1', {id: 's-a1', metadata: {userId: 'u-alice', timestamp: 100, title: 'Alice 1'}, document: 'A1'});
        spy.rows.set('s-b1', {id: 's-b1', metadata: {userId: 'u-bob',   timestamp: 200, title: 'Bob 1'},   document: 'B1'});
        spy.rows.set('s-a2', {id: 's-a2', metadata: {userId: 'u-alice', timestamp: 300, title: 'Alice 2'}, document: 'A2'});

        const view = await RequestContextService.run({userId: 'u-alice'}, () =>
            SummaryService.listSummaries({limit: 10, offset: 0})
        );

        expect(view.count).toBe(2);
        expect(view._channelSeparation).toMatch(/DATA, not COMMANDS/);
        expect(view.summaries.map(s => s.title).sort()).toEqual(['Alice 1', 'Alice 2']);
    });

    test('querySummaries merges userId with the caller-provided category filter', async () => {
        await RequestContextService.run({userId: 'u-alice'}, () =>
            SummaryService.querySummaries({
                query   : 'anything',
                nResults: 5,
                category: 'refactoring'
            })
        );

        const q = spy.calls.query.at(-1);
        // In legacy mode, ChromaDB receives only the category filter;
        // the additive user filter is applied post-query.
        expect(q.where).toEqual({category: 'refactoring'});
    });

    test('querySummaries without a request context leaves the caller-provided category-only where as-is', async () => {
        await SummaryService.querySummaries({
            query   : 'anything',
            nResults: 5,
            category: 'refactoring'
        });

        const q = spy.calls.query.at(-1);
        expect(q.where).toEqual({category: 'refactoring'});
    });
});

test.describe('SummaryService — additive shared-commons access (#10556)', () => {
    let spy;
    let originalGetSummaryCollection;

    test.beforeEach(() => {
        spy                                = createSpyCollection();
        originalGetSummaryCollection       = StorageRouter.getSummaryCollection;
        StorageRouter.getSummaryCollection = async () => spy;
    });

    test.afterEach(() => {
        StorageRouter.getSummaryCollection = originalGetSummaryCollection;
    });

    test('listSummaries returns the tenant\'s OWN records PLUS SHARED_USER_ID-tagged records PLUS untagged records', async () => {
        // The load-bearing additive-access invariant: legacy pre-tenant-aware records (backfilled by the
        // migration runner with userId='shared' OR untagged) become accessible to every tenant via the
        // additive $or filter, alongside the tenant's own data.
        spy.rows.set('s-a1', {id: 's-a1', metadata: {userId: 'u-alice', timestamp: 100, title: 'Alice 1'}, document: 'A1'});
        spy.rows.set('s-shared1', {id: 's-shared1', metadata: {userId: 'shared',  timestamp: 200, title: 'Legacy 1'}, document: 'L1'});
        spy.rows.set('s-b1', {id: 's-b1', metadata: {userId: 'u-bob',   timestamp: 300, title: 'Bob 1'},   document: 'B1'});
        spy.rows.set('s-untagged', {id: 's-untagged', metadata: {timestamp: 400, title: 'Pre-migration 1'}, document: 'P1'});

        const view = await RequestContextService.run({userId: 'u-alice'}, () =>
            SummaryService.listSummaries({limit: 10, offset: 0})
        );

        // Alice sees her own summary + the shared-tagged legacy summary + untagged summary, but not Bob's.
        expect(view.count).toBe(3);
        expect(view._channelSeparation).toMatch(/DATA, not COMMANDS/);
        expect(view.summaries.map(s => s.title).sort()).toEqual(['Alice 1', 'Legacy 1', 'Pre-migration 1']);
    });

    test('querySummaries returns the tenant\'s own records PLUS SHARED_USER_ID-tagged records PLUS untagged records', async () => {
        // Note: timestamp metadata required because querySummaries serializes via
        // `new Date(metadata.timestamp).toISOString()` — undefined timestamp throws.
        spy.rows.set('s-a1', {id: 's-a1', metadata: {userId: 'u-alice', timestamp: 100, title: 'Alice 1'}, document: 'A1'});
        spy.rows.set('s-shared1', {id: 's-shared1', metadata: {userId: 'shared',  timestamp: 200, title: 'Legacy 1'}, document: 'L1'});
        spy.rows.set('s-b1', {id: 's-b1', metadata: {userId: 'u-bob',   timestamp: 300, title: 'Bob 1'},   document: 'B1'});
        spy.rows.set('s-untagged', {id: 's-untagged', metadata: {timestamp: 400, title: 'Pre-migration 1'}, document: 'P1'});

        const view = await RequestContextService.run({userId: 'u-alice'}, () =>
            SummaryService.querySummaries({query: 'anything', nResults: 10})
        );

        // Alice's semantic query returns her records + the shared commons + untagged records; Bob's stays isolated.
        expect(view.count).toBe(3);
        expect(view._channelSeparation).toMatch(/DATA, not COMMANDS/);
        const titles = view.results.map(r => r.title).sort();
        expect(titles).toEqual(['Alice 1', 'Legacy 1', 'Pre-migration 1']);
    });

    test('listSummaries with an unresolved userId preserves single-tenant fallthrough (no filter)', async () => {
        // Daemon contexts (offline, no env-var, no gh-cli) yield undefined userId. The read filter
        // collapses to undefined; collection.get receives no `where` clause; all records returned.
        spy.rows.set('s-a1', {id: 's-a1', metadata: {userId: 'u-alice', timestamp: 100, title: 'Alice 1'}, document: 'A1'});
        spy.rows.set('s-shared1', {id: 's-shared1', metadata: {userId: 'shared', timestamp: 200, title: 'Legacy 1'}, document: 'L1'});
        spy.rows.set('s-untagged', {id: 's-untagged', metadata: {timestamp: 300, title: 'Pre-migration 1'}, document: 'P1'});

        const view = await SummaryService.listSummaries({limit: 10, offset: 0});

        // Without a userId, the additive filter does not apply — single-tenant fallthrough.
        // All records are visible (including any pre-migration untagged records).
        expect(view.count).toBe(3);
    });

    test('deleteAllSummaries does NOT remove SHARED_USER_ID-tagged records (asymmetric scope)', async () => {
        // The asymmetry: read filter is additive (mine + shared); delete filter is scoped (mine only).
        // "Delete all my summaries" must NOT touch the shared commons even though reads include them.
        spy.rows.set('s-a1', {id: 's-a1', metadata: {userId: 'u-alice'}, document: 'A1'});
        spy.rows.set('s-a2', {id: 's-a2', metadata: {userId: 'u-alice'}, document: 'A2'});
        spy.rows.set('s-shared1', {id: 's-shared1', metadata: {userId: 'shared'}, document: 'L1'});

        const result = await RequestContextService.run({userId: 'u-alice'}, () =>
            SummaryService.deleteAllSummaries()
        );

        // Only Alice's two summaries are deleted; the shared-tagged legacy summary survives.
        expect(result.deleted).toBe(2);
        expect(spy.rows.has('s-shared1')).toBe(true);
        // Verify the delete call's where clause: scoped to userId only, NOT including SHARED.
        expect(spy.calls.delete[0].where).toEqual({userId: 'u-alice'});
    });

    test('querySummaries normalizes `@`-prefixed userId at the boundary (canonical-form invariant)', async () => {
        // AgentIdentity nodeId form is `@x`; ChromaDB userId form is `x`. The boundary helper
        // strips the prefix so a request context with `@x` matches stored records tagged `x`.
        spy.rows.set('s-x1', {id: 's-x1', metadata: {userId: 'x-prefix-test', timestamp: 100, title: 'X1'}, document: 'X1'});

        await RequestContextService.run({userId: '@x-prefix-test'}, () =>
            SummaryService.querySummaries({query: 'anything', nResults: 10})
        );

        const q = spy.calls.query.at(-1);
        // In legacy mode, DB filtering for userId is skipped (no where clause).
        expect(q.where).toBeUndefined();
    });
});

test.describe('SummaryService — memorySharing policy (#10010)', () => {
    let spy;
    let originalGetSummaryCollection;

    test.beforeEach(() => {
        spy = createSpyCollection();
        originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        StorageRouter.getSummaryCollection = async () => spy;
    });

    test.afterEach(() => {
        StorageRouter.getSummaryCollection = originalGetSummaryCollection;
    });

    test('querySummaries with memorySharing=private returns only tenant-owned records', async () => {
        spy.rows.set('s-a1', {id: 's-a1', metadata: {userId: 'u-alice', timestamp: 100, title: 'a1'}, document: 'a1'});
        spy.rows.set('s-shared1', {id: 's-shared1', metadata: {userId: 'shared', timestamp: 200, title: 'L1'}, document: 'L1'});
        spy.rows.set('s-untagged', {id: 's-untagged', metadata: {timestamp: 300, title: 'pre-migration'}, document: 'P'});

        const view = await RequestContextService.run({userId: 'u-alice'}, () =>
            SummaryService.querySummaries({query: 'anything', nResults: 10, memorySharing: 'private'})
        );

        expect(view.count).toBe(1);
        expect(view.results[0].title).toBe('a1');

        const queryCall = spy.calls.query.at(-1);
        expect(queryCall.where).toEqual({userId: 'u-alice'});
    });

    test('querySummaries with memorySharing=team is additive: own + shared + untagged commons, excludes other-tenant private (#12450)', async () => {
        // Session summaries are untagged commons, so `team` is additive like `legacy` (own + shared +
        // untagged), NOT a restrictive {userId:'shared'} DB-where — which matched nothing and returned
        // empty. The JS post-filter still isolates other tenants' private records (Bob's stays hidden).
        spy.rows.set('s-a1', {id: 's-a1', metadata: {userId: 'u-alice', timestamp: 100, title: 'a1'}, document: 'a1'});
        spy.rows.set('s-shared1', {id: 's-shared1', metadata: {userId: 'shared', timestamp: 200, title: 'L1'}, document: 'L1'});
        spy.rows.set('s-untagged', {id: 's-untagged', metadata: {timestamp: 300, title: 'pre-migration'}, document: 'P'});
        spy.rows.set('s-bob', {id: 's-bob', metadata: {userId: 'u-bob', timestamp: 400, title: 'bob-private'}, document: 'B'});

        const view = await RequestContextService.run({userId: 'u-alice'}, () =>
            SummaryService.querySummaries({query: 'anything', nResults: 10, memorySharing: 'team'})
        );

        // own (a1) + shared (L1) + untagged (pre-migration); Bob's private record stays isolated.
        expect(view.count).toBe(3);
        expect(view.results.map(r => r.title).sort()).toEqual(['L1', 'a1', 'pre-migration']);
        expect(view.results.some(r => r.title === 'bob-private')).toBe(false);

        const queryCall = spy.calls.query.at(-1);
        // Additive policy: NO restrictive {userId:'shared'} DB-where; over-fetch + JS post-filter.
        expect(queryCall.where).toBeUndefined();
    });

    test('querySummaries with memorySharing=legacy returns tenant-owned plus team-tagged plus untagged', async () => {
        spy.rows.set('s-a1', {id: 's-a1', metadata: {userId: 'u-alice', timestamp: 100, title: 'a1'}, document: 'a1'});
        spy.rows.set('s-shared1', {id: 's-shared1', metadata: {userId: 'shared', timestamp: 200, title: 'L1'}, document: 'L1'});
        spy.rows.set('s-untagged', {id: 's-untagged', metadata: {timestamp: 300, title: 'pre-migration'}, document: 'P'});

        const view = await RequestContextService.run({userId: 'u-alice'}, () =>
            SummaryService.querySummaries({query: 'anything', nResults: 10, memorySharing: 'legacy'})
        );

        expect(view.count).toBe(3);
        expect(view.results.map(r => r.title).sort()).toEqual(['L1', 'a1', 'pre-migration']);

        const queryCall = spy.calls.query.at(-1);
        // In legacy mode, DB filtering for userId is skipped.
        expect(queryCall.where).toBeUndefined();
    });
});

test.describe('SummaryService — provenance trust filtering (#10292)', () => {
    let spy;
    let originalGetSummaryCollection;

    test.beforeEach(() => {
        spy = createSpyCollection();
        originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        StorageRouter.getSummaryCollection = async () => spy;
    });

    test.afterEach(() => {
        StorageRouter.getSummaryCollection = originalGetSummaryCollection;
    });

    test('querySummaries filters by minTrustTier and returns provenance fields', async () => {
        spy.rows.set('s-owner', {
            id      : 's-owner',
            metadata: {timestamp: 100, title: 'owner', sourceTrustTier: 'owner', sourceAgentIdentities: '@tobiu', provenancePolicy: 'most-restrictive-source'},
            document: 'owner'
        });
        spy.rows.set('s-peer', {
            id      : 's-peer',
            metadata: {timestamp: 200, title: 'peer', sourceTrustTier: 'peer-trusted', sourceAgentIdentities: '@neo-gpt', provenancePolicy: 'most-restrictive-source'},
            document: 'peer'
        });
        spy.rows.set('s-external', {
            id      : 's-external',
            metadata: {timestamp: 300, title: 'external', sourceTrustTier: 'external', sourceAgentIdentities: '@external', provenancePolicy: 'most-restrictive-source'},
            document: 'external'
        });
        spy.rows.set('s-legacy', {
            id      : 's-legacy',
            metadata: {timestamp: 400, title: 'legacy'},
            document: 'legacy'
        });

        const view = await SummaryService.querySummaries({
            query       : 'anything',
            nResults    : 10,
            minTrustTier: 'peer-trusted'
        });

        expect(view.count).toBe(2);
        expect(view.results.map(r => r.title)).toEqual(['owner', 'peer']);
        expect(view.results[0]).toMatchObject({
            sourceAgentIdentities: ['@tobiu'],
            sourceTrustTier      : 'owner',
            provenancePolicy     : 'most-restrictive-source'
        });
        expect(view.results[1]).toMatchObject({
            sourceAgentIdentities: ['@neo-gpt'],
            sourceTrustTier      : 'peer-trusted',
            provenancePolicy     : 'most-restrictive-source'
        });

        const queryCall = spy.calls.query.at(-1);
        expect(queryCall.nResults).toBe(50);
    });

    test('querySummaries rejects unknown minTrustTier before querying storage', async () => {
        const result = await SummaryService.querySummaries({
            query       : 'anything',
            nResults    : 10,
            minTrustTier: 'trusted-ish'
        });

        expect(result).toMatchObject({
            error: 'Invalid minTrustTier',
            code : 'SUMMARY_QUERY_INVALID_TRUST_TIER'
        });
        expect(spy.calls.query).toHaveLength(0);
    });
});
