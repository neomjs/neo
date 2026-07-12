import {test, expect}                        from '@playwright/test';
import {enumerateChronologicalWindowSources} from '../../../../../../ai/services/memory-core/helpers/chronologicalWindowSources.mjs';

// simple half-open window [1000, 2000) in epoch-ms; item timestamps are plain ms for clarity
const WINDOW = {windowStart: 1000, windowEnd: 2000};

// a per-identity paginator: pagesByIdentity[identity] is an ordered [{items, nextCursor}] list.
// cursor is the page index; undefined → page 0, each page names its own nextCursor (next index or null).
const pager = (pagesByIdentity, onFetch) => async ({identity, cursor}) => {
    onFetch?.({identity, cursor});
    const pages = pagesByIdentity[identity] || [];
    return pages[cursor === undefined ? 0 : cursor] || {items: [], nextCursor: null}
};

test.describe('chronologicalWindowSources — the recency-exhaustion completeness spine', () => {
    test('single identity, one exhausted page, all in-window → complete coverage', async () => {
        const {sources, coverage} = await enumerateChronologicalWindowSources({
            window    : WINDOW,
            identities: ['@a'],
            fetchPage : pager({'@a': [{items: [{id: 's1', timestamp: 1500}], nextCursor: null}]})
        });

        expect(sources.map(s => s.id)).toEqual(['s1']);
        expect(coverage).toMatchObject({totalResolved: 1, identitiesWalked: 1, exhausted: true, degraded: false, degradedReason: null})
    });

    test('walks nextCursor to exhaustion across multiple pages', async () => {
        const {sources, coverage} = await enumerateChronologicalWindowSources({
            window    : WINDOW,
            identities: ['@a'],
            fetchPage : pager({'@a': [
                {items: [{id: 's1', timestamp: 1800}], nextCursor: 1},
                {items: [{id: 's2', timestamp: 1200}], nextCursor: null}
            ]})
        });

        expect(sources.map(s => s.id).sort()).toEqual(['s1', 's2']);
        expect(coverage.exhausted).toBe(true)
    });

    test('early-stops once a page predates the window start — no over-paging', async () => {
        let fetches = 0;

        const {sources, coverage} = await enumerateChronologicalWindowSources({
            window    : WINDOW,
            identities: ['@a'],
            fetchPage : pager({'@a': [
                // this page already contains an item older than windowStart(1000) → the walk must STOP here
                {items: [{id: 's1', timestamp: 1500}, {id: 'old', timestamp: 500}], nextCursor: 1},
                {items: [{id: 'should-not-be-fetched', timestamp: 1400}], nextCursor: null}
            ]}, () => { fetches++ })
        });

        expect(sources.map(s => s.id)).toEqual(['s1']);   // 500 is out of window; the second page is never walked
        expect(fetches).toBe(1);
        expect(coverage.exhausted).toBe(true)
    });

    test('filters half-open: an item at exactly windowEnd is excluded (too new), one at windowStart is included', async () => {
        const {sources} = await enumerateChronologicalWindowSources({
            window    : WINDOW,
            identities: ['@a'],
            fetchPage : pager({'@a': [{items: [
                {id: 'too-new', timestamp: 2000},   // == windowEnd → excluded (half-open)
                {id: 'edge',    timestamp: 1000},   // == windowStart → included
                {id: 'mid',     timestamp: 1500}
            ], nextCursor: null}]})
        });

        expect(sources.map(s => s.id).sort()).toEqual(['edge', 'mid'])
    });

    test('unified: walks every identity and cross-agent de-duplicates by id', async () => {
        const {sources, coverage} = await enumerateChronologicalWindowSources({
            window    : WINDOW,
            identities: ['@a', '@b'],
            fetchPage : pager({
                '@a': [{items: [{id: 'shared', timestamp: 1500}],                              nextCursor: null}],
                '@b': [{items: [{id: 'shared', timestamp: 1500}, {id: 'b1', timestamp: 1600}], nextCursor: null}]
            })
        });

        expect(sources.map(s => s.id).sort()).toEqual(['b1', 'shared']);   // 'shared' counted once
        expect(coverage).toMatchObject({totalResolved: 2, identitiesWalked: 2, exhausted: true, degraded: false})
    });

    test('a page-fetch failure degrades (never throws) and preserves the sources it did enumerate', async () => {
        const {sources, coverage} = await enumerateChronologicalWindowSources({
            window    : WINDOW,
            identities: ['@a', '@b'],
            fetchPage : async ({identity}) => {
                if (identity === '@b') throw new Error('cursor lost');
                return {items: [{id: 'a1', timestamp: 1500}], nextCursor: null}
            }
        });

        expect(sources.map(s => s.id)).toEqual(['a1']);       // @a's sources survive
        expect(coverage.exhausted).toBe(false);
        expect(coverage.degraded).toBe(true);
        expect(coverage.degradedReason).toMatch(/chronological-walk-incomplete: @b: cursor lost/)
    });

    test('a runaway page cap degrades with a page-cap reason (never spins forever)', async () => {
        const {coverage} = await enumerateChronologicalWindowSources({
            window             : WINDOW,
            identities         : ['@a'],
            maxPagesPerIdentity: 2,
            // every page stays in-window and always has a nextCursor → only the cap ends it
            fetchPage          : async () => ({items: [{id: `s-${Math.random()}`, timestamp: 1500}], nextCursor: 'more'})
        });

        expect(coverage.exhausted).toBe(false);
        expect(coverage.degraded).toBe(true);
        expect(coverage.degradedReason).toMatch(/page-cap/)
    });

    test('fails loud on a missing window, fetchPage, or identities', async () => {
        const ok = pager({'@a': []});

        await expect(enumerateChronologicalWindowSources({identities: ['@a'], fetchPage: ok})).rejects.toThrow(/window/);
        await expect(enumerateChronologicalWindowSources({window: WINDOW, identities: ['@a']})).rejects.toThrow(/fetchPage/);
        await expect(enumerateChronologicalWindowSources({window: WINDOW, identities: [], fetchPage: ok})).rejects.toThrow(/identity/)
    })
});
