import {test, expect} from '@playwright/test';

/**
 * A button badge must be readable in every theme the fixture loads: its text and its background
 * need a contrast of at least 4.5:1. The default, primary and tertiary buttons read the base badge
 * tokens, so one button of each is created. The theme switch swaps the `neo-theme-*` class, as
 * `dashboard/ThemeColorSchemeStaging.spec.mjs` does, because this fixture loads the sheets of the
 * default themes only: Light, Dark and Neo Light.
 */

const uis = [null, 'primary', 'tertiary'];

let buttonIds = [];

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector('#component-test-viewport', {state: 'attached'});

    buttonIds = await page.evaluate(async uis => {
        const ids = [];

        for (const ui of uis) {
            const result = await Neo.worker.App.createNeoInstance({
                badgeText : '3',
                importPath: '../button/Base.mjs',
                ntype     : 'button',
                parentId  : 'component-test-viewport',
                text      : `Button ${ui || 'default'}`,
                ui
            });
            if (!result.success) throw new Error(`Button creation failed: ${result.error.message}`);
            ids.push(result.id)
        }

        return ids
    }, uis);

    await expect(page.locator('.neo-button-badge')).toHaveCount(uis.length)
});

test.afterEach(async ({page}) => {
    for (const id of buttonIds) {
        await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), id)
    }
    buttonIds = []
});

test.describe('Neo.button.Base badge', () => {
    for (const theme of ['neo-theme-neo-light', 'neo-theme-light', 'neo-theme-dark']) {
        test(`every badge reads at 4.5:1 or more in ${theme}`, async ({page}) => {
            const badges = await page.evaluate(({ids, theme}) => {
                const luminance = rgb => {
                    const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(channel => {
                        const value = channel / 255;
                        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
                    });

                    return 0.2126 * r + 0.7152 * g + 0.0722 * b
                };

                document.querySelectorAll('[class*="neo-theme-"]').forEach(node => {
                    node.className = node.className.replace(/neo-theme-[a-z-]+/, theme)
                });

                return ids.map(id => {
                    const style    = getComputedStyle(document.querySelector(`#${id} .neo-button-badge`)),
                          [hi, lo] = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a);

                    return {
                        background: style.backgroundColor,
                        color     : style.color,
                        contrast  : Math.round((hi + 0.05) / (lo + 0.05) * 100) / 100,
                        ui        : document.getElementById(id).className.match(/neo-button-(primary|tertiary)/)?.[1] || 'default'
                    }
                })
            }, {ids: buttonIds, theme});

            for (const badge of badges) {
                expect(badge.contrast, `${badge.ui}: ${badge.color} on ${badge.background}`).toBeGreaterThanOrEqual(4.5)
            }
        })
    }
});
