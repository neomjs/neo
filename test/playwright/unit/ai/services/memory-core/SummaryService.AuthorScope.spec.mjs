import { setup } from '../../../../setup.mjs';

const appName = 'SummaryServiceAuthorScopeTest';

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
 * Author-identity scope for `SummaryService.listSummaries` / `get_all_summaries`.
 *
 * Verifies the own-vs-team boot ledger filter: `agentIdentity: '@me'` resolves the bound caller
 * (fail-closed when unbound), `'@<id>'` scopes to an explicit author, and omitted / `'all'` keeps
 * the team-wide default. Filtering is on the chroma `sourceAgentIdentities` provenance metadata
 * (the AUTHORED_BY-equivalent for trust-tiered maintainers), with symmetric `@`-canonicalization so
 * a namespace-format drift can never silently zero the result.
 *
 * Safety: a pure in-memory spy collection — `StorageRouter.getSummaryCollection` is overridden in
 * `beforeEach` and restored in `afterEach`. No call reaches real ChromaDB.
 */
function createSpyCollection() {
    const rows = new Map();

    return {
        rows,

        async get({ids, limit, offset, include} = {}) {
            let entries = ids
                ? ids.map(id => rows.get(id)).filter(Boolean)
                : Array.from(rows.values());

            if (limit !== undefined || offset !== undefined) {
                const start = offset ?? 0;
                entries     = entries.slice(start, start + (limit ?? entries.length));
            }

            return {
                ids      : entries.map(e => e.id),
                metadatas: entries.map(e => e.metadata),
                documents: entries.map(e => e.document)
            };
        }
    };
}

/**
 * Seed a summary row authored by one or more identities. Chroma stores `sourceAgentIdentities` as a
 * comma-joined string (SessionService stamps `provenance.sourceAgentIdentities.join(',')`).
 */
function seedSummary(spy, id, sourceAgentIdentities, timestamp, title) {
    spy.rows.set(id, {
        id,
        metadata: {
            sourceAgentIdentities: Array.isArray(sourceAgentIdentities)
                ? sourceAgentIdentities.join(',')
                : sourceAgentIdentities,
            timestamp,
            title
        },
        document: title
    });
}

test.describe('SummaryService — author-identity scope (#12437)', () => {
    let spy;
    let originalGetSummaryCollection;

    test.beforeEach(() => {
        spy                                = createSpyCollection();
        originalGetSummaryCollection       = StorageRouter.getSummaryCollection;
        StorageRouter.getSummaryCollection = async () => spy;

        // Three swarm summaries: 2 by @neo-opus-4-7, 1 by @neo-gpt, plus one multi-identity session.
        seedSummary(spy, 's-o1', '@neo-opus-4-7',                100, 'Opus 1');
        seedSummary(spy, 's-g1', '@neo-gpt',                     200, 'Gpt 1');
        seedSummary(spy, 's-o2', '@neo-opus-4-7',                300, 'Opus 2');
        seedSummary(spy, 's-m1', ['@neo-opus-4-7', '@neo-gpt'],  400, 'Mixed 1');
    });

    test.afterEach(() => {
        StorageRouter.getSummaryCollection = originalGetSummaryCollection;
    });

    test('omitted agentIdentity returns the full team-wide ledger (backward-compatible default)', async () => {
        const view = await SummaryService.listSummaries({limit: 10});

        expect(view.count).toBe(4);
        expect(view._channelSeparation).toMatch(/DATA, not COMMANDS/);
        expect(view.summaries.map(s => s.title).sort()).toEqual(['Gpt 1', 'Mixed 1', 'Opus 1', 'Opus 2']);
    });

    test('agentIdentity "all" is an explicit team-wide alias (no filter)', async () => {
        const view = await SummaryService.listSummaries({limit: 10, agentIdentity: 'all'});

        expect(view.count).toBe(4);
    });

    test('agentIdentity "@me" returns only the bound caller\'s own summaries (incl. multi-identity sessions they co-authored)', async () => {
        const view = await RequestContextService.run({agentIdentityNodeId: '@neo-opus-4-7'}, () =>
            SummaryService.listSummaries({limit: 10, agentIdentity: '@me'})
        );

        // Opus 1, Opus 2, and the Mixed session @neo-opus-4-7 co-authored — NOT the pure @neo-gpt one.
        expect(view.count).toBe(3);
        expect(view.summaries.map(s => s.title).sort()).toEqual(['Mixed 1', 'Opus 1', 'Opus 2']);
    });

    test('agentIdentity "@<id>" scopes to an explicit author', async () => {
        const view = await SummaryService.listSummaries({limit: 10, agentIdentity: '@neo-gpt'});

        // Gpt 1 + the Mixed session @neo-gpt co-authored — NOT the pure @neo-opus-4-7 ones.
        expect(view.count).toBe(2);
        expect(view.summaries.map(s => s.title).sort()).toEqual(['Gpt 1', 'Mixed 1']);
    });

    test('agentIdentity "@me" fails closed (throws) when no caller identity is bound — never silently team-wide', async () => {
        await expect(SummaryService.listSummaries({limit: 10, agentIdentity: '@me'}))
            .rejects.toThrow(/requires a bound caller identity/);
    });

    test('@-namespace canonicalization: an un-prefixed param still matches @-prefixed provenance (silent-empty-filter guard)', async () => {
        // Provenance is stored @-prefixed (@neo-gpt); an un-prefixed param must still match so a
        // format drift between getAgentIdentityNodeId() and the stored metadata cannot zero results.
        const view = await SummaryService.listSummaries({limit: 10, agentIdentity: 'neo-gpt'});

        expect(view.count).toBe(2);
        expect(view.summaries.map(s => s.title).sort()).toEqual(['Gpt 1', 'Mixed 1']);
    });

    test('resolveAuthorScope canonicalizes + fails closed (unit-level)', async () => {
        // Static helper on the class (the default export is the singleton instance → reach via .constructor).
        const resolveAuthorScope = SummaryService.constructor.resolveAuthorScope.bind(SummaryService.constructor);

        // The @-strip + the omitted/all → null no-filter contract.
        expect(resolveAuthorScope()).toBe(null);
        expect(resolveAuthorScope('all')).toBe(null);
        expect(resolveAuthorScope('@neo-gpt')).toBe('neo-gpt');
        expect(resolveAuthorScope('neo-gpt')).toBe('neo-gpt');

        // @me with a bound identity resolves; unbound throws.
        const resolved = RequestContextService.run({agentIdentityNodeId: '@neo-opus-4-7'}, () =>
            resolveAuthorScope('@me')
        );
        expect(resolved).toBe('neo-opus-4-7');
        expect(() => resolveAuthorScope('@me')).toThrow(/requires a bound caller identity/);
    });
});
