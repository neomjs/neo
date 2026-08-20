import {test, expect}  from '@playwright/test';
import {execFileSync, spawnSync} from 'node:child_process';
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

    // spawnSync (not execSync): node is spawned directly with an argv array — no shell, so the
    // absolute scriptPath + file args can never be interpolated into a shell command (CodeQL-clean).
    //
    // BOTH streams, on BOTH paths. The failure path always merged them; the success path returned
    // stdout alone, so anything a PASSING run wrote to stderr was invisible to every arm in this
    // file. A checker that emits an advisory about a file it does not fail is exactly that shape,
    // and an arm asserting such an advisory would have failed for a reason having nothing to do with
    // the advisory. `output` now means what its name claims.
    const run = (...args) => {
        const result = spawnSync('node', [scriptPath, ...args], {encoding: 'utf8'});

        return {status: result.status, output: (result.stdout || '') + (result.stderr || '')}
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

    test.describe('the green line states the unit it judged', () => {
        // This checker judges GROUPS. Both defects below are invisible to every other arm in this
        // file, because both produce output the checker itself considers correct.

        const SPLIT = [
            'const x = {',
            '    staleCount         : 0,',
            '    manifestOrphanCount: 0,',
            '    // prose about the next key',
            '    parserOrphanCount: 0,',
            '    totalOrphanCount : 0',
            '};'
        ].join('\n');

        test('a comment splits one literal into two groups, and the file PASSES while the halves sit at different columns', () => {
            const {status, output} = run(write('split.mjs', SPLIT));

            // The defect, stated as the checker sees it: this is a pass. The two halves align to
            // columns 23 and 21 and neither group is internally wrong, so there is nothing to report
            // under the group rule — which is exactly why the notice has to exist.
            expect(status).toBe(0);
            expect(output).toContain('an alignment group starts here');
            expect(output).toMatch(/split\.mjs:5/)
        });

        test('CONTROL: the same literal WITHOUT the comment is reported as misaligned', () => {
            // Without this, "the checker notices the split" is equally consistent with a checker that
            // cannot see the literal at all. The only difference between the two fixtures is the
            // comment line.
            const {status, output} = run(write('joined.mjs', SPLIT.split('\n').filter(line => !line.includes('prose about')).join('\n')));

            expect(status).toBe(1);
            expect(output).toContain('Misaligned object-literal colon')
        });

        test('CONTROL: a blank-line separation is deliberate and draws no notice', () => {
            // A blank line is how an author separates groups on purpose. Reporting it would make the
            // notice noise, and a notice that fires on intent gets tuned out before it ever fires on
            // an accident.
            const {status, output} = run(write('blank.mjs', SPLIT.replace('    // prose about the next key', '')));

            expect(status).toBe(0);
            expect(output).not.toContain('an alignment group starts here')
        });

        test('a violation names WHICH group of how many, because the column alone cannot say', () => {
            const {status, output} = run(write('two.mjs', [
                'const a = {',
                '    one  : 1,',
                '    two  : 2',
                '};',
                '',
                'const b = {',
                '    alpha        : 1,',
                '    beta: 2',
                '};'
            ].join('\n')));

            expect(status).toBe(1);
            expect(output).toContain('(group 1 of 2)');
            expect(output).toContain('(group 2 of 2)')
        });

        test('IMPORT groups name themselves too — the unit contract is not object-colon only', () => {
        // The ticket says "each checker's failure output names the unit it judged". Implementing that
        // for one of three evaluators would leave the generalized claim and the output disagreeing.
        const {output} = run(write('imp.mjs', [
            "import {a}        from './a.mjs';",
            "import {bb, ccc} from './b.mjs';",
            '',
            'function f() {}',
            '',
            "import x   from './x.mjs';",
            "import yy from './y.mjs';"
        ].join('\n')));

        expect(output).toContain('(group 1 of 2)');
        expect(output).toContain('(group 2 of 2)')
    });

    test('ASSIGNMENT groups name themselves too', () => {
        const {output} = run(write('asg.mjs', [
            'const aa = 1;',
            'const b  = 2;',
            '',
            'function f() {',
            '    const ccccc = 3;',
            '    const d = 4;',
            '}'
        ].join('\n')));

        expect(output).toMatch(/Misaligned '='.*\(group \d of 2\)/)
    });

    test('a single group is not labelled — "group 1 of 1" would be noise', () => {
            const {output} = run(write('one.mjs', ['const a = {', '    one  : 1,', '    two: 2', '};'].join('\n')));

            expect(output).toContain('Misaligned object-literal colon');
            expect(output).not.toContain('group 1 of 1')
        })
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

        test('#15072: a destructuring-with-defaults declarator is left untouched, never mis-split into invalid JS', () => {
            // The default `=` inside `{blockedNodes = []}` is NOT the assignment operator. Before the guard,
            // --fix sliced the line at that first `=` and erased `[], ...} = focusContradiction` into a
            // SyntaxError. Such a line now fails to match as a declaration, breaks the run, and is preserved
            // byte-for-byte. Default-FREE destructuring (`{record}`, above) still aligns — this is the only
            // shape excluded. Pins the exact multi-declarator input the aligner corrupted.
            const original = [
                'function buildRouteAttributionRecords(focusContradiction) {',
                '    const {blockedNodes = [], focusCandidates = []} = focusContradiction,',
                '          focusReasons = [...new Set(focusCandidates.flatMap(c => Array.isArray(c.reasons) ? c.reasons : []))];',
                '    return {blockedNodes, focusReasons};',
                '}'
            ].join('\n');
            const file = write('d.mjs', original);

            expect(run('--fix', file).status).toBe(0);
            expect(fs.readFileSync(file, 'utf8')).toBe(original);    // byte-identical: the default `=` is never an alignment column
            expect(run(file).status).toBe(0);                        // check mode: no drift, so the author is never told to --fix
            execFileSync('node', ['--check', file], {stdio: 'pipe'}); // throws if --fix left the file un-parseable
        });

        test('#15703: a multiline callback arrow breaks the declaration run and stays byte-identical', () => {
            // The `=` inside `=>` is not an assignment operator. A callback body line can share the
            // comma-block continuation indent, so the parser must reject it before reconstruction.
            const original = [
                'function selectObservations(observations) {',
                '    const',
                '        selected = observations.filter(',
                '        observation => observation.keep',
                '    ),',
                '        count = selected.length;',
                '',
                '    return {selected, count}',
                '}'
            ].join('\n');
            const file = write('callback-arrow.mjs', original);

            expect(run('--fix', file).status).toBe(0);
            expect(fs.readFileSync(file, 'utf8')).toBe(original);
            expect(run(file).status).toBe(0);
            expect(run('--fix', file).status).toBe(0);
            expect(fs.readFileSync(file, 'utf8')).toBe(original);
            execFileSync(process.execPath, ['--check', file], {stdio: 'pipe'});
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
            // Regression guard: an earlier fix collapsed `me    = this` to `me = this` before a block-opening
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

/**
 * Real-git integration for the scoped pre-commit REPAIR (`--fix --staged`): the hook converts from
 * reject to repair, rewriting ONLY drift on the author's staged-added lines. A grandfathered
 * misalignment on an untouched line stays byte-identical; a git detection failure reports and never
 * writes (fail-closed); pure `--fix` stays the deliberate whole-file pass. The detector is untouched —
 * the entire pre-existing suite above runs unmodified against the new disposition surface.
 */
test.describe('check-block-alignment.mjs --fix --staged scoped repair (#17201)', () => {
    let stagedDir;

    const git = (...a) => execFileSync('git', a, {cwd: stagedDir, stdio: 'ignore'});

    // execFileSync with an argv array (no shell), cwd-pinned to the fixture repo: the script resolves
    // its gitRoot from the process cwd, exactly as lint-staged's invocation resolves the real one.
    const run = (args, cwd = stagedDir) => {
        try {
            return {status: 0, output: execFileSync('node', [scriptPath, ...args], {cwd, encoding: 'utf8', stdio: 'pipe'})};
        } catch (error) {
            return {status: error.status, output: (error.stderr || '') + (error.stdout || '')};
        }
    };

    test.beforeEach(() => {
        stagedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-blockalign-scopedfix-'));
        git('init');
        git('config', 'user.email', 'test@example.com');
        git('config', 'user.name', 'Test User');
    });

    test.afterEach(() => {
        fs.rmSync(stagedDir, {recursive: true, force: true});
    });

    test('rewrites only staged-added-line drift; a grandfathered misalignment stays byte-identical (AC1)', () => {
        const file = path.join(stagedDir, 'src.mjs');
        // Committed: a misaligned import pair (line 1 drifts) — grandfathered, never owned again.
        fs.writeFileSync(file, "import a from 'a';\nimport bb from 'b';\n", 'utf8');
        git('add', 'src.mjs');
        git('commit', '-m', 'init');

        // Staged: an unrelated object block whose colon drift sits entirely on the ADDED lines.
        fs.writeFileSync(file, [
            "import a from 'a';",
            "import bb from 'b';",
            'const config = {',
            '    db: 1,',
            '    intervals: 3',
            '};',
            ''
        ].join('\n'), 'utf8');
        git('add', 'src.mjs');

        expect(run(['--fix', '--staged', 'src.mjs']).status).toBe(0);

        const lines = fs.readFileSync(file, 'utf8').split('\n');
        expect(lines[0]).toBe("import a from 'a';");   // grandfathered import drift: byte-identical
        expect(lines[1]).toBe("import bb from 'b';");
        expect(lines[3]).toBe('    db       : 1,');    // owned colon drift: repaired
        expect(lines[4]).toBe('    intervals: 3');
    });

    test('fails closed without a reliable staged-line set: reports, never writes (AC2)', () => {
        // No git repository at or above this cwd: rev-parse fails, so the scoped repair must refuse
        // to write rather than degrade into a whole-file reformat on a transient git error.
        const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-blockalign-norepo-'));
        try {
            const file     = path.join(bareDir, 'src.mjs');
            const original = "import a from 'a';\nimport bb from 'b';\n";
            fs.writeFileSync(file, original, 'utf8');

            const r = run(['--fix', '--staged', file], bareDir);
            expect(r.status).toBe(1);
            expect(r.output).toContain('Misaligned');
            expect(r.output).toContain('repair skipped');
            expect(fs.readFileSync(file, 'utf8')).toBe(original);   // byte-identical: nothing rewritten
        } finally {
            fs.rmSync(bareDir, {recursive: true, force: true});
        }
    });

    test('the hook disposition: stage misaligned → --fix --staged repairs → commit proceeds, aligned (AC3)', () => {
        const file = path.join(stagedDir, 'src.mjs');
        // A brand-new file whose entire content is staged-added: every violation is owned.
        fs.writeFileSync(file, "import a from 'a';\nimport bb from 'b';\n", 'utf8');
        git('add', 'src.mjs');

        // What the pre-commit hook now runs (the package.json lint-staged entry pinned below).
        expect(run(['--fix', '--staged', 'src.mjs']).status).toBe(0);

        git('add', 'src.mjs');                      // lint-staged re-stages the repair
        git('commit', '-m', 'fixture commit');      // the commit proceeds without author action

        const committed = execFileSync('git', ['show', 'HEAD:src.mjs'], {cwd: stagedDir, encoding: 'utf8'});
        expect(committed).toBe("import a  from 'a';\nimport bb from 'b';\n");
    });

    test('the lint-staged entry invokes the scoped repair (AC3 wiring pin)', () => {
        const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../../../package.json'), 'utf8'));
        expect(pkg['lint-staged']['*.mjs']).toContain('node ./buildScripts/util/check-block-alignment.mjs --fix --staged');
    });

    test('pure --fix remains the deliberate whole-file pass, grandfathered drift included (AC4)', () => {
        const file = path.join(stagedDir, 'src.mjs');
        fs.writeFileSync(file, "import a from 'a';\nimport bb from 'b';\n", 'utf8');
        git('add', 'src.mjs');
        git('commit', '-m', 'init');

        // Nothing staged at all: the scoped repair would own no line, but a deliberate --fix
        // rewrites the whole file regardless of staging.
        expect(run(['--fix', 'src.mjs']).status).toBe(0);
        expect(fs.readFileSync(file, 'utf8')).toBe("import a  from 'a';\nimport bb from 'b';\n");
    });
});

/**
 * The scoped repair's unchecked precondition: `getStagedAddedLines` speaks INDEX coordinates and the
 * repair writes the WORKING TREE. On a partially staged file they drift by the unstaged edit's line
 * delta, so index line N addresses a different line on disk — the repair then edits lines the author
 * never staged and leaves the staged drift in place, reporting success for both halves.
 */
test.describe('check-block-alignment.mjs --fix --staged index-vs-worktree precondition (#17226)', () => {
    let stagedDir;

    const git = (...a) => execFileSync('git', a, {cwd: stagedDir, stdio: 'ignore'});

    const run = (args, cwd = stagedDir) => {
        try {
            return {status: 0, output: execFileSync('node', [scriptPath, ...args], {cwd, encoding: 'utf8', stdio: 'pipe'})};
        } catch (error) {
            return {status: error.status, output: (error.stderr || '') + (error.stdout || '')};
        }
    };

    // A file whose staged content carries alignable drift, then an unstaged edit ABOVE it that shifts
    // every subsequent line by three — the shape that makes index and worktree coordinates disagree.
    const seedShiftedFile = () => {
        const file = path.join(stagedDir, 'src.mjs');

        fs.writeFileSync(file, 'const zz = 1;\n', 'utf8');
        git('add', 'src.mjs');
        git('commit', '-m', 'init');

        fs.writeFileSync(file, 'const zz = 1;\nconst obj = {\n    id: 1,\n    namelong: 2\n};\n', 'utf8');
        git('add', 'src.mjs');

        fs.writeFileSync(file, '// unstaged A\n// unstaged B\n// unstaged C\nconst zz = 1;\nconst obj = {\n    id: 1,\n    namelong: 2\n};\n', 'utf8');

        return file
    };

    test.beforeEach(() => {
        stagedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-blockalign-coords-'));
        git('init');
        git('config', 'user.email', 'test@example.com');
        git('config', 'user.name', 'Test User');
    });

    test.afterEach(() => {
        fs.rmSync(stagedDir, {recursive: true, force: true});
    });

    test('refuses to rewrite a file whose working tree has drifted from the index (#17226)', () => {
        const file   = seedShiftedFile(),
              before = fs.readFileSync(file, 'utf8'),
              result = run(['--fix', '--staged', 'src.mjs']);

        // Byte-identical is the assertion that matters: before this precondition the run rewrote
        // `const zz` — a line the author never staged — and left the staged object block unrepaired.
        expect(fs.readFileSync(file, 'utf8')).toBe(before);
        expect(result.status).toBe(1);
        expect(result.output).toContain('unstaged changes');
    });

    test('names the unstaged-changes cause apart from a failed staged-line read (#17226)', () => {
        seedShiftedFile();

        // Two causes, two author actions — stash your other edits, versus fix your git state. One
        // message for both told the author neither, which is why the reason is carried per file.
        expect(run(['--fix', '--staged', 'src.mjs']).output).toContain('stage or stash the rest');
    });

    test('a fully staged file is unaffected — the repair still runs (#17226)', () => {
        const file = path.join(stagedDir, 'src.mjs');

        fs.writeFileSync(file, "import a from 'a';\nimport bb from 'b';\n", 'utf8');
        git('add', 'src.mjs');
        git('commit', '-m', 'init');

        fs.writeFileSync(file, "import a from 'a';\nimport bb from 'b';\nconst obj = {\n    id: 1,\n    namelong: 2\n};\n", 'utf8');
        git('add', 'src.mjs');

        // The control that keeps the new precondition from becoming a blanket refusal: with no
        // unstaged changes the coordinates agree, so the scoped repair must behave exactly as before.
        expect(run(['--fix', '--staged', 'src.mjs']).status).toBe(0);
        expect(fs.readFileSync(file, 'utf8')).toContain('    id      : 1,');
    });

    test('pure --fix is unaffected by the precondition — still whole-file (#17226)', () => {
        const file = seedShiftedFile();

        // The deliberate pass has no staged-line set to misapply, so an unstaged edit is irrelevant
        // to it; refusing here would break the documented remedy for grandfathered drift.
        expect(run(['--fix', 'src.mjs']).status).toBe(0);
        expect(fs.readFileSync(file, 'utf8')).toContain('const zz  = 1;');
    });

    // The usage header accepts `<file.mjs> [...]`, and a per-file refusal does NOT make the batch
    // mutation-free: a safe file earlier in argv is already written when a later one refuses. Saying
    // "no files were rewritten" there is the opposite of what just happened, and it sends the author
    // away from a real repair sitting UNSTAGED in their tree. Found by @neo-gpt at the exact head.
    test('a mixed batch reports the earlier repair instead of claiming nothing was written (#17226)', () => {
        const safe = path.join(stagedDir, 'safe.mjs'),
              file = path.join(stagedDir, 'src.mjs');

        // Both baselines are committed in ONE commit before anything is staged. `git commit` with no
        // pathspec commits the whole index, so seeding these files in sequence would sweep the first
        // file's staged drift into the second file's commit and leave it with nothing staged.
        fs.writeFileSync(safe, "import a from 'a';\nimport bb from 'b';\n", 'utf8');
        fs.writeFileSync(file, 'const zz = 1;\n', 'utf8');
        git('add', 'safe.mjs', 'src.mjs');
        git('commit', '-m', 'init');

        // safe.mjs: drift entirely on staged-added lines, no unstaged edit → repairable.
        fs.writeFileSync(safe, "import a from 'a';\nimport bb from 'b';\nconst obj = {\n    id: 1,\n    namelong: 2\n};\n", 'utf8');
        // src.mjs: staged drift, then an unstaged edit above it that shifts the coordinates → refused.
        fs.writeFileSync(file, 'const zz = 1;\nconst obj = {\n    id: 1,\n    namelong: 2\n};\n', 'utf8');
        git('add', 'safe.mjs', 'src.mjs');
        fs.writeFileSync(file, '// unstaged A\n// unstaged B\n// unstaged C\nconst zz = 1;\nconst obj = {\n    id: 1,\n    namelong: 2\n};\n', 'utf8');

        const result = run(['--fix', '--staged', 'safe.mjs', 'src.mjs']);

        // The earlier file really was rewritten...
        expect(fs.readFileSync(safe, 'utf8')).toContain('    id      : 1,');
        // ...so the summary must say so, and must NOT claim the batch was a no-op.
        expect(result.output).toContain('safe.mjs was already repaired before the refusal');
        expect(result.output).not.toContain('No files were rewritten');
        expect(result.status).toBe(1);
    });

    // The control that keeps the truthful-summary fix from inverting: when nothing was written, the
    // no-op claim is correct and must survive.
    test('an all-refused batch still reports that nothing was written (#17226)', () => {
        seedShiftedFile();

        const result = run(['--fix', '--staged', 'src.mjs']);

        expect(result.output).toContain('No files were rewritten');
        expect(result.output).not.toContain('already repaired before the refusal');
    });
});
