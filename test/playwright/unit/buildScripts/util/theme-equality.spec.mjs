import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {
    collectThemeStylesheetUrls,
    compareSnapshots,
    evaluateExpectedDiffs,
    formatEqualityReport,
    resolveBuiltTree,
    validateExpectedRules
} from '../../../../../buildScripts/util/theme-equality.mjs';
import {
    COMPONENT_MATRIX,
    ENGINE_PACKAGE_MATRIX,
    normalizePartSpec,
    PAINTED_PROPERTIES,
    SCOPES,
    STATES,
    THEMES,
    validateEnginePackageMatrix
} from '../../../../../buildScripts/util/themeEqualityMatrix.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)),
      REPO_ROOT = path.resolve(__dirname, '../../../../..');

/**
 * @summary Unit coverage for the computed-style equality matrix, checkout-vs-CSS-root resolution,
 * part-granular snapshot diffing, and strict expected-difference schema validation.
 */
test.describe('buildScripts/util/theme-equality', () => {
    const tempDirs = [];

    function makeTempDir() {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-theme-eq-unit-'));
        tempDirs.push(dir);
        return dir
    }

    test.afterAll(() => {
        tempDirs.forEach(dir => fs.rmSync(dir, {force: true, recursive: true}))
    });

    test('matrix covers every engine package under resources/css/src with normalized element and pseudo-element parts', () => {
        const report = validateEnginePackageMatrix(path.join(REPO_ROOT, 'resources/css/src'));

        expect(report.ok, JSON.stringify(report)).toBe(true);
        expect(report.missingPackages).toEqual([]);
        expect(report.extraPackages).toEqual([]);
        expect(report.invalidRendered).toEqual([]);
        expect(report.invalidUnrendered).toEqual([]);
        expect(ENGINE_PACKAGE_MATRIX.length).toBeGreaterThanOrEqual(29);
        expect(THEMES).toEqual([
            'neo-theme-neo-light',
            'neo-theme-neo-dark',
            'neo-theme-light',
            'neo-theme-dark',
            'neo-theme-cyberpunk'
        ]);
        expect(SCOPES).toEqual(['inherited', 'scoped']);
        expect(STATES).toEqual([
            'default', 'hover', 'active', 'focus', 'selected', 'pressed', 'disabled', 'invalid', 'readonly'
        ]);

        for (const entry of COMPONENT_MATRIX) {
            expect(entry.parts.length).toBeGreaterThan(0);
            for (const rawPart of entry.parts) {
                const part = normalizePartSpec(rawPart);
                expect(part.id.length).toBeGreaterThan(0);
                expect(part.selector.length).toBeGreaterThan(0);
                if (part.pseudo) {
                    expect(['::before', '::after']).toContain(part.pseudo)
                }
            }
            for (const state of entry.states) {
                expect(STATES).toContain(state)
            }
            if (entry.stateTargets) {
                for (const [state, target] of Object.entries(entry.stateTargets)) {
                    expect(STATES).toContain(state);
                    const list = Array.isArray(target) ? target : [target];
                    expect(list.length).toBeGreaterThan(0);
                    list.forEach(sel => expect(sel.length).toBeGreaterThan(0))
                }
            }
        }

        const chipEntry = COMPONENT_MATRIX.find(entry => entry.id === 'chip');
        expect(chipEntry.stateTargets?.hover).toBe('.neo-chip-close-button')
    });

    test('resolveBuiltTree distinguishes a checkout root with JavaScript src/ from a direct CSS root and fails on missing structural or theme sheets', () => {
        const root   = makeTempDir(),
              jsSrc  = path.join(root, 'src'),
              cssDir = path.join(root, 'dist/development/css');

        // Populate JavaScript `src/` at the checkout root so a naive `existsSync('<root>/src')` check would misfire
        fs.mkdirSync(jsSrc, {recursive: true});
        fs.writeFileSync(path.join(jsSrc, 'Neo.mjs'), 'export default {};\n');

        // Before building CSS, resolving the checkout root must fail clearly rather than reading `<root>/src`
        expect(() => resolveBuiltTree(root, 'development')).toThrow(/missing structural "src\/Global\.css"/);

        const write = (rel, content = '/* css */') => {
            const full = path.join(cssDir, rel);
            fs.mkdirSync(path.dirname(full), {recursive: true});
            fs.writeFileSync(full, content)
        };

        write('src/button/Base.css');
        write('src/Global.css');
        write('src/apps/portal/Viewport.css');
        write('src/examples/button/base/MainContainer.css');
        write('theme-base/button/Base.css');
        write('theme-neo/Global.css');

        fs.mkdirSync(path.join(root, 'resources'), {recursive: true});
        fs.writeFileSync(path.join(root, 'resources/theme-map.json'), JSON.stringify({
            themes: {
                'neo-theme-neo-light': ['theme-neo'],
                'neo-theme-missing'  : ['theme-missing']
            }
        }));

        const fromStubRoot = resolveBuiltTree(root, 'development'),
              fromCssDir   = resolveBuiltTree(cssDir, 'development');

        expect(fromStubRoot.cssRoot).toBe(cssDir);
        expect(fromStubRoot.sourceRoot).toBeNull();
        expect(fromCssDir.cssRoot).toBe(cssDir);
        expect(fromCssDir.sourceRoot).toBeNull();
        expect(fromCssDir.themeMap?.themes?.['neo-theme-neo-light']).toEqual(['theme-neo']);

        fs.writeFileSync(path.join(jsSrc, 'DefaultConfig.mjs'), 'export default {};\n');
        const fromRepoRoot = resolveBuiltTree(root, 'development');
        expect(fromRepoRoot.sourceRoot).toBe(root);

        const urls = collectThemeStylesheetUrls(fromRepoRoot, 'neo-theme-neo-light');

        expect(urls).toEqual([
            '/__equality_css/src/Global.css',
            '/__equality_css/src/button/Base.css',
            '/__equality_css/theme-base/button/Base.css',
            '/__equality_css/theme-neo/Global.css'
        ]);

        // Unmapped or missing theme folders must fail closed
        expect(() => collectThemeStylesheetUrls(fromRepoRoot, 'neo-theme-dark')).toThrow(/not mapped in theme-map\.json/);
        expect(() => collectThemeStylesheetUrls(fromRepoRoot, 'neo-theme-missing')).toThrow(/resolved insufficient theme stylesheets/)
    });

    test('collectThemeStylesheetUrls mounts only the sheets a theme map with the Neo class tree names, as the runtime requests', () => {
        const root   = makeTempDir(),
              cssDir = path.join(root, 'dist/development/css');

        fs.mkdirSync(path.join(root, 'src'), {recursive: true});
        fs.writeFileSync(path.join(root, 'src/Neo.mjs'), 'export default {};\n');

        const write = rel => {
            const full = path.join(cssDir, rel);
            fs.mkdirSync(path.dirname(full), {recursive: true});
            fs.writeFileSync(full, '/* css */')
        };

        write('src/Global.css');
        write('src/button/Base.css');
        write('src/examples/button/base/MainContainer.css');
        write('theme-neo/Global.css');
        write('theme-neo/button/Base.css');

        // Built sheets whose sources are gone: no leaf of the map names them
        write('src/component/IconLink.css');
        write('theme-neo/design-tokens/Core.css');

        fs.mkdirSync(path.join(root, 'resources'), {recursive: true});
        fs.writeFileSync(path.join(root, 'resources/theme-map.json'), JSON.stringify({
            themes: {'neo-theme-neo-light': ['theme-neo']},
            Neo   : {
                Global  : ['src', 'theme-neo'],
                button  : {Base: ['src', 'theme-neo']},
                examples: {button: {base: {MainContainer: ['src']}}}
            },
            apps  : {portal: {Viewport: ['src']}}
        }));

        const tree = resolveBuiltTree(root, 'development');

        expect(collectThemeStylesheetUrls(tree, 'neo-theme-neo-light')).toEqual([
            '/__equality_css/src/Global.css',
            '/__equality_css/src/button/Base.css',
            '/__equality_css/theme-neo/Global.css',
            '/__equality_css/theme-neo/button/Base.css'
        ]);

        // A sheet the map names but the build did not write fails closed, naming it
        fs.rmSync(path.join(cssDir, 'theme-neo/button/Base.css'));

        expect(() => collectThemeStylesheetUrls(tree, 'neo-theme-neo-light')).toThrow(/did not write in ".*theme-neo" \(first: button\/Base\.css\)/)
    });

    test('compareSnapshots emits every changed part/property and evaluateExpectedDiffs enforces part matching and rule schema', () => {
        const makeValues = overrides => Object.fromEntries(
            PAINTED_PROPERTIES.map(prop => [prop, overrides?.[prop] ?? 'initial'])
        );

        const base = {
            'button[primary]': {
                'neo-theme-neo-light': {
                    inherited: {
                        default: {
                            '.neo-button-text' : makeValues({color: 'rgb(10, 20, 30)'}),
                            '.neo-button-glyph': makeValues({color: 'rgb(10, 20, 30)'}),
                            '.neo-button-badge': makeValues({color: 'rgb(255, 255, 255)'})
                        }
                    }
                }
            }
        };

        const identical = compareSnapshots(base, structuredClone(base));
        expect(identical.diffs).toEqual([]);

        // Mutate BOTH text and glyph colors simultaneously
        const mutated = structuredClone(base);
        mutated['button[primary]']['neo-theme-neo-light'].inherited.default['.neo-button-text'].color  = 'rgb(200, 10, 20)';
        mutated['button[primary]']['neo-theme-neo-light'].inherited.default['.neo-button-glyph'].color = 'rgb(20, 200, 10)';

        const changed = compareSnapshots(base, mutated);
        expect(changed.diffs).toEqual([
            {
                component: 'button[primary]',
                theme    : 'neo-theme-neo-light',
                scope    : 'inherited',
                state    : 'default',
                part     : '.neo-button-text',
                property : 'color',
                base     : 'rgb(10, 20, 30)',
                head     : 'rgb(200, 10, 20)'
            },
            {
                component: 'button[primary]',
                theme    : 'neo-theme-neo-light',
                scope    : 'inherited',
                state    : 'default',
                part     : '.neo-button-glyph',
                property : 'color',
                base     : 'rgb(10, 20, 30)',
                head     : 'rgb(20, 200, 10)'
            }
        ]);

        // Declaring ONLY `.neo-button-text` must leave `.neo-button-glyph` unexpected
        const textOnly = evaluateExpectedDiffs(changed.diffs, [{
            component: 'button[primary]',
            theme    : 'neo-theme-neo-light',
            state    : 'default',
            part     : '.neo-button-text',
            property : 'color'
        }]);
        expect(textOnly.ok).toBe(false);
        expect(textOnly.matchedDiffs).toHaveLength(1);
        expect(textOnly.unexpectedDiffs).toEqual([changed.diffs[1]]);

        // Declaring an unchanged part (`.neo-button-badge`) must remain unmet
        const unmetPart = evaluateExpectedDiffs(changed.diffs, [
            {component: 'button[primary]', part: '.neo-button-text',  property: 'color'},
            {component: 'button[primary]', part: '.neo-button-glyph', property: 'color'},
            {component: 'button[primary]', part: '.neo-button-badge', property: 'color'}
        ]);
        expect(unmetPart.ok).toBe(false);
        expect(unmetPart.unexpectedDiffs).toEqual([]);
        expect(unmetPart.unmetExpected).toEqual([
            {component: 'button[primary]', part: '.neo-button-badge', property: 'color'}
        ]);

        // Schema validation rejects misspelled/unknown keys and missing or wildcard `component`
        expect(() => validateExpectedRules([{componnet: 'nope'}])).toThrow(/Unknown key "componnet"/);
        expect(() => validateExpectedRules([{theme: 'neo-theme-neo-light'}])).toThrow(/requires a specific non-wildcard "component"/);
        expect(() => validateExpectedRules([{component: '*'}])).toThrow(/requires a specific non-wildcard "component"/);

        const report = formatEqualityReport({
            ok              : unmetPart.ok,
            elapsedMs       : 1234,
            themes          : ['neo-theme-neo-light'],
            scopes          : ['inherited', 'scoped'],
            componentCount  : COMPONENT_MATRIX.length,
            packageCoverage : {diskPackages: new Array(29)},
            totalComparisons: changed.totalComparisons,
            diffs           : changed.diffs,
            unexpectedDiffs : textOnly.unexpectedDiffs,
            matchedDiffs    : textOnly.matchedDiffs,
            unmetExpected   : unmetPart.unmetExpected
        });
        expect(report).toContain('| Component | Theme | Scope | State | Part | Property | Base | Head | Disposition |');
        expect(report).toContain('`.neo-button-glyph`');
        expect(report).toContain('`.neo-button-badge`')
    })
});
