import {test, expect}       from '@playwright/test';
import autoprefixer         from 'autoprefixer';
import fs                   from 'node:fs';
import path                 from 'node:path';
import postcss              from 'postcss';
import {fileURLToPath}      from 'node:url';
import {cascadeLayerPlugin} from '../../../../buildScripts/util/themeCssLayers.mjs';

const
    __dirname      = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot       = path.resolve(__dirname, '../../../..'),
    distCss        = path.join(repoRoot, 'dist/development/css'),
    readBuilt      = rel => fs.readFileSync(path.join(distCss, rel), 'utf8'),
    buildRoleSheet = async css => (await postcss([autoprefixer, cascadeLayerPlugin({layer: 'neo.roles'})]).process(css, {
        from: undefined
    })).css;

/**
 * Pins the four scope contracts of `resources/css/theme-base/Global.css` on the built
 * stylesheets in `dist/development/css`:
 *   1. A classic theme alone keeps its own values and UA typography metrics unchanged.
 *   2. A classic scope nested inside Theme Neo declines back to its own / UA values after the outer
 *      scope is proven to resolve Theme Neo's bindings.
 *   3. A theme class with palette + roles and no `--neo-global-*` declarations of its own takes the
 *      zero-weight bindings from `theme-base/Global.css`.
 *   4. A theme class that re-values `--neo-global-*` variables in its `neo.roles` sheet wins in both
 *      stylesheet arrival orders because `theme-base/Global.css` sits in `neo.roles` under `:where()`.
 */
test.describe('Global.css role bindings in neo.roles', () => {
    const readStyles = (page, id) => page.locator(`#${id}`).evaluate(el => {
        const s = getComputedStyle(el);

        return {
            backgroundColor: s.backgroundColor,
            color          : s.color,
            fontFamily     : s.fontFamily,
            fontSize       : s.fontSize,
            fontWeight     : s.fontWeight,
            letterSpacing  : s.letterSpacing,
            lineHeight     : s.lineHeight
        }
    });

    test('1. a classic theme alone keeps its own background, font family, and UA element typography', async ({page}) => {
        await page.setContent(`<!doctype html><html><head>
            <style>${readBuilt('src/Global.css')}</style>
            <style>${readBuilt('theme-base/Global.css')}</style>
            <style>${readBuilt('theme-light/Global.css')}</style>
        </head><body id="classic-body" class="neo-body neo-theme-light">
            <h1 id="classic-h1">Heading</h1>
            <p id="classic-p">Paragraph</p>
            <p><code id="classic-code">code</code> <mark id="classic-mark">mark</mark></p>
        </body></html>`);

        const
            body = await readStyles(page, 'classic-body'),
            h1   = await readStyles(page, 'classic-h1'),
            mark = await readStyles(page, 'classic-mark');

        expect(body.backgroundColor).toBe('rgb(250, 250, 250)');
        expect(body.color).toBe('rgb(0, 0, 0)');
        expect(body.fontFamily).toContain('Helvetica Neue');
        expect(h1.fontSize).toBe('32px');
        expect(h1.fontWeight).toBe('700');
        expect(h1.letterSpacing).toBe('normal');
        expect(mark.backgroundColor).toBe('rgb(255, 255, 0)')
    });

    test('2. a classic scope nested in theme Neo declines after the outer scope resolves real role values', async ({page}) => {
        await page.setContent(`<!doctype html><html><head>
            <style>${readBuilt('src/Global.css')}</style>
            <style>${readBuilt('theme-base/Global.css')}</style>
            <style>${readBuilt('theme-neo/Global.css')}</style>
            <style>${readBuilt('theme-neo-light/Global.css')}</style>
            <style>${readBuilt('theme-light/Global.css')}</style>
        </head><body id="outer-body" class="neo-body neo-theme-neo-light">
            <h1 id="outer-h1">Outer</h1>
            <p><mark id="outer-mark">Outer mark</mark></p>
            <div id="inner-scope" class="neo-body neo-theme-light">
                <h1 id="inner-h1">Inner</h1>
                <p><mark id="inner-mark">Inner mark</mark></p>
            </div>
        </body></html>`);

        // Non-vacuity control first: outer Neo scope resolves its role-bound typography and mark tint.
        const
            outerBody = await readStyles(page, 'outer-body'),
            outerH1   = await readStyles(page, 'outer-h1'),
            outerMark = await readStyles(page, 'outer-mark');

        expect(outerBody.backgroundColor).toBe('oklch(0.985 0.002 270)');
        expect(outerBody.fontFamily).toContain('Source Sans 3');
        expect(outerH1.fontSize).toBe('40px');
        expect(outerH1.fontWeight).toBe('600');
        expect(outerH1.letterSpacing).toBe('-0.8px');
        expect(outerMark.backgroundColor).toBe('oklch(0.96 0.06 161)');

        // Nested classic scope declines via `--neo-global-*: initial` -> `revert` and keeps its own body font/surface.
        const
            innerBody = await readStyles(page, 'inner-scope'),
            innerH1   = await readStyles(page, 'inner-h1'),
            innerMark = await readStyles(page, 'inner-mark');

        expect(innerBody.backgroundColor).toBe('rgb(250, 250, 250)');
        expect(innerBody.fontFamily).toContain('Helvetica Neue');
        expect(innerH1.fontSize).toBe('32px');
        expect(innerH1.fontWeight).toBe('700');
        expect(innerH1.letterSpacing).toBe('normal');
        expect(innerH1.fontFamily).toContain('Helvetica Neue');
        expect(innerMark.backgroundColor).toBe('rgb(255, 255, 0)')
    });

    test('3. a theme class with roles and no own --neo-global-* values takes the base bindings', async ({page}) => {
        const roleOnlyCss = await buildRoleSheet(
            fs.readFileSync(path.join(repoRoot, 'resources/css/theme-neo/Global.css'), 'utf8')
                .replaceAll('neo-theme-neo-light', 'neo-theme-role-only-light')
                .replaceAll('neo-theme-neo-dark', 'neo-theme-role-only-dark')
        );

        await page.setContent(`<!doctype html><html><head>
            <style>${readBuilt('src/Global.css')}</style>
            <style>${readBuilt('theme-base/Global.css')}</style>
            <style>${roleOnlyCss}</style>
        </head><body id="role-body" class="neo-body neo-theme-role-only-light">
            <h1 id="role-h1">Heading <code id="role-h1-code">x</code></h1>
            <p id="role-p">Body <code id="role-code">inline</code> <mark id="role-mark">mark</mark></p>
        </body></html>`);

        const
            body   = await readStyles(page, 'role-body'),
            h1     = await readStyles(page, 'role-h1'),
            h1Code = await readStyles(page, 'role-h1-code'),
            p      = await readStyles(page, 'role-p'),
            code   = await readStyles(page, 'role-code'),
            mark   = await readStyles(page, 'role-mark');

        expect(body.backgroundColor).toBe('oklch(0.985 0.002 270)');
        expect(body.color).toBe('oklch(0.168 0.008 270)');
        expect(body.fontFamily).toContain('Source Sans 3');
        expect(h1.color).toBe('rgb(0, 0, 0)');
        expect(h1.fontSize).toBe('40px');
        expect(h1.fontWeight).toBe('600');
        expect(h1Code.color).toBe('rgb(0, 0, 0)');
        expect(p.color).toBe('oklch(0.168 0.008 270)');
        expect(p.fontSize).toBe('16px');
        expect(p.lineHeight).toBe('24px');
        expect(code.backgroundColor).toBe('oklch(0.96 0.019 267)');
        expect(code.color).toBe('oklch(0.168 0.008 270)');
        expect(code.fontFamily).toContain('Source Code Pro');
        expect(mark.backgroundColor).toBe('oklch(0.96 0.06 161)');
        expect(mark.color).toBe('rgb(0, 0, 0)')
    });

    test('4. a theme class that re-values a --neo-global-* variable wins in both stylesheet arrival orders', async ({page}) => {
        const
            baseGlobal = readBuilt('theme-base/Global.css'),
            srcGlobal  = readBuilt('src/Global.css'),
            customCss  = await buildRoleSheet(
                fs.readFileSync(path.join(repoRoot, 'resources/css/theme-neo/Global.css'), 'utf8')
                    .replaceAll('neo-theme-neo-light', 'neo-theme-custom-light')
                    .replaceAll('neo-theme-neo-dark', 'neo-theme-custom-dark') +
                '\n.neo-theme-custom-light { --neo-global-font-family: Georgia, serif; --neo-global-heading-1-font-size: 44px; }\n'
            );

        for (const [firstSheet, secondSheet] of [[baseGlobal, customCss], [customCss, baseGlobal]]) {
            await page.setContent(`<!doctype html><html><head>
                <style>${srcGlobal}</style>
                <style>${firstSheet}</style>
                <style>${secondSheet}</style>
            </head><body id="custom-body" class="neo-body neo-theme-custom-light">
                <h1 id="custom-h1">Custom heading</h1>
                <p><mark id="custom-mark">Mark</mark></p>
            </body></html>`);

            const
                body = await readStyles(page, 'custom-body'),
                h1   = await readStyles(page, 'custom-h1'),
                mark = await readStyles(page, 'custom-mark');

            expect(body.fontFamily).toBe('Georgia, serif');
            expect(h1.fontSize).toBe('44px');
            // Un-overridden variables still take theme-base/Global.css's role bindings.
            expect(body.backgroundColor).toBe('oklch(0.985 0.002 270)');
            expect(mark.backgroundColor).toBe('oklch(0.96 0.06 161)')
        }
    })
});
