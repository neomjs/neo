import {test, expect} from '@playwright/test';
import {spawnSync}    from 'node:child_process';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';

import {
    AT_IMPORT_PATTERN, collectReport, PER_FILE_LIMIT_BYTES, resolveLoadedSize
} from '../../../../buildScripts/util/check-substrate-size.mjs';

/**
 * The guard exists because a substrate breach is SILENT: past the limit the tail of `AGENTS.md` is
 * truncated and every seat loses the bottom of its own rules with nothing reporting it. So the arms
 * that matter are the ones where a wrong implementation still looks green — a symlink measured as
 * its own 12-byte path string, an import stub measured as its own ~25 bytes, a renamed import
 * quietly dropped from the total.
 *
 * Sizes are the real ones from the near-miss this guard exists to catch (`AGENTS.md` 24,380 B,
 * `NOW.md` 1,586 B) so the fixture reproduces the incident's arithmetic rather than a convenient toy.
 */

const
    AGENTS_BYTES = 24380,
    NOW_BYTES    = 1586,
    // '@../AGENTS.md\n@../NOW.md\n' — the stub's own bytes, which the seat also reads.
    STUB_BYTES   = 25;

/**
 * Builds a throwaway substrate tree and returns its realpath.
 *
 * The root is realpath-resolved because `os.tmpdir()` is itself a symlink on macOS
 * (`/var` → `/private/var`); leaving it unresolved would make reported member paths relative to a
 * directory the resolved files are not actually under.
 *
 * @param {String} claudeShape Either `'symlink'` (today's tree) or `'imports'` (the near-miss shape).
 * @returns {String} Absolute realpath of the fixture root.
 */
function buildTree(claudeShape) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'substrate-size-')));

    fs.mkdirSync(path.join(root, '.agents'));
    fs.mkdirSync(path.join(root, '.claude'));

    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'A'.repeat(AGENTS_BYTES));
    fs.writeFileSync(path.join(root, 'NOW.md'),    'N'.repeat(NOW_BYTES));
    fs.writeFileSync(path.join(root, '.agents/ANTIGRAVITY_RULES.md'), 'R'.repeat(100));

    claudeShape === 'symlink' ?
        fs.symlinkSync('../AGENTS.md', path.join(root, '.claude/CLAUDE.md')) :
        fs.writeFileSync(path.join(root, '.claude/CLAUDE.md'), '@../AGENTS.md\n@../NOW.md\n');

    return root
}

const claudeRow = rows => rows.find(row => row.file === '.claude/CLAUDE.md');

test.describe('check-substrate-size — the two entry-point shapes', () => {
    test('CONTROL: the symlink tree passes, measured as the TARGET and not as the link', () => {
        const row = claudeRow(collectReport({root: buildTree('symlink')}));

        // The whole point: `lstat` on this symlink reports 12 — the length of '../AGENTS.md'. A
        // guard reporting 12 passes every conceivable substrate and is worse than no guard.
        expect(row.bytes).toBe(AGENTS_BYTES);
        expect(row.bytes).not.toBe('../AGENTS.md'.length);
        expect(row.over).toBe(false);
        expect(row.error).toBeNull();
        expect(row.headroom).toBe(PER_FILE_LIMIT_BYTES - AGENTS_BYTES)
    });

    test('the PR #17156 near-miss FAILS: two @-imports are summed as one loaded unit', () => {
        const row = claudeRow(collectReport({root: buildTree('imports')}));

        // 24,380 + 1,586 + the stub's own 25. Pinned as a literal: a summing regression that drops
        // a member or forgets the importer's own bytes must not be able to still land on it.
        expect(row.bytes).toBe(AGENTS_BYTES + NOW_BYTES + STUB_BYTES);
        expect(row.bytes).toBe(25991);
        expect(row.over).toBe(true);
        expect(row.headroom).toBe(PER_FILE_LIMIT_BYTES - 25991);
        expect(row.members).toEqual(['AGENTS.md', 'NOW.md'])
    });

    test('the same tree differs ONLY in that shape — so the shape is what the guard caught', () => {
        // Non-vacuity: both arms above must not be passing for some unrelated fixture difference.
        const symlink = claudeRow(collectReport({root: buildTree('symlink')})),
              imports = claudeRow(collectReport({root: buildTree('imports')}));

        expect(symlink.over).toBe(false);
        expect(imports.over).toBe(true);
        expect(imports.bytes - symlink.bytes).toBe(NOW_BYTES + STUB_BYTES)
    })
});

test.describe('check-substrate-size — fails closed', () => {
    test('an import naming a file that does not exist is an ERROR, never a skipped member', () => {
        const root = buildTree('imports');

        // The rename case: a budget that silently drops a missing member measures a fiction, and
        // the fiction is always SMALLER — so it passes.
        fs.rmSync(path.join(root, 'NOW.md'));

        const row = claudeRow(collectReport({root}));

        expect(row.error).toContain("imports '../NOW.md', which does not exist");
        expect(row.bytes).toBeNull();
        expect(row.over).toBe(false)
    });

    test('a missing target file is an ERROR row, not an absent row that reads as a pass', () => {
        const root = buildTree('symlink');

        fs.rmSync(path.join(root, '.agents/ANTIGRAVITY_RULES.md'));

        const rows = collectReport({root}),
              row  = rows.find(entry => entry.file === '.agents/ANTIGRAVITY_RULES.md');

        expect(rows).toHaveLength(3);
        expect(row.error).toBe('Required substrate file .agents/ANTIGRAVITY_RULES.md not found.')
    })
});

test.describe('check-substrate-size — resolution mechanics', () => {
    test('imports recurse, because an imported file may import further', () => {
        const root = buildTree('imports');

        fs.writeFileSync(path.join(root, 'NOW.md'), '@./DEEP.md\n');
        fs.writeFileSync(path.join(root, 'DEEP.md'), 'D'.repeat(500));

        const {bytes, members} = resolveLoadedSize('.claude/CLAUDE.md', {root});

        expect(members).toEqual(['AGENTS.md', 'NOW.md', 'DEEP.md']);
        expect(bytes).toBe(AGENTS_BYTES + 11 + 500 + STUB_BYTES)
    });

    test('a file reachable twice is paid for once, and a cycle terminates', () => {
        const root = buildTree('imports');

        // Both the stub (as '../AGENTS.md' from .claude/) and NOW.md (as './AGENTS.md' from the
        // root) import the same file by different paths; the loader reads it once.
        fs.writeFileSync(path.join(root, 'NOW.md'), '@./AGENTS.md\n');

        const {bytes} = resolveLoadedSize('.claude/CLAUDE.md', {root});

        // '@./AGENTS.md\n' is 13 bytes, and AGENTS.md itself is counted ONCE despite two referents —
        // the cycle guard keys on realpath, so the two spellings collapse to one identity.
        expect(bytes).toBe(AGENTS_BYTES + 13 + STUB_BYTES);
        expect(bytes).toBeLessThan(2 * AGENTS_BYTES);

        // A self-import must not recurse forever.
        fs.writeFileSync(path.join(root, 'NOW.md'), '@./NOW.md\n');
        expect(() => resolveLoadedSize('.claude/CLAUDE.md', {root})).not.toThrow()
    });

    test('only a whole-line @path is an import — a mid-prose @handle is prose', () => {
        expect('@../AGENTS.md'.match(AT_IMPORT_PATTERN)[1]).toBe('../AGENTS.md');
        expect('hand off to @tobiu (human operator)').toMatch(/@tobiu/);
        expect('hand off to @tobiu (human operator)'.match(AT_IMPORT_PATTERN)).toBeNull();
        expect('**No `<noreply@*>` footers.**'.match(AT_IMPORT_PATTERN)).toBeNull()
    })
});

/**
 * The executable boundary — the one the workflow actually trusts.
 *
 * Everything above imports `collectReport` and `resolveLoadedSize` and drives them with fixture
 * roots. That covers the measurement and nothing else: `main()`, its exit code, the headroom line,
 * `REPO_ROOT`'s derivation, and the entrypoint guard were all unreached, so the CI step could stop
 * enforcing anything while every assertion stayed green. Raised by @neo-gpt in review.
 *
 * **How the fixture reaches `REPO_ROOT` without a CLI flag.** The script derives
 * `REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')`, so a COPY placed at
 * `<fixture>/buildScripts/util/check-substrate-size.mjs` measures `<fixture>`. That is why the copy
 * exists rather than a `--root` option: adding one would create a public CLI contract purely to make
 * the code testable, and it would test the flag instead of the derivation. Every run below also uses
 * a foreign `cwd`, so a regression of `REPO_ROOT` to `process.cwd()` reds these arms.
 *
 * The script imports only node builtins, so a copy is a faithful executable.
 */
test.describe('check-substrate-size — the process boundary', () => {
    const SCRIPT_REL = 'buildScripts/util/check-substrate-size.mjs';

    let scratch = [];

    test.afterAll(() => {
        scratch.forEach(dir => fs.rmSync(dir, {force: true, recursive: true}));
        scratch = []
    });

    /**
     * @summary Builds a runnable fixture repo: a copy of the real script over a substrate tree.
     * @param {Object} [options]
     * @param {Boolean} [options.over=false] Push AGENTS.md past the limit.
     * @param {Boolean} [options.danglingImport=false] Point CLAUDE.md at a file that is not there.
     * @param {Boolean} [options.missingTarget=false] Omit a required substrate file entirely.
     * @returns {String} Absolute fixture root.
     */
    function buildRunnableRepo({over = false, danglingImport = false, missingTarget = false} = {}) {
        const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'substrate-exec-')));

        scratch.push(root);

        fs.mkdirSync(path.join(root, '.agents'));
        fs.mkdirSync(path.join(root, '.claude'));
        fs.mkdirSync(path.join(root, 'buildScripts/util'), {recursive: true});
        fs.copyFileSync(path.resolve(process.cwd(), SCRIPT_REL), path.join(root, SCRIPT_REL));

        fs.writeFileSync(path.join(root, 'AGENTS.md'), 'A'.repeat(over ? PER_FILE_LIMIT_BYTES + 1 : 100));
        fs.writeFileSync(path.join(root, '.agents/ANTIGRAVITY_RULES.md'), 'R'.repeat(100));

        if (!missingTarget) {
            fs.writeFileSync(
                path.join(root, '.claude/CLAUDE.md'),
                danglingImport ? '@../NOT_THERE.md\n' : '@../AGENTS.md\n'
            )
        }

        return root
    }

    /**
     * @summary Runs the fixture's script as a real process from a foreign cwd.
     * @param {String} root Fixture root.
     * @param {Object} [options]
     * @param {String[]} [options.nodeArgs=[]] Extra node flags, e.g. `--preserve-symlinks-main`.
     * @param {String} [options.entry] Path to invoke instead of the script itself (a symlink).
     * @returns {{code: Number, output: String}}
     */
    function run(root, {nodeArgs = [], entry} = {}) {
        const result = spawnSync(
            process.execPath,
            [...nodeArgs, entry ?? path.join(root, SCRIPT_REL)],
            // A foreign cwd on purpose: os.tmpdir() holds no substrate, so anything resolving its
            // root from process.cwd() reports three missing targets instead of measuring the fixture.
            {cwd: os.tmpdir(), encoding: 'utf8'}
        );

        return {code: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}`}
    }

    test('CONTROL: an under-limit tree exits 0 and reports headroom', () => {
        const {code, output} = run(buildRunnableRepo());

        expect(code, `expected a clean exit, got:\n${output}`).toBe(0);
        expect(output).toContain('PASSED');

        // The headroom line is the guard's actual product — the drift is gradual, so the margin is
        // the signal. Losing it while still exiting 0 would be a silent downgrade to pass/fail.
        expect(output, 'the headroom line disappeared from the report').toMatch(/headroom \d+ bytes/);

        // Proof the foreign cwd did not decide the measurement: a process.cwd() root finds nothing.
        expect(output).not.toContain('not found')
    });

    test('an over-limit file exits 1', () => {
        const {code, output} = run(buildRunnableRepo({over: true}));

        expect(code).toBe(1);
        expect(output).toContain('EXCEEDS');
        expect(output).toMatch(/OVER by \d+ bytes/)
    });

    test('an import naming a file that is not there exits 1', () => {
        // `row.error`, not `row.over`. A main() that only checked `over` would exit 0 here while the
        // substrate was unmeasurable — the failure mode is not "too big", it is "we do not know".
        const {code, output} = run(buildRunnableRepo({danglingImport: true}));

        expect(code).toBe(1);
        expect(output).toContain('Error')
    });

    test('a missing required target exits 1', () => {
        const {code, output} = run(buildRunnableRepo({missingTarget: true}));

        expect(code).toBe(1);
        expect(output).toContain('not found')
    });

    /**
     * @summary Symlinks the fixture's script beside itself and returns the link path.
     *
     * Beside, not elsewhere, and that placement is the experiment rather than convenience. Under
     * `--preserve-symlinks-main` node keeps the LINK path in `import.meta.url`, and `REPO_ROOT` is
     * derived from that path — so a link parked in a different directory would move the measured
     * root as well as exercise the guard, and a failure could not be attributed to either. Keeping
     * the link at the same depth holds `REPO_ROOT` fixed so the node flag is the only variable.
     * @param {String} root
     * @param {String} name
     * @returns {String} Absolute link path.
     */
    function linkBesideScript(root, name) {
        const link = path.join(root, 'buildScripts/util', name);

        fs.symlinkSync(path.join(root, SCRIPT_REL), link);

        return link
    }

    test('reached through a SYMLINK the guard still fires', () => {
        const
            root = buildRunnableRepo({over: true}),
            link = linkBesideScript(root, 'via-link.mjs');

        const {code, output} = run(root, {entry: link});

        // Exit 0 here would NOT mean "passed" — it would mean main() never ran. That is the whole
        // hazard: a guard that stops guarding reports success.
        expect(code, `the guard did not fire through the symlink:\n${output}`).toBe(1);
        expect(output).toContain('EXCEEDS')
    });

    test('under --preserve-symlinks-main the guard STILL fires', () => {
        // The arm the one-sided realpath let through. With this flag node keeps the LINK path in
        // import.meta.url while argv[1] still resolves, so realpathing only argv[1] made the two
        // operands disagree and the process exited 0 with the substrate unchecked. Canonicalizing
        // both is what closes it. Found by @neo-gpt in review.
        const
            root = buildRunnableRepo({over: true}),
            link = linkBesideScript(root, 'via-preserve.mjs');

        const {code, output} = run(root, {entry: link, nodeArgs: ['--preserve-symlinks-main']});

        expect(code, `silent exit 0 — the entrypoint guard did not invoke main():\n${output}`).toBe(1);
        expect(output).toContain('EXCEEDS')
    })
});
