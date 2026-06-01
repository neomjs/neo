import {test, expect}                    from '@playwright/test';
import {extractComment, findTicketRefs}  from '../../../../../../buildScripts/util/check-ticket-archaeology.mjs';

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
