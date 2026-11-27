import {test, expect} from '@playwright/test';
import autoprefixer   from 'autoprefixer';
import postcss        from 'postcss';

import {
    cascadeLayer,
    cascadeLayerPlugin
} from '../../../../../buildScripts/util/themeCssLayers.mjs';

/**
 * @summary A theme sheet's relative `@import` survives the layer plugin: the browser fetches the imported sheet once,
 * it paints as it did unlayered, and its rules come from the layer the imported sheet's own build gave it.
 *
 * Both sheets take the theme build's path for a generated theme's `button/` folder, the importing one keeping the
 * `@import` that `create-theme` preserves. A real browser resolves the import and reads the computed style.
 */
const plugins = file => [autoprefixer, cascadeLayerPlugin({layer: cascadeLayer('theme-my-theme', file)})],
      sources = {
          'Base.css'  : '@import url("./Shared.css");\n.probe {border-top-style: solid}\n',
          'Shared.css': '.probe {color: rgb(0, 128, 0)}\n'
      };

async function load(page, layered) {
    const sheets = {}, requests = [];

    for (const [name, css] of Object.entries(sources)) {
        sheets[name] = layered ? (await postcss(plugins(`button/${name}`)).process(css, {from: `/theme-my-theme/button/${name}`})).css : css
    }

    // One origin for the page and its sheets, so the page can read their rules
    await page.route('http://theme.test/**', route => {
        const name = route.request().url().split('/').pop();

        if (name === 'index.html') {
            return route.fulfill({body: '<link rel="stylesheet" href="css/Base.css"><div class="probe">probe</div>', contentType: 'text/html'})
        }

        requests.push(name);
        route.fulfill({body: sheets[name], contentType: 'text/css'})
    });
    await page.goto('http://theme.test/index.html');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.probe')).color === 'rgb(0, 128, 0)');

    return page.evaluate(requests => {
        const probe  = getComputedStyle(document.querySelector('.probe')),
              rule   = [...document.styleSheets[0].cssRules].find(rule => rule instanceof CSSImportRule),
              layers = [...rule.styleSheet.cssRules].filter(rule => rule instanceof CSSLayerBlockRule).map(rule => rule.name);

        return {border: probe.borderTopStyle, color: probe.color, importLayer: rule.layerName, layers, requests}
    }, requests)
}

test.describe('buildScripts/util/themeCssLayers: a relative @import in the browser (#22297)', () => {
    test('the layered sheet paints as the unlayered one, with one request for the import', async ({page}) => {
        const unlayered = await load(page, false);

        await page.unrouteAll();
        const layered = await load(page, true);

        expect(layered.requests).toEqual(['Base.css', 'Shared.css']);
        expect({border: layered.border, color: layered.color}).toEqual({border: unlayered.border, color: unlayered.color});
        // The import stays top-level and unwrapped; the imported sheet carries its own layer, entered once
        expect(layered.importLayer).toBeNull();
        expect(layered.layers).toEqual(['neo.theme'])
    })
});
