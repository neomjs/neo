import {test, expect}              from '@playwright/test';
import {chunkSession, estimateTokens} from '../../../../../../ai/services/graph/sessionChunker.mjs';

/**
 * Pure-function unit coverage for the deterministic session chunker (Sub 7 of the REM-pipeline epic).
 * No Neo bootstrap — the module is a pure helper, mirroring the queries.mjs / consumerFrictionHelper pattern.
 */
test.describe('ai/services/graph/sessionChunker', () => {
    // A 400-char turn estimates to 100 tokens at the 0.25 ratio; a 40-token limit forces chunking.
    const turn  = (label, chars) => `${label}:` + 'x'.repeat(Math.max(0, chars - label.length - 1));
    const TOKENS_PER_CHAR = 0.25;

    test.describe('estimateTokens', () => {
        test('is a deterministic char-based estimate (ceil of chars × 0.25)', () => {
            expect(estimateTokens('')).toBe(0);
            expect(estimateTokens('x'.repeat(400))).toBe(100);
            expect(estimateTokens('x'.repeat(401))).toBe(101); // ceil(100.25)
        });

        test('treats non-string input as zero tokens', () => {
            expect(estimateTokens(null)).toBe(0);
            expect(estimateTokens(undefined)).toBe(0);
            expect(estimateTokens(42)).toBe(0);
        });
    });

    test.describe('chunkSession — small-session fast path (AC8: preserve single-pass)', () => {
        test('returns a single un-chunked chunk when the session fits the limit', () => {
            const turns  = [turn('t0', 40), turn('t1', 40)]; // ~20 tokens total
            const result = chunkSession(turns, {sessionId: 'session:abc', safeProcessingLimitTokens: 1000});

            expect(result.chunked).toBe(false);
            expect(result.chunks.length).toBe(1);
            expect(result.chunks[0].chunkId).toBe('session:abc:chunk:0');
            expect(result.chunks[0].turnIndices).toEqual([0, 1]);
            expect(result.chunks[0].oversizedTurn).toBe(false);
        });

        test('no limit (non-positive / non-finite) → never chunks', () => {
            const turns = [turn('t0', 4000), turn('t1', 4000)];
            expect(chunkSession(turns, {sessionId: 's', safeProcessingLimitTokens: 0}).chunked).toBe(false);
            expect(chunkSession(turns, {sessionId: 's', safeProcessingLimitTokens: undefined}).chunked).toBe(false);
        });
    });

    test.describe('chunkSession — chunk activation (AC1) + boundaries (AC2)', () => {
        // Four 400-char turns = 100 tokens each; limit 250 → packs 2 turns/chunk (200 ≤ 250, +100 would be 300 > 250).
        const turns = [turn('t0', 400), turn('t1', 400), turn('t2', 400), turn('t3', 400)];

        test('activates chunking above threshold and keeps every chunk within the limit', () => {
            const {chunked, chunks} = chunkSession(turns, {sessionId: 'session:big', safeProcessingLimitTokens: 250});

            expect(chunked).toBe(true);
            expect(chunks.length).toBe(2);
            for (const chunk of chunks) {
                expect(chunk.estimatedTokens).toBeLessThanOrEqual(250);
            }
        });

        test('chunk ids are <sessionId>:chunk:<N>, zero-indexed and monotonic', () => {
            const {chunks} = chunkSession(turns, {sessionId: 'session:big', safeProcessingLimitTokens: 250});
            expect(chunks.map(c => c.chunkId)).toEqual(['session:big:chunk:0', 'session:big:chunk:1']);
        });

        test('boundaries are turn-aligned — turnIndices are contiguous and cover every turn exactly once (AC3 traceability)', () => {
            const {chunks} = chunkSession(turns, {sessionId: 'session:big', safeProcessingLimitTokens: 250});
            const covered  = chunks.flatMap(c => c.turnIndices);

            expect(covered).toEqual([0, 1, 2, 3]); // full coverage, in order, no duplicates, no mid-turn split
            expect(chunks[0].turnIndices).toEqual([0, 1]);
            expect(chunks[1].turnIndices).toEqual([2, 3]);
        });

        test('is deterministic — identical input yields byte-identical chunk shape across runs', () => {
            const a = chunkSession(turns, {sessionId: 'session:big', safeProcessingLimitTokens: 250});
            const b = chunkSession(turns, {sessionId: 'session:big', safeProcessingLimitTokens: 250});
            expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        });
    });

    test.describe('chunkSession — oversized single turn (Contract Ledger edge: keep intact, do not split)', () => {
        test('a turn larger than the limit becomes its own chunk flagged oversizedTurn', () => {
            const turns  = [turn('t0', 400), turn('huge', 4000), turn('t2', 400)]; // 100, 1000, 100 tokens; limit 250
            const {chunks} = chunkSession(turns, {sessionId: 'session:x', safeProcessingLimitTokens: 250});

            const oversized = chunks.find(c => c.oversizedTurn);
            expect(oversized).toBeTruthy();
            expect(oversized.turnIndices).toEqual([1]);             // the huge turn, intact, alone
            expect(oversized.estimatedTokens).toBeGreaterThan(250); // not split despite exceeding the limit

            // Full coverage preserved; neighbours are not merged into the oversized chunk.
            expect(chunks.flatMap(c => c.turnIndices).sort((a, b) => a - b)).toEqual([0, 1, 2]);
        });
    });

    test.describe('chunkSession — empty / defensive input', () => {
        test('empty turn list yields a single empty chunk (no throw)', () => {
            const result = chunkSession([], {sessionId: 'session:empty', safeProcessingLimitTokens: 250});
            expect(result.chunked).toBe(false);
            expect(result.chunks.length).toBe(1);
            expect(result.chunks[0].turnIndices).toEqual([]);
        });

        test('non-array turns input does not throw', () => {
            expect(() => chunkSession(null, {sessionId: 's', safeProcessingLimitTokens: 250})).not.toThrow();
        });
    });
});
