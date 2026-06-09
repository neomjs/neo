import {setup} from '../../../../../setup.mjs';

const appName = 'SessionSummaryBacklogCountTest';

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

import {test, expect}              from '@playwright/test';
import Neo                         from '../../../../../../../src/Neo.mjs';
import {getPendingSessionSummaryCount} from '../../../../../../../ai/daemons/orchestrator/scheduling/summary.mjs';

/**
 * getPendingSessionSummaryCount real-graph coverage.
 *
 * The count drives the orchestrator periodic-sweep log. Its anti-join (sessions with AGENT_MEMORY
 * but no SESSION_SUMMARY) must be null-safe: a single SESSION_SUMMARY row with a NULL sessionId
 * must not collapse the count to 0 (the `NOT IN (subquery)` trap). Real :memory: graph under
 * UNIT_TEST_MODE — no Chroma / live model, CI-safe.
 */
test.describe('orchestrator/scheduling getPendingSessionSummaryCount (#12821)', () => {
    test.describe.configure({mode: 'serial'});

    let GraphService, LifecycleService, sqlite;

    test.beforeAll(async () => {
        GraphService     = (await import('../../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        LifecycleService = (await import('../../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }

        sqlite = GraphService.db?.storage?.db;
    });

    test('counts unsummarized sessions and is null-safe against a SESSION_SUMMARY with a NULL sessionId', () => {
        const before = getPendingSessionSummaryCount(sqlite);
        expect(Number.isInteger(before)).toBe(true);

        // sA: memory + a matching summary (summarized → not counted).
        GraphService.upsertNode({id: 'bk-mem-A', type: 'AGENT_MEMORY', name: 'mem A', properties: {sessionId: 'bk-sess-A', timestamp: 1, miniSummary: 'a'}});
        GraphService.upsertNode({id: 'summary_bk-sess-A', type: 'SESSION_SUMMARY', name: 'sum A', properties: {sessionId: 'bk-sess-A'}});
        // sB: memory, no summary (unsummarized → the one new row the count must report).
        GraphService.upsertNode({id: 'bk-mem-B', type: 'AGENT_MEMORY', name: 'mem B', properties: {sessionId: 'bk-sess-B', timestamp: 1, miniSummary: 'b'}});
        // The trap: a SESSION_SUMMARY with a NULL sessionId. With `NOT IN` this would null out the
        // whole anti-join and force the count to 0; NOT EXISTS must be immune.
        GraphService.upsertNode({id: 'summary_bk-null', type: 'SESSION_SUMMARY', name: 'sum null', properties: {sessionId: null}});

        const after = getPendingSessionSummaryCount(sqlite);

        // Exactly one new unsummarized session (sB); sA is summarized; the null-sessionId summary
        // must NOT collapse the count.
        expect(after).toBe(before + 1);
        expect(after).toBeGreaterThan(0);
    });

    test('is fail-soft when the db handle is unavailable', () => {
        expect(getPendingSessionSummaryCount(null)).toBeNull();
        expect(getPendingSessionSummaryCount({})).toBeNull();
    });
});
