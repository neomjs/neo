import {test, expect} from '@playwright/test';

/**
 * The shared tooltip follows the hovered target's theme scope: it stamps that scope's theme class
 * on itself, so a light scope inside a dark app gets a light tooltip. The scope's child carries no
 * theme class of its own (it inherits), so the answer has to come from the component chain's theme
 * configs — a walk over vdom nodes sees the scope as a component reference with no classes and
 * falls back to the app default, which paints the tooltip dark inside the light scope.
 */

const targets = {
    dark : {sel: '#tooltip-nested-theme-dark',  text: 'Dark tooltip',  theme: 'neo-theme-neo-dark'},
    light: {sel: '#tooltip-nested-theme-light', text: 'Light tooltip', theme: 'neo-theme-neo-light'}
};

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/tooltip-nested-theme/index.html');
    await page.waitForSelector('#tooltip-nested-theme-viewport', {state: 'attached'});
    await expect(page.locator(targets.dark.sel)).toBeVisible();
    await expect(page.locator(targets.light.sel)).toBeVisible();

    // The scope renders its theme class; its child inherits without one — the shape under test.
    await expect(page.locator('#tooltip-nested-theme-scope')).toHaveClass(/neo-theme-neo-light/);
    await expect(page.locator(targets.light.sel)).not.toHaveClass(/neo-theme-/)
});

test.describe('Neo.tooltip.Base — the shared tooltip takes the hovered target\'s scope theme', () => {
    for (const [name, {sel, text, theme}] of Object.entries(targets)) {
        test(`hovering the ${name} target stamps its scope's theme on the tooltip`, async ({page}) => {
            await page.mouse.move(0, 0);
            await page.locator(sel).hover();

            const tooltip = page.locator('.neo-tooltip');

            await expect(tooltip, 'the shared tooltip shows the target text').toHaveText(text);
            await expect(tooltip, `and carries ${theme}`).toHaveClass(new RegExp(theme))
        })
    }
});
