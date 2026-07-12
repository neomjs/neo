import {test, expect}             from '@playwright/test';
import {makeSessionSummaryReader} from '../../../../../../ai/services/memory-core/helpers/sessionSummaryReader.mjs';

/**
 * sessionSummaryReader — the team-visible session-summary coverage leg. It recovers the peer sessions the
 * tenant-bound recency walk structurally cannot see, so a `unified` window stops silently declaring peers
 * exhausted. These hermetic fixtures pin the half-open window filter, the team-vs-author scope, the
 * DESC-sorted early stop, and honest degradation on a read failure.
 */
test.describe('sessionSummaryReader — the team-visible session-summary coverage leg', () => {
    const S = (id, ts, extra = {}) => ({id, timestamp: ts, sessionId: `sess-${id}`, impact: 50, summary: `${id} summary`, ...extra});

    test('collects in-window summaries as type:session sources, drops out-of-window, preserves impact/sessionId', async () => {
        const reader = makeSessionSummaryReader({
            pageSize     : 10,
            // DESC-sorted (newest first), as the summary index returns
            listSummaries: async () => ({summaries: [
                S('new', '2026-07-20T00:00:00Z'),            // newer than windowEnd → skipped
                S('in',  '2026-07-10T00:00:00Z', {impact: 92}),
                S('old', '2026-01-01T00:00:00Z')             // older than windowStart → skipped (+ stops walk)
            ]})
        });

        const {sources, degraded} = await reader({
            windowStart: Date.parse('2026-07-08T00:00:00Z'),
            windowEnd  : Date.parse('2026-07-12T00:00:00Z'),
            partition  : 'unified'
        });

        expect(degraded).toBe(false);
        expect(sources.map(s => s.id)).toEqual(['in']);
        expect(sources[0]).toMatchObject({type: 'session', sessionId: 'sess-in', impact: 92, summary: 'in summary'})
    });

    test('unified reads team-wide (no agentIdentity); a @identity partition scopes the author', async () => {
        const seen   = [],
              reader = makeSessionSummaryReader({listSummaries: async args => { seen.push(args); return {summaries: []} }});

        await reader({windowStart: 0, windowEnd: 1, partition: 'unified'});
        await reader({windowStart: 0, windowEnd: 1, partition: '@neo-opus-ada'});

        expect(seen[0].agentIdentity).toBeUndefined();       // unified → team-visible, sees peer sessions
        expect(seen[1].agentIdentity).toBe('@neo-opus-ada')  // partition → author-scoped
    });

    test('stops the walk once a page runs older than the window (DESC-sorted index)', async () => {
        let   calls  = 0;
        const reader = makeSessionSummaryReader({
            pageSize     : 2,
            listSummaries: async () => { calls++; return {summaries: [S('a', '2026-07-10T00:00:00Z'), S('b', '2020-01-01T00:00:00Z')]} }
        });

        await reader({windowStart: Date.parse('2026-07-08T00:00:00Z'), windowEnd: Date.parse('2026-07-12T00:00:00Z')});
        expect(calls).toBe(1) // 'b' is older than windowStart → stop, no second page fetched
    });

    test('a read error degrades coverage honestly (never an empty-window false pass)', async () => {
        const thrown    = makeSessionSummaryReader({listSummaries: async () => { throw new Error('chroma down') }}),
              enveloped = makeSessionSummaryReader({listSummaries: async () => ({error: 'quarantined'})});

        expect((await thrown({windowStart: 0, windowEnd: 1})).degraded).toBe(true);
        expect((await enveloped({windowStart: 0, windowEnd: 1})).degraded).toBe(true)
    });

    test('the injected listSummaries is required', () => {
        expect(() => makeSessionSummaryReader({})).toThrow(/listSummaries/)
    })
});
