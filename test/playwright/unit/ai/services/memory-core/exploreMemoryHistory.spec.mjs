import {test, expect}         from '@playwright/test';
import {exploreMemoryHistory} from '../../../../../../ai/services/memory-core/helpers/exploreMemoryHistory.mjs';

const NOW = '2026-07-12T12:00:00.000Z';   // preset 'weekly' → window [2026-07-05T12:00Z, 2026-07-12T12:00Z)

// a deps builder with sensible in-window defaults; override any leg per test
const makeDeps = (over = {}) => ({
    listIdentities  : async () => ['@a', '@b'],
    queryRecentTurns: async ({agentIdentity}) => ({
        turns     : [{id: `turn-${agentIdentity}`, timestamp: '2026-07-08T00:00:00.000Z'}],
        nextCursor: null   // one exhausted page → complete coverage
    }),
    queryMemories: async () => ({results: [{id: 'm1', document: 'a recurring theme'}]}),
    generate     : async () => 'Two sessions of work happened this week.',
    listSummaries: async () => ({summaries: []}),   // team-visible session leg; empty unless a test overrides
    ...over
});

test.describe('exploreMemoryHistory — the full Memory/session Bird View composition (8 primitives end-to-end)', () => {
    test('unified happy path: walks the roster, complete coverage, enriched + synthesized envelope', async () => {
        const envelope = await exploreMemoryHistory({partition: 'unified', preset: 'weekly', now: NOW, deps: makeDeps()});

        expect(envelope.notAuthority).toBe(true);
        expect(envelope.synthesisAvailable).toBe(true);
        expect(envelope.synthesis).toBe('Two sessions of work happened this week.');
        expect(envelope.coverage).toMatchObject({totalResolved: 2, degraded: false});
        expect(envelope.citations.map(c => c.id).sort()).toEqual(['turn-@a', 'turn-@b']);
        expect(envelope.window.preset).toBe('weekly')
    });

    test('census-vs-inference flows end-to-end: a within-bounds window marks every citation inSynthesis + reports the input count', async () => {
        const envelope = await exploreMemoryHistory({partition: 'unified', preset: 'weekly', now: NOW, deps: makeDeps()});

        // the 2 recency turns fit the prompt bound → the manifest reaches the envelope through the full
        // composition: every citation is an inference input, and the count is exposed beside the census total.
        expect(envelope.coverage.synthesisInputCount).toBe(2);
        expect(envelope.coverage.totalResolved).toBe(2);
        expect(envelope.citations.every(c => c.inSynthesis === true)).toBe(true)
    });

    test('unified surfaces PEER sessions from the team-visible summary leg the tenant-bound recency walk cannot see', async () => {
        // query_recent_turns is caller-userId-bound → a peer's turns come back empty; listSummaries is team-visible.
        const envelope = await exploreMemoryHistory({partition: 'unified', preset: 'weekly', now: NOW, deps: makeDeps({
            queryRecentTurns: async () => ({turns: [], nextCursor: null}),
            listSummaries   : async () => ({summaries: [{id: 'sess-peer', sessionId: 's-peer', timestamp: '2026-07-08T00:00:00.000Z', impact: 95, summary: 'a peer shipped the thing'}]})
        })});

        // the peer session is admitted into coverage + prominence even though the recency walk saw zero turns
        expect(envelope.coverage.totalResolved).toBe(1);
        expect(envelope.citations.map(c => c.id)).toContain('sess-peer')
    });

    test('an @identity partition walks exactly that identity — the roster is never consulted', async () => {
        let rosterCalls = 0;

        const envelope = await exploreMemoryHistory({
            partition: '@a',
            preset   : 'weekly',
            now      : NOW,
            deps     : makeDeps({listIdentities: async () => { rosterCalls++; return ['@a', '@b'] }})
        });

        expect(rosterCalls).toBe(0);
        expect(envelope.citations.map(c => c.id)).toEqual(['turn-@a'])
    });

    test('a recency-spine failure degrades the envelope and the LLM is never called', async () => {
        let generateCalls = 0;

        const envelope = await exploreMemoryHistory({
            partition: '@a',
            preset   : 'weekly',
            now      : NOW,
            deps     : makeDeps({
                // queryRecentTurns signals failure by RETURNING an error envelope
                queryRecentTurns: async () => ({error: 'graph unavailable', message: 'chroma down'}),
                generate        : async () => { generateCalls++; return 'x' }
            })
        });

        expect(envelope.synthesisAvailable).toBe(false);
        expect(envelope.coverage.degraded).toBe(true);
        expect(envelope.coverage.degradedReason).toMatch(/chronological-walk-incomplete/);
        expect(generateCalls, 'no synthesis over incomplete coverage').toBe(0)
    });

    test('an enrichment failure does NOT block synthesis — themes are best-effort, coverage is intact', async () => {
        const envelope = await exploreMemoryHistory({
            partition: '@a',
            preset   : 'weekly',
            now      : NOW,
            deps     : makeDeps({queryMemories: async () => { throw new Error('chroma semantic down') }})
        });

        // coverage came from the recency spine (intact); enrichment failure only means fewer themes
        expect(envelope.synthesisAvailable).toBe(true);
        expect(envelope.synthesis).toBe('Two sessions of work happened this week.');
        expect(envelope.coverage.degraded).toBe(false)
    });

    test('fails loud when a dep is missing', async () => {
        await expect(exploreMemoryHistory({preset: 'weekly', now: NOW, deps: {queryRecentTurns: async () => ({})}}))
            .rejects.toThrow(/deps must supply/)
    })
});
