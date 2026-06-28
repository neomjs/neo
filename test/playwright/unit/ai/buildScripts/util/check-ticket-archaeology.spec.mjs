import {test, expect}                                                                       from '@playwright/test';
import {execFileSync}                                                                       from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync}                                                 from 'node:fs';
import {tmpdir}                                                                             from 'node:os';
import path                                                                                 from 'node:path';
import {fileURLToPath}                                                                      from 'node:url';
import {extractComment, findTicketRefs, isInScopePath, DEFAULT_SCAN_PATHS, DEFAULT_IGNORES} from '../../../../../../buildScripts/util/check-ticket-archaeology.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../../..');
const GUARD     = path.join(REPO_ROOT, 'buildScripts/util/check-ticket-archaeology.mjs');

// CLI-invoked from REPO_ROOT (where node_modules resolves Commander), capturing exit code + combined output.
const runGuard = (args, env = {}) => {
    try {
        const stdout = execFileSync('node', [GUARD, ...args], {cwd: REPO_ROOT, encoding: 'utf8', env: {...process.env, ...env}});
        return {code: 0, stdout};
    } catch (e) {
        return {code: e.status, stdout: `${e.stdout || ''}${e.stderr || ''}`};
    }
};

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
        const state = {inBlock: false};
        extractComment('/** opens */', state);
        expect(state.inBlock).toBe(false)
    });
});

/**
 * Boy-scout whole-touched-file behavior: the guard scans each passed file in FULL — touching a
 * file obligates cleaning ALL its ticket-archaeology, not just the author's added lines (operator-directed,
 * exactly like check-block-alignment). This reduces the grandfathered backlog as files are naturally touched
 * (the prior added-lines-only scope froze it). Plus the generated-data skip-flag (data-sync / sync_all).
 *
 * CLI-invoked from REPO_ROOT against an isolated temp file, so the real argv-mode path — including the
 * whole-file scan + the skip gate — is exercised end-to-end.
 */
test.describe('check-ticket-archaeology whole-touched-file + skip (#14279)', () => {
    let tempDir, probe;

    test.beforeEach(() => {
        tempDir = mkdtempSync(path.join(tmpdir(), 'neo-archaeology-boyscout-'));
        probe   = path.join(tempDir, 'probe.mjs');
        // The ref sits on a line the author did NOT add this change — boy-scout must still flag it.
        writeFileSync(probe, '// grandfathered ref #11111\nexport const a = 1;\nexport const b = 2;\n');
    });

    test.afterEach(() => rmSync(tempDir, {recursive: true, force: true}));

    test('flags a ref on ANY line of a touched file (whole-file, not added-lines)', () => {
        const {code, stdout} = runGuard([probe]);
        expect(code).toBe(1);
        expect(stdout).toContain('#11111');
    });

    test('--skip bypasses the gate (generated-data class)', () => {
        const {code, stdout} = runGuard(['--skip', probe]);
        expect(code).toBe(0);
        expect(stdout).toContain('skipped');
    });

    test('NEO_SKIP_TICKET_ARCHAEOLOGY=1 bypasses the gate', () => {
        const {code} = runGuard([probe], {NEO_SKIP_TICKET_ARCHAEOLOGY: '1'});
        expect(code).toBe(0);
    });
});

/**
 * Base-mode scope selection: isInScopePath is the in-scope contract the `--base` CI selection applies to
 * each changed path. The guard script lives outside the ai/src/test-playwright roots, so it must be listed
 * explicitly in DEFAULT_SCAN_PATHS — otherwise a PR touching the guard triggers the lint workflow but the
 * scan selects 0 files and greens vacuously (the gap this covers). Pure predicate → no live git diff needed.
 */
test.describe('check-ticket-archaeology --base scope selection (#14279)', () => {
    test('selects the guard script itself — it triggers the lint workflow, so it must self-scan', () => {
        expect(isInScopePath('buildScripts/util/check-ticket-archaeology.mjs', DEFAULT_SCAN_PATHS, DEFAULT_IGNORES)).toBe(true)
    });

    test('selects in-scope ai / src / test-playwright .mjs files', () => {
        expect(isInScopePath('ai/services/foo.mjs', DEFAULT_SCAN_PATHS, DEFAULT_IGNORES)).toBe(true);
        expect(isInScopePath('src/core/Base.mjs', DEFAULT_SCAN_PATHS, DEFAULT_IGNORES)).toBe(true);
        expect(isInScopePath('test/playwright/unit/x.spec.mjs', DEFAULT_SCAN_PATHS, DEFAULT_IGNORES)).toBe(true)
    });

    test('rejects non-.mjs, out-of-scope dirs, a buildScripts sibling, and ignored fragments', () => {
        expect(isInScopePath('buildScripts/util/check-ticket-archaeology.yml', DEFAULT_SCAN_PATHS, DEFAULT_IGNORES)).toBe(false);
        expect(isInScopePath('buildScripts/util/other-guard.mjs', DEFAULT_SCAN_PATHS, DEFAULT_IGNORES)).toBe(false);
        expect(isInScopePath('apps/portal/foo.mjs', DEFAULT_SCAN_PATHS, DEFAULT_IGNORES)).toBe(false);
        expect(isInScopePath('test/unit/legacy.mjs', DEFAULT_SCAN_PATHS, DEFAULT_IGNORES)).toBe(false);
        expect(isInScopePath('ai/node_modules/dep.mjs', DEFAULT_SCAN_PATHS, DEFAULT_IGNORES)).toBe(false)
    });
});

/**
 * CLI parser contract: the guard parses argv with Commander (a declared dependency), so an invalid
 * invocation must fail loudly rather than silently changing the scanned set or base ref. These cover the
 * fail-loud paths (unknown option, missing option value) plus the accepted forms (=value, space value,
 * boolean flag, positional file).
 */
test.describe('check-ticket-archaeology CLI parser contract (#14279)', () => {
    let tempDir, probe;

    test.beforeEach(() => {
        tempDir = mkdtempSync(path.join(tmpdir(), 'neo-archaeology-parser-'));
        probe   = path.join(tempDir, 'probe.mjs');
        writeFileSync(probe, '// ref #11111\nexport const a = 1;\n');
    });

    test.afterEach(() => rmSync(tempDir, {recursive: true, force: true}));

    test('fails loudly on an unknown option (not swallowed as a positional file path)', () => {
        const {code, stdout} = runGuard(['--bogus']);
        expect(code).not.toBe(0);
        expect(stdout.toLowerCase()).toContain('unknown option');
    });

    test('fails loudly on a missing value for --base / --dirs / --ignore', () => {
        for (const flag of ['--base', '--dirs', '--ignore']) {
            const {code, stdout} = runGuard([flag]);
            expect(code, `${flag} with no value must error`).not.toBe(0);
            expect(stdout.toLowerCase()).toContain('argument missing');
        }
    });

    test('accepts --dirs=<value> (equals form) and honors it', () => {
        const {code, stdout} = runGuard([`--dirs=${tempDir}`]);
        expect(code).toBe(1);
        expect(stdout).toContain('#11111');
    });

    test('accepts --dirs <value> (space-separated form)', () => {
        const {code, stdout} = runGuard(['--dirs', tempDir]);
        expect(code).toBe(1);
        expect(stdout).toContain('#11111');
    });

    test('accepts the -q boolean flag (suppresses the per-violation listing)', () => {
        const {code, stdout} = runGuard(['-q', '--dirs', tempDir]);
        expect(code).toBe(1);
        expect(stdout).toContain('decay-prone');
        expect(stdout).not.toContain('probe.mjs:');
    });

    test('accepts a positional file path', () => {
        const {code, stdout} = runGuard([probe]);
        expect(code).toBe(1);
        expect(stdout).toContain('#11111');
    });
});
