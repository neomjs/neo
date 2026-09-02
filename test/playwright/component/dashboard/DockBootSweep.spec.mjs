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


    test('no rendered write until the tail that REPLACED the sample settles', async ({page}) => {
        // The overlap the close target names, in the browser: a refresh begins AFTER the mount-time
        // sample and BEFORE the deferred write. The fixture installs a tail that replaces itself from
        // inside its own `then`, so the replacement lands while the sweep is already committed to
        // awaiting — staging both promises up front cannot reach that state, because the deferral has
        // not fired and the sweep would simply sample the replacement.
        await page.goto('test/playwright/component/apps/dock-static-boot-overlap/index.html');
        await page.waitForSelector('#dock-static-boot-workspace', {state: 'attached'});
        await page.waitForSelector('.neo-tab-header-button',      {state: 'visible'});

        const header = tabsNodeWith(page, 'Contract'),
              reload = actionButton(header, 'fa-rotate-right');

        await openActionGate(page, header);

        // Poll the observable rather than a clock: `tailReplaced` flips the instant the sweep consumes
        // its sampled tail, which is precisely when the contested state exists. No fixed sleep.
        await expect.poll(async () => (await readWorkspace(page, ['tailReplaced']))[0],
            {message: 'the sweep must reach its await and consume the sampled tail'}).toBe(true);

        // The SAMPLED tail has now settled while a different promise owns the field. A sweep that
        // trusts one snapshot writes here — this is the assertion the pre-fix method cannot pass.
        expect((await readWorkspace(page, ['sweepCount']))[0],
            'no sweep may run on a tail that no longer owns the field').toBe(0);
        await expect(reload, 'and nothing may be rendered yet').toHaveCount(0);

        // Release the CURRENT tail.
        await setWorkspace(page, {releaseTailCount: 1});

        await expect(reload, 'the sweep runs on the current tail and reveals reload').toHaveCount(1);
        expect((await readWorkspace(page, ['sweepCount']))[0], 'exactly one sweep').toBe(1);

        // Uniqueness is gated on the post-sweep outcome above, so it cannot pass by sampling
        // pre-sweep DOM — the failure mode a standalone census has.
        const rendered = await header.locator('.neo-tab-header-toolbar .neo-toolbar-action').evaluateAll(
            nodes => nodes.map(node => ({id: node.id, label: node.getAttribute('aria-label')}))
        );

        expect(new Set(rendered.map(entry => entry.id)).size,
            `no two action nodes share a DOM id — rendered: ${JSON.stringify(rendered)}`).toBe(rendered.length)
    });
});
