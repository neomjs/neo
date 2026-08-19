import {test, expect} from '@playwright/test';
import {
    DEFAULT_BOUNDS,
    formatDensityWarning,
    isInScopePath,
    isProseLine,
    isTagLine,
    measureProseDensity,
    summarizeDensity
} from '../../../../buildScripts/util/check-comment-density.mjs';

/**
 * Two axes, warned on independently. The share axis has an author-controlled denominator — fixture
 * lines in the same commit dilute a long docblock below the bar — so the run axis exists to catch what
 * the share cannot see. Every commit named below was measured on this repo.
 */
test.describe('check-comment-density — share and run axes', () => {
    const measured = {
        // 62% share, the worst share observed in the sampled window.
        highShare: {file: 'a.mjs', added: 343, prose: 214, longestRun: 20},
        // 21% share with a 36-line run: under the share bar, operator change-requested for bloat.
        dilutedRun: {file: 'b.mjs', added: 316, prose: 69, longestRun: 36},
        // 20% share, 11-line run — at the repo median on both axes.
        clean: {file: 'c.mjs', added: 105, prose: 21, longestRun: 11}
    };

    test('the share axis warns high and stays silent at the median', () => {
        expect(summarizeDensity([measured.highShare]).shareExceeded).toBe(true);
        expect(summarizeDensity([measured.clean]).shareExceeded).toBe(false);
    });

    test('RED-PROOF: the run axis warns where the share axis provably cannot', () => {
        const summary = summarizeDensity([measured.dilutedRun]);

        expect(summary.shareExceeded, 'a 21% share is under the bar').toBe(false);
        expect(summary.runExceeded, 'a 36-line run must still warn').toBe(true);
        expect(summary.warn).toBe(true);
        expect(summary.worstFile).toBe('b.mjs');
    });

    test('SILENT ARM for the run axis, so a guard that warns on everything fails here', () => {
        const summary = summarizeDensity([measured.clean]);

        expect(summary.runExceeded).toBe(false);
        expect(summary.warn).toBe(false);
    });

    test('the run bar sits in the measured p90–p99 band, so a warning means unusual', () => {
        // p90 32, p99 64 across ai/services/**. A bar below p90 warns on ordinary files; above p99
        // warns on almost nothing.
        expect(DEFAULT_BOUNDS.maxProseRun).toBeGreaterThanOrEqual(32);
        expect(DEFAULT_BOUNDS.maxProseRun).toBeLessThan(64);
        expect(DEFAULT_BOUNDS.maxProseShare).toBeCloseTo(0.3);
    });

    test('a changed bound changes the outcome — the bars are inputs, not baked-in numbers', () => {
        expect(summarizeDensity([measured.dilutedRun], {maxProseRun: 100}).runExceeded).toBe(false);
        expect(summarizeDensity([measured.clean], {maxProseShare: 0.05}).shareExceeded).toBe(true);
    });

    test('partial bounds normalize onto the defaults rather than disabling an axis', () => {
        expect(summarizeDensity([measured.dilutedRun], {maxProseShare: 0.9}).runExceeded).toBe(true);
    });

    test('the run is a per-file maximum, never summed across files', () => {
        const summary = summarizeDensity([
            {file: 'x.mjs', added: 50, prose: 5, longestRun: 20},
            {file: 'y.mjs', added: 50, prose: 5, longestRun: 25}
        ]);

        expect(summary.longestRun).toBe(25);
        expect(summary.runExceeded).toBe(false);
    });

    test('an empty staged set never warns', () => {
        const summary = summarizeDensity([]);

        expect(summary).toMatchObject({added: 0, prose: 0, share: 0, longestRun: 0, warn: false});
    });
});

test.describe('check-comment-density — prose classification', () => {
    const added = lines => measureProseDensity(lines, new Set(lines.map((_, i) => i + 1)));

    test('a JSDoc tag line is contract, not prose', () => {
        expect(isTagLine(' * @param {String} x')).toBe(true);
        expect(isTagLine(' * @returns {Boolean}')).toBe(true);
        expect(isTagLine(' * an explanation')).toBe(false);

        // Tags break a run: a densely-typed signature must not read as one long block.
        expect(added(['/**', ' * prose', ' * @param {String} x', ' * prose', ' */']).longestRun).toBe(1);
        expect(isProseLine('*'), 'a `/**` opener extracts as `*` and is a delimiter, not prose').toBe(false);
        expect(isProseLine(' one'), 'a comment with a word is prose').toBe(true);
    });

    test('a comment marker inside a string literal is not prose', () => {
        expect(added(['const s = "// not a comment";']).prose).toBe(0);
        expect(added(['const u = "https://example.com";']).prose).toBe(0);
    });

    test('a block comment accumulates one run across its TEXT lines', () => {
        // The `/*` and `*/` delimiter lines carry no text, so they are not prose. Measuring text rather
        // than markers keeps a two-line docblock from scoring the same as a four-line one.
        expect(added(['/*', ' * one', ' * two', ' * three', ' */', 'code();']).longestRun).toBe(3);
        expect(added([' * orphan prose outside a block']).prose, 'not a comment without an opener').toBe(0);
    });

    test('an UNCHANGED line breaks the run — prose split by untouched code is not one block', () => {
        const lines  = ['// one', '// two', 'const untouched = 1;', '// three', '// four'];
        const result = measureProseDensity(lines, new Set([1, 2, 4, 5]));

        expect(result.added).toBe(4);
        expect(result.prose).toBe(4);
        expect(result.longestRun, 'the unchanged line must split the two pairs').toBe(2);
    });

    test('pre-existing prose is not counted as this commit\'s', () => {
        const lines  = ['// old', '// old', '// new'];
        const result = measureProseDensity(lines, new Set([3]));

        expect(result.added).toBe(1);
        expect(result.prose).toBe(1);
        expect(result.longestRun).toBe(1);
    });
});

test.describe('check-comment-density — scope and output', () => {
    test('measures source and specs, ignores everything else', () => {
        expect(isInScopePath('ai/services/x.mjs')).toBe(true);
        expect(isInScopePath('src/core/Base.mjs')).toBe(true);
        expect(isInScopePath('test/playwright/unit/x.spec.mjs')).toBe(true);
        expect(isInScopePath('learn/guide.md')).toBe(false);
        expect(isInScopePath('ai/config.json')).toBe(false);
        // A checker exempt from its own rule is not a rule.
        expect(isInScopePath('buildScripts/util/x.mjs')).toBe(true);
    });

    test('the warning prints both raw numbers, never only a verdict', () => {
        const text = formatDensityWarning(summarizeDensity([{file: 'b.mjs', added: 316, prose: 69, longestRun: 36}]));

        expect(text).toContain('69 of 316');
        expect(text).toContain('longest contiguous run 36');
        expect(text).toContain('bar 34');
        expect(text).toContain('b.mjs');
    });
});
