import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    scriptPath = path.resolve(__dirname, '../../../../../../buildScripts/util/check-block-alignment.mjs');

/**
 * check-block-alignment.mjs — the lint that mechanizes Neo's import-`from` alignment so it is
 * never hand-counted. Coverage is constructed WITHOUT any hand-aligned fixture (the exact error class
 * this gate removes): the misaligned input is trivial to write, the aligned form is DERIVED via `--fix`,
 * and the false-positive guards use ungrouped inputs that pass regardless of spacing.
 */
test.describe('check-block-alignment.mjs (#13556)', () => {
    let tempDir;

    test.beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-block-align-'));
    });

    test.afterEach(() => {
        fs.rmSync(tempDir, {recursive: true, force: true});
    });

    const write = (name, content) => {
        const filePath = path.join(tempDir, name);
        fs.writeFileSync(filePath, content, 'utf8');
        return filePath;
    };

    // execFileSync (not execSync): node is spawned directly with an argv array — no shell, so the
    // absolute scriptPath + file args can never be interpolated into a shell command (CodeQL-clean).
    const run = (...args) => {
        try {
            return {status: 0, output: execFileSync('node', [scriptPath, ...args], {encoding: 'utf8', stdio: 'pipe'})};
        } catch (error) {
            return {status: error.status, output: (error.stderr || '') + (error.stdout || '')};
        }
    };

    const MISALIGNED = [
        "import {a}        from './a.mjs';",
        "import {bb, ccc} from './b.mjs';",
        "import x          from './x.mjs';"
    ].join('\n');

    test('flags a misaligned import-from group with a file:line + expected-column diagnostic (exit 1)', () => {
        const file             = write('m.mjs', MISALIGNED);
        const {status, output} = run(file);

        expect(status).toBe(1);
        expect(output).toContain('Misaligned import');
        expect(output).toMatch(/m\.mjs:1/);
        expect(output).toMatch(/expected 'from' at column \d+/);
    });

    test('--fix aligns the group to one shared from-column and is idempotent', () => {
        const file = write('m.mjs', MISALIGNED);

        expect(run('--fix', file).status).toBe(0);

        const
            fixedLines = fs.readFileSync(file, 'utf8').split('\n').filter(line => line.startsWith('import')),
            fromCols   = fixedLines.map(line => line.indexOf('from'));

        expect(new Set(fromCols).size).toBe(1);        // every 'from' shares one column
        expect(run(file).status).toBe(0);              // re-check passes — aligned file is clean
        expect(run('--fix', file).status).toBe(0);   // idempotent — a second --fix changes nothing harmful
    });

    test('a lone single import is not a group — passes regardless of its spacing', () => {
        const file = write('m.mjs', "import {something}        from './x.mjs';\n\nconst y = 1;\n");
        expect(run(file).status).toBe(0);
    });

    test('multi-line imports break the run and are never aligned (no false positive)', () => {
        const file = write('m.mjs', [
            "import {",
            "    alpha,",
            "    beta",
            "} from './ab.mjs';",
            "import x from './x.mjs';"
        ].join('\n'));
        expect(run(file).status).toBe(0);
    });

    test('a file that cannot be processed fails (exit 1) even under --fix — no silent exit 0', () => {
        // Guards the cycle-1 review bug: --fix swallowed a file-processing error and exited 0, masking a
        // repair that never happened. An unprocessable (missing) file must fail in BOTH modes.
        const missing = path.join(tempDir, 'does-not-exist.mjs');

        const fixResult = run('--fix', missing);
        expect(fixResult.status).toBe(1);
        expect(fixResult.output).toContain('Error processing');

        expect(run(missing).status).toBe(1); // check mode also fails
    });
});
