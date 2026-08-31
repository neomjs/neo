import {test, expect} from '@playwright/test';

/**
 * @summary The boot header-action sweep, observed as RENDERED DOM rather than as worker state.
 *
 * The sweep corrects pane-dependent action state that a projection cannot know: projected action
 * rows are projection-constant by design, so a pane owning no `dockReload()` still projects the
 * row and only the sweep removes it. Every assertion here therefore reads Main's DOM.
 *
 * That tier is the point, and it is not interchangeable with the unit witness. A worker-side
 * instance count answers "how many action components exist"; the failure class this chrome is
 * exposed to is **one instance rendered as two nodes carrying the same id**, which a registry
 * count reports as 1. Only a DOM count can falsify it.
 *
 * Scoped to BOOT deliberately. Duplicated retained chrome is separately reachable from the
 * activation-plus-write path, so an arm that activated panes here would inherit that intermittent
 * and stop being a witness for this sweep. No activation happens below.
 *
 * Run: NEO_COMPONENT_PORT=8186 npx playwright test dashboard/DockBootSweep -c test/playwright/playwright.config.component.mjs --workers=1
 */

const ENGINE_ACTIONS = [
    {glyph: 'fa-rotate-right',    name: 'reload'},
    {glyph: 'fa-window-maximize', name: 'maximize'},
    {glyph: 'fa-times',           name: 'close'}
];

const tabsNodeWith = (page, tabText) => page.locator('.neo-dashboard-dock-tabs', {
    has: page.locator(`.neo-tab-header-button:has-text("${tabText}")`)
});

const actionButton = (node, glyph) => node.locator(`.neo-tab-header-toolbar .neo-button:has([class*="${glyph}"])`);

test.describe('dock boot sweep — rendered chrome after a static first projection', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/dock-static-boot/index.html');
        await page.waitForSelector('#dock-static-boot-workspace', {state: 'attached'});
        await page.waitForSelector('.neo-tab-header-button',      {state: 'visible'})
    });

    test('the sweep reaches live chrome and REVEALS an action the projection defaulted hidden', async ({page}) => {
        const header = tabsNodeWith(page, 'Contract');

        // The projection hardcodes reload to `hidden: true`, so its ABSENCE proves nothing — that is
        // the default, and an arm asserting it stays green with the sweep deleted. The discriminating
        // direction is reveal: `contract` owns `dockReload()`, and only the sweep can turn the
        // projected-hidden row into rendered chrome. Settling on the outcome, not a duration.
        await expect(actionButton(header, 'fa-rotate-right'), 'the sweep revealed reload on live chrome')
            .toHaveCount(1);

        // …and the pane-independent action renders too, so the assertion above cannot pass by the
        // header having rendered some unrelated shape.
        await expect(actionButton(header, 'fa-times'), 'close still renders once').toHaveCount(1)
    });

    test('every rendered engine action is a single node with a unique id', async ({page}) => {
        const main = tabsNodeWith(page, 'Contract');

        // The id-collision falsifier the registry cannot see: two nodes sharing one id report as a
        // single instance in the worker, so identity is asserted again on ids read from Main. The
        // message carries the rendered labels, because "expected 3, received 4" names nothing a
        // reader can act on — a duplicate and an extra contribution look identical in a bare count.
        const rendered = await main.locator('.neo-tab-header-toolbar .neo-toolbar-action').evaluateAll(
            nodes => nodes.map(node => ({id: node.id, label: node.getAttribute('aria-label')}))
        );

        const ids = rendered.map(entry => entry.id);

        expect(new Set(ids).size, `no two action nodes share a DOM id — rendered: ${JSON.stringify(rendered)}`)
            .toBe(ids.length);

        // Nothing engine-owned appears twice. Deliberately not an equality against a fixed set: a
        // host contribution may legally share this toolbar, and this arm is a duplication witness,
        // not a census.
        for (const {name} of ENGINE_ACTIONS) {
            expect(rendered.filter(entry => entry.label === name).length,
                `at most one ${name} — rendered: ${JSON.stringify(rendered)}`).toBeLessThanOrEqual(1)
        }
    });

});
