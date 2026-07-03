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

import {test, expect}                  from '@playwright/test';
import Neo                             from '../../../../../../../src/Neo.mjs';
import {getPendingSessionSummaryCount} from '../../../../../../../ai/daemons/orchestrator/scheduling/summary.mjs';

/**
 * getPendingSessionSummaryCount real-graph coverage.
 *
 * The count drives the orchestrator periodic-sweep log. Its anti-join must be null-safe and must
 * distinguish the two intentional graph surfaces: direct SESSION_SUMMARY artifacts and REM
 * SESSION projections derived from Chroma summary rows. Minimal SESSION placeholders are not
 * summary evidence. Real :memory: graph under UNIT_TEST_MODE — no Chroma / live model, CI-safe.
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

    test('counts unsummarized sessions and is null-safe against summary graph drift', () => {
        const before = getPendingSessionSummaryCount(sqlite);
        expect(Number.isInteger(before)).toBe(true);

        // sA: memory + a matching summary (summarized → not counted).
        GraphService.upsertNode({id: 'bk-mem-A', type: 'AGENT_MEMORY', name: 'mem A', properties: {sessionId: 'bk-sess-A', timestamp: 1, miniSummary: 'a'}});
        GraphService.upsertNode({id: 'summary_bk-sess-A', type: 'SESSION_SUMMARY', name: 'sum A', properties: {sessionId: 'bk-sess-A'}});
        // sB: memory, no summary (unsummarized → the one new row the count must report).
        GraphService.upsertNode({id: 'bk-mem-B', type: 'AGENT_MEMORY', name: 'mem B', properties: {sessionId: 'bk-sess-B', timestamp: 1, miniSummary: 'b'}});
        // sC: memory + REM projection emitted as a SESSION node pointing at a summary_* Chroma
        // artifact (summarized → not counted even if the direct SESSION_SUMMARY node is missing).
        GraphService.upsertNode({id: 'bk-mem-C', type: 'AGENT_MEMORY', name: 'mem C', properties: {sessionId: 'bk-sess-C', timestamp: 1, miniSummary: 'c'}});
        GraphService.upsertNode({id: 'session_bk-sess-C', type: 'SESSION', name: 'sum C', properties: {sessionId: 'bk-sess-C', chromaId: 'summary_bk-sess-C'}});
        // sD: memory + minimal SESSION placeholder only. This is not summary evidence and must
        // still count as unsummarized.
        GraphService.upsertNode({id: 'bk-mem-D', type: 'AGENT_MEMORY', name: 'mem D', properties: {sessionId: 'bk-sess-D', timestamp: 1, miniSummary: 'd'}});
        GraphService.upsertNode({id: 'session_bk-sess-D', type: 'SESSION', name: 'minimal D', properties: {sessionId: 'bk-sess-D', minimal: true}});
        // The trap: a SESSION_SUMMARY with a NULL sessionId. With `NOT IN` this would null out the
        // whole anti-join and force the count to 0; NOT EXISTS must be immune.
        GraphService.upsertNode({id: 'summary_bk-null', type: 'SESSION_SUMMARY', name: 'sum null', properties: {sessionId: null}});

        const after = getPendingSessionSummaryCount(sqlite);

        // Exactly two new unsummarized sessions (sB + minimal-placeholder sD); sA and the
        // summary-backed REM projection sC are summarized; the null-sessionId summary must NOT
        // collapse the count.
        expect(after).toBe(before + 2);
        expect(after).toBeGreaterThan(0);
    });

    test('excludes archived/orphaned sessions — an archived memory is not summary-pending', () => {
        const before = getPendingSessionSummaryCount(sqlite);

        // sARCH: a single, archived memory with no summary. Its content is gone (vector row GC'd or
        // never landed) so it can never be summarized — it must NOT inflate the pending proxy.
        GraphService.upsertNode({id: 'bk-mem-ARCH', type: 'AGENT_MEMORY', name: 'mem arch', properties: {sessionId: 'bk-sess-ARCH', timestamp: 1, archivedAt: '2026-01-01T00:00:00.000Z', archivedReason: 'no-content'}});
        // sLIVE: a single, un-archived, unsummarized memory — the control that DOES count, so the
        // delta isolates the archived-exclusion rather than a flat count.
        GraphService.upsertNode({id: 'bk-mem-LIVE', type: 'AGENT_MEMORY', name: 'mem live', properties: {sessionId: 'bk-sess-LIVE', timestamp: 1}});
        // sMIX: one archived + one live memory node. A session still counts while it has any
        // un-archived (summarizable) memory — only fully-orphaned sessions drop out.
        GraphService.upsertNode({id: 'bk-mem-MIX-arch', type: 'AGENT_MEMORY', name: 'mix arch', properties: {sessionId: 'bk-sess-MIX', timestamp: 1, archivedAt: '2026-01-01T00:00:00.000Z'}});
        GraphService.upsertNode({id: 'bk-mem-MIX-live', type: 'AGENT_MEMORY', name: 'mix live', properties: {sessionId: 'bk-sess-MIX', timestamp: 2}});

        const after = getPendingSessionSummaryCount(sqlite);

        // +2, not +3: sLIVE and sMIX count; the fully-archived sARCH is excluded.
        expect(after).toBe(before + 2);
    });

    test('is fail-soft when the db handle is unavailable', () => {
        expect(getPendingSessionSummaryCount(null)).toBeNull();
        expect(getPendingSessionSummaryCount({})).toBeNull();
    });
});
