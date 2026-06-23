import {test, expect}                 from '@playwright/test';
import {chunkSession, estimateTokens} from '../../../../../../ai/services/graph/sessionChunker.mjs';

/**
 * Pure-function unit coverage for the deterministic session chunker (Sub 7 of the REM-pipeline epic).
 * No Neo bootstrap — the module is a pure helper, mirroring the queries.mjs / consumerFrictionHelper pattern.
 */
test.describe('ai/services/graph/sessionChunker', () => {
    // A 300-char turn estimates to 100 tokens at the conservative 1/3 ratio; a 40-token limit forces chunking.
    const turn  = (label, chars) => `${label}:` + 'x'.repeat(Math.max(0, chars - label.length - 1));

    test.describe('estimateTokens', () => {
        test('is a deterministic conservative char-based estimate (ceil of chars / 3)', () => {
            expect(estimateTokens('')).toBe(0);
            expect(estimateTokens('x'.repeat(300))).toBe(100);
            expect(estimateTokens('x'.repeat(301))).toBe(101); // ceil(100.333...)
        });

        test('treats non-string input as zero tokens', () => {
            expect(estimateTokens(null)).toBe(0);
            expect(estimateTokens(undefined)).toBe(0);
            expect(estimateTokens(42)).toBe(0);
        });

        test('estimates incident-shaped dense payloads above the 100k safe band (#13918)', () => {
            expect(estimateTokens('x'.repeat(400000))).toBe(133334);
            expect(estimateTokens('x'.repeat(400000))).toBeGreaterThan(100000);
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
        // Four 300-char turns = 100 tokens each; limit 250 → packs 2 turns/chunk (~201 ≤ 250, +100 would be > 250).
        const turns = [turn('t0', 300), turn('t1', 300), turn('t2', 300), turn('t3', 300)];

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
            const covered = chunks.flatMap(c => c.turnIndices);

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
            const turns = [turn('t0', 300), turn('huge', 3000), turn('t2', 300)]; // 100, 1000, 100 tokens; limit 250
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

    test.describe('chunkSession — emitted-text boundedness (#13514 review: join separators counted)', () => {
        test('boundary-tight input: no chunk reports under-limit while its emitted text estimates over-limit', () => {
            // GPT falsifier: ['aaaa','aaaa'] @ limit 2 — the per-turn sum was 2 (under), but the joined
            // text (aaaa + newline + aaaa = 9 chars) estimates 3 (over). The bound must reflect the emitted text.
            const {chunked, chunks} = chunkSession(['aaaa', 'aaaa'], {sessionId: 's', safeProcessingLimitTokens: 2});

            expect(chunked).toBe(true);
            for (const chunk of chunks) {
                expect(chunk.estimatedTokens).toBe(estimateTokens(chunk.text)); // reported === actual emitted-text estimate
                expect(estimateTokens(chunk.text)).toBeLessThanOrEqual(2);      // and within the limit
            }
        });

        test('every chunk reports estimatedTokens === estimate(text); non-oversized chunks stay within the limit', () => {
            const turns = Array.from({length: 7}, (_, i) => `turn${i}:` + 'y'.repeat(300)); // ~102 tokens each
            const limit = 200;
            const {chunks} = chunkSession(turns, {sessionId: 'inv', safeProcessingLimitTokens: limit});

            for (const chunk of chunks) {
                expect(chunk.estimatedTokens).toBe(estimateTokens(chunk.text));
                if (!chunk.oversizedTurn) {
                    expect(chunk.estimatedTokens).toBeLessThanOrEqual(limit);
                }
            }
        });
    });
});
