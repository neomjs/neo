import {test, expect} from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs             from 'node:fs';
import path            from 'node:path';

// The Playwright unit runner executes with cwd = repo root, so resolve against it rather than
// __dirname arithmetic — the latter is brittle across nesting depth and git-worktree layouts.
const
    repoRoot   = process.cwd(),
    scriptPath = path.join(repoRoot, 'ai/scripts/diagnostics/check-retired-primitives.mjs');

/**
 * Runs the guard with a throwaway fixture file written under the real SEARCH_ROOT (`ai/`), then
 * cleans up. Returns the script's exit code + combined stdout/stderr. The fixture lives in a
 * dedicated directory so cleanup is a single recursive remove even if the assertion throws.
 *
 * @param {string} relFile Path (relative to repo root, under `ai/`) of the fixture file to write.
 * @param {string} content File contents that should trip exactly one guard category.
 * @returns {{exitCode:number, output:string}}
 */
function runWithFixture(relFile, content) {
    const
        fixtureFile = path.join(repoRoot, relFile),
        fixtureDir  = path.dirname(fixtureFile);

    let exitCode = 0,
        output   = '';

    try {
        fs.mkdirSync(fixtureDir, {recursive: true});
        fs.writeFileSync(fixtureFile, content);

        execFileSync('node', [scriptPath], {cwd: repoRoot, encoding: 'utf8'});
    } catch (err) {
        exitCode = err.status;
        output   = (err.stdout || '') + (err.stderr || '');
    } finally {
        fs.rmSync(fixtureDir, {recursive: true, force: true});
    }

    return {exitCode, output};
}

/**
 * @summary CI guard test for `check-retired-primitives.mjs`.
 *
 * Verifies the guard distinguishes a clean tree from each re-introduction category: retired module
 * import, retired per-MCP-server config flag (#12139), and retired MCP tool (#12139). Each negative
 * case writes a throwaway fixture under `ai/`, runs the guard as a subprocess, asserts the failure,
 * then cleans up — covering the falsifying input, not just the happy path.
 *
 * @see ai/scripts/diagnostics/check-retired-primitives.mjs
 */
// `describe.serial` is REQUIRED: the negative-case tests plant on-disk fixture files under `ai/`
// whose visibility would otherwise leak across Playwright's parallel workers (fullyParallel default).
// Without serial execution, the clean-tree PASS test + the JSDoc non-false-match test would race
// against another worker's planted fixture and see a transient retired primitive that isn't theirs.
test.describe.serial('check-retired-primitives CI guard', () => {
    test('exits 0 (PASS) on the current clean tree', () => {
        // The committed tree must be free of retired primitives, config flags, and MCP tools.
        const result = execFileSync('node', [scriptPath], {cwd: repoRoot, encoding: 'utf8'});
        expect(result).toContain('PASS');
    });

    test('exits 1 (FAIL) on a re-added retired-primitive import', () => {
        const {exitCode, output} = runWithFixture(
            'ai/__retired_primitive_fixture__/probe.mjs',
            "import {chunkPath} from '../shared/chunkPath.mjs';\n"
        );

        expect(exitCode).toBe(1);
        expect(output).toContain('FAIL');
        expect(output).toContain('retired-primitive import');
    });

    test('exits 1 (FAIL) on a re-added retired config flag in a config.template.mjs', () => {
        // autoStartInference is the canonical trap: config string-matched, logic never implemented.
        const {exitCode, output} = runWithFixture(
            'ai/__retired_config_fixture__/config.template.mjs',
            '        autoStartInference: leaf(false, "NEO_MEM_AUTO_START_INFERENCE", "boolean"),\n'
        );

        expect(exitCode).toBe(1);
        expect(output).toContain('FAIL');
        expect(output).toContain('retired config flag');
        expect(output).toContain('autoStartInference');
    });

    test('exits 1 (FAIL) on a re-added retired MCP-tool operationId in an openapi.yaml', () => {
        const {exitCode, output} = runWithFixture(
            'ai/__retired_tool_fixture__/openapi.yaml',
            '      operationId: manage_database\n'
        );

        expect(exitCode).toBe(1);
        expect(output).toContain('FAIL');
        expect(output).toContain('retired MCP tool');
    });

    test('does NOT false-match a config flag named in a JSDoc/comment line', () => {
        // A documentation mention (not an object-key declaration) must not trip the guard:
        // the config-flag pattern is anchored to line-start indentation, so ` * autoSync` and
        // `// autoSync` are ignored. This guards against over-eager removal of explanatory prose.
        const {exitCode} = runWithFixture(
            'ai/__retired_comment_fixture__/config.template.mjs',
            '            // autoSync was removed; the orchestrator owns kbSync now.\n'
        );

        expect(exitCode).toBe(0);
    });
});
