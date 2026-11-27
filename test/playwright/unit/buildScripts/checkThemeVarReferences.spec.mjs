import {test, expect} from '@playwright/test';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';

/**
 * The theme var-reference guard. Fixture trees are planted in a tmp dir and the collector
 * is pure over an injectable root, so each failure direction is asserted on its own. The live-tree
 * control anchors the rest: a guard that cannot pass on the tree it guards is ceremony.
 */
test.describe('check-theme-var-references — every fallback-free var() in a theme resolves', () => {
    let SCAN_SURFACE, collect, tmpRoot;

    /**
     * @param {Object<String,String>} files Root-relative path → CSS. A `src/` sheet is always planted.
     * @returns {String} The fixture root.
     */
    const makeTree = files => {
        const root = fs.mkdtempSync(path.join(tmpRoot, 'theme-vars-'));

        for (const [file, css] of Object.entries({'src/Base.css': '.neo-x {}', ...files})) {
            fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
            fs.writeFileSync(path.join(root, file), css)
        }

        return root
    };

    test.beforeAll(async () => {
        ({SCAN_SURFACE, collectThemeVarReferenceFailures: collect} = await import('../../../../buildScripts/util/check-theme-var-references.mjs'));
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-theme-vars-'));
    });

    test.afterAll(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    test('CONTROL: the live tree passes and SCAN_SURFACE uses no theme-* wildcard', () => {
        expect(collect()).toEqual([]);
        expect(SCAN_SURFACE.some(entry => entry.includes('theme-*'))).toBe(false);
    });

    test('FIRES: a property nothing defines, named with its theme, file and line', () => {
        const root = makeTree({
            'theme-a/Global.css'   : ':where(.neo-theme-a) {}',
            'theme-a/form/Text.css': ':where(.neo-theme-a) {\n    --x-border: var(--red-500);\n}'
        });

        expect(collect({root, runtimeProperties: {}})).toEqual([
            '[undefined] theme-a reads --red-500, which nothing defines: theme-a/form/Text.css:2'
        ]);
    });

    test('PASSES: a definition in another file of the theme, or in src/', () => {
        const root = makeTree({
            'src/Base.css'      : '.neo-x {--shared: 1px}',
            'theme-a/Global.css': ':where(.neo-theme-a) {--red-500: #f00}',
            'theme-a/Text.css'  : ':where(.neo-theme-a) {--x-border: var(--red-500); --x-gap: var(--shared)}'
        });

        expect(collect({root, runtimeProperties: {}})).toEqual([]);
    });

    test('PASSES: a reference with a fallback is the author\'s explicit choice', () => {
        const root = makeTree({
            'theme-a/Global.css': ':where(.neo-theme-a) {}',
            'theme-a/Text.css'  : ':where(.neo-theme-a) {--x-border: var(--red-500, red)}'
        });

        expect(collect({root, runtimeProperties: {}})).toEqual([]);
    });

    test('FIRES: another theme\'s definition does not count, since a page loads one theme', () => {
        const root = makeTree({
            'theme-a/Global.css': ':where(.neo-theme-a) {--red-500: #f00}',
            'theme-b/Global.css': ':where(.neo-theme-b) {}',
            'theme-b/Text.css'  : ':where(.neo-theme-b) {--x-border: var(--red-500)}'
        });

        expect(collect({root, runtimeProperties: {}})).toEqual([
            '[undefined] theme-b reads --red-500, which nothing defines: theme-b/Text.css:1'
        ]);
    });

    test('FIRES: a commented-out definition does not count', () => {
        const root = makeTree({
            'theme-a/Global.css': ':where(.neo-theme-a) {}',
            'theme-a/Text.css'  : ':where(.neo-theme-a) {\n    /* --red-500: #f00; */\n    --x-border: var(--red-500);\n}'
        });

        expect(collect({root, runtimeProperties: {}})).toEqual([
            '[undefined] theme-a reads --red-500, which nothing defines: theme-a/Text.css:3'
        ]);
    });

    test('PASSES: a runtime row covers a property a third party sets', () => {
        const root = makeTree({
            'theme-a/Global.css'  : ':where(.neo-theme-a) {}',
            'theme-a/CheckBox.css': ':where(.neo-theme-a) {--x-font: var(--fa-style-family-classic)}'
        });

        expect(collect({root, runtimeProperties: {'--fa-style-family-classic': 'Font Awesome'}})).toEqual([]);
    });

    test('FIRES: a runtime row that no stylesheet reads any more', () => {
        const root = makeTree({
            'theme-a/Global.css': ':where(.neo-theme-a) {}',
            'theme-a/Text.css'  : ':where(.neo-theme-a) {--x-gap: 1px}'
        });

        expect(collect({root, runtimeProperties: {'--gone': 'nothing reads it'}})).toEqual([
            '[stale-runtime] no stylesheet reads --gone any more, so remove its runtime row'
        ]);
    });

    test('PASSES: a runtime row that only a structural rule reads, with or without a fallback, is not stale', () => {
        const root = makeTree({
            'src/tree/List.css' : '.neo-tree-list .neo-list-item {padding-left: calc(var(--neo-tree-level) * 1em)}',
            'src/grid/Body.css' : '.neo-grid-row {transition-duration: var(--neo-duration, 300ms)}',
            'theme-a/Global.css': ':where(.neo-theme-a) {--x-gap: 1px}'
        });

        expect(collect({root, runtimeProperties: {'--neo-duration': 'set from JavaScript', '--neo-tree-level': 'set from JavaScript'}})).toEqual([]);
    });

    test('MAP & THEME-BASE: checks theme-base role reads against every mapped theme without treating theme-base as a standalone theme', () => {
        const mapPath = path.join(tmpRoot, 'custom-theme-map.json'),
              root    = makeTree({
                  'theme-base/Button.css': '[class*="neo-theme-"] {--button-text: var(--neo-color-text-default)}',
                  'acme-skin/Global.css' : ':where(.neo-theme-acme) {--neo-color-text-default: #111}',
                  'beta-skin/Global.css' : ':where(.neo-theme-beta) {}',
                  'theme-decoy/Text.css' : ':root {--broken: var(--never-defined)}'
              });

        fs.writeFileSync(mapPath, JSON.stringify({
            themes: {
                'neo-theme-acme': ['acme-skin'],
                'neo-theme-beta': ['beta-skin']
            }
        }), 'utf8');

        expect(collect({root, runtimeProperties: {}, themeMapPath: mapPath})).toEqual([
            '[undefined] beta-skin reads --neo-color-text-default, which nothing defines: theme-base/Button.css:1'
        ]);
    });

    test('FAILS CLOSED: a root without src/ or theme directories is a failure, never a vacuous green', () => {
        const failures = collect({root: path.join(tmpRoot, 'does-not-exist')});

        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain('[surface]');
    });
});
