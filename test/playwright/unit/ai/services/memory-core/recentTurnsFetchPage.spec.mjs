import {test, expect}                        from '@playwright/test';
import {makeRecentTurnsFetchPage}            from '../../../../../../ai/services/memory-core/helpers/recentTurnsFetchPage.mjs';
import {enumerateChronologicalWindowSources} from '../../../../../../ai/services/memory-core/helpers/chronologicalWindowSources.mjs';

test.describe('recentTurnsFetchPage — the query_recent_turns → fetchPage seam adapter', () => {
    test('types turns as memory + preserves fidelity fields (sessionId, impact, summary), drops arbitrary ones, passes args through', async () => {
        const calls     = [],
              fetchPage = makeRecentTurnsFetchPage({
                  limit           : 50,
                  queryRecentTurns: async args => {
                      calls.push(args);
                      return {turns: [{id: 't1', timestamp: '2026-07-10T00:00:00Z', sessionId: 's1', impact: 87, summary: 'shipped the thing', extra: 'ignored'}], nextCursor: {timestamp: 'x', id: 'y'}}
                  }
              });

        const page = await fetchPage({identity: '@ada', cursor: {timestamp: 'c', id: 'z'}});

        // type is `memory` (so citationProminence can classify it); sessionId + impact + summary survive for
        // prominence + drill-down; `extra` is dropped (the item stays a known shape).
        expect(page.items).toEqual([{id: 't1', timestamp: '2026-07-10T00:00:00Z', type: 'memory', sessionId: 's1', impact: 87, summary: 'shipped the thing'}]);
        expect(page.nextCursor).toEqual({timestamp: 'x', id: 'y'});
        expect(calls[0]).toEqual({agentIdentity: '@ada', before: {timestamp: 'c', id: 'z'}, limit: 50})
    });

    test('an error-envelope return (queryRecentTurns does not throw) is surfaced as a throw so coverage degrades', async () => {
        const fetchPage = makeRecentTurnsFetchPage({
            queryRecentTurns: async () => ({error: 'Failed to query recent turns', message: 'graph unavailable', code: 'RECENT_TURNS_ERROR'})
        });

        await expect(fetchPage({identity: '@ada'})).rejects.toThrow(/query_recent_turns failed for @ada: graph unavailable/)
    });

    test('an empty page maps to empty items + null nextCursor', async () => {
        const fetchPage = makeRecentTurnsFetchPage({queryRecentTurns: async () => ({turns: [], nextCursor: null})});

        expect(await fetchPage({identity: '@ada'})).toEqual({items: [], nextCursor: null})
    });

    test('the injected queryRecentTurns is required', () => {
        expect(() => makeRecentTurnsFetchPage({})).toThrow(/queryRecentTurns/)
    });

    test('integration: the adapter drives the chronological spine to exhaustion over paged turns', async () => {
        // a two-page reverse-chronological stream for @ada; page 2 ends the cursor (nextCursor null)
        const pages = [
            {turns: [{id: 't-newer', timestamp: '2026-07-11T00:00:00Z'}], nextCursor: {timestamp: '2026-07-11T00:00:00Z', id: 't-newer'}},
            {turns: [{id: 't-older', timestamp: '2026-07-10T00:00:00Z'}], nextCursor: null}
        ];
        let call = 0;

        const fetchPage           = makeRecentTurnsFetchPage({queryRecentTurns: async () => pages[call++] || {turns: [], nextCursor: null}}),
              {sources, coverage} = await enumerateChronologicalWindowSources({
                  window    : {windowStart: Date.parse('2026-07-01T00:00:00Z'), windowEnd: Date.parse('2026-07-12T00:00:00Z')},
                  identities: ['@ada'],
                  fetchPage
              });

        expect(sources.map(s => s.id).sort()).toEqual(['t-older', 't-newer'].sort());
        expect(coverage).toMatchObject({totalResolved: 2, exhausted: true, degraded: false})
    })
});
