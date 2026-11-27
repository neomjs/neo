import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'child_process';
import fs              from 'fs';
import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';

/**
 * The theme census. One fixture tree is planted in a tmp dir and the collector is pure over an
 * injectable root, so every section is asserted against counts derived by hand from the fixture. The
 * live-tree control proves the census reads the real tree, and the CLI arm proves `--json` and `--root`.
 */
const
    repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
    cli      = path.join(repoRoot, 'buildScripts/util/theme-census.mjs'),
    runtime  = {'--neo-tree-level': 'set from JavaScript'},

    FIXTURE = {
        'src/button/Base.css': [
            '.neo-button {',
            '    background-color: var(--button-background-color);',
            '    color           : var(--button-text-color);',
            '    border          : 1px solid #ff0000;',
            '    box-shadow      : 0 0 2px rgba(0, 0, 0, 0.5);',
            '    padding-left    : calc(var(--neo-tree-level) * 1em);',
            '    margin          : var(--ghost-margin);',
            '    outline         : var(--fallback-only, 0);',
            '    top             : var(--mixed-read, 0);',
            '    left            : var(--mixed-read);',
            '    --src-gap       : 2px;',
            '    --src-color     : #abcdef;',
            '    gap             : var(--src-gap);',
            '    caret-color     : var(--caret, #00ff00);',
            '    /* width        : var(--commented-read); */',
            '}'
        ].join('\n'),
        // a block's last declaration without its `;`
        'src/component/Timer.css'        : '@keyframes t {\n    to {\n        --neo-timer-current: 0\n    }\n}\n.neo-timer {width: var(--neo-timer-current);}',
        'src/apps/demo/Main.css'         : '.demo-main {color: var(--app-ghost)}',
        'theme-x-dark/Global.css'        : ':where(.neo-theme-x-dark) {--gray-100: #111111; --sem-surface: #222222; --sem-unused: #333333; --cmp-radius: 4px;}',
        'theme-x-dark/apps/demo/Main.css': ':where(.neo-theme-x-dark) {--demo-panel-bg: #101010;}',
        'theme-x-dark/button/Base.css'   : [
            ':where(.neo-theme-x-dark) {',
            '    --button-background-color   : var(--sem-surface);',
            '    --button-text-color         : #eeeeee;',
            '    --button-border-radius      : var(--cmp-radius);',
            '    --button-gap                : var(--gray-100);',
            '    --button-color-hover        : var(--button-text-color);',
            '    --button-focus-outline-width: 2px;',
            '    /* --button-ghost: 1px; */',
            '}'
        ].join('\n'),
        'theme-x-dark/button/Split.css': ':where(.neo-theme-x-dark) .neo-split-button {--button-text-color: #000000;}',
        'theme-x-light/Global.css'     : ':where(.neo-theme-x-light) {--gray-100: #eeeeee; --sem-surface: #fafafa; --sem-unused: #333333; --cmp-radius: 4px;}',
        'theme-x-light/button/Base.css': [
            ':where(.neo-theme-x-light) {',
            '    --button-background-color: var(--sem-surface);',
            '    --button-text-color      : #111111;',
            '    --button-border-radius   : var(--cmp-radius);',
            '    --button-gap             : var(--gray-100);',
            '    --button-color-hover     : var(--button-text-color);',
            '    --button-light-only      : 1px;',
            '}'
        ].join('\n'),
        'theme-solo/Global.css'     : ':where(.neo-theme-solo) {}',
        'theme-solo/button/Base.css': ':where(.neo-theme-solo) {--button-background-color: #123456}'
    };

test.describe('theme-census — the shape of the theme tree, as counts anyone can re-run', () => {
    let collect, render, root, tmpRoot;

    test.beforeAll(async () => {
        ({collectThemeCensus: collect, renderCensus: render} = await import('../../../../buildScripts/util/theme-census.mjs'));
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-theme-census-'));
        root    = path.join(tmpRoot, 'css');

        for (const [file, css] of Object.entries(FIXTURE)) {
            fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
            fs.writeFileSync(path.join(root, file), css)
        }
    });

    test.afterAll(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    test('CONTROL: the live tree is read, the Neo pair is found, the component-alias layer is empty, and no runtime-set property is reported', async () => {
        const
            {RUNTIME_PROPERTIES} = await import('../../../../buildScripts/util/themeCss.mjs'),
            census               = collect();

        expect(census.pairs).toEqual([
            expect.objectContaining({dark: 'theme-dark',     light: 'theme-light'}),
            expect.objectContaining({dark: 'theme-neo-dark', light: 'theme-neo-light'})
        ]);
        expect(Object.values(census.themes).flatMap(theme => Object.values(theme.unresolved).flat()).filter(name => name in RUNTIME_PROPERTIES)).toEqual([]);

        for (const name of census.pairs.flatMap(pair => [pair.dark, pair.light])) {
            expect(census.themes[name].unresolved.engine, name).toEqual([]);
        }

        for (const [themeName, theme] of Object.entries(census.themes)) {
            expect(theme.properties.engine.cmp, `${themeName} engine component aliases`).toBe(0);
            expect(theme.properties.apps.cmp, `${themeName} apps component aliases`).toBe(0);
            expect(theme.properties.examples.cmp, `${themeName} examples component aliases`).toBe(0);
            expect(theme.composition.cmp, `${themeName} component values via aliases`).toBe(0);
        }
    });

    test('1: files and unique properties per area and layer; a commented-out declaration is not one, a declaration again with another value is named', () => {
        const theme = collect({root, runtimeProperties: runtime}).themes['theme-x-dark'];

        expect(theme.files).toEqual({engine: 3, apps: 1, examples: 0});
        expect(theme.properties.engine).toEqual({palette: 1, sem: 2, cmp: 1, component: 6, total: 10});
        expect(theme.properties.apps).toEqual({palette: 0, sem: 0, cmp: 0, component: 1, total: 1});
        expect(theme.redeclared.engine).toEqual({count: 1, conflicting: ['--button-text-color']});
    });

    test('2: an engine component value is made of a role, a component token, the palette, another variable or a literal; the first declaration in file order counts', () => {
        expect(collect({root, runtimeProperties: runtime}).themes['theme-x-dark'].composition).toEqual({
            sem: 1, cmp: 1, palette: 1, variable: 1, colourLiteral: 1, literal: 1, total: 6
        });
    });

    test('3: a light and dark pair, per layer: shared names, identical and differing values, names on one side only', () => {
        expect(collect({root, runtimeProperties: runtime}).pairs).toEqual([{
            dark  : 'theme-x-dark',
            light : 'theme-x-light',
            layers: {
                palette  : {shared: 1, identical: 0, differ: 1, onlyDark: 0, onlyLight: 0},
                sem      : {shared: 2, identical: 1, differ: 1, onlyDark: 0, onlyLight: 0},
                cmp      : {shared: 1, identical: 1, differ: 0, onlyDark: 0, onlyLight: 0},
                component: {shared: 5, identical: 4, differ: 1, onlyDark: 1, onlyLight: 1}
            }
        }]);
    });

    test('4: the component names every full theme declares; a theme without a sibling is not full', () => {
        expect(collect({root, runtimeProperties: runtime}).shared).toEqual({themes: ['theme-x-dark', 'theme-x-light'], component: 5});
    });

    test('5: declarations no CSS under the root reads, per area and layer', () => {
        const {unread} = collect({root, runtimeProperties: runtime}).themes['theme-x-dark'];

        expect(unread.engine).toEqual({
            palette  : [],
            sem      : ['--sem-unused'],
            cmp      : [],
            component: ['--button-border-radius', '--button-color-hover', '--button-focus-outline-width', '--button-gap']
        });
        expect(unread.apps.component).toEqual(['--demo-panel-bg']);
    });

    test('6: a structural read without a fallback that nothing declares, once per name; a fallback, a structural or theme declaration (with or without its `;`) and a runtime row each excuse it', () => {
        const census = collect({root, runtimeProperties: runtime}), {themes} = census;

        expect(census.runtime).toEqual(['--neo-tree-level']);
        expect(themes['theme-x-dark'].unresolved).toEqual({engine: ['--ghost-margin', '--mixed-read'], apps: ['--app-ghost'], examples: []});
        expect(themes['theme-solo'].unresolved.engine).toEqual(['--button-text-color', '--ghost-margin', '--mixed-read']);
        expect(collect({root, runtimeProperties: {}}).themes['theme-x-dark'].unresolved.engine).toContain('--neo-tree-level');
    });

    test('7: colour literals in structural rules, per engine file, outside custom-property declarations: bare, or inside a var() fallback', () => {
        expect(collect({root, runtimeProperties: runtime}).structural).toEqual({
            files         : {engine: 2, apps: 1, examples: 0},
            colourLiterals: {'button/Base.css': {bare: 2, inFallback: 1}}
        });
    });

    test('8: the words for a background, a text colour and an icon colour, and where a state word sits', () => {
        expect(collect({root, runtimeProperties: runtime}).themes['theme-x-dark'].naming).toEqual({
            background: {'background-color': 1},
            text      : {'text-color': 1, color: 1},
            icon      : {},
            state     : {last: 1, elsewhere: 1}
        });
    });

    test('RENDERS: one Markdown section per count, headed by the label it was given', () => {
        const markdown = render(collect({root, runtimeProperties: runtime}), 'fixture/css');

        expect(markdown.startsWith('# Theme census: `fixture/css`')).toBe(true);
        expect(markdown.match(/^## \d\. /gm)).toHaveLength(8);
        expect(markdown).toContain('Set at runtime, so not counted: `--neo-tree-level`.');
        expect(markdown).toContain('3 in 1 files: 2 bare, 1 inside a `var()` fallback');
        expect(markdown).toContain('| `button/Base.css` | 2 | 1 |');
    });

    test('CLI: --json prints the object for the tree --root names', () => {
        const census = JSON.parse(execFileSync(process.execPath, [cli, '--json', '--root', root], {encoding: 'utf8'}));

        expect(census.shared).toEqual({themes: ['theme-x-dark', 'theme-x-light'], component: 5});
    });

    test('FAILS CLOSED: a root without src/ or theme directories throws, never an empty census', () => {
        expect(() => collect({root: path.join(tmpRoot, 'does-not-exist')})).toThrow(/needs src\/ and at least one mapped theme directory/);
    });

    test('MAP READERS: resolves non-theme-* folders from theme-map.json, excludes theme-base as a standalone theme, and credits theme-base shared declarations', () => {
        const mapFixtureRoot = path.join(tmpRoot, 'mapped/resources/css'),
              mapPath        = path.join(tmpRoot, 'mapped/resources/theme-map.json'),
              writeCss       = (rel, css) => {
                  const full = path.join(mapFixtureRoot, rel);
                  fs.mkdirSync(path.dirname(full), {recursive: true});
                  fs.writeFileSync(full, css, 'utf8')
              };

        writeCss('src/button/Base.css', '.neo-button { color: var(--button-color); gap: var(--button-gap); }');
        writeCss('theme-base/button/Base.css', '[class*="neo-theme-"] { --button-color: var(--sem-text); }');
        writeCss('brand-skin/Global.css', ':where(.neo-theme-brand) { --sem-text: #111111; }');
        writeCss('brand-skin/button/Base.css', ':where(.neo-theme-brand) { --button-gap: 4px; }');
        writeCss('theme-decoy/button/Base.css', '.decoy { --unused: 1px; }');
        fs.writeFileSync(mapPath, JSON.stringify({themes: {'neo-theme-brand': ['brand-skin']}}), 'utf8');

        const census = collect({root: mapFixtureRoot});

        expect(Object.keys(census.themes)).toEqual(['brand-skin']);
        expect(census.themes['brand-skin'].unresolved.engine).toEqual([]);
        expect(census.themes['brand-skin'].unread.engine.sem).toEqual([])
    });

    test('SPLIT & SUFFIX-FREE PAIRS: merges multi-folder classes into one theme entry and pairs dark/light schemes via mapped class names', () => {
        const pairRoot = path.join(tmpRoot, 'split-pairs/resources/css'),
              mapPath  = path.join(tmpRoot, 'split-pairs/resources/theme-map.json'),
              writeCss = (rel, css) => {
                  const full = path.join(pairRoot, rel);
                  fs.mkdirSync(path.dirname(full), {recursive: true});
                  fs.writeFileSync(full, css, 'utf8')
              };

        writeCss('src/button/Base.css', '.neo-button { background-color: var(--button-background-color); color: var(--button-color); }');
        writeCss('obsidian/Global.css', ':where(.neo-theme-brand-dark) { --sem-surface: #111111; }');
        writeCss('obsidian/button/Base.css', ':where(.neo-theme-brand-dark) { --button-background-color: var(--sem-surface); --button-color: #eeeeee; }');
        writeCss('alabaster/Global.css', ':where(.neo-theme-brand-light) { --sem-surface: #ffffff; }');
        writeCss('alabaster/button/Base.css', ':where(.neo-theme-brand-light) { --button-background-color: var(--sem-surface); --button-color: #111111; }');
        writeCss('split-roles/Global.css', ':where(.neo-theme-split) { --sem-surface: #333333; }');
        writeCss('split-widgets/button/Base.css', ':where(.neo-theme-split) { --button-background-color: var(--sem-surface); --button-color: #dddddd; }');
        fs.writeFileSync(mapPath, JSON.stringify({
            themes: {
                'neo-theme-brand-dark' : ['obsidian'],
                'neo-theme-brand-light': ['alabaster'],
                'neo-theme-split'      : ['split-roles', 'split-widgets']
            }
        }), 'utf8');

        const census = collect({root: pairRoot, runtimeProperties: {}});

        expect(Object.keys(census.themes)).toEqual(['alabaster', 'neo-theme-split', 'obsidian']);
        expect(census.themes['neo-theme-split'].unresolved.engine).toEqual([]);
        expect(census.themes['neo-theme-split'].unread.engine.sem).toEqual([]);
        expect(census.pairs).toEqual([
            expect.objectContaining({
                dark  : 'obsidian',
                light : 'alabaster',
                layers: expect.objectContaining({
                    sem      : {shared: 1, identical: 0, differ: 1, onlyDark: 0, onlyLight: 0},
                    component: {shared: 2, identical: 1, differ: 1, onlyDark: 0, onlyLight: 0}
                })
            })
        ]);
        expect(census.shared).toEqual({themes: ['alabaster', 'obsidian'], component: 2})
    });
});
