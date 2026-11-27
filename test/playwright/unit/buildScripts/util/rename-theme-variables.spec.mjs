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
        expect(guidelines).toContain('var(--neo-calendar-week-border-color)')
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

        // 2. Dashless `setCssVariable({..., key: 'neo-fixture-button-color'})` target collision while old CSS still exists
        const
            dashlessRoot = fs.mkdtempSync(path.join(tmpRoot, 'collision-dashless-')),
            dashlessMap  = path.join(dashlessRoot, 'map.json');

        fs.mkdirSync(path.join(dashlessRoot, 'src'), {recursive: true});
        fs.mkdirSync(path.join(dashlessRoot, 'resources/css/src'), {recursive: true});
        fs.writeFileSync(path.join(dashlessRoot, 'resources/css/src/Button.css'), `.btn { color: var(${oldButtonToken}); }\n`);
        fs.writeFileSync(
            path.join(dashlessRoot, 'src/Consumer.mjs'),
            `Neo.setCssVariable({value: compute({r: 1}), key: '${newButtonToken.slice(2)}', theme: 'neo-theme-neo-dark'});\n`
        );
        fs.writeFileSync(dashlessMap, JSON.stringify({
            rules  : {r: 'rule'},
            entries: {[oldButtonToken]: {to: newButtonToken, rule: 'r'}}
        }));

        expect(() => loadRenameMap(dashlessMap, {root: dashlessRoot})).toThrow(/already exists as setCssVariable key.*src\/Consumer\.mjs:1/);
        expect(scanSetCssVariableCalls('const msg = "setCssVariable({key: \\"ignored-in-string\\"})";')).toEqual([]);

        // 3. Fail-closed CLI & API validation (`--root /nonexistent`, `--root --check`, unknown flag)
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
        expect(flagAsOperandProc.stderr).toMatch(/Option "--root" requires a path operand/)
    })
});
