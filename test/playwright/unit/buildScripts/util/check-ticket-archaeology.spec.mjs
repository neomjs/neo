import {test, expect}                                                                                     from '@playwright/test';
import {execFileSync, spawnSync}                                                                          from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync}                                                               from 'node:fs';
import {tmpdir}                                                                                           from 'node:os';
import path                                                                                               from 'node:path';
import {fileURLToPath}                                                                                    from 'node:url';
import {describeRead, extractComment, findTicketRefs, isInScopePath, DEFAULT_SCAN_PATHS, DEFAULT_IGNORES} from '../../../../../buildScripts/util/check-ticket-archaeology.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const GUARD     = path.join(REPO_ROOT, 'buildScripts/util/check-ticket-archaeology.mjs');

// CLI-invoked from REPO_ROOT (where node_modules resolves Commander), capturing exit code + combined output.
// Both streams, on both paths. The failure branch already merged them; the success branch returned
// stdout alone, so anything a PASSING run wrote to stderr was invisible to every arm here — and an
// unreadable input warns on stderr while still exiting 0.
const runGuard = (args, env = {}) => {
    const result = spawnSync('node', [GUARD, ...args], {cwd: REPO_ROOT, encoding: 'utf8', env: {...process.env, ...env}});

    return {code: result.status, stdout: `${result.stdout || ''}${result.stderr || ''}`};
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

    test('the typed marker covers a load-bearing ref; the bare one no longer does', () => {
        expect(findTicketRefs('// keep this ref — see #12345 [not-ticket-ref: pins a retired-primitive successor]'),
            'a typed marker on the ref token excuses a deliberate reference').toEqual([]);

        expect(findTicketRefs('// keep this ref — see #12345 ticket-ref-ok: pins a retired-primitive successor'),
            'the bare marker is retired: the published guard rejects it, so honouring it here is the divergence'
        ).toHaveLength(1)
    });

    /**
     * The typed escape exists because this guard and the published `neo-agent-skills` one disagreed
     * on the same line: the legacy bare marker on a hex colour passed here and failed there, so a
     * commit could clear the hook and red CI on a line it never touched.
     *
     * Both forms are asserted together on purpose. Accepting the typed one while dropping the bare
     * one would block every deliberate ref that has no typed equivalent upstream — a policy change,
     * not a lint repair — and asserting only the typed one would let that regress unnoticed.
     */
    /**
     * Colour syntax is enough on its own, which is what retires the annotation this guard used to
     * demand. The published guard carries the identical rule, so the two agree line for line; a bare
     * number in prose stays a ref, because nothing tells a six-digit colour from a six-digit ticket.
     */
    test('colour syntax and a leading zero excuse a number, and prose does not', () => {
        const comment = inner => `/**\n * ${inner}\n */`;

        expect(findTicketRefs(comment("backgroundColor_='#123456'")),
            'a quoted camelCase colour assignment needs no marker').toEqual([]);

        expect(findTicketRefs(comment('borderColor="#111111"')),
            'six digits with no leading zero and no letter: syntax is the only discriminator').toEqual([]);

        expect(findTicketRefs(comment('CSS color #123456 for the ring')),
            'the prose form of colour context counts too').toEqual([]);

        expect(findTicketRefs(comment('defaults to #000000')),
            'a leading zero is never a ticket, with or without colour syntax').toEqual([]);

        expect(findTicketRefs(comment('a bare #123456 in prose')),
            'CONTROL: without colour syntax the same number stays a ref').toHaveLength(1);

        expect(findTicketRefs(comment("issue='#9473' — see #16538")),
            'CONTROL: a quoted assignment that is not colour syntax launders nothing').toHaveLength(1);

        expect(findTicketRefs(comment("backgroundColor_='#123456' — and see #16538")),
            'CONTROL: an excused colour cannot hide a real ref on the same line').toHaveLength(1)
    });

    /**
     * A numeric HTML entity is `&` `#` digits `;`, and the digits are a codepoint. This guard's length
     * rule cannot see a two-digit entity, but it does see the four-digit em dash and right quote — the
     * pair a comment describing rendered markup carries most often — so the two guards disagreed about
     * the same line until both carried the exclusion.
     */
    test('a numeric HTML entity is a codepoint, and the exclusion hides nothing beside it', () => {
        const comment = inner => `/**\n * ${inner}\n */`;

        expect(findTicketRefs(comment('renders &#8212; between the columns')),
            'the em dash entity is not ticket 8212').toEqual([]);

        expect(findTicketRefs(comment('publishes as &#8217;beta&#8217;')),
            'two entities on one line read the same way').toEqual([]);

        expect(findTicketRefs(comment('see #16553 — it publishes as &#8212; here')),
            'an entity cannot hide a real ref beside it').toHaveLength(1);

        expect(findTicketRefs(comment('the hex form &#x27; needs no exemption')),
            'control: a hex entity never matched the length rule to begin with').toEqual([]);

        expect(findTicketRefs(comment('see #8212 for the entity work')),
            'control: the same digits without entity syntax stay a ticket').toHaveLength(1)
    });

    test('accepts the typed escape and the bare marker, and neither is a blanket bypass', () => {
        const comment = inner => `/**\n * ${inner}\n */`;

        // Both still pass, and after the colour-context rule they pass for two reasons rather than
        // one: the escape AND the syntax. They stay asserted so a consumer still carrying the marker
        // never reds, which is what lets the two engine escapes come out in a later commit instead of
        // this one.
        expect(findTicketRefs(comment("backgroundColor_='#000000' [not-ticket-ref: css-color]")),
            'a typed escape naming a known kind is accepted').toEqual([]);

        expect(findTicketRefs(comment("backgroundColor_='#000000' [NOT-TICKET-REF:css-color]")),
            'the typed escape is case-insensitive and tolerates a missing space').toEqual([]);

        expect(findTicketRefs(comment('@see #12345 [not-ticket-ref: load-bearing] — the ticket this implements')),
            'the typed marker covers a deliberate ref, which is what 0.1.6 added upstream').toEqual([]);

        expect(findTicketRefs(comment('@see #12345 — the ticket this implements ticket-ref-ok: load-bearing')),
            'the bare marker is retired here, because upstream rejects it').toHaveLength(1);

        expect(findTicketRefs(comment('@see #12345 [not-ticket-ref: ]')),
            'an empty reason declares nothing and fails closed, as upstream does').toHaveLength(1);

        // The three that must still fire. Without them this test would pass against a guard that
        // detects nothing at all, which is the failure an escape-only assertion cannot see.
        //
        // Their subjects changed with the colour-context rule: an annotated colour is now excused by
        // its own syntax, so a colour can no longer witness "the pattern still detects" or "an unknown
        // kind is not a bypass" — both would pass for a reason that has nothing to do with the escape.
        // A bare number in prose and a real ref carry those two jobs instead.
        expect(findTicketRefs(comment('a bare #123456 in prose')),
            'the pattern still detects: a colour-length number outside colour syntax is a ref').toHaveLength(1);

        expect(findTicketRefs(comment('@see #12345 — the ticket this implements')),
            'a real ref with no escape still fires').toHaveLength(1);

        // This arm asserted the opposite until 0.1.6. Its REASONING was right and its premise moved:
        // rejecting a free-reason marker was the safe side only while upstream had no typed
        // equivalent for a deliberate ref. Upstream now accepts one, so rejecting it here IS the
        // divergence the arm was defending against.
        expect(findTicketRefs(comment('@see #12345 [not-ticket-ref: whatever]')),
            'a free-text reason is accepted on a ref, matching neo-agent-skills 0.1.6').toEqual([])
    });

    /**
     * The typed escape excuses ONE annotated colour, not the line it sits on. A whole-line bypass
     * would have recreated the divergence this repair exists to close, pointed the other way: the
     * hook would fall silent where CI still flags. Both arms below were @neo-gpt's falsifiers against
     * exactly that, and both were red before the escape was scoped to its own token.
     */
    test('the typed escape excuses its own colour, not the whole line it sits on', () => {
        expect(findTicketRefs("const tag = '[not-ticket-ref: css-color]'; // #12345"),
            'a marker inside a STRING literal never reaches comment scope, so it cannot excuse a ref in the comment'
        ).toHaveLength(1);

        expect(findTicketRefs("// backgroundColor_='#000000' [not-ticket-ref: css-color]; see #12345"),
            'an unrelated ref sharing the line with an annotated colour stays visible'
        ).toHaveLength(1);

        // The other side of the same boundary: scoping must not stop the escape working at all.
        expect(findTicketRefs("// backgroundColor_='#000000' [not-ticket-ref: css-color]"),
            'an annotated colour alone is still excused'
        ).toEqual([]);

        expect(findTicketRefs('// ticket #12345 beside #16538 [not-ticket-ref: implementing ticket]'),
            'a ref marker excuses its own token only, never the row'
        ).toHaveLength(1);

        expect(findTicketRefs('// see #12345 and some words [not-ticket-ref: nope]'),
            'prose between the token and the marker breaks the binding: adjacency is what makes it a declaration'
        ).toHaveLength(1)
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
 * (the prior added-lines-only scope froze it). Plus the generated-data skip-flag (data-sync / GitHub Workflow sync).
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

test.describe('the receipt reports what was READ, not what was selected', () => {
    test('an unreadable selected file is never counted as read', () => {
        // Selection and IO diverge. A selected path that fails to open warns and is skipped; reporting
        // the SELECTED count as the scanned one is a green claim about a file nobody opened.
        expect(describeRead(0, 1)).toBe('0 file(s) read, 1 unreadable');
        expect(describeRead(7, 9)).toBe('7 file(s) read, 2 unreadable')
    });

    test('CONTROL: a fully-read run says nothing about unreadable files', () => {
        // Otherwise "names the unreadable count" is equally consistent with an always-present suffix,
        // which carries no information.
        expect(describeRead(3, 3)).toBe('3 file(s) read')
    });

    test('the CLI does not claim to have read a missing file', () => {
        // The reviewer falsifier, committed: previously `1 file(s) scanned, 0 violations`, exit 0.
        const {code, stdout} = runGuard(['src/doesNotExist17435.mjs']);

        expect(code).toBe(0);
        expect(stdout).toContain('could not read');
        expect(stdout).toContain('0 file(s) read, 1 unreadable')
    })
});
