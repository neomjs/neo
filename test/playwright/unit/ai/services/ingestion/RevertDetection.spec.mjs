import {test, expect}                   from '@playwright/test';
import {parseRevertTrailer, isRevertOf} from '../../../../../../ai/services/ingestion/RevertDetection.mjs';

test.describe('ai/services/ingestion/RevertDetection', () => {
    test.describe('parseRevertTrailer', () => {
        test('extracts a single reverted SHA from the trailer', () => {
            expect(parseRevertTrailer('Revert "feat: x"\n\nThis reverts commit abc1234.')).toEqual(['abc1234']);
        });

        test('extracts a full 40-char SHA', () => {
            const sha = 'a'.repeat(40);
            expect(parseRevertTrailer(`This reverts commit ${sha}`)).toEqual([sha]);
        });

        test('extracts multiple reverted SHAs (revert of a range/merge)', () => {
            const msg = 'Revert batch\n\nThis reverts commit abc1234.\nThis reverts commit def5678.';
            expect(parseRevertTrailer(msg)).toEqual(['abc1234', 'def5678']);
        });

        test('lowercases SHAs', () => {
            expect(parseRevertTrailer('This reverts commit ABC1234.')).toEqual(['abc1234']);
        });

        test('returns [] for a non-revert message', () => {
            expect(parseRevertTrailer('feat: a normal commit (#1234)')).toEqual([]);
        });

        test('returns [] for empty / non-string input', () => {
            expect(parseRevertTrailer('')).toEqual([]);
            expect(parseRevertTrailer(null)).toEqual([]);
            expect(parseRevertTrailer(undefined)).toEqual([]);
        });

        test('does not false-match a mid-line mention (anchored to a clean trailer line)', () => {
            expect(parseRevertTrailer('note: This reverts commit abc1234 was discussed but not applied')).toEqual([]);
        });
    });

    test.describe('isRevertOf', () => {
        test('matches an abbreviated trailer SHA against a full target', () => {
            expect(isRevertOf('This reverts commit abc1234.', 'abc1234567890abcdef')).toBe(true);
        });

        test('matches a full trailer SHA against an abbreviated target', () => {
            expect(isRevertOf(`This reverts commit ${'a'.repeat(40)}`, 'aaaaaaa')).toBe(true);
        });

        test('false when the message reverts a different commit', () => {
            expect(isRevertOf('This reverts commit deadbeef.', 'abc1234')).toBe(false);
        });

        test('false for a non-revert message', () => {
            expect(isRevertOf('feat: x', 'abc1234')).toBe(false);
        });

        test('false for an empty target', () => {
            expect(isRevertOf('This reverts commit abc1234.', '')).toBe(false);
        });
    });
});
