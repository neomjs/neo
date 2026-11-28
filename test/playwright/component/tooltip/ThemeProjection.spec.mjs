import {test, expect} from '@playwright/test';

/**
 * A consumer that projects its palette into an engine token family at theme-root — the documented
 * path — must win against the engine's own value sheet, regardless of which sheet loaded first. The
 * engine declares the tooltip family once, in `theme-base`, inside the `neo.base` cascade layer. The
 * fixture's projection is an inline rule, and unlayered CSS beats every layer whatever the selectors
 * weigh. Both rules match the tooltip element itself, because the tooltip stamps the hovered target's
 * theme class on itself.
 *
 * The fixture projects one token, `--neo-tooltip-background-color`, and nothing else; the control reads a token the
 * host leaves alone, so a green here means the engine sheet still supplies the rest of the family, bound to its
 * role, rather than having been wiped by the projection.
 */

const
    TARGET    = '#tooltip-theme-projection-target',
    PROJECTED = 'rgb(1, 2, 3)';

/** Hovers the target from a parked pointer and returns the shown shared tooltip. */
const showTooltip = async page => {
    await page.mouse.move(0, 0);
    await page.locator(TARGET).hover();

    const tooltip = page.locator('.neo-tooltip');

    await expect(tooltip, 'the shared tooltip shows the target text').toHaveText('Projected tooltip');
    await expect(tooltip, 'and carries the hovered target\'s theme class').toHaveClass(/neo-theme-neo-dark/);

    return tooltip
};

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/tooltip-theme-projection/index.html');
    await page.waitForSelector('#tooltip-theme-projection-viewport', {state: 'attached'});
    await expect(page.locator(TARGET)).toBeVisible()
});

test.describe('Neo.tooltip.Base — a theme-root projection outranks the engine value sheet', () => {
    test('the tooltip paints the host\'s projected ground', async ({page}) => {
        const tooltip = await showTooltip(page);

        // The projection matches the tooltip element itself (the theme class is on it), so this is
        // a specificity contest on one element, not an inheritance question.
        await expect.poll(() => tooltip.evaluate(node => getComputedStyle(node).backgroundColor),
            {message: 'the ground is the projected value, not the engine sheet\'s'}).toBe(PROJECTED)
    });

    test('control: a token the host does not project still comes from the engine sheet', async ({page}) => {
        const tooltip = await showTooltip(page);

        // `--neo-tooltip-font-size` is the engine sheet's alone: theme-base binds it to the medium control's type role.
        const read = name => tooltip.evaluate((node, property) => getComputedStyle(node).getPropertyValue(property).trim(), name);

        await expect.poll(() => read('--neo-tooltip-font-size'), {message: 'the engine sheet supplies the rest of the family'}).not.toBe('');
        expect(await read('--neo-tooltip-font-size'), 'bound to its role').toBe(await read('--neo-control-font-size-medium'))
    })
});
