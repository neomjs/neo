import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {
    loadRenameMap,
    runThemeVariableRename
} from '../../../../../buildScripts/util/rename-theme-variables.mjs';

/**
 * @summary Unit suite for `buildScripts/util/rename-theme-variables.mjs` and `theme-variable-renames.json`.
 */
test.describe('rename-theme-variables — canonical map validation, target-freedom check, dashless setCssVariable, static rewrites, and idempotence', () => {
    let tmpRoot;

    test.beforeAll(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-rename-vars-'))
    });

    test.afterAll(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true})
    });

    test('CONTROL: canonical theme-variable-renames.json validates cleanly and live repo has 0 remaining old names', () => {
        const {entries, rules} = loadRenameMap();

        expect(Object.keys(rules).length).toBeGreaterThan(0);
        expect(entries.size).toBeGreaterThan(1000);

        const checkSummary = runThemeVariableRename({check: true});

        expect(checkSummary.modifiedFiles).toEqual([]);
        expect(checkSummary.remainingOldCount).toBe(0)
    });

    test('REWRITES .css, .html, .mjs (including dashless setCssVariable), and learn/apps/examples *.md once, verifies targets free on base, and is idempotent on rerun', () => {
        const
            root    = fs.mkdtempSync(path.join(tmpRoot, 'fixture-')),
            mapPath = path.join(root, 'renames.json');

        fs.writeFileSync(mapPath, JSON.stringify({
            rules: {
                'neo-prefix'   : 'engine custom property gains --neo-',
                'text-to-color': 'text-color becomes color'
            },
            entries: {
                '--sample-text-color'      : {to: '--neo-sample-color',       rule: 'neo-prefix+text-to-color'},
                '--sample-text-color-hover': {to: '--neo-sample-color-hover', rule: 'neo-prefix+text-to-color'}
            }
        }, null, 2));

        fs.mkdirSync(path.join(root, 'resources/css/src'), {recursive: true});
        fs.mkdirSync(path.join(root, 'src'),               {recursive: true});
        fs.mkdirSync(path.join(root, 'apps/demo'),         {recursive: true});
        fs.mkdirSync(path.join(root, 'test'),              {recursive: true});
        fs.mkdirSync(path.join(root, 'learn/guides'),      {recursive: true});

        fs.writeFileSync(
            path.join(root, 'resources/css/src/Sample.css'),
            '.sample { color: var(--sample-text-color); }\n.sample:hover { color: var(--sample-text-color-hover); font-size: var(--sample-text-color-unmapped); }\n'
        );
        fs.writeFileSync(
            path.join(root, 'src/Sample.mjs'),
            [
                'export const token = "--sample-text-color";',
                'export const dyn = `var(--neo-sample-${state}-color)`;',
                'Neo.setCssVariable({key: "sample-text-color", theme: "neo-theme-neo-dark", value: "#fff"});',
                'Neo.setCssVariable({key: "unmapped-probe", theme: "neo-theme-neo-dark", value: "#000"});'
            ].join('\n') + '\n'
        );
        fs.writeFileSync(
            path.join(root, 'apps/demo/TOKENS.md'),
            'Consumer doc cites `--sample-text-color`.\n'
        );
        fs.writeFileSync(
            path.join(root, 'test/fixture.html'),
            '<style>:root { --sample-text-color: rgb(1, 2, 3); }</style>\n'
        );
        fs.writeFileSync(
            path.join(root, 'learn/guides/Sample.md'),
            'Override `--sample-text-color` on the container.\n'
        );

        const firstRun = runThemeVariableRename({mapPath, root, verifyTargetsFree: true});

        expect(firstRun.modifiedFiles).toEqual([
            'apps/demo/TOKENS.md',
            'learn/guides/Sample.md',
            'resources/css/src/Sample.css',
            'src/Sample.mjs',
            'test/fixture.html'
        ]);
        expect(firstRun.replacements).toBe(7);
        expect(firstRun.remainingOldCount).toBe(0);
        expect(firstRun.dynamicTemplates).toEqual(['src/Sample.mjs:2: `--neo-sample-${state}-color)`']);
        expect(firstRun.dashlessCalls).toEqual([
            "src/Sample.mjs:3: setCssVariable key 'neo-sample-color'",
            "src/Sample.mjs:4: setCssVariable key 'unmapped-probe'"
        ]);

        expect(fs.readFileSync(path.join(root, 'resources/css/src/Sample.css'), 'utf8')).toContain('var(--sample-text-color-unmapped)');
        expect(fs.readFileSync(path.join(root, 'resources/css/src/Sample.css'), 'utf8')).toContain('var(--neo-sample-color)');
        expect(fs.readFileSync(path.join(root, 'src/Sample.mjs'), 'utf8')).toContain('key: "neo-sample-color"');
        expect(fs.readFileSync(path.join(root, 'apps/demo/TOKENS.md'), 'utf8')).toContain('`--neo-sample-color`');
        expect(fs.readFileSync(path.join(root, 'test/fixture.html'), 'utf8')).toContain('--neo-sample-color: rgb(1, 2, 3)');

        const secondRun = runThemeVariableRename({mapPath, root});

        expect(secondRun.modifiedFiles).toEqual([]);
        expect(secondRun.replacements).toBe(0);
        expect(secondRun.remainingOldCount).toBe(0)
    });

    test('REJECTS duplicate targets, chained renames, pre-existing targets in loadRenameMap({root}), and dashless old names in --check', () => {
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

        const
            collisionRoot  = fs.mkdtempSync(path.join(tmpRoot, 'collision-')),
            collisionMap   = path.join(collisionRoot, 'map.json'),
            oldButtonToken = '--' + 'fixture-old-text-color',
            newButtonToken = '--neo-fixture-button-color';

        fs.mkdirSync(path.join(collisionRoot, 'test'), {recursive: true});
        fs.writeFileSync(path.join(collisionRoot, 'test/Probe.spec.mjs'), [
            `const existing = '${newButtonToken}';`,
            "Neo.setCssVariable({key: 'fixture-old-text-color', theme: 'neo-theme-neo-dark', value: '#111'});"
        ].join('\n') + '\n');
        fs.writeFileSync(collisionMap, JSON.stringify({
            rules  : {r: 'rule'},
            entries: {[oldButtonToken]: {to: newButtonToken, rule: 'r'}}
        }));

        expect(() => loadRenameMap(collisionMap, {root: collisionRoot})).toThrow(/already exists in test\/Probe\.spec\.mjs:1/);

        const checkResult = runThemeVariableRename({check: true, mapPath: collisionMap, root: collisionRoot});

        expect(checkResult.remainingOldCount).toBe(1);
        expect(checkResult.remainingMatches[0].token).toContain('--fixture-old-text-color (dashless setCssVariable key)')
    })
});
