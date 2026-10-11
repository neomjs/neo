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

const WORKSPACE_ID = 'dock-static-boot-workspace';

const readWorkspace = async (page, keys) => {
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data), {id: WORKSPACE_ID, keys});

    return reply?.data ?? reply
};

const setWorkspace = (page, configs) => page.evaluate(
    data => Neo.worker.App.setConfigs(data),
    {id: WORKSPACE_ID, ...configs}
);

const tabsNodeWith = (page, tabText) => page.locator('.neo-dashboard-dock-tabs', {
    has: page.locator(`.neo-tab-header-button:has-text("${tabText}")`)
});

const actionButton = (node, glyph) => node.locator(`.neo-tab-header-toolbar .neo-button:has([class*="${glyph}"])`);

/**
 * Opens one header's focus gate through the same reactive config the focus wiring writes. A
 * withdrawn action has no DOM node at all, so the sweep's reveal — `hidden` flipped on the
 * retained instance — is observable on rendered chrome only once the gate is open. Driving the
 * config keeps this a boot witness: no pane is activated and no focus moves.
 * @param {Object} page
 * @param {Object} node The tabs-node locator.
 * @returns {Promise<void>}
 */
const openActionGate = async (page, node) => {
    const toolbarId = await node.locator('.neo-tab-header-toolbar').first().getAttribute('id');

    await page.evaluate(id => Neo.worker.App.setConfigs({id, contextualActionsVisible: true}), toolbarId)
};

test.describe('dock boot sweep — rendered chrome after a static first projection', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/dock-static-boot/index.html');
        await page.waitForSelector('#dock-static-boot-workspace', {state: 'attached'});
        await page.waitForSelector('.neo-tab-header-button',      {state: 'visible'})
    });

    test('the sweep reaches live chrome and REVEALS an action the projection defaulted hidden', async ({page}) => {
        const header = tabsNodeWith(page, 'Contract');

        await openActionGate(page, header);

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


    test('the first paint is the only write: one reload node, no two action nodes share a DOM id', async ({page}) => {
        const header = tabsNodeWith(page, 'Contract');

        await openActionGate(page, header);
        await expect(actionButton(header, 'fa-rotate-right'), 'bound at construction, rendered from the first paint').toHaveCount(1);

        // No boot sweep follows the static projection any more — the header truth was published
        // before the chrome constructed and the actions bound to it — so a census taken now is the
        // settled census, not a pre-sweep sample.
        const rendered = await header.locator('.neo-tab-header-toolbar .neo-toolbar-action').evaluateAll(
            nodes => nodes.map(node => ({id: node.id, label: node.getAttribute('aria-label')}))
        );

        expect(new Set(rendered.map(entry => entry.id)).size,
            `no two action nodes share a DOM id — rendered: ${JSON.stringify(rendered)}`).toBe(rendered.length)
    });
});
