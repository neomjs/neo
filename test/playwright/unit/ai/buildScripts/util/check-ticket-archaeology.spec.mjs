import {test, expect}                    from '@playwright/test';
import {extractComment, filterToAddedLines, findTicketRefs, parseAddedLines} from '../../../../../../buildScripts/util/check-ticket-archaeology.mjs';

/**
 * Self-test for the ticket-archaeology guard: the mechanical replacement for the discipline-only
 * "no decay-prone ticket refs in durable comments" rule. Verifies it flags comment/JSDoc refs,
 * exempts load-bearing string-literal anchors, and honors the inline escape marker.
 */
test.describe('check-ticket-archaeology guard', () => {
    test('flags a numeric ticket ref inside a JSDoc block comment', () => {
        const hits = findTicketRefs([
            '/**',
            ' * Resolves #12345 by reshaping the owner clause.',
            ' */',
            'const x = 1;'
        ].join('\n'));

        expect(hits).toEqual([{line: 2, text: '* Resolves #12345 by reshaping the owner clause.'}])
    });

    test('flags a ref in a full-line // comment and a trailing // comment', () => {
        const full = findTicketRefs('// see #12345 for context\nconst a = 1;');
        expect(full.map(h => h.line)).toEqual([1]);

        const trailing = findTicketRefs('const b = 2; // added in #12345');
        expect(trailing.map(h => h.line)).toEqual([1])
    });

    test('does NOT flag a ticket ref inside a string literal (load-bearing test.describe anchor)', () => {
        const hits = findTicketRefs([
            '/** behavior-only summary */',
            "test.describe('Dockerized KB retrieval (#11645)', () => {});",
            "const url = 'https://github.com/neomjs/neo/issues/12345';"
        ].join('\n'));

        expect(hits).toEqual([])
    });

    test('honors the inline escape marker on a genuinely load-bearing line', () => {
        const hits = findTicketRefs('// keep this ref — see #12345 ticket-ref-ok: pins a retired-primitive successor');

        expect(hits).toEqual([])
    });

    test('flags the named Epic / Discussion / ADR prose forms in comments', () => {
        const hits = findTicketRefs([
            '// part of Epic #11624',
            '// graduated from Discussion #10137',
            '// aligned-with ADR-0003'
        ].join('\n'));

        expect(hits.map(h => h.line)).toEqual([1, 2, 3])
    });

    test('does NOT flag a 6-hex-with-letters color or a markdown-style "# 12345" heading in a comment', () => {
        const hits = findTicketRefs([
            '// fallback color #1234ff for the badge',
            '// # 12345 (spaced — markdown-style, not a ticket ref)'
        ].join('\n'));

        expect(hits).toEqual([])
    });

    test('closes block-comment state so post-block code lines are not treated as comments', () => {
        // Regression guard: a `* /`-closed block must reset state.inBlock so a later string-literal
        // line is not mis-scanned as comment context.
        const state = {inBlock: false};
        extractComment('/** opens */', state);
        expect(state.inBlock).toBe(false)
    });
});

/**
 * Diff-aware scoping: the per-commit (lint-staged) path scans only lines a commit ADDS, so a clean diff
 * is never blocked by pre-existing legacy refs in untouched regions — while NEW refs in the staged diff
 * still hard-block. The no-args sweep keeps full-file scanning (covered by the guard suite above).
 */
test.describe('check-ticket-archaeology diff-aware scoping (#12609)', () => {
    test('parseAddedLines maps + lines to their new-file line numbers', () => {
        const diff = [
            'diff --git a/x.mjs b/x.mjs',
            '--- a/x.mjs',
            '+++ b/x.mjs',
            '@@ -4,0 +5,2 @@',
            '+// added line 5 — see #12345',
            '+const y = 2;'
        ].join('\n');

        expect([...parseAddedLines(diff)]).toEqual([5, 6])
    });

    test('parseAddedLines counts only + lines; - lines do not advance the new-side counter', () => {
        const diff = [
            '@@ -5,2 +5,3 @@',
            '-const old = 1;',
            '-const gone = 2;',
            '+const a = 1;',
            '+const b = 2;',
            '+const c = 3;'
        ].join('\n');

        expect([...parseAddedLines(diff)]).toEqual([5, 6, 7])
    });

    test('parseAddedLines returns an empty set for a pure deletion and for an empty diff', () => {
        const deletion = ['@@ -5,2 +4,0 @@', '-const a = 1;', '-const b = 2;'].join('\n');

        expect(parseAddedLines(deletion).size).toBe(0);
        expect(parseAddedLines('').size).toBe(0)
    });

    test('parseAddedLines unions multiple hunks', () => {
        const diff = [
            '@@ -1,0 +2,1 @@',
            '+const a = 1;',
            '@@ -10,0 +12,2 @@',
            '+const b = 2;',
            '+const c = 3;'
        ].join('\n');

        expect([...parseAddedLines(diff)].sort((a, b) => a - b)).toEqual([2, 12, 13])
    });

    test('filterToAddedLines keeps only hits on added lines, empties on empty set, and falls back on null', () => {
        const hits = [{line: 2, text: 'legacy'}, {line: 9, text: 'fresh'}];

        // Only the newly-added line 9 is retained — line 2 is a pre-existing legacy ref.
        expect(filterToAddedLines(hits, new Set([9]))).toEqual([{line: 9, text: 'fresh'}]);
        // Empty added-set → nothing blocked.
        expect(filterToAddedLines(hits, new Set())).toEqual([]);
        // null (git unavailable) → safe full-file fallback, every hit returned.
        expect(filterToAddedLines(hits, null)).toEqual(hits)
    });

    test('end-to-end: a legacy ref in an untouched region is not flagged; a newly-added ref is', () => {
        const content = [
            '// legacy ref from an old commit — see #11111',
            'const stable = 1;',
            '// freshly added this commit — see #22222'
        ].join('\n');

        const hits  = findTicketRefs(content), // full scan finds both comment refs
              added = new Set([3]);            // only line 3 is in the staged diff

        expect(hits.map(h => h.line)).toEqual([1, 3]);
        expect(filterToAddedLines(hits, added).map(h => h.line)).toEqual([3])
    });
});
