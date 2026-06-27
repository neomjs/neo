import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    computeCorpusFingerprint,
    selectResumableChunks,
    decideResume
} from '../../../../../../../ai/services/knowledge-base/helpers/resumableEmbedding.mjs';

const chunks = ids => ids.map(id => ({id, text: `body-${id}`}));

test.describe('computeCorpusFingerprint — resume-shadow validity key', () => {
    test('is deterministic + order-independent for the same corpus', () => {
        const a = computeCorpusFingerprint(chunks(['c1', 'c2', 'c3'])),
              b = computeCorpusFingerprint(chunks(['c3', 'c1', 'c2'])); // reordered

        expect(a).toBe(b);
        expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    test('changes when the corpus drifts (a chunk added or removed)', () => {
        const base    = computeCorpusFingerprint(chunks(['c1', 'c2', 'c3'])),
              added   = computeCorpusFingerprint(chunks(['c1', 'c2', 'c3', 'c4'])),
              removed = computeCorpusFingerprint(chunks(['c1', 'c2']));

        expect(added).not.toBe(base);
        expect(removed).not.toBe(base);
    });

    test('ignores duplicates + non-string ids', () => {
        const a = computeCorpusFingerprint([{id: 'c1'}, {id: 'c1'}, {id: 'c2'}, {id: null}, {}]),
              b = computeCorpusFingerprint(chunks(['c1', 'c2']));

        expect(a).toBe(b);
    });
});

test.describe('selectResumableChunks — the resume-skip', () => {
    test('a fresh run (no existing ids) returns every chunk', () => {
        const result = selectResumableChunks({chunks: chunks(['c1', 'c2', 'c3'])});

        expect(result.remaining.map(c => c.id)).toEqual(['c1', 'c2', 'c3']);
        expect(result.alreadyEmbedded).toBe(0);
    });

    test('skips chunks already embedded in the resume-shadow', () => {
        const result = selectResumableChunks({
            chunks     : chunks(['c1', 'c2', 'c3', 'c4']),
            existingIds: new Set(['c1', 'c2']) // already done last run
        });

        expect(result.remaining.map(c => c.id)).toEqual(['c3', 'c4']);
        expect(result.alreadyEmbedded).toBe(2);
    });

    test('accepts an array of existing ids', () => {
        const result = selectResumableChunks({chunks: chunks(['c1', 'c2']), existingIds: ['c1']});

        expect(result.remaining.map(c => c.id)).toEqual(['c2']);
        expect(result.alreadyEmbedded).toBe(1);
    });
});

test.describe('decideResume — resume vs clean-rebuild gate', () => {
    const FP = 'fingerprint-abc';

    test('no preserved resume-shadow → rebuild fresh', () => {
        expect(decideResume({resumeState: null, currentFingerprint: FP}))
            .toMatchObject({resume: false, reason: 'no-resume-shadow', attempts: 1});
    });

    test('corpus drifted (fingerprint mismatch) → rebuild fresh (never resume a stale corpus)', () => {
        expect(decideResume({resumeState: {fingerprint: 'old-fp', attempts: 1}, currentFingerprint: FP}))
            .toMatchObject({resume: false, reason: 'corpus-drift'});
    });

    test('fingerprint matches + under the cap → resume, incrementing the attempt', () => {
        expect(decideResume({resumeState: {fingerprint: FP, attempts: 1}, currentFingerprint: FP, maxAttempts: 3}))
            .toMatchObject({resume: true, reason: 'fingerprint-match', attempts: 2});
    });

    test('attempt cap exhausted → forced clean rebuild (a persistent failure cannot resume forever)', () => {
        expect(decideResume({resumeState: {fingerprint: FP, attempts: 3}, currentFingerprint: FP, maxAttempts: 3}))
            .toMatchObject({resume: false, reason: 'attempt-cap-exhausted', attempts: 1});
    });
});
