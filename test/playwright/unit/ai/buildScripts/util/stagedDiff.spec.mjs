import {test, expect}                         from '@playwright/test';
import {getStagedAddedLines, parseAddedLines} from '../../../../../../buildScripts/util/stagedDiff.mjs';

test.describe('buildScripts/util/stagedDiff.parseAddedLines (#13717)', () => {
    test('returns an empty set for empty diff text', () => {
        expect([...parseAddedLines('')]).toEqual([]);
    });

    test('single-line add (count omitted → defaults to 1)', () => {
        expect([...parseAddedLines('@@ -0,0 +5 @@\n+new line')].sort((a, b) => a - b)).toEqual([5]);
    });

    test('multi-line add range', () => {
        expect([...parseAddedLines('@@ -10,0 +11,3 @@\n+a\n+b\n+c')].sort((a, b) => a - b)).toEqual([11, 12, 13]);
    });

    test('multiple hunks union their added lines', () => {
        const diff = '@@ -1,0 +2,1 @@\n+x\n@@ -20,0 +30,2 @@\n+y\n+z';
        expect([...parseAddedLines(diff)].sort((a, b) => a - b)).toEqual([2, 30, 31]);
    });

    test('pure-deletion hunk (+c,0) adds nothing', () => {
        expect([...parseAddedLines('@@ -5,2 +4,0 @@\n-gone\n-gone2')]).toEqual([]);
    });
});

test.describe('buildScripts/util/stagedDiff.getStagedAddedLines (#13717)', () => {
    test('returns null (not an empty set) on git failure so the caller falls back to whole-file', () => {
        // A non-repo cwd makes `git diff` fail; null is the fail-closed signal (detection unavailable),
        // which the archaeology filter treats as "flag all findings" rather than suppressing them.
        expect(getStagedAddedLines('any.mjs', '/nonexistent-neo-archaeology-dir')).toBeNull();
    });
});
