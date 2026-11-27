import {test, expect} from '@playwright/test';
import {LAYER_ORDER}  from '../../../../buildScripts/util/themeCssLayers.mjs';

/**
 * @summary `Neo.main.DomAccess#loadStylesheet()` puts a sheet from outside the theme build into the first layer of
 * the theme build's order, so a layered engine rule outranks it whatever the vendor selector weighs.
 *
 * The vendor sheet's rule is more specific than the engine rule beside it. Every arm runs in a real browser, because
 * which declaration wins is the cascade's decision, not the method's.
 */
test.describe('Neo.main.DomAccess: a vendor stylesheet loads into the vendor layer', () => {
    const vendorCss = '#ls-target.ls-target {color: rgb(255, 0, 0); text-decoration: underline}',
          vendorUrl = '/test/playwright/component/main/__vendor-probe.css';

    test.beforeEach(async ({page}) => {
        // Same origin as the page, as Font Awesome and the Highlight.js themes are
        await page.route(`**${vendorUrl}`, route => route.fulfill({body: vendorCss, contentType: 'text/css'}));
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        // What every built theme sheet starts with, then one engine rule less specific than the vendor's
        await page.evaluate(order => {
            const engine = new CSSStyleSheet();

            engine.replaceSync(`@layer ${order}; @layer neo.rules {.ls-target {color: rgb(0, 128, 0)}}`);
            document.adoptedStyleSheets = [engine];
            document.body.insertAdjacentHTML('beforeend', '<div id="ls-target" class="ls-target">target</div>')
        }, LAYER_ORDER.join(', '))
    });

    const color = page => page.evaluate(() => getComputedStyle(document.getElementById('ls-target')).color);

    test('the sheet moves into the first layer of the build order, and the engine rule wins', async ({page}) => {
        const result = await page.evaluate(async href => {
            await Neo.main.DomAccess.loadStylesheet(href, {vendor: 'probe'}, 'probe-sheet');

            const link   = document.querySelector('[data-vendor="probe"]'),
                  rule   = document.adoptedStyleSheets.at(-1).cssRules[0],
                  target = getComputedStyle(document.getElementById('ls-target'));

            // The link keeps a loaded sheet, which callers wait on; only the sheet is disabled
            return {color: target.color, decoration: target.textDecorationLine, disabled: link.sheet?.disabled, id: link.id, layer: rule.name, isLayer: rule instanceof CSSLayerBlockRule}
        }, vendorUrl);

        // The property both sheets set goes to the engine layer; the vendor's own property still paints
        expect(result.color).toBe('rgb(0, 128, 0)');
        expect(result.decoration).toBe('underline');
        expect({isLayer: result.isLayer, layer: result.layer}).toEqual({isLayer: true, layer: LAYER_ORDER[0]});
        expect({disabled: result.disabled, id: result.id}).toEqual({disabled: true, id: 'probe-sheet'})
    });

    test('a relative url() still resolves against the vendor sheet, as a font face needs', async ({page}) => {
        await page.route('**/component/main/__vendor-url.css', route => route.fulfill({
            body: '#ls-target {background-image: url("img/probe.png")}', contentType: 'text/css'
        }));

        const image = await page.evaluate(async () => {
            await Neo.main.DomAccess.loadStylesheet('/test/playwright/component/main/__vendor-url.css');
            return getComputedStyle(document.getElementById('ls-target')).backgroundImage
        });

        // Against the document it would read /component/apps/empty-viewport/img/probe.png
        expect(image).toMatch(/\/test\/playwright\/component\/main\/img\/probe\.png"\)$/)
    });

    test('a swapped href refills the vendor layer, so the old sheet\'s rules leave with it', async ({page}) => {
        // As the Docs source view swaps #hljs-theme between its light and dark sheets
        await page.route('**/component/main/__vendor-swap.css', route => route.fulfill({
            body: '#ls-target {font-style: italic}', contentType: 'text/css'
        }));

        const result = await page.evaluate(async ([first, second, layer]) => {
            await Neo.main.DomAccess.loadStylesheet(first, null, 'swap-sheet');

            const link = document.getElementById('swap-sheet');

            // Registered after the loader's onload, so it runs once the loader has handled the new sheet
            await new Promise(resolve => {
                link.addEventListener('load', resolve, {once: true});
                link.setAttribute('href', second)
            });

            const target = getComputedStyle(document.getElementById('ls-target'));

            return {
                decoration  : target.textDecorationLine,
                disabled    : link.sheet.disabled,
                fontStyle   : target.fontStyle,
                vendorSheets: document.adoptedStyleSheets.filter(sheet => sheet.cssRules[0]?.name === layer).length
            }
        }, [vendorUrl, '/test/playwright/component/main/__vendor-swap.css', LAYER_ORDER[0]]);

        expect(result).toEqual({decoration: 'none', disabled: true, fontStyle: 'italic', vendorSheets: 1})
    });

    test('the positive control: the same sheet by <link> alone is unlayered and beats the engine layer', async ({page}) => {
        await page.evaluate(href => new Promise(resolve => {
            document.head.append(Object.assign(document.createElement('link'), {href, rel: 'stylesheet', onload: resolve}))
        }), vendorUrl);

        expect(await color(page)).toBe('rgb(255, 0, 0)')
    });

    test('a cross-origin sheet hides its rules, so it stays an enabled, unlayered link', async ({page}) => {
        await page.route('http://vendor.test/**', route => route.fulfill({body: vendorCss, contentType: 'text/css'}));

        const disabled = await page.evaluate(async () => {
            await Neo.main.DomAccess.loadStylesheet('http://vendor.test/widgets.css', {vendor: 'opaque'});
            return document.querySelector('[data-vendor="opaque"]').sheet.disabled
        });

        expect(disabled).toBe(false);
        expect(await color(page)).toBe('rgb(255, 0, 0)')
    });

    test('a sheet that fails to load rejects with an Error naming its href', async ({page}) => {
        const message = await page.evaluate(href => Neo.main.DomAccess.loadStylesheet(href).then(
            () => 'resolved',
            error => error instanceof Error ? error.message : `not an Error: ${error}`
        ), '/test/playwright/component/main/no-such-sheet.css');

        expect(message).toBe('Stylesheet failed to load: /test/playwright/component/main/no-such-sheet.css')
    })
});
