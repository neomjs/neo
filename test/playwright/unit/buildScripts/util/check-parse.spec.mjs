import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    scriptPath = path.resolve(__dirname, '../../../../../buildScripts/util/check-parse.mjs');

/**
 * check-parse.mjs — the commit-time syntax gate (`node --check` each staged `.mjs`). It is the durable
 * backstop for mechanical rewrites whose output ships un-run: `check-block-alignment --fix` runs after the
 * author's local test pass, so a destructuring-with-defaults edge case erased valid JS into a
 * SyntaxError that was green locally and only red in CI (every importing spec threw). A parse gate catches
 * every such break regardless of the source that produced it.
 */
test.describe('check-parse.mjs (#15072)', () => {
    let tempDir;

    test.beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-check-parse-'));
    });

    test.afterEach(() => {
        fs.rmSync(tempDir, {recursive: true, force: true});
    });

    const write = (name, content) => {
        const filePath = path.join(tempDir, name);
        fs.writeFileSync(filePath, content, 'utf8');
        return filePath;
    };

    // execFileSync (not execSync): node is spawned directly with an argv array — no shell, so the absolute
    // scriptPath + file args can never be interpolated into a shell command (CodeQL-clean).
    const run = (...args) => {
        try {
            return {status: 0, output: execFileSync('node', [scriptPath, ...args], {encoding: 'utf8', stdio: 'pipe'})};
        } catch (error) {
            return {status: error.status, output: (error.stderr || '') + (error.stdout || '')};
        }
    };

    test('passes (exit 0) when every staged .mjs parses', () => {
        const file = write('ok.mjs', 'export const answer = 42;\n');
        expect(run(file).status).toBe(0);
    });

    test('fails (exit 1) and names the file + SyntaxError when a staged .mjs no longer parses', () => {
        // The exact aligner-corruption shape: a multi-declarator const mis-split at the default `=` inside
        // the destructuring pattern, leaving an unterminated `{` — a plain SyntaxError.
        const file             = write('broken.mjs', 'const {blockedNodes = focusContradiction,\n      focusReasons  = [1];\n');
        const {status, output} = run(file);

        expect(status).toBe(1);
        expect(output).toContain('no longer parse');
        expect(output).toContain('broken.mjs');
        expect(output).toContain('SyntaxError');
    });

    test('a mixed batch fails on the one broken file and reports only it', () => {
        const
            good             = write('good.mjs', 'const a = 1, bb = 2;\n'),
            broken           = write('broken.mjs', 'const {x = ;\n'),
            {status, output} = run(good, broken);

        expect(status).toBe(1);
        expect(output).toContain('broken.mjs');
        expect(output).not.toContain('good.mjs');   // clean files are never listed
    });

    test('non-.mjs paths are ignored — a broken .js never fails the gate', () => {
        // lint-staged globs this gate to *.mjs; a stray non-.mjs arg must be a no-op, never a false block.
        const file = write('broken.js', 'const {x = ;\n');
        expect(run(file).status).toBe(0);
    });

    test('no .mjs files in scope is a clean no-op (exit 0)', () => {
        expect(run().status).toBe(0);
    });
});
