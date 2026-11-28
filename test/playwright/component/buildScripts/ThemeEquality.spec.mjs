import {test, expect}            from '@playwright/test';
import {execFileSync, spawnSync} from 'node:child_process';
import fs                        from 'node:fs';
import os                        from 'node:os';
import path                      from 'node:path';
import {fileURLToPath}           from 'node:url';

import {
    evaluateExpectedDiffs,
    runThemeEquality
} from '../../../../buildScripts/util/theme-equality.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)),
      REPO_ROOT = path.resolve(__dirname, '../../../..'),
      DIST_CSS  = path.join(REPO_ROOT, 'dist/development/css'),
      CLI_PATH  = path.join(REPO_ROOT, 'buildScripts/util/theme-equality.mjs');

/**
 * @summary End-to-end headless Chromium and CLI verification of `runThemeEquality`:
 * 1. Compares two independently produced theme builds across all 5 themes and both scopes (`0` differences).
 * 2. Exercises both checkout-root (with JavaScript `src/`) and direct CSS-root inputs, plus multi-part text+glyph isolation.
 * 3. Exercises SwitchField knob (`::before`) + hovered track, Dialog header button hover, Chip close-button hover, Table row-ancestor hover, and classic `theme-dark` `scoped`-only flips.
 * 4. Verifies server cleanup and non-zero CLI exit without hanging when Chromium startup fails.
 */
test.describe('theme-equality headless Chromium integration', () => {
    const tempDirs = [];

    function makeTempCheckout() {
        const root   = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-theme-eq-checkout-')),
              cssDir = path.join(root, 'dist/development/css');

        tempDirs.push(root);
        // Include a real JavaScript `src/` folder so checkout-root resolution cannot confuse `<root>/src` with CSS `src/`
        fs.mkdirSync(path.join(root, 'src'), {recursive: true});
        fs.writeFileSync(path.join(root, 'src/Neo.mjs'), 'export default {};\n');

        fs.mkdirSync(path.dirname(cssDir), {recursive: true});
        fs.cpSync(DIST_CSS, cssDir, {recursive: true});

        fs.mkdirSync(path.join(root, 'resources'), {recursive: true});
        fs.copyFileSync(path.join(REPO_ROOT, 'resources/theme-map.json'), path.join(root, 'resources/theme-map.json'));

        return {root, cssDir}
    }

    test.afterAll(() => {
        tempDirs.forEach(dir => fs.rmSync(dir, {force: true, recursive: true}))
    });

    test('reports zero differences across two independently produced theme builds of the same commit', async () => {
        test.setTimeout(120000);

        // Snapshot the first build (`dist/development/css`), run a fresh independent `build-themes` pass for the second build,
        // and compare the first build against the live checkout root `.`.
        const buildOne = makeTempCheckout();

        execFileSync(
            process.execPath,
            [path.join(REPO_ROOT, 'buildScripts/build/themes.mjs'), '-n', '-e', 'dev', '-t', 'all'],
            {cwd: REPO_ROOT, stdio: 'pipe'}
        );

        const result = await runThemeEquality({
            base      : buildOne.root,
            baseSource: 'workspace',
            head      : REPO_ROOT,
            repoRoot  : REPO_ROOT
        });

        expect(result.ok).toBe(true);
        expect(result.diffs).toEqual([]);
        expect(result.unexpectedDiffs).toEqual([]);
        expect(result.totalComparisons).toBeGreaterThan(50000)
    });

    test('detects mutations equivalently via checkout-root and CSS-root inputs and isolates simultaneous multi-part changes', async () => {
        test.setTimeout(120000);

        const base = makeTempCheckout(),
              head = makeTempCheckout();

        const targetFile = path.join(head.cssDir, 'theme-base/button/Base.css'),
              original   = fs.readFileSync(targetFile, 'utf8'),
              mutated    = original
                  .replace(/--neo-button-primary-color\s*:\s*[^;]+;/, '--neo-button-primary-color: rgb(251, 13, 199);')
                  .replace(/--neo-button-primary-glyph-color\s*:\s*[^;]+;/, '--neo-button-primary-glyph-color: rgb(3, 244, 202);');

        expect(mutated).not.toBe(original);
        fs.writeFileSync(targetFile, mutated);

        const viaCheckoutRoots = await runThemeEquality({
            base      : base.root,
            baseSource: 'workspace',
            head      : head.root,
            headSource: 'workspace',
            themes    : ['neo-theme-neo-light'],
            repoRoot  : REPO_ROOT
        });

        const viaCssRoots = await runThemeEquality({
            base      : base.cssDir,
            baseSource: 'workspace',
            head      : head.cssDir,
            headSource: 'workspace',
            themes    : ['neo-theme-neo-light'],
            repoRoot  : REPO_ROOT
        });

        expect(viaCheckoutRoots.ok).toBe(false);
        expect(viaCssRoots.ok).toBe(false);
        expect(viaCheckoutRoots.diffs).toEqual(viaCssRoots.diffs);

        const textDiffs  = viaCheckoutRoots.diffs.filter(d => d.part === '.neo-button-text'),
              glyphDiffs = viaCheckoutRoots.diffs.filter(d => d.part === '.neo-button-glyph');

        expect(textDiffs).toHaveLength(16);
        expect(glyphDiffs).toHaveLength(16);

        // Declaring ONLY `.neo-button-text` rows as expected must leave all 16 `.neo-button-glyph` rows unexpected
        const partialExpected = evaluateExpectedDiffs(viaCheckoutRoots.diffs, [{
            component: 'button[primary]',
            theme    : 'neo-theme-neo-light',
            part     : '.neo-button-text'
        }]);
        expect(partialExpected.ok).toBe(false);
        expect(partialExpected.matchedDiffs).toEqual(textDiffs);
        expect(partialExpected.unexpectedDiffs).toEqual(glyphDiffs)
    });

    test('catches SwitchField knob/hover, Dialog header button hover, Chip close-button hover, Table row-ancestor hover, and classic theme-dark scoped-only flips', async () => {
        test.setTimeout(120000);

        const base = makeTempCheckout(),
              head = makeTempCheckout();

        // 1. SwitchField knob (`::before`) + unchecked & checked hover tracks in Neo Light
        const switchFile = path.join(head.cssDir, 'theme-base/form/field/Switch.css'),
              switchOrig = fs.readFileSync(switchFile, 'utf8'),
              switchNext = switchOrig
                  .replace(/--neo-switchfield-knob-background-color\s*:\s*[^;]+;/, '--neo-switchfield-knob-background-color: rgb(251, 13, 199);')
                  .replace(/--neo-switchfield-off-background-color-hover\s*:\s*[^;]+;/, '--neo-switchfield-off-background-color-hover: rgb(3, 244, 202);')
                  .replace(/--neo-switchfield-on-background-color-hover\s*:\s*[^;]+;/, '--neo-switchfield-on-background-color-hover: rgb(244, 180, 12);');

        expect(switchNext).not.toBe(switchOrig);
        fs.writeFileSync(switchFile, switchNext);

        // 2. Dialog header button hover inherits the shared binding in Neo Light
        const dialogFile = path.join(head.cssDir, 'theme-base/dialog/Base.css'),
              dialogOrig = fs.readFileSync(dialogFile, 'utf8'),
              dialogNext = dialogOrig.replace(
                  /--neo-dialog-header-button-background-color-hover\s*:\s*[^;]+;/,
                  '--neo-dialog-header-button-background-color-hover: rgb(220, 40, 90);'
              );

        expect(dialogNext).not.toBe(dialogOrig);
        fs.writeFileSync(dialogFile, dialogNext);

        // 3. Chip close-button hover (`--neo-chip-close-button-color-hover` on `.neo-chip-close-button:hover`)
        const chipFile = path.join(head.cssDir, 'theme-base/component/Chip.css'),
              chipOrig = fs.readFileSync(chipFile, 'utf8'),
              chipNext = chipOrig.replace(
                  /--neo-chip-close-button-color-hover\s*:\s*[^;]+;/,
                  '--neo-chip-close-button-color-hover: rgb(251, 13, 199);'
              );

        expect(chipNext).not.toBe(chipOrig);
        fs.writeFileSync(chipFile, chipNext);

        // 4. Table row-ancestor hover (`--neo-table-cell-background-color-hover` on `.neo-table-row:hover .neo-table-cell`)
        const tableFile = path.join(head.cssDir, 'theme-base/table/Body.css'),
              tableOrig = fs.readFileSync(tableFile, 'utf8'),
              tableNext = tableOrig.replace(
                  /--neo-table-cell-background-color-hover\s*:\s*[^;]+;/,
                  '--neo-table-cell-background-color-hover: rgb(19, 201, 144);'
              );

        expect(tableNext).not.toBe(tableOrig);
        fs.writeFileSync(tableFile, tableNext);

        // 5. Classic `theme-dark` scoped-only custom-property winner flip on `.neo-tooltip`
        const srcTooltipRule   = '\n.neo-tooltip { --neo-tooltip-background-color: rgb(18, 52, 86); }\n',
              themeTooltipRule = '\n:root .neo-theme-dark { --neo-tooltip-background-color: rgb(210, 99, 44); }\n';

        fs.appendFileSync(path.join(base.cssDir, 'src/tooltip/Base.css'), srcTooltipRule);
        fs.appendFileSync(path.join(head.cssDir, 'src/tooltip/Base.css'), srcTooltipRule);
        fs.appendFileSync(path.join(head.cssDir, 'theme-dark/tooltip/Base.css'), themeTooltipRule);

        const result = await runThemeEquality({
            base      : base.root,
            baseSource: 'workspace',
            head      : head.root,
            headSource: 'workspace',
            themes    : ['neo-theme-neo-light', 'neo-theme-dark'],
            repoRoot  : REPO_ROOT
        });

        expect(result.ok).toBe(false);

        // SwitchField knob (`::before`) caught
        expect(result.diffs).toContainEqual(expect.objectContaining({
            component: 'switchfield',
            theme    : 'neo-theme-neo-light',
            part     : 'input.neo-switchfield-input::before',
            property : 'background-color',
            head     : 'rgb(251, 13, 199)'
        }));

        // SwitchField unchecked & checked hovered tracks caught
        expect(result.diffs).toContainEqual(expect.objectContaining({
            component: 'switchfield',
            theme    : 'neo-theme-neo-light',
            state    : 'hover',
            part     : 'input.neo-switchfield-input',
            property : 'background-color',
            head     : 'rgb(3, 244, 202)'
        }));
        expect(result.diffs).toContainEqual(expect.objectContaining({
            component: 'switchfield[checked]',
            theme    : 'neo-theme-neo-light',
            state    : 'hover',
            part     : 'input.neo-switchfield-input',
            property : 'background-color',
            head     : 'rgb(244, 180, 12)'
        }));

        // Dialog hovered header button caught
        expect(result.diffs).toContainEqual(expect.objectContaining({
            component: 'dialog',
            theme    : 'neo-theme-neo-light',
            state    : 'hover',
            part     : '.neo-header-toolbar .neo-button',
            property : 'background-color',
            head     : 'rgb(220, 40, 90)'
        }));
        expect(result.diffs.filter(diff => diff.component === 'dialog' && diff.theme === 'neo-theme-dark')).toEqual([]);

        // Chip hovered close button caught
        expect(result.diffs).toContainEqual(expect.objectContaining({
            component: 'chip',
            theme    : 'neo-theme-neo-light',
            state    : 'hover',
            part     : '.neo-chip-close-button',
            property : 'color',
            head     : 'rgb(251, 13, 199)'
        }));

        // Table cell hovered via `.neo-table-row:hover` ancestor propagation caught
        expect(result.diffs).toContainEqual(expect.objectContaining({
            component: 'table',
            theme    : 'neo-theme-neo-light',
            state    : 'hover',
            part     : '.neo-table-cell',
            property : 'background-color',
            head     : 'rgb(19, 201, 144)'
        }));

        // Scoped-only tooltip control caught in `scoped` while `inherited` stays untouched
        expect(result.diffs.filter(d => d.component === 'tooltip')).toEqual([{
            component: 'tooltip',
            theme    : 'neo-theme-dark',
            scope    : 'scoped',
            state    : 'default',
            part     : '.neo-tooltip',
            property : 'background-color',
            base     : expect.any(String),
            head     : 'rgb(210, 99, 44)'
        }])
    });

    test('fails closed when ONLY --neo-chip-close-button-color-hover is mutated in Neo Light', async () => {
        test.setTimeout(120000);

        const base = makeTempCheckout(),
              head = makeTempCheckout();

        const chipFile = path.join(head.cssDir, 'theme-base/component/Chip.css'),
              chipOrig = fs.readFileSync(chipFile, 'utf8'),
              chipNext = chipOrig.replace(
                  /--neo-chip-close-button-color-hover\s*:\s*[^;]+;/,
                  '--neo-chip-close-button-color-hover: rgb(251, 13, 199);'
              );

        expect(chipNext).not.toBe(chipOrig);
        fs.writeFileSync(chipFile, chipNext);

        const result = await runThemeEquality({
            base      : base.root,
            baseSource: 'workspace',
            head      : head.root,
            headSource: 'workspace',
            themes    : ['neo-theme-neo-light'],
            repoRoot  : REPO_ROOT
        });

        expect(result.ok).toBe(false);
        expect(result.unexpectedDiffs.length).toBeGreaterThanOrEqual(2);
        expect(result.unexpectedDiffs.every(d => d.component === 'chip' && d.part === '.neo-chip-close-button')).toBe(true);
        expect(result.unexpectedDiffs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                component: 'chip',
                theme    : 'neo-theme-neo-light',
                scope    : 'inherited',
                state    : 'hover',
                part     : '.neo-chip-close-button',
                property : 'color',
                head     : 'rgb(251, 13, 199)'
            }),
            expect.objectContaining({
                component: 'chip',
                theme    : 'neo-theme-neo-light',
                scope    : 'scoped',
                state    : 'hover',
                part     : '.neo-chip-close-button',
                property : 'color',
                head     : 'rgb(251, 13, 199)'
            })
        ]))
    });

    test('closes the loopback server and exits non-zero promptly when Chromium launch fails', () => {
        const emptyBrowsersDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-empty-browsers-'));
        tempDirs.push(emptyBrowsersDir);

        const proc = spawnSync(
            process.execPath,
            [CLI_PATH, '--base', REPO_ROOT, '--head', REPO_ROOT, '--themes', 'neo-theme-neo-light'],
            {
                cwd     : REPO_ROOT,
                encoding: 'utf8',
                env     : {...process.env, PLAYWRIGHT_BROWSERS_PATH: emptyBrowsersDir},
                timeout : 10000
            }
        );

        // Must exit on its own (signal === null, not killed by timeout) with code 1 and a diagnostic on stderr
        expect(proc.signal).toBeNull();
        expect(proc.status).toBe(1);
        expect(proc.stderr).toMatch(/Executable doesn't exist|browserType\.launch/i)
    });

    test('pairs standard dist/development/css folder inputs with their enclosing checkout JS across Cube runtime property renames and requires explicit source for portable snapshots', async () => {
        test.setTimeout(120000);

        const checkoutRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-theme-eq-cube-checkout-')),
              checkoutCss  = path.join(checkoutRoot, 'dist/development/css'),
              portableCss  = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-theme-eq-cube-portable-'));

        tempDirs.push(checkoutRoot, portableCss);

        fs.cpSync(path.join(REPO_ROOT, 'src'), path.join(checkoutRoot, 'src'), {recursive: true});
        fs.mkdirSync(path.dirname(checkoutCss), {recursive: true});
        fs.cpSync(DIST_CSS, checkoutCss, {recursive: true});
        fs.mkdirSync(path.join(checkoutRoot, 'resources'), {recursive: true});
        fs.copyFileSync(path.join(REPO_ROOT, 'resources/theme-map.json'), path.join(checkoutRoot, 'resources/theme-map.json'));

        // Simulate pre-rename Cube JS writer (`side-x/y/z`) paired with pre-rename Cube CSS (`side-x/y/z`)
        const cubeJsPath  = path.join(checkoutRoot, 'src/layout/Cube.mjs'),
              cubeCssPath = path.join(checkoutCss, 'src/layout/Cube.css'),
              legacySide  = token => '--' + 'side-' + token;

        fs.writeFileSync(
            cubeJsPath,
            fs.readFileSync(cubeJsPath, 'utf8')
                .replaceAll('--neo-layout-cube-side-x', legacySide('x'))
                .replaceAll('--neo-layout-cube-side-y', legacySide('y'))
                .replaceAll('--neo-layout-cube-side-z', legacySide('z'))
        );
        fs.writeFileSync(
            cubeCssPath,
            fs.readFileSync(cubeCssPath, 'utf8')
                .replaceAll('--neo-layout-cube-side-x', legacySide('x'))
                .replaceAll('--neo-layout-cube-side-y', legacySide('y'))
                .replaceAll('--neo-layout-cube-side-z', legacySide('z'))
        );

        fs.cpSync(checkoutCss, portableCss, {recursive: true});
        fs.copyFileSync(path.join(REPO_ROOT, 'resources/theme-map.json'), path.join(portableCss, 'theme-map.json'));

        // 1. Portable CSS snapshot without an explicit source choice fails closed
        await expect(runThemeEquality({
            base    : portableCss,
            head    : REPO_ROOT,
            themes  : ['neo-theme-neo-light'],
            repoRoot: REPO_ROOT
        })).rejects.toThrow(/Portable CSS snapshot.*--base-source/);

        // 2. Direct `<checkout>/dist/development/css` folder input infers `<checkout>` JS (`Cube.mjs`) -> 0 differences
        const fromDirectBuildCss = await runThemeEquality({
            base    : checkoutCss,
            head    : REPO_ROOT,
            themes  : ['neo-theme-neo-light'],
            repoRoot: REPO_ROOT
        });

        expect(fromDirectBuildCss.baseSource).toEqual({mode: 'inferred-checkout', root: checkoutRoot});
        expect(fromDirectBuildCss.ok).toBe(true);
        expect(fromDirectBuildCss.diffs).toEqual([]);

        // 3. Portable CSS snapshot explicitly paired with `workspace` (head JS) exposes the Cube runtime-property mismatch
        const mismatchedPortable = await runThemeEquality({
            base      : portableCss,
            baseSource: 'workspace',
            head      : REPO_ROOT,
            themes    : ['neo-theme-neo-light'],
            repoRoot  : REPO_ROOT
        });

        expect(mismatchedPortable.ok).toBe(false);
        expect(mismatchedPortable.diffs.some(d => d.component.includes('cube'))).toBe(true);

        // 4. Portable CSS snapshot explicitly paired with `checkoutRoot` matches cleanly
        const matchedPortable = await runThemeEquality({
            base      : portableCss,
            baseSource: checkoutRoot,
            head      : REPO_ROOT,
            themes    : ['neo-theme-neo-light'],
            repoRoot  : REPO_ROOT
        });

        expect(matchedPortable.baseSource).toEqual({mode: 'explicit', root: checkoutRoot});
        expect(matchedPortable.ok).toBe(true);
        expect(matchedPortable.diffs).toEqual([])
    });

    test('binds the Neo Dark ghost glyph to its roles: text-strong on hover, text-on-accent when pressed', async ({page}) => {
        await page.goto('/test/playwright/component/apps/theme-switcher/index.html?theme=neo-theme-neo-dark');

        const button = page.locator('#theme-switcher-test-viewport.neo-theme-neo-dark .neo-button-ghost').first();
        await expect(button).toBeVisible();

        await page.evaluate(() => {
            const root = document.getElementById('theme-switcher-test-viewport');
            root.style.setProperty('--neo-color-text-on-accent', 'rgb(230, 15, 25)');
            root.style.setProperty('--neo-color-text-strong', 'rgb(10, 190, 25)');
        });

        await button.hover();
        const hoverGlyphColor = await button.locator('.neo-button-glyph').evaluate(el => getComputedStyle(el).color);

        const pressedGlyphColor = await button.evaluate(el => {
            el.classList.add('pressed');
            return getComputedStyle(el.querySelector('.neo-button-glyph')).color
        });

        expect(hoverGlyphColor).toBe('rgb(10, 190, 25)');
        expect(pressedGlyphColor).toBe('rgb(230, 15, 25)')
    })
});
