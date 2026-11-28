import {expect, test} from '@playwright/test';

const source = '#!/usr/bin/env node\n/**\n * A multiline comment.\n * @returns {Promise<Boolean>}\n */\n' +
    'const value = `<div class="probe">&amp;</div>\n${true ?\n"yes" : "no"}\nend`;\n\n';

for (const theme of ['light', 'neo-light', 'dark', 'neo-dark', 'standalone-light', 'standalone-dark']) {
    test(`${theme}: rendered tokens, multiline spans and gutter meet AA`, async ({page}, info) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await expect(page.locator('#component-test-viewport')).toBeVisible();

        for (const name of ['HighlightJs', 'HighlightJsLineNumbers']) {
            await page.addStyleTag({url: `/dist/development/css/src/util/${name}.css`});
            if (!theme.startsWith('standalone')) {
                await page.addStyleTag({url: `/dist/development/css/theme-${theme}/util/${name}.css`})
            }
        }
        if (theme.startsWith('standalone')) {
            await page.addStyleTag({url: `/resources/lib/highlightjs-custom-${theme.endsWith('light') ? 'github' : 'dark'}-theme.css`})
        }

        await page.evaluate(async ({source, theme}) => {
            const {default: HighlightJs} = await import('/src/util/HighlightJs.mjs');
            const node                   = document.createElement('pre');
            node.id = 'highlight-contrast';
            node.className = `hljs neo-theme-${theme.replace('standalone-', '')}`;
            node.style.cssText = 'position:fixed;inset:20px;z-index:1000;padding:20px';
            node.innerHTML = await HighlightJs.highlightLine(source, 'javascript');
            document.body.append(node)
        }, {source, theme});

        const code = page.locator('#highlight-contrast');
        expect(await code.textContent()).toBe(source);
        const measurements = await code.evaluate(root => {
            const rgba  = color => color.match(/[\d.]+/g).map(Number);
            const blend = (foreground, background) => foreground.slice(0, 3).map((value, i) =>
                value * (foreground[3] ?? 1) + background[i] * (1 - (foreground[3] ?? 1)));
            const luminance = rgb => rgb.map(value => {
                value /= 255;
                return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
            }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);

            return ['comment', 'meta', 'string', 'keyword', 'doctag', 'ln-numbers'].map(token => {
                const nodes = [...root.querySelectorAll(`.hljs-${token}`)];
                return {token, samples: nodes.map(node => {
                    const ancestors = [];
                    for (let current = node; current; current = current.parentElement) ancestors.unshift(current);
                    const background = ancestors.reduce((color, ancestor) =>
                        blend(rgba(getComputedStyle(ancestor).backgroundColor), color), [255, 255, 255]);
                    const style  = getComputedStyle(node), foreground = blend(rgba(style.color), background);
                    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
                    return {color: style.color, background, ratio: (values[0] + 0.05) / (values[1] + 0.05)}
                })}
            })
        });
        await info.attach('computed-contrast', {body: JSON.stringify(measurements, null, 2), contentType: 'application/json'});
        await code.screenshot({path: info.outputPath(`${theme}.png`)});
        for (const {token, samples} of measurements) {
            expect(samples.length, `${theme} renders ${token}`).toBeGreaterThan(0);
            for (const sample of samples) expect(sample.ratio, `${theme} ${token} ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(4.5)
        }
        for (const line of [2, 3, 4, 5]) {
            await expect(code.locator(`.hljs-ln-code[data-line-number="${line}"] .hljs-comment`).first()).toBeVisible()
        }
        for (const line of [6, 7, 8, 9]) {
            await expect(code.locator(`.hljs-ln-code[data-line-number="${line}"] .hljs-string`).first()).toBeVisible()
        }
        expect(await code.locator('.hljs-ln-n').first().evaluate(node => getComputedStyle(node, '::before').content)).toBe('"1"');
    })
}
