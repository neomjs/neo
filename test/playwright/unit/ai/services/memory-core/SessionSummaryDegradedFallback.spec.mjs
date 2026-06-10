import {setup} from '../../../../setup.mjs';

const appName = 'SessionSummaryDegradedFallbackTest';

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
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';
import {PROVIDER_TIMEOUT_CODE} from '../../../../../../ai/provider/createTimeoutError.mjs';

/**
 * SessionService degraded session-summary fallback (graduated from the session-summary fidelity
 * ideation, LEAF 1).
 *
 * Closes the silent-summary gap: when the RAW-turn prompt exceeds the local model's safe processing
 * band, `summarizeSession` no longer returns null — it builds a provenance-labeled (`sourceTier:
 * 'miniSummary'`, `degraded:true`, `rawCanonical:true`) summary from the per-turn miniSummaries.
 *
 * Deterministic + CI-safe by construction: UNIT_TEST_MODE resolves the graph to ':memory:'; the model
 * is mocked (no live SLM), and the Chroma read/write are mocked (the CI unit env has no ChromaDB).
 * The size-skip is triggered by an oversized raw input — NEVER by mutating the shared aiConfig
 * singleton (the reactive-provider set-trap lint forbids that).
 */
test.describe('Neo.ai.services.memory-core.SessionService — degraded session-summary fallback (#12819)', () => {
    test.describe.configure({mode: 'serial'});

    let SessionService, GraphService, LifecycleService;
    let originalMemoryCollection, originalSessionsCollection, originalModel, originalIngest;
    let captured;

    const CANNED = JSON.stringify({
        summary     : 'session arc summary',
        title       : 'Test Session',
        category    : 'analysis',
        quality     : 50,
        productivity : 50,
        impact      : 50,
        complexity  : 50,
        technologies: ['neo.mjs']
    });

    const seedMiniSummaries = (sessionId, entries) => entries.forEach((entry, index) =>
        GraphService.upsertNode({
            id        : `${sessionId}-mem-${index}`,
            type      : 'AGENT_MEMORY',
            name      : `mem ${index}`,
            properties: {sessionId, timestamp: entry.ts, miniSummary: entry.text}
        })
    );

    test.beforeAll(async () => {
        GraphService     = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        SessionService   = (await import('../../../../../../ai/services/memory-core/SessionService.mjs')).default;
        LifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }

        // Save originals — sibling specs share the worker; an unrestored mock would leak.
        originalMemoryCollection   = SessionService.memoryCollection;
        originalSessionsCollection = SessionService.sessionsCollection;
        originalModel              = SessionService.model;
        originalIngest             = SessionService.ingestAntigravityArtifacts;

        // No live SLM: canned structured-summary JSON.
        SessionService.model                      = {generateContent: async () => ({response: {text: () => CANNED}})};
        // No filesystem artifact scan.
        SessionService.ingestAntigravityArtifacts = async () => {};
        // Capture the persisted summary metadata; no live Chroma write.
        SessionService.sessionsCollection         = {upsert: async args => { captured = args; }};
    });

    test.afterAll(() => {
        SessionService.memoryCollection           = originalMemoryCollection;
        SessionService.sessionsCollection         = originalSessionsCollection;
        SessionService.model                      = originalModel;
        SessionService.ingestAntigravityArtifacts = originalIngest;
    });

    test('getSessionMiniSummaries returns a memory-id → miniSummary map, filters nulls, empty for unknown session', () => {
        seedMiniSummaries('sess-mini', [
            {ts: 300, text: 'third'},
            {ts: 100, text: 'first'},
            {ts: 200, text: 'second'}
        ]);
        // A null-miniSummary turn must be excluded.
        GraphService.upsertNode({
            id: 'sess-mini-mem-null', type: 'AGENT_MEMORY', name: 'null turn',
            properties: {sessionId: 'sess-mini', timestamp: 400, miniSummary: null}
        });

        const map = SessionService.getSessionMiniSummaries('sess-mini');
        expect(map.size).toBe(3);
        expect(map.get('sess-mini-mem-1')).toBe('first');
        expect(map.get('sess-mini-mem-2')).toBe('second');
        expect(map.get('sess-mini-mem-0')).toBe('third');
        expect(map.has('sess-mini-mem-null')).toBe(false);
        expect(SessionService.getSessionMiniSummaries('no-such-session').size).toBe(0);
    });

    test('over-band raw → provenance-labeled degraded summary from stored miniSummaries (not null)', async () => {
        captured = null;
        const sessionId = 'sess-oversized';
        // The fallback joins by memory id, so the Chroma ids must match the seeded graph node ids.
        seedMiniSummaries(sessionId, [{ts: 1, text: 'turn one gist'}, {ts: 2, text: 'turn two gist'}]);

        // RAW prompt far exceeds the safe processing band → guardrail size-precheck-skip.
        const huge = 'x'.repeat(1_500_000);
        SessionService.memoryCollection = {get: async () => ({
            ids      : [`${sessionId}-mem-0`, `${sessionId}-mem-1`],
            documents: [huge, huge],
            metadatas: [
                {timestamp: 1, agent: 'test-agent', model: 'gemma4'},
                {timestamp: 2, agent: 'test-agent', model: 'gemma4'}
            ]
        })};

        const res = await RequestContextService.run(
            {userId: 'tenant-a', agentIdentityNodeId: '@test-agent'},
            async () => SessionService.summarizeSession(sessionId)
        );

        expect(res).not.toBeNull();
        expect(captured).toBeTruthy();
        expect(captured.metadatas[0].sourceTier).toBe('miniSummary');
        expect(captured.metadatas[0].degraded).toBe(true);
        expect(captured.metadatas[0].rawCanonical).toBe(true);
    });

    test('over-band raw + NO stored miniSummaries → truncated-raw degraded summary, not null (fail-soft branch)', async () => {
        captured = null;
        const sessionId = 'sess-oversized-nomini';
        // Deliberately seed NO miniSummary graph nodes — the fail-soft case where buildMiniSummary /
        // the backfill has not (yet) populated this session's turns. Must still produce a summary.
        const huge = 'x'.repeat(1_500_000);
        SessionService.memoryCollection = {get: async () => ({
            ids      : [`${sessionId}-mem-0`],
            documents: [huge],
            metadatas: [{timestamp: 1, agent: 'test-agent', model: 'gemma4'}]
        })};

        const res = await RequestContextService.run(
            {userId: 'tenant-a', agentIdentityNodeId: '@test-agent'},
            async () => SessionService.summarizeSession(sessionId)
        );

        expect(res).not.toBeNull();
        expect(captured).toBeTruthy();
        expect(captured.metadatas[0].sourceTier).toBe('truncatedRaw');
        expect(captured.metadatas[0].degraded).toBe(true);
        expect(captured.metadatas[0].rawCanonical).toBe(true);
    });

    test('within-band raw → normal raw summary (sourceTier raw, not degraded)', async () => {
        captured = null;
        const sessionId = 'sess-small';
        SessionService.memoryCollection = {get: async () => ({
            ids      : ['m1'],
            documents: ['a short raw turn'],
            metadatas: [{timestamp: 1, agent: 'test-agent', model: 'gemma4'}]
        })};

        const res = await RequestContextService.run(
            {userId: 'tenant-a', agentIdentityNodeId: '@test-agent'},
            async () => SessionService.summarizeSession(sessionId)
        );

        expect(res).not.toBeNull();
        expect(captured.metadatas[0].sourceTier).toBe('raw');
        expect(captured.metadatas[0].degraded).toBe(false);
    });

    test('in-band raw that TIMES OUT → degraded compact summary, not null (timeout symptom triggers the fallback)', async () => {
        captured = null;
        const sessionId = 'sess-timeout';
        // Stored miniSummaries so the compact fallback has content to synthesize.
        seedMiniSummaries(sessionId, [{ts: 1, text: 'turn one gist'}, {ts: 2, text: 'turn two gist'}]);

        // In-band raw content (passes the size pre-check) — the synthesis itself is what times out.
        SessionService.memoryCollection = {get: async () => ({
            ids      : [`${sessionId}-mem-0`, `${sessionId}-mem-1`],
            documents: ['a short in-band raw turn', 'another short in-band raw turn'],
            metadatas: [
                {timestamp: 1, agent: 'test-agent', model: 'gemma4'},
                {timestamp: 2, agent: 'test-agent', model: 'gemma4'}
            ]
        })};

        // First (RAW) synthesis throws the uniform PROVIDER_TIMEOUT; the smaller compact retry succeeds.
        let call = 0;
        SessionService.model = {generateContent: async () => {
            if (call++ === 0) {
                const err = new Error('session summarization timed out after 180000ms');
                err.code = PROVIDER_TIMEOUT_CODE;
                throw err;
            }
            return {response: {text: () => CANNED}};
        }};

        const res = await RequestContextService.run(
            {userId: 'tenant-a', agentIdentityNodeId: '@test-agent'},
            async () => SessionService.summarizeSession(sessionId)
        );

        expect(res).not.toBeNull();
        expect(captured).toBeTruthy();
        expect(captured.metadatas[0].sourceTier).toBe('miniSummary');
        expect(captured.metadatas[0].degraded).toBe(true);
        expect(captured.metadatas[0].rawCanonical).toBe(true);
    });
});
