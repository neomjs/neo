import {test, expect}        from '@playwright/test';
import {execFileSync}        from 'node:child_process';
import fs                    from 'node:fs';
import path                  from 'node:path';
import {findDbPathMutations} from '../../../../../../buildScripts/util/check-aiconfig-test-mutation.mjs';

// The Playwright unit runner executes with cwd = repo root, so resolve against it rather than
// __dirname arithmetic — the latter is brittle across nesting depth and git-worktree layouts.
const
    repoRoot   = process.cwd(),
    scriptPath = path.join(repoRoot, 'ai/scripts/diagnostics/printAiConfig.mjs');

/**
 * Runs the CLI and captures exit code + combined output instead of throwing on non-zero exits.
 * @param {String[]} args CLI args forwarded to the script.
 * @returns {{exitCode: Number, output: String}}
 */
function run(args) {
    try {
        return {exitCode: 0, output: execFileSync('node', [scriptPath, ...args], {cwd: repoRoot, encoding: 'utf8'})}
    } catch (err) {
        return {exitCode: err.status, output: (err.stdout || '') + (err.stderr || '')}
    }
}

/**
 * @summary CLI contract test for `printAiConfig.mjs`.
 *
 * The tool exists to make "resolved at this head" config claims falsifiable in one command — a
 * recent test-isolation burndown rested on such a measurement, and its cross-family review had no
 * cheap way to reproduce it. These tests pin the resolution the test-isolation family cares about
 * (`storagePaths.graph` → `:memory:` under `UNIT_TEST_MODE`), the toggle visibility that prevents
 * misreading consumer-side selection as missing isolation, the failure shapes for bad input, and
 * the read-only property (the script never assigns to a config path — the mutation guard's own
 * concern, from the other side).
 */
test.describe('ai:config-print', () => {
    test('unit mode resolves the test-isolation surface — the burndown measurement in one command', () => {
        const {exitCode, output} = run(['--unit', 'storagePaths.graph']);

        expect(exitCode).toBe(0);
        expect(output).toContain('storagePaths.graph = :memory:')
    });

    test('default set prints the selector toggles alongside the value leaves', () => {
        const {exitCode, output} = run(['--unit']);

        expect(exitCode).toBe(0);
        // `database` stays `default_database` while ChromaManager selects `databaseTest` via the
        // toggle — printing values without toggles would misread that as missing isolation.
        expect(output).toContain('engines.chroma.database = default_database');
        expect(output).toContain('engines.chroma.useTestDatabase = true');
        expect(output).toContain('engines.chroma.useUnitTestDatabase = true');
        // Per-process randomized collection names under UNIT_TEST_MODE.
        expect(output).toMatch(/collections\.memory = test-memory-\d+-\w+/)
    });

    test('an unknown dot-path exits non-zero and names the path', () => {
        const {exitCode, output} = run(['--unit', 'does.not.exist']);

        expect(exitCode).toBe(1);
        expect(output).toContain('does.not.exist')
    });

    test('an unknown --server exits with a usage error listing the valid values', () => {
        const {exitCode, output} = run(['--server=bogus']);

        expect(exitCode).toBe(2);
        expect(output).toContain('memory-core');
        expect(output).toContain('knowledge-base');
        expect(output).toContain('neural-link')
    });

    test('the script is read-only against the config SSOT (the mutation guard from the other side)', () => {
        const source = fs.readFileSync(scriptPath, 'utf8');

        // Asserted with the SAME shape-based detector that guards test files against config-
        // singleton mutation — never a literal `aiConfig` text anchor, which silently stops
        // testing the day the local binding is renamed (AiConfig, myAiConfig, …). Honest bound:
        // a fully-renamed local with no `Config` in the identifier escapes BOTH shapes.
        expect(findDbPathMutations(source)).toEqual([])
    });
});
