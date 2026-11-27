import {test, expect} from '@playwright/test';
import {LAYER_ORDER}  from '../../../../buildScripts/util/themeCssLayers.mjs';

/**
 * @summary `Neo.main.DomAccess#loadStylesheet()` puts a sheet from outside the theme build into the first layer of
 * the theme build's order, so a layered engine rule outranks it whatever the vendor selector weighs.
 *
 * The vendor sheet is a `data:` URL whose rule is more specific than the engine rule beside it. Every arm runs in a
 * real browser, because which declaration wins is the cascade's decision, not the method's.
 */
test.describe('Neo.main.DomAccess: a vendor stylesheet loads into the vendor layer', () => {
    const vendorCss = '#ls-target.ls-target {color: rgb(255, 0, 0); text-decoration: underline}',
          vendorUrl = `data:text/css,${encodeURIComponent(vendorCss)}`;

    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        // What every built theme sheet starts with, then one engine rule less specific than the vendor's
        await page.evaluate(order => {
            document.head.append(Object.assign(document.createElement('style'), {
                textContent: `@layer ${order}; @layer neo.rules {.ls-target {color: rgb(0, 128, 0)}}`
            }));
            document.body.insertAdjacentHTML('beforeend', '<div id="ls-target" class="ls-target">target</div>')
        }, LAYER_ORDER.join(', '))
    });

    test('the sheet imports into the first layer of the build order, and the engine rule wins', async ({page}) => {
        const result = await page.evaluate(async href => {
            await Neo.main.DomAccess.loadStylesheet(href, {vendor: 'probe'});

            const rule   = document.querySelector('[data-vendor="probe"]').sheet.cssRules[0],
                  target = getComputedStyle(document.getElementById('ls-target'));

            return {color: target.color, decoration: target.textDecorationLine, isImport: rule instanceof CSSImportRule, layer: rule.layerName}
        }, vendorUrl);

        // The property both sheets set goes to the engine layer; the vendor's own property still paints
        expect(result.color).toBe('rgb(0, 128, 0)');
        expect(result.decoration).toBe('underline');
        expect(result.isImport).toBe(true);
        expect(result.layer).toBe(LAYER_ORDER[0])
    });

    test('the positive control: the same sheet by <link> is unlayered and beats the engine layer', async ({page}) => {
        const color = await page.evaluate(href => new Promise(resolve => {
            document.head.append(Object.assign(document.createElement('link'), {
                href, rel: 'stylesheet',
                onload: () => resolve(getComputedStyle(document.getElementById('ls-target')).color)
            }))
        }), vendorUrl);

        expect(color).toBe('rgb(255, 0, 0)')
    });

    test('a sheet that fails to load rejects with an Error naming its href', async ({page}) => {
        const message = await page.evaluate(href => Neo.main.DomAccess.loadStylesheet(href).then(
            () => 'resolved',
            error => error instanceof Error ? error.message : `not an Error: ${error}`
        ), '/test/playwright/component/main/no-such-sheet.css');

        expect(message).toBe('Stylesheet failed to load: /test/playwright/component/main/no-such-sheet.css')
    })
});
