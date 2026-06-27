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
 * object-literal colons, declaration `=` blocks) so it is never hand-counted. Coverage is constructed
 * mostly without hand-aligned fixtures (the exact error class this gate removes): the misaligned input
 * is trivial to write, the aligned form is DERIVED via `--fix`, and the false-positive guards use
 * ungrouped inputs that pass regardless of spacing. The destructuring regression pins one concrete
 * output fixture because the bug erased an existing human-reviewed block shape.
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

        test('a single-line template-valued property stays in its run — all keys align, not split (#14212)', () => {
            // Regression: a property whose VALUE is a single-line template begins in code, so it must stay
            // in its colon-alignment run. A prior mask flagged any line containing template content, which
            // split the run here — leaving the keys before it tight and the rest far.
            const file = write('tmpl-value.mjs', [
                'const node = {',
                '    id: memoryId,',
                '    type: nodeType,',
                '    name: `Memory: ${timestamp}`,',
                '    semanticVectorId: memoryId',
                '};'
            ].join('\n'));

            expect(run('--fix', file).status).toBe(0);

            const colonCols = fs.readFileSync(file, 'utf8').split('\n')
                .filter(line => /^\s+\w+\s*:/.test(line))
                .map(line => line.indexOf(':'));

            expect(colonCols.length).toBe(4);
            expect(new Set(colonCols).size).toBe(1);     // id/type/name/semanticVectorId share one column — the template value did not split the run
            expect(run(file).status).toBe(0);            // aligned → clean
            expect(run('--fix', file).status).toBe(0);   // idempotent
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

        test('--fix aligns a keyword-head comma-block with bare continuations', () => {
            const file = write('d.mjs', [
                'const short = 1,',
                '      muchLongerName = 2,',
                '      blockValue = {',
                '          a: 1',
                '      };'
            ].join('\n'));

            expect(run('--fix', file).status).toBe(0);

            const
                lines    = fs.readFileSync(file, 'utf8').split('\n'),
                shortEq  = lines.find(line => /short/.test(line)).indexOf('='),
                longerEq = lines.find(line => /muchLongerName/.test(line)).indexOf('='),
                blockEq  = lines.find(line => /blockValue/.test(line)).indexOf('=');

            expect(shortEq).toBe(longerEq);
            expect(blockEq).toBe(longerEq);
            expect(run(file).status).toBe(0);
        });

        test('#13908: --fix aligns keyword-head comma-blocks with destructuring continuations', () => {
            const file = write('d.mjs', [
                '        let me = this,',
                '            {record} = data,',
                '            oldValue = me.value,',
                '            {value} = record;'
            ].join('\n'));

            expect(run('--fix', file).status).toBe(0);

            expect(fs.readFileSync(file, 'utf8').split('\n')).toEqual([
                '        let me       = this,',
                '            {record} = data,',
                '            oldValue = me.value,',
                '            {value}  = record;'
            ]);
            expect(run(file).status).toBe(0);
        });

        test('#13896: --fix aligns repeated-keyword declaration blocks', () => {
            const file = write('d.mjs', [
                "const extra     = extraModels.length ? extraModels.join(', ') : 'none';",
                'const requiredObserved = Neo.isNumber(observedRequiredCount) ? observedRequiredCount : observedCount;'
            ].join('\n'));

            expect(run(file).status).toBe(1);
            expect(run('--fix', file).status).toBe(0);

            const
                lines      = fs.readFileSync(file, 'utf8').split('\n'),
                extraEq    = lines[0].indexOf('='),
                observedEq = lines[1].indexOf('=');

            expect(extraEq).toBe(observedEq);
            expect(lines[0]).toBe("const extra            = extraModels.length ? extraModels.join(', ') : 'none';");
            expect(run(file).status).toBe(0);
        });

        test('#13896: --fix aligns repeated declarations when a new longer binding resets the block', () => {
            const file = write('d.mjs', [
                'const observedCount = availableModels.length;',
                'const observedRequiredCount = getRequiredAvailable(availableModels).length;',
                'const capacityReady      = observedRequiredCount >= requiredResidentModels;'
            ].join('\n'));

            expect(run('--fix', file).status).toBe(0);

            const eqCols = fs.readFileSync(file, 'utf8').split('\n').map(line => line.indexOf('='));

            expect(new Set(eqCols).size).toBe(1);
            expect(run(file).status).toBe(0);
        });

        test('#13896: a lone keyword declaration normalizes stale padding', () => {
            const file = write('d.mjs', 'const trigger   = buildSummaryTrigger({\n    now\n});\n');

            expect(run(file).status).toBe(1);
            expect(run('--fix', file).status).toBe(0);
            expect(fs.readFileSync(file, 'utf8').split('\n')[0]).toBe('const trigger = buildSummaryTrigger({');
            expect(run(file).status).toBe(0);
        });

        test('bare non-declaration assignments are NOT aligned (declaration-anchored only)', () => {
            // No const/let/var anchor → arbitrary assignments must never be re-aligned (false-positive guard).
            const file = write('d.mjs', 'obj.a = 1;\nobj.bbb = 2;\n');
            expect(run(file).status).toBe(0);
        });

        test('mixed repeated-keyword declarations align keyword, name, and equals columns', () => {
            const file = write('d.mjs', 'let aaa = 1;\nconst b = 2;\nlet cc = 3;\n');
            expect(run('--fix', file).status).toBe(0);

            const aligned = fs.readFileSync(file, 'utf8');
            expect(aligned).toContain('let   aaa = 1;');
            expect(aligned).toContain('const b   = 2;');
            expect(aligned).toContain('let   cc  = 3;');
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

        test('a block-opening `=` value participates in lone-keyword block alignment', () => {
            // Regression guard: #13908 changed `me    = this` to `me = this` before a block-opening
            // sibling. That is still one declaration block and must align as a whole.
            const file = write('d.mjs', [
                'const',
                '    me = this,',
                '    camelRegex = 1,',
                '    configSymbol = 2,',
                '    cloneMap = {',
                '        a: 1',
                '    };'
            ].join('\n'));

            expect(run('--fix', file).status).toBe(0);

            const
                lines    = fs.readFileSync(file, 'utf8').split('\n'),
                meEq     = lines.find(line => /\bme\b/.test(line)).indexOf('='),
                camelEq  = lines.find(line => /camelRegex/.test(line)).indexOf('='),
                configEq = lines.find(line => /configSymbol/.test(line)).indexOf('='),
                cloneEq  = lines.find(line => /cloneMap/.test(line)).indexOf('=');

            expect(new Set([meEq, camelEq, configEq, cloneEq]).size).toBe(1);
            expect(lines.find(line => /\bme\b/.test(line))).toBe('    me           = this,');
            expect(lines.find(line => /cloneMap/.test(line))).toBe('    cloneMap     = {');
        });
    });
});

/**
 * Real-git integration for the --staged diff-scope. In lint-staged (pre-commit) mode the check
 * reports only drift on the author's staged-ADDED lines — a grandfathered misalignment on an
 * untouched line must not block an unrelated commit — reusing the shared stagedDiff helper.
 */
test.describe('check-block-alignment.mjs --staged diff-scope (#13720)', () => {
    let stagedDir;

    const git = (...a) => execFileSync('git', a, {cwd: stagedDir, stdio: 'ignore'});

    const runStaged = (file) => {
        try {
            return {status: 0, output: execFileSync('node', [scriptPath, '--staged', file], {cwd: stagedDir, encoding: 'utf8', stdio: 'pipe'})};
        } catch (error) {
            return {status: error.status, output: (error.stderr || '') + (error.stdout || '')};
        }
    };

    test.beforeEach(() => {
        stagedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-blockalign-staged-'));
        git('init');
        git('config', 'user.email', 'test@example.com');
        git('config', 'user.name', 'Test User');
    });

    test.afterEach(() => {
        fs.rmSync(stagedDir, {recursive: true, force: true});
    });

    test('does NOT flag a grandfathered misalignment on an untouched line', () => {
        const file = path.join(stagedDir, 'src.mjs');
        // Two misaligned imports (line 1 drifts), committed = grandfathered.
        fs.writeFileSync(file, "import a from 'a';\nimport bb from 'b';\n", 'utf8');
        git('add', 'src.mjs');
        git('commit', '-m', 'init');
        // Stage an unrelated added line (line 3); the grandfathered drift on line 1 stays untouched.
        fs.writeFileSync(file, "import a from 'a';\nimport bb from 'b';\nexport const x = 1;\n", 'utf8');
        git('add', 'src.mjs');

        expect(runStaged('src.mjs').status).toBe(0);
    });

    test('flags a misalignment on a staged-ADDED line', () => {
        const file = path.join(stagedDir, 'src.mjs');
        // New file: both misaligned imports are staged-added, so line 1's drift is in scope.
        fs.writeFileSync(file, "import a from 'a';\nimport bb from 'b';\n", 'utf8');
        git('add', 'src.mjs');

        const r = runStaged('src.mjs');
        expect(r.status).toBe(1);
        expect(r.output).toContain('Misaligned');
    });
});
