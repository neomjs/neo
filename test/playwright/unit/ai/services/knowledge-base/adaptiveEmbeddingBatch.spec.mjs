import {expect, test}                               from '@playwright/test';
import {embedWithAdaptiveBatch, isEmbeddingTimeout} from '../../../../../../ai/services/knowledge-base/helpers/adaptiveEmbeddingBatch.mjs';

/**
 * A retry that changes nothing cannot succeed. Measured on a client plane 2026-08-11: one batch
 * exceeded a 30-minute provider deadline and was retried four more times at the identical size —
 * ~2.5h of continuous work on a single-slot provider for a request that could never complete.
 */
const timeout = () => new Error('knowledge base tenant ingestion embedding timed out after 1800000ms');

/** Provider that times out above `capacity` texts and otherwise returns one vector per text. */
const providerWithCapacity = (capacity, calls = []) => texts => {
    calls.push(texts.length);
    if (texts.length > capacity) return Promise.reject(timeout());
    return Promise.resolve(texts.map(t => [t.length]))
};

test.describe('embedWithAdaptiveBatch — a timeout is evidence about SIZE (#16972)', () => {
    test('NON-VACUITY — a batch that fits is embedded in ONE call, never pre-split', () => {
        // Without this arm an implementation that always split into singles would pass every arm
        // below while multiplying provider calls on the happy path — the defect inverted.
        const calls = [];

        return embedWithAdaptiveBatch({texts: ['a', 'bb', 'ccc'], embed: providerWithCapacity(50, calls)})
            .then(out => {
                expect(calls).toEqual([3]);
                expect(out).toEqual([[1], [2], [3]]);
            });
    });

    test('the production shape: a 50-chunk batch against a provider that only fits 6', async () => {
        // The exact measured configuration — batchSize 50, a provider that times out well below it.
        const calls = [],
              texts = Array.from({length: 50}, (_, i) => 'x'.repeat(i + 1)),
              out   = await embedWithAdaptiveBatch({texts, embed: providerWithCapacity(6, calls)});

        expect(out).toHaveLength(50);
        // Halving converges rather than repeating: 50 -> 25 -> 12 -> 6, then 6-wide slices.
        expect(calls.slice(0, 4)).toEqual([50, 25, 12, 6]);
        // And it NEVER re-attempts a size already proven too large.
        expect(Math.max(...calls.slice(4))).toBeLessThanOrEqual(6);
    });

    test('embeddings come back in INPUT order across every split', async () => {
        // A split binds vectors to ids by position downstream, so an out-of-order result would
        // silently attach each vector to its neighbour's chunk with no length mismatch to catch it.
        const texts = ['a', 'bb', 'ccc', 'dddd', 'eeeee'],
              out   = await embedWithAdaptiveBatch({texts, embed: providerWithCapacity(2)});

        expect(out).toEqual([[1], [2], [3], [4], [5]]);
    });

    test('work already paid for is NOT re-bought when a later slice times out', async () => {
        // First slice succeeds, then the provider degrades. The completed embeddings must survive.
        let   call = 0;
        const seen = [];

        const out = await embedWithAdaptiveBatch({
            texts: ['a', 'bb', 'cc', 'dd'],
            embed: texts => {
                seen.push(texts.length);
                call++;
                // Slice 1 (2 wide) ok; next 2-wide attempt times out once, then 1-wide succeeds.
                if (call === 2 && texts.length === 2) return Promise.reject(timeout());
                if (texts.length > 2) return Promise.reject(timeout());
                return Promise.resolve(texts.map(t => [t.length]))
            }
        });

        expect(out).toHaveLength(4);
        // The first two never appear in a later call — they were not re-embedded.
        expect(seen.filter(n => n === 4)).toHaveLength(1);
    });

    test('a NON-timeout error throws immediately — it says nothing about size', async () => {
        // Splitting on a credential or dimension fault would multiply calls while changing nothing.
        const calls = [];

        await expect(embedWithAdaptiveBatch({
            texts: ['a', 'b', 'c', 'd'],
            embed: texts => {calls.push(texts.length); return Promise.reject(new Error('401 invalid api key'))}
        })).rejects.toThrow('401');

        expect(calls).toEqual([4]);
    });

    test('a SINGLE text that still times out fails honestly rather than looping', async () => {
        const calls = [];

        await expect(embedWithAdaptiveBatch({
            texts: ['only'],
            embed: texts => {calls.push(texts.length); return Promise.reject(timeout())}
        })).rejects.toThrow('timed out');

        expect(calls).toEqual([1]);
    });

    test('onSplit reports the shrink so an operator sees the provider ceiling', async () => {
        const splits = [];

        await embedWithAdaptiveBatch({
            texts  : Array.from({length: 8}, (_, i) => `t${i}`),
            embed  : providerWithCapacity(2),
            onSplit: s => splits.push(s)
        });

        expect(splits[0]).toEqual({attempted: 8, next: 4, depth: 1});
        expect(splits[1]).toEqual({attempted: 4, next: 2, depth: 2});
    });

    test('isEmbeddingTimeout matches deadline errors and rejects unrelated ones', () => {
        expect(isEmbeddingTimeout(timeout())).toBe(true);
        expect(isEmbeddingTimeout(Object.assign(new Error('aborted'), {name: 'AbortError'}))).toBe(true);
        expect(isEmbeddingTimeout(new Error('deadline exceeded'))).toBe(true);
        expect(isEmbeddingTimeout(new Error('401 invalid api key'))).toBe(false);
        expect(isEmbeddingTimeout(new Error('dimension mismatch: 4096 vs 768'))).toBe(false);
        expect(isEmbeddingTimeout(null)).toBe(false);
    });
});
