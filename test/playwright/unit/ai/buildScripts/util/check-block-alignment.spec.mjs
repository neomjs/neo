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
 * check-block-alignment.mjs — the lint that mechanizes Neo's block alignment (import-`from`,
 * object-literal colons, `=` declaration blocks) so it is never hand-counted. Coverage is constructed
 * WITHOUT any hand-aligned fixture (the exact error class
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

    test.describe('v1b: object-colon + `=` alignment (#13563)', () => {
        test('--fix aligns an object-literal colon block to one column and is idempotent', () => {
            const file = write('o.mjs', [
                'const config = {',
                '    db: 1,',
                '    state: 2,',
                '    intervals: 3',
                '};'
            ].join('\n'));

            expect(run('--fix', file).status).toBe(0);

            const colonCols = fs.readFileSync(file, 'utf8').split('\n')
                .filter(line => /^\s+\w+\s*:/.test(line))
                .map(line => line.indexOf(':'));

            expect(colonCols.length).toBe(3);
            expect(new Set(colonCols).size).toBe(1);     // db/state/intervals colons share one column
            expect(run(file).status).toBe(0);            // aligned → clean
            expect(run('--fix', file).status).toBe(0);   // idempotent
        });

        test('a shorthand property stays in the run without breaking colon alignment', () => {
            const file = write('o.mjs', [
                'const config = {',
                '    db: 1,',
                '    now,',
                '    intervals: 3',
                '};'
            ].join('\n'));

            expect(run('--fix', file).status).toBe(0);

            const lines          = fs.readFileSync(file, 'utf8').split('\n');
            const dbColon        = lines.find(line => /^\s+db\b/.test(line)).indexOf(':');
            const intervalsColon = lines.find(line => /^\s+intervals\b/.test(line)).indexOf(':');

            expect(dbColon).toBe(intervalsColon); // aligned across the `now,` shorthand
        });

        test('a nested object re-groups at its own indent (no cross-indent alignment)', () => {
            const file = write('o.mjs', [
                'const config = {',
                '    a: 1,',
                '    nested: {',
                '        x: 1,',
                '        yy: 2',
                '    }',
                '};'
            ].join('\n'));

            expect(run('--fix', file).status).toBe(0);

            const lines = fs.readFileSync(file, 'utf8').split('\n');
            const xCol  = lines.find(line => /^\s{8}x\b/.test(line)).indexOf(':');
            const yyCol = lines.find(line => /^\s{8}yy\b/.test(line)).indexOf(':');

            expect(xCol).toBe(yyCol);          // inner keys align to each other at the deeper indent
            expect(run(file).status).toBe(0);  // aligned → clean
        });

        test('a lone colon property is not an alignment group — passes regardless of spacing', () => {
            const file = write('o.mjs', 'const config = {\n    onlyKey:      1\n};\n');
            expect(run(file).status).toBe(0);
        });

        test('template-string JSON examples are neither flagged nor fixed (#13670)', () => {
            const file = write('prompt.mjs', [
                'const prompt = `',
                'Output STRICT JSON:',
                '{',
                '    "id": "x",',
                '    "longName": "y"',
                '}',
                '`;'
            ].join('\n'));
            const before = fs.readFileSync(file, 'utf8');

            expect(run(file).status).toBe(0);
            expect(run('--fix', file).status).toBe(0);
            expect(fs.readFileSync(file, 'utf8')).toBe(before);
        });

        test('template masking ignores quoted/comment backticks and preserves real object fixes (#13670)', () => {
            const file = write('prompt-edge.mjs', [
                'const quoted = "`";',
                '// comment with ` must not open a template',
                '/* block comment with ` must not open a template */',
                'const rendered = `${(() => {',
                '    const inner = `value ${`nested`}`;',
                '    return inner;',
                '})()}`;',
                'const prompt = `',
                'escaped \\` backtick stays content',
                '{',
                '    "id": "x",',
                '    "longName": "y"',
                '}',
                '`;',
                '',
                'const config = {',
                '    a: 1,',
                '    longer: 2',
                '};'
            ].join('\n'));

            expect(run('--fix', file).status).toBe(0);

            const lines = fs.readFileSync(file, 'utf8').split('\n');
            expect(lines).toContain('    "id": "x",');
            expect(lines).toContain('    "longName": "y"');
            expect(lines.find(line => /^\s+a\b/.test(line))).toBe('    a     : 1,');
            expect(lines.find(line => /^\s+longer\b/.test(line))).toBe('    longer: 2');
            expect(run(file).status).toBe(0);
        });

        test('--fix aligns a `=` declaration block (lone-keyword form) and is idempotent', () => {
            const file = write('d.mjs', [
                'const',
                '    a = 1,',
                '    bbb = 2;'
            ].join('\n'));

            expect(run('--fix', file).status).toBe(0);

            const eqCols = fs.readFileSync(file, 'utf8').split('\n')
                .filter(line => line.includes('='))
                .map(line => line.indexOf('='));

            expect(eqCols.length).toBe(2);
            expect(new Set(eqCols).size).toBe(1);        // a/bbb `=` share one column
            expect(run(file).status).toBe(0);
            expect(run('--fix', file).status).toBe(0);   // idempotent
        });

        test('bare non-declaration assignments are NOT aligned (declaration-anchored only)', () => {
            // No const/let/var anchor → arbitrary assignments must never be re-aligned (false-positive guard).
            const file = write('d.mjs', 'obj.a = 1;\nobj.bbb = 2;\n');
            expect(run(file).status).toBe(0);
        });

        test('separate consecutive declarations are NOT grouped (only the comma-block aligns)', () => {
            // `let aaa = …; const b = …;` are distinct statements — the house-style `=` unit is the
            // single-keyword comma-block, not every adjacent declaration. Must pass unchanged.
            const file = write('d.mjs', 'let aaa = 1;\nconst b = 2;\nlet cc = 3;\n');
            expect(run(file).status).toBe(0);
        });

        test('a computed key participates in colon alignment (the [isDescriptor] config pattern)', () => {
            // Regression guard: a `[bracket]` key must be counted in the key width, not excluded — else
            // the colons re-align to a narrower column and break the descriptor block.
            const file = write('o.mjs', [
                'const d = {',
                '    [isDescriptor]: true,',
                '    merge: 1,',
                '    value: 2',
                '};'
            ].join('\n'));

            expect(run('--fix', file).status).toBe(0);

            const colonCols = fs.readFileSync(file, 'utf8').split('\n')
                .filter(line => /^\s+(\[[^\]]+\]|\w+)\s*:/.test(line))
                .map(line => line.indexOf(':'));

            expect(colonCols.length).toBe(3);
            expect(new Set(colonCols).size).toBe(1); // [isDescriptor]/merge/value colons share one column
        });

        test('a block-opening `=` value is excluded from alignment while simple siblings align', () => {
            // Regression guard: `cloneMap = {` stays unaligned (house style) beside an aligned
            // simple-valued declaration run.
            const file = write('d.mjs', [
                'const',
                '    camelRegex = 1,',
                '    configSymbol = 2,',
                '    cloneMap = {',
                '        a: 1',
                '    };'
            ].join('\n'));

            expect(run('--fix', file).status).toBe(0);

            const
                lines    = fs.readFileSync(file, 'utf8').split('\n'),
                camelEq  = lines.find(line => /camelRegex/.test(line)).indexOf('='),
                configEq = lines.find(line => /configSymbol/.test(line)).indexOf('=');

            expect(camelEq).toBe(configEq);                                   // simple siblings align
            expect(lines.find(line => /cloneMap/.test(line))).toBe('    cloneMap = {'); // block-opener untouched
        });
    });
});
