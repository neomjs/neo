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
    resolveBuiltTree
} from '../../../../../buildScripts/util/theme-equality.mjs';
import {
    COMPONENT_MATRIX,
    ENGINE_PACKAGE_MATRIX,
    PAINTED_PROPERTIES,
    SCOPES,
    STATES,
    THEMES,
    validateEnginePackageMatrix
} from '../../../../../buildScripts/util/themeEqualityMatrix.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)),
      REPO_ROOT = path.resolve(__dirname, '../../../../..');

/**
 * @summary Unit coverage for the computed-style equality matrix, built-tree resolution,
 * snapshot diffing, and expected-difference accounting.
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

    test('matrix covers every engine package under resources/css/src with rendered components or an explicit reason', () => {
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
            for (const state of entry.states) {
                expect(STATES).toContain(state)
            }
        }
    });

    test('resolveBuiltTree and collectThemeStylesheetUrls order Global.css first, include theme-base, and exclude apps/examples', () => {
        const root   = makeTempDir(),
              cssDir = path.join(root, 'dist/development/css');

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
                'neo-theme-neo-light': ['theme-neo']
            }
        }));

        const fromRepoRoot = resolveBuiltTree(root, 'development'),
              fromCssDir   = resolveBuiltTree(cssDir, 'development');

        expect(fromRepoRoot.cssRoot).toBe(cssDir);
        expect(fromCssDir.cssRoot).toBe(cssDir);

        const urls = collectThemeStylesheetUrls(fromRepoRoot, 'neo-theme-neo-light');

        expect(urls).toEqual([
            '/__equality_css/src/Global.css',
            '/__equality_css/src/button/Base.css',
            '/__equality_css/theme-base/button/Base.css',
            '/__equality_css/theme-neo/Global.css'
        ])
    });

    test('compareSnapshots reports zero diffs on identical snapshots and isolates single-property changes', () => {
        const makeValues = overrides => Object.fromEntries(
            PAINTED_PROPERTIES.map(prop => [prop, overrides?.[prop] ?? 'initial'])
        );

        const base = {
            'button[primary]': {
                'neo-theme-neo-light': {
                    inherited: {
                        default: {'.neo-button': makeValues({'background-color': 'rgb(10, 20, 30)'})},
                        hover  : {'.neo-button': makeValues({'background-color': 'rgb(20, 30, 40)'})}
                    },
                    scoped: {
                        default: {'.neo-button': makeValues({'background-color': 'rgb(10, 20, 30)'})},
                        hover  : {'.neo-button': makeValues({'background-color': 'rgb(20, 30, 40)'})}
                    }
                },
                'neo-theme-neo-dark': {
                    inherited: {
                        default: {'.neo-button': makeValues({'background-color': 'rgb(50, 60, 70)'})}
                    }
                }
            }
        };

        const identical = compareSnapshots(base, structuredClone(base));
        expect(identical.diffs).toEqual([]);

        const mutated = structuredClone(base);
        mutated['button[primary]']['neo-theme-neo-light'].scoped.hover['.neo-button']['background-color'] = 'rgb(255, 0, 128)';

        const changed = compareSnapshots(base, mutated);
        expect(changed.diffs).toEqual([{
            component: 'button[primary]',
            theme    : 'neo-theme-neo-light',
            scope    : 'scoped',
            state    : 'hover',
            property : 'background-color',
            part     : '.neo-button',
            base     : 'rgb(20, 30, 40)',
            head     : 'rgb(255, 0, 128)'
        }])
    });

    test('evaluateExpectedDiffs passes declared diffs, fails undeclared diffs, and fails unmet expected diffs', () => {
        const observed = [{
            component: 'button[primary]',
            theme    : 'neo-theme-neo-light',
            scope    : 'scoped',
            state    : 'hover',
            property : 'background-color',
            part     : '.neo-button',
            base     : 'rgb(20, 30, 40)',
            head     : 'rgb(255, 0, 128)'
        }];

        // Undeclared difference fails
        const undeclared = evaluateExpectedDiffs(observed, []);
        expect(undeclared.ok).toBe(false);
        expect(undeclared.unexpectedDiffs).toHaveLength(1);

        // Matching expected difference passes
        const declared = evaluateExpectedDiffs(observed, [{
            component: 'button[primary]',
            theme    : 'neo-theme-neo-light',
            scope    : 'scoped',
            state    : 'hover',
            property : 'background-color'
        }]);
        expect(declared.ok).toBe(true);
        expect(declared.unexpectedDiffs).toEqual([]);
        expect(declared.matchedDiffs).toHaveLength(1);
        expect(declared.unmetExpected).toEqual([]);

        // Mismatched scope fails both unexpectedDiffs and unmetExpected
        const wrongScope = evaluateExpectedDiffs(observed, [{
            component: 'button[primary]',
            theme    : 'neo-theme-neo-light',
            scope    : 'inherited',
            state    : 'hover',
            property : 'background-color'
        }]);
        expect(wrongScope.ok).toBe(false);
        expect(wrongScope.unexpectedDiffs).toHaveLength(1);
        expect(wrongScope.unmetExpected).toHaveLength(1);

        // Declared expected difference that did not occur fails
        const unmet = evaluateExpectedDiffs(observed, [
            {
                component: 'button[primary]',
                theme    : 'neo-theme-neo-light',
                state    : 'hover',
                property : 'background-color'
            },
            {
                component: 'chip',
                theme    : 'neo-theme-neo-dark',
                state    : 'focus',
                property : 'border-color'
            }
        ]);
        expect(unmet.ok).toBe(false);
        expect(unmet.unmetExpected).toEqual([{
            component: 'chip',
            theme    : 'neo-theme-neo-dark',
            state    : 'focus',
            property : 'border-color'
        }]);

        const report = formatEqualityReport({
            ok              : unmet.ok,
            elapsedMs       : 1234,
            themes          : ['neo-theme-neo-light'],
            scopes          : ['inherited', 'scoped'],
            componentCount  : 77,
            packageCoverage : {diskPackages: new Array(29)},
            totalComparisons: 100,
            diffs           : observed,
            unexpectedDiffs : unmet.unexpectedDiffs,
            matchedDiffs    : unmet.matchedDiffs,
            unmetExpected   : unmet.unmetExpected
        });
        expect(report).toContain('## Differences');
        expect(report).toContain('## Unmet Expected Differences')
    })
});
