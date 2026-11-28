import {test, expect}  from '@playwright/test';
import {spawnSync}     from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {
    loadRenameMap,
    parseCliArgs,
    runThemeVariableRename,
    scanSetCssVariableCalls
} from '../../../../../buildScripts/util/rename-theme-variables.mjs';

const
    dirname  = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot = path.resolve(dirname, '../../../../..'),
    cliPath  = path.join(repoRoot, 'buildScripts/util/rename-theme-variables.mjs');

/**
 * @summary Unit suite for `buildScripts/util/rename-theme-variables.mjs` and `theme-variable-renames.json`.
 */
test.describe('rename-theme-variables — canonical map validation, fail-closed CLI/API, balanced setCssVariable, static rewrites, and idempotence', () => {
    let tmpRoot;

    test.beforeAll(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-rename-vars-'))
    });

    test.afterAll(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true})
    });

    test('CONTROL: canonical theme-variable-renames.json validates cleanly and live repo has 0 remaining old names (including .github/CODING_GUIDELINES.md)', () => {
        const {entries, rules} = loadRenameMap();

        expect(Object.keys(rules).length).toBeGreaterThan(0);
        expect(entries.size).toBeGreaterThan(1000);

        const checkSummary = runThemeVariableRename({check: true});

        expect(checkSummary.modifiedFiles).toEqual([]);
        expect(checkSummary.remainingOldCount).toBe(0);

        const guidelines = fs.readFileSync(path.join(repoRoot, '.github/CODING_GUIDELINES.md'), 'utf8');
        expect(guidelines).toContain('var(--neo-calendar-week-background-color)');
        expect(guidelines).toContain('var(--neo-calendar-week-border-color)');

        // Every target a run writes or a split names still exists: declared or read under resources/css or src
        // (dashless setCssVariable keys included), so a later move that splits or drops a name has to record it.
        const
            names = new Set(),
            read  = (dir, ext) => {
                for (const item of fs.readdirSync(dir, {withFileTypes: true})) {
                    const file = path.join(dir, item.name);

                    if (item.isDirectory()) {
                        read(file, ext)
                    } else if (file.endsWith(ext)) {
                        const text = fs.readFileSync(file, 'utf8');

                        for (const [name] of text.matchAll(/--neo-[\w-]+/g)) names.add(name);

                        if (ext === '.mjs') {
                            for (const call of scanSetCssVariableCalls(text)) {
                                call.kind === 'literal' && names.add(call.key.startsWith('--') ? call.key : '--' + call.key)
                            }
                        }
                    }
                }
            };

        read(path.join(repoRoot, 'resources/css'), '.css');
        read(path.join(repoRoot, 'src'), '.mjs');

        expect([...entries].flatMap(([oldName, {split, to}]) =>
            (split ?? (to ? [to] : [])).filter(name => !names.has(name)).map(name => `${oldName} -> ${name}`))).toEqual([])
    });

    test('RECORDS a split or dropped name: never rewritten, reported with what it became, and every CLI run exits 1', () => {
        const
            root    = path.join(tmpRoot, 'split-drop'),
            mapPath = path.join(root, 'map.json'),
            splitTo = ['--neo-fixture-input-font-family', '--neo-fixture-input-font-size'],
            write   = (rel, text) => {
                fs.mkdirSync(path.dirname(path.join(root, rel)), {recursive: true});
                fs.writeFileSync(path.join(root, rel), text, 'utf8')
            };

        write('map.json', JSON.stringify({rules: {r: 'fixture rule'}, entries: {
            '--fixture-input-font': {split: splitTo, rule: 'r', reason: 'shorthand split (fixture)'},
            '--fixture-gone'      : {dropped: true, reason: 'no reader (fixture)'},
            '--fixture-color'     : {to: '--neo-fixture-color', rule: 'r'}
        }}));
        write('resources/css/src/Field.css', '.f { font: var(--fixture-input-font); color: var(--fixture-color); box-shadow: var(--fixture-gone); }\n');

        const summary = runThemeVariableRename({mapPath, root}),
              css     = fs.readFileSync(path.join(root, 'resources/css/src/Field.css'), 'utf8');

        expect(css).toBe('.f { font: var(--fixture-input-font); color: var(--neo-fixture-color); box-shadow: var(--fixture-gone); }\n');
        expect(summary.unmigrated).toBe(2);
        expect(summary.remainingMatches).toEqual([
            expect.objectContaining({token: '--fixture-input-font', split: splitTo}),
            expect.objectContaining({token: '--fixture-gone', dropped: 'no reader (fixture)'})
        ]);

        for (const extra of [[], ['--check']]) {
            const proc = spawnSync(process.execPath, [cliPath, '--root', root, '--map', mapPath, ...extra], {encoding: 'utf8'});

            expect(proc.status, extra.join(' ') || 'normal run').toBe(1);
            expect(proc.stderr).toContain('--fixture-input-font split into --neo-fixture-input-font-family, --neo-fixture-input-font-size');
            expect(proc.stderr).toContain('--fixture-gone dropped: no reader (fixture)')
        }

        for (const [entry, message] of [
            [{split: ['--neo-fixture-a'], rule: 'r'},                      /at least two distinct --neo- names/],
            [{split: ['--neo-fixture-a', '--fixture-b'], rule: 'r'},       /at least two distinct --neo- names/],
            [{dropped: true, rule: 'r'},                                   /needs "dropped": true and a one-line reason/],
            [{to: '--neo-fixture-x', dropped: true, reason: 'both'},       /exactly one of "to", "split" or "dropped"/]
        ]) {
            write('bad.json', JSON.stringify({rules: {r: 'fixture rule'}, entries: {'--fixture-bad': entry}}));
            expect(() => loadRenameMap(path.join(root, 'bad.json'))).toThrow(message)
        }
    });

    test('REWRITES .css, .html, .mjs (including nested-object dashless setCssVariable), .github/CODING_GUIDELINES.md, and learn/apps/docs/examples *.md once while preserving release-note history', () => {
        const
            root        = fs.mkdtempSync(path.join(tmpRoot, 'fixture-')),
            mapPath     = path.join(root, 'renames.json'),
            oldBtnBgKey = 'button-background-color',
            oldBtnBgVar = '--' + oldBtnBgKey;

        fs.writeFileSync(mapPath, JSON.stringify({
            rules: {
                'neo-prefix'   : 'engine custom property gains --neo-',
                'text-to-color': 'text-color becomes color'
            },
            entries: {
                [oldBtnBgVar]              : {to: '--neo-button-background-color', rule: 'neo-prefix'},
                '--sample-text-color'      : {to: '--neo-sample-color',            rule: 'neo-prefix+text-to-color'},
                '--sample-text-color-hover': {to: '--neo-sample-color-hover',      rule: 'neo-prefix+text-to-color'}
            }
        }, null, 2));

        fs.mkdirSync(path.join(root, '.github/RELEASE_NOTES'), {recursive: true});
        fs.mkdirSync(path.join(root, 'resources/css/src'),     {recursive: true});
        fs.mkdirSync(path.join(root, 'src'),                   {recursive: true});
        fs.mkdirSync(path.join(root, 'apps/demo'),             {recursive: true});
        fs.mkdirSync(path.join(root, 'docs/guides'),           {recursive: true});
        fs.mkdirSync(path.join(root, 'docs/output'),           {recursive: true});
        fs.mkdirSync(path.join(root, 'test'),                  {recursive: true});
        fs.mkdirSync(path.join(root, 'learn/guides'),          {recursive: true});

        fs.writeFileSync(
            path.join(root, '.github/CODING_GUIDELINES.md'),
            'Example: `var(--sample-text-color)`.\n'
        );
        fs.writeFileSync(
            path.join(root, '.github/RELEASE_NOTES/v14.0.0.md'),
            'Historical note: `--sample-text-color`.\n'
        );
        fs.writeFileSync(
            path.join(root, 'resources/css/src/Sample.css'),
            '.sample { color: var(--sample-text-color); }\n.sample:hover { color: var(--sample-text-color-hover); font-size: var(--sample-text-color-unmapped); }\n'
        );
        fs.writeFileSync(
            path.join(root, 'src/Sample.mjs'),
            [
                'export const token = "--sample-text-color";',
                'export const dyn = `var(--neo-sample-${state}-color)`;',
                'Neo.setCssVariable({value: compute({r: 1, key: "inner-ignored"}), key: "button-background-color", theme: "neo-theme-neo-dark"});',
                'Neo.setCssVariable({key: "sample-text-color", theme: "neo-theme-neo-dark", value: "#fff"});',
                'Neo.setCssVariable({key: "unmapped-probe", theme: "neo-theme-neo-dark", value: "#000"});'
            ].join('\n') + '\n'
        );
        fs.writeFileSync(
            path.join(root, 'apps/demo/TOKENS.md'),
            'Consumer doc cites `--sample-text-color`.\n'
        );
        fs.writeFileSync(
            path.join(root, 'docs/guides/Cells.md'),
            `Guide cites \`${oldBtnBgVar}\`.\n`
        );
        fs.writeFileSync(
            path.join(root, 'docs/output/Generated.md'),
            'Generated output `--sample-text-color` ignored.\n'
        );
        fs.writeFileSync(
            path.join(root, 'test/fixture.html'),
            '<style>:root { --sample-text-color: rgb(1, 2, 3); }</style>\n'
        );
        fs.writeFileSync(
            path.join(root, 'learn/guides/Sample.md'),
            'Override `--sample-text-color` on the container.\n'
        );

        // Verify `--check` fails on the nested `setCssVariable({value: compute({r: 1}), key: 'button-background-color'})` BEFORE rewrite
        const preCheck = runThemeVariableRename({check: true, mapPath, root});
        expect(preCheck.remainingMatches).toContainEqual({
            file : 'src/Sample.mjs',
            line : 3,
            token: `${oldBtnBgVar} (dashless setCssVariable key)`
        });

        const firstRun = runThemeVariableRename({mapPath, root, verifyTargetsFree: true});

        expect(firstRun.modifiedFiles).toEqual([
            '.github/CODING_GUIDELINES.md',
            'apps/demo/TOKENS.md',
            'docs/guides/Cells.md',
            'learn/guides/Sample.md',
            'resources/css/src/Sample.css',
            'src/Sample.mjs',
            'test/fixture.html'
        ]);
        expect(firstRun.replacements).toBe(10);
        expect(firstRun.remainingOldCount).toBe(0);
        expect(firstRun.dynamicTemplates).toEqual(['src/Sample.mjs:2: `--neo-sample-${state}-color)`']);
        expect(firstRun.dashlessCalls).toEqual([
            "src/Sample.mjs:3: setCssVariable key 'neo-button-background-color'",
            "src/Sample.mjs:4: setCssVariable key 'neo-sample-color'",
            "src/Sample.mjs:5: setCssVariable key 'unmapped-probe'"
        ]);

        expect(fs.readFileSync(path.join(root, '.github/CODING_GUIDELINES.md'), 'utf8')).toContain('var(--neo-sample-color)');
        expect(fs.readFileSync(path.join(root, '.github/RELEASE_NOTES/v14.0.0.md'), 'utf8')).toBe('Historical note: `--sample-text-color`.\n');
        expect(fs.readFileSync(path.join(root, 'docs/guides/Cells.md'), 'utf8')).toContain('`--neo-button-background-color`');
        expect(fs.readFileSync(path.join(root, 'docs/output/Generated.md'), 'utf8')).toBe('Generated output `--sample-text-color` ignored.\n');
        expect(fs.readFileSync(path.join(root, 'src/Sample.mjs'), 'utf8')).toContain('value: compute({r: 1, key: "inner-ignored"}), key: "neo-button-background-color"');
        expect(fs.readFileSync(path.join(root, 'src/Sample.mjs'), 'utf8')).toContain('key: "neo-sample-color"');

        const secondRun = runThemeVariableRename({mapPath, root});

        expect(secondRun.modifiedFiles).toEqual([]);
        expect(secondRun.replacements).toBe(0);
        expect(secondRun.remainingOldCount).toBe(0)
    });

    test('REJECTS duplicate targets, chained renames, dashed and dashless pre-existing targets in loadRenameMap({root}), and invalid CLI operands', () => {
        const dupMap = path.join(tmpRoot, 'dup.json');

        fs.writeFileSync(dupMap, JSON.stringify({
            rules  : {r: 'rule'},
            entries: {
                '--a': {to: '--neo-widget-color', rule: 'r'},
                '--b': {to: '--neo-widget-color', rule: 'r'}
            }
        }));
        expect(() => loadRenameMap(dupMap)).toThrow(/Duplicate rename target/);

        const chainMap = path.join(tmpRoot, 'chain.json');

        fs.writeFileSync(chainMap, JSON.stringify({
            rules  : {r: 'rule'},
            entries: {
                '--a': {to: '--b', rule: 'r'},
                '--b': {to: '--c', rule: 'r'}
            }
        }));
        expect(() => loadRenameMap(chainMap)).toThrow(/Chained rename/);

        // 1. Dashed target collision
        const
            collisionRoot  = fs.mkdtempSync(path.join(tmpRoot, 'collision-dashed-')),
            collisionMap   = path.join(collisionRoot, 'map.json'),
            oldButtonToken = '--' + 'fixture-old-text-color',
            newButtonToken = '--neo-fixture-button-color';

        fs.mkdirSync(path.join(collisionRoot, 'test'), {recursive: true});
        fs.writeFileSync(path.join(collisionRoot, 'test/Probe.spec.mjs'), [
            `const existing = '${newButtonToken}';`,
            "Neo.setCssVariable({value: compute({r: 1}), key: 'fixture-old-text-color', theme: 'neo-theme-neo-dark'});"
        ].join('\n') + '\n');
        fs.writeFileSync(collisionMap, JSON.stringify({
            rules  : {r: 'rule'},
            entries: {[oldButtonToken]: {to: newButtonToken, rule: 'r'}}
        }));

        expect(() => loadRenameMap(collisionMap, {root: collisionRoot})).toThrow(/already exists in test\/Probe\.spec\.mjs:1/);

        // 2. Dashless `setCssVariable({..., key: 'neo-fixture-button-color'})` target collision (including inline comments) while old CSS still exists
        const
            dashlessRoot = fs.mkdtempSync(path.join(tmpRoot, 'collision-dashless-')),
            dashlessMap  = path.join(dashlessRoot, 'map.json');

        fs.mkdirSync(path.join(dashlessRoot, 'src'), {recursive: true});
        fs.mkdirSync(path.join(dashlessRoot, 'resources/css/src'), {recursive: true});
        fs.writeFileSync(path.join(dashlessRoot, 'resources/css/src/Button.css'), `.btn { color: var(${oldButtonToken}); }\n`);
        fs.writeFileSync(
            path.join(dashlessRoot, 'src/Consumer.mjs'),
            `Neo.setCssVariable({value: compute({r: 1}), key: /* note */ '${newButtonToken.slice(2)}', theme: 'neo-theme-neo-dark'});\n`
        );
        fs.writeFileSync(dashlessMap, JSON.stringify({
            rules  : {r: 'rule'},
            entries: {[oldButtonToken]: {to: newButtonToken, rule: 'r'}}
        }));

        expect(() => loadRenameMap(dashlessMap, {root: dashlessRoot})).toThrow(/already exists as setCssVariable key.*src\/Consumer\.mjs:1/);

        // Inline comment around `key:` is detected in `--check` residuals AND rewritten cleanly in place
        const
            commentedKeyRoot = fs.mkdtempSync(path.join(tmpRoot, 'commented-key-')),
            oldCommentedKey  = 'fixture-old-text-color';

        fs.mkdirSync(path.join(commentedKeyRoot, 'src'), {recursive: true});
        fs.writeFileSync(
            path.join(commentedKeyRoot, 'src/Commented.mjs'),
            `Neo.setCssVariable({key: /* note */ '${oldCommentedKey}', value: 'red'});\n`
        );

        const commentedCheck = runThemeVariableRename({check: true, mapPath: dashlessMap, root: commentedKeyRoot});
        expect(commentedCheck.remainingOldCount).toBe(1);
        expect(commentedCheck.remainingMatches[0].file).toBe('src/Commented.mjs');

        const commentedRewrite = runThemeVariableRename({mapPath: dashlessMap, root: commentedKeyRoot});
        expect(commentedRewrite.replacements).toBe(1);
        expect(commentedRewrite.remainingOldCount).toBe(0);
        expect(fs.readFileSync(path.join(commentedKeyRoot, 'src/Commented.mjs'), 'utf8')).toBe(
            `Neo.setCssVariable({key: /* note */ '${newButtonToken.slice(2)}', value: 'red'});\n`
        );

        expect(scanSetCssVariableCalls('const msg = "setCssVariable({key: \\"ignored-in-string\\"})";')).toEqual([]);

        // 3. Fail-closed `--map` schema validation (`{}`, `{"entries": {}}`) & CLI operands (`--root /nonexistent`, `--root --check`, unknown flag)
        const emptyObjMap     = path.join(tmpRoot, 'empty-obj.json'),
              emptyEntriesMap = path.join(tmpRoot, 'empty-entries.json');

        fs.writeFileSync(emptyObjMap, '{}\n');
        fs.writeFileSync(emptyEntriesMap, JSON.stringify({rules: {r: 'rule'}, entries: {}}));

        expect(() => loadRenameMap(emptyObjMap)).toThrow(/"entries" must be a non-empty plain object/);
        expect(() => loadRenameMap(emptyEntriesMap)).toThrow(/must contain at least one rename mapping/);

        const emptyMapProc = spawnSync(
            process.execPath,
            [cliPath, '--root', commentedKeyRoot, '--map', emptyObjMap, '--check', '--json'],
            {cwd: repoRoot, encoding: 'utf8'}
        );
        expect(emptyMapProc.status).toBe(1);
        expect(emptyMapProc.stderr).toMatch(/"entries" must be a non-empty plain object/);

        expect(() => runThemeVariableRename({check: true, root: path.join(tmpRoot, 'does-not-exist')})).toThrow(/does not exist/);
        expect(() => parseCliArgs(['--root', '--check'])).toThrow(/Option "--root" requires a path operand/);
        expect(() => parseCliArgs(['--unknown-flag'])).toThrow(/Unknown CLI argument/);

        const missingRootProc = spawnSync(
            process.execPath,
            [cliPath, '--root', path.join(tmpRoot, 'does-not-exist'), '--check'],
            {cwd: repoRoot, encoding: 'utf8'}
        );
        expect(missingRootProc.status).toBe(1);
        expect(missingRootProc.stderr).toMatch(/does not exist/);

        const flagAsOperandProc = spawnSync(
            process.execPath,
            [cliPath, '--root', '--check'],
            {cwd: repoRoot, encoding: 'utf8'}
        );
        expect(flagAsOperandProc.status).toBe(1);
        expect(flagAsOperandProc.stderr).toMatch(/Option "--root" requires a path operand/);

        // 4. Installed `node_modules` invocation without `--root` fails closed instead of scanning the already-migrated package
        const installedPkgRoot = path.join(tmpRoot, 'consumer-ws/node_modules/neo.mjs');
        fs.mkdirSync(installedPkgRoot, {recursive: true});

        expect(() => parseCliArgs([], {defaultRootDir: installedPkgRoot})).toThrow(/inside node_modules requires an explicit --root/);
        expect(() => runThemeVariableRename({check: true, defaultRootDir: installedPkgRoot})).toThrow(/inside node_modules requires an explicit --root/);
        expect(parseCliArgs(['--root', commentedKeyRoot], {defaultRootDir: installedPkgRoot}).root).toBe(commentedKeyRoot);

        // 5. ES6 shorthand `{key, theme, value}` is reported in `dynamicTemplates`, while class method signatures are ignored
        const shorthandRoot = fs.mkdtempSync(path.join(tmpRoot, 'shorthand-key-'));
        fs.mkdirSync(path.join(shorthandRoot, 'src'), {recursive: true});
        fs.writeFileSync(
            path.join(shorthandRoot, 'src/Shorthand.mjs'),
            [
                "const key = 'fixture-old-text-color';",
                "Neo.setCssVariable({key, theme: 'neo-theme-neo-dark', value: 'rgb(40, 50, 60)'});",
                "class Helper { setCssVariable({key, theme}) { return {key, theme} } }"
            ].join('\n') + '\n'
        );

        const shorthandSummary = runThemeVariableRename({check: true, mapPath: dashlessMap, root: shorthandRoot});
        expect(shorthandSummary.dynamicTemplates).toEqual(['src/Shorthand.mjs:2: setCssVariable key key']);

        // 6. `--check --json` drains >64 KB stdout completely on non-zero exit (1,000 residuals > 130 KB piped JSON)
        const
            largeJsonRoot = fs.mkdtempSync(path.join(tmpRoot, 'large-json-')),
            largeJsonMap  = path.join(largeJsonRoot, 'map.json'),
            oldLargeToken = '--' + 'fixture-old-large-residual-color',
            residualCss   = Array.from({length: 1000}, (_, idx) => `.item-${idx} { color: var(${oldLargeToken}); }`).join('\n') + '\n';

        fs.mkdirSync(path.join(largeJsonRoot, 'resources/css/src'), {recursive: true});
        fs.writeFileSync(path.join(largeJsonRoot, 'resources/css/src/LargeResidual.css'), residualCss);
        fs.writeFileSync(largeJsonMap, JSON.stringify({
            rules  : {r: 'rule'},
            entries: {[oldLargeToken]: {to: '--neo-fixture-large-residual-color', rule: 'r'}}
        }));

        const largeJsonProc = spawnSync(
            process.execPath,
            [cliPath, '--root', largeJsonRoot, '--map', largeJsonMap, '--check', '--json'],
            {cwd: repoRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024}
        );

        expect(largeJsonProc.status).toBe(1);
        expect(Buffer.byteLength(largeJsonProc.stdout, 'utf8')).toBeGreaterThan(100_000);

        const parsedLarge = JSON.parse(largeJsonProc.stdout);
        expect(parsedLarge.remainingOldCount).toBe(1000);
        expect(parsedLarge.remainingMatches).toHaveLength(1000)
    })
});
