import {test, expect}                       from '@playwright/test';
import {execFileSync}                       from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir}                             from 'node:os';
import path                                 from 'node:path';
import {extractComment, findTicketRefs}     from '../../../../../../buildScripts/util/check-ticket-archaeology.mjs';
import {getStagedAddedLines}                from '../../../../../../buildScripts/util/stagedDiff.mjs';

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
 * Real-git integration for the staged-mode diff-scope. Exercises the exact filter
 * composition main() runs in argv-files mode — findTicketRefs scoped to getStagedAddedLines —
 * against a real staged repo, without invoking the commander CLI (the tempDir has no node_modules).
 * Covers: refs scoped to staged-added lines, grandfathered refs on untouched lines NOT re-flagged,
 * a quoted filename (the shell-interpolation fail-open regression), and the null fail-closed path.
 */
test.describe('check-ticket-archaeology staged-mode diff-scope (#13717)', () => {
    let tempDir;

    const git = (...args) => execFileSync('git', args, {cwd: tempDir, stdio: 'ignore'});

    const stagedHits = (content, file) => {
        const added = getStagedAddedLines(file, tempDir);
        return findTicketRefs(content).filter(({line}) => !added || added.has(line));
    };

    test.beforeEach(() => {
        tempDir = mkdtempSync(path.join(tmpdir(), 'neo-archaeology-staged-'));
        git('init');
        git('config', 'user.email', 'test@example.com');
        git('config', 'user.name', 'Test User');
    });

    test.afterEach(() => {
        rmSync(tempDir, {recursive: true, force: true});
    });

    test('scopes a flagged ref to a staged-ADDED line', () => {
        const content = '// see #12345\nexport const a = 1;\n';
        writeFileSync(path.join(tempDir, 'src.mjs'), content);
        git('add', 'src.mjs');

        expect(stagedHits(content, 'src.mjs').map(h => h.line)).toEqual([1]);
    });

    test('does NOT flag a grandfathered ref on an untouched line', () => {
        const filePath = path.join(tempDir, 'src.mjs');
        writeFileSync(filePath, '// legacy ref #11111\nexport const a = 1;\n');
        git('add', 'src.mjs');
        git('commit', '-m', 'init');

        const content = '// legacy ref #11111\nexport const a = 1;\nexport const b = 2;\n';
        writeFileSync(filePath, content);
        git('add', 'src.mjs');

        // findTicketRefs still sees the legacy ref on line 1, but it is not a staged-added line → dropped.
        expect(findTicketRefs(content).map(h => h.line)).toEqual([1]);
        expect(stagedHits(content, 'src.mjs')).toEqual([]);
    });

    test('fails CLOSED on a quoted filename — execFileSync reads the diff so the added ref stays scoped in', () => {
        const name    = 'a"b.mjs';
        const content = '// added ref #12345\nexport const a = 1;\n';
        writeFileSync(path.join(tempDir, name), content);
        git('add', name);

        // The old shell-interpolated git command broke on the quote (empty diff → fail-open);
        // execFileSync (argv array) reads it correctly, so the added ref stays flagged.
        expect(stagedHits(content, name).map(h => h.line)).toEqual([1]);
    });

    test('fails CLOSED when detection is unavailable — null added-lines flags every finding', () => {
        const content = '// see #12345\nexport const a = 1;\n';
        const added   = getStagedAddedLines('nope.mjs', '/nonexistent-neo-dir');

        expect(added).toBeNull();
        expect(findTicketRefs(content).filter(({line}) => !added || added.has(line)).map(h => h.line)).toEqual([1]);
    });
});
