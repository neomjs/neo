import {test, expect}           from '@playwright/test';
import {makeSemanticEnrichment} from '../../../../../../ai/services/memory-core/helpers/semanticEnrichment.mjs';

test.describe('semanticEnrichment — best-effort theme evidence, never the coverage backbone', () => {
    test('maps queryMemories results to themes tagged type:"memory" and passes query + nResults', async () => {
        const calls  = [],
              enrich = makeSemanticEnrichment({
                  nResults     : 25,
                  queryMemories: async args => {
                      calls.push(args);
                      return {query: args.query, count: 1, results: [{id: 'm1', document: 'a decision', distance: 0.1}]}
                  }
              });

        const result = await enrich({query: 'notable decisions and friction'});

        expect(result).toEqual({
            themes  : [{id: 'm1', document: 'a decision', distance: 0.1, type: 'memory'}],
            degraded: false,
            reason  : null
        });
        expect(calls[0]).toEqual({query: 'notable decisions and friction', nResults: 25})
    });

    test('a thrown queryMemories degrades ENRICHMENT ONLY — empty themes, its own reason, never a throw', async () => {
        const enrich = makeSemanticEnrichment({queryMemories: async () => { throw new Error('chroma down') }}),
              result = await enrich({query: 'themes'});

        expect(result.themes).toEqual([]);
        expect(result.degraded).toBe(true);
        expect(result.reason).toMatch(/^enrichment-failed: chroma down/)
    });

    test('an error-envelope return degrades enrichment only', async () => {
        const enrich = makeSemanticEnrichment({queryMemories: async () => ({error: 'Invalid minTrustTier'})}),
              result = await enrich({query: 'themes'});

        expect(result.themes).toEqual([]);
        expect(result.degraded).toBe(true);
        expect(result.reason).toMatch(/^enrichment-error: Invalid minTrustTier/)
    });

    test('a missing/empty query returns no themes with a no-query reason (never calls the search)', async () => {
        let   called = 0;
        const enrich = makeSemanticEnrichment({queryMemories: async () => { called++; return {results: []} }});

        expect(await enrich({})).toEqual({themes: [], degraded: true, reason: 'no-query'});
        expect(await enrich({query: ''})).toEqual({themes: [], degraded: true, reason: 'no-query'});
        expect(called).toBe(0)
    });

    test('an empty result set is a clean (non-degraded) enrichment — the search ran, found nothing', async () => {
        const enrich = makeSemanticEnrichment({queryMemories: async () => ({results: []})});

        expect(await enrich({query: 'themes'})).toEqual({themes: [], degraded: false, reason: null})
    });

    test('the injected queryMemories is required', () => {
        expect(() => makeSemanticEnrichment({})).toThrow(/queryMemories/)
    });

    test('window-binds themes: out-of-window and unverifiable-timestamp records are dropped', async () => {
        const enrich = makeSemanticEnrichment({
            queryMemories: async () => ({results: [
                {id: 'in',   timestamp: '2026-07-10T12:00:00Z', document: 'in-window theme'},
                {id: 'out',  timestamp: '2026-01-01T00:00:00Z', document: 'out-of-window theme'},
                {id: 'none', document: 'no timestamp — cannot be proven in-window'}
            ]})
        });

        const {themes} = await enrich({
            query      : 'themes',
            windowStart: Date.parse('2026-07-08T00:00:00Z'),
            windowEnd  : Date.parse('2026-07-12T00:00:00Z')
        });

        expect(themes.map(t => t.id)).toEqual(['in'])
    })
});
