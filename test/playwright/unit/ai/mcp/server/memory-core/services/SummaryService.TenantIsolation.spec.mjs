import { setup } from '../../../../../../setup.mjs';

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
import Neo                   from '../../../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../../../src/core/_export.mjs';
import SummaryService        from '../../../../../../../../ai/mcp/server/memory-core/services/SummaryService.mjs';
import StorageRouter         from '../../../../../../../../ai/mcp/server/memory-core/managers/StorageRouter.mjs';
import RequestContextService from '../../../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

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
        return Object.entries(where).every(([k, v]) => metadata?.[k] === v);
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
        // #10000's cloud-mode branching is to replace that call with the scoped `delete({where})`.
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
        expect(q.where).toEqual({ $and: [{ category: 'refactoring' }, { userId: 'u-alice' }] });
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
