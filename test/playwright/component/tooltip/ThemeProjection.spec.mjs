import {test, expect} from '@playwright/test';

/**
 * A consumer that projects its palette into an engine token family at theme-root — the documented
 * path — must win against the engine's own theme value sheet, regardless of which sheet loaded
 * first. The engine's value sheets for the tooltip declare at `:where()` weight for exactly this:
 * zero specificity, so a `:root .neo-theme-neo-*` projection at (0,2,0) outranks them wherever both
 * match, and the tooltip — which stamps the hovered target's theme class on itself — is matched by
 * both. Before that weight, the two declarations tied at (0,2,0) and the engine sheet won on load
 * order, because the Stylesheet addon appends per-class theme sheets after the host's own.
 *
 * The fixture projects one token, `--tooltip-bg`, and nothing else; the control reads a token the
 * host leaves alone, so a green here means the engine sheet still supplies the family at its new
 * weight rather than having been wiped by the projection.
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

        // `--tooltip-fontsize` is the engine sheet's alone; at `:where()` weight it still applies.
        await expect.poll(() => tooltip.evaluate(node => getComputedStyle(node).getPropertyValue('--tooltip-fontsize').trim()),
            {message: 'the engine sheet supplies the rest of the family'}).toBe('14px')
    })
});
