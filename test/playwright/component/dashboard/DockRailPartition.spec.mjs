import {test, expect} from '@playwright/test';

/**
 * A collapsed header action must not reach `Neo.tab.plugin.Overflow`'s measurement.
 *
 * A context-inactive action has no DOM node at all, so there is nothing for `getDomRect`
 * to measure. The plugin reads each action rect's POSITION as well as its size, so measuring a
 * missing or all-zero rect places the action cluster at offset 0 and the strip reads as fully
 * consumed — every tab but the active one is driven into the overflow menu.
 * `Overflow#getActionItems()` therefore excludes withdrawn actions rather than measuring them.
 *
 * This lives on the dock fixture and not beside the other Overflow arms on purpose: the dock header
 * is where a real gated action and a real overflow control coexist on a wide strip at rest, which
 * is where a mis-measured withdrawal is observable.
 */

const tabsNodeWith = (page, tabText) => page.locator('.neo-dashboard-dock-tabs', {
    has: page.locator(`.neo-tab-header-button:has-text("${tabText}")`)
});

/** Rail geometry for one dock header: strip width, direct tabs, and the rendered action count. */
const readRail = node => node.locator(':scope > .neo-tab-header-toolbar').evaluate(bar => {
    const children = [...bar.children];

    return {
        actions   : children.filter(child => child.classList.contains('neo-toolbar-action')).length,
        barWidth  : Math.round(bar.getBoundingClientRect().width),
        directTabs: children.filter(child => child.classList.contains('neo-tab-header-button')).length,
        hasControl: !!bar.querySelector('.fa-ellipsis')
    }
});

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-maximize/index.html');
    await page.waitForSelector('#dock-maximize-workspace', {state: 'attached'});
    await page.waitForSelector('.neo-tab-header-button',   {state: 'visible'})
});

test.describe('dock rail — a collapsed action contributes no extent', () => {
    test('the tab partition survives withdrawn actions on a wide strip', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        await expect(main).toHaveCount(1);

        const rest = await readRail(main);

        // Non-vacuity, first half: without a wide strip a one-tab partition is indistinguishable
        // from the defect's output, so this precondition must red here rather than pass quietly.
        expect(rest.barWidth, `the strip must be wide enough to hold several tabs — ${JSON.stringify(rest)}`)
            .toBeGreaterThan(400);

        // The subject, read at rest. Measuring a withdrawn action's missing rect places the cluster
        // at offset 0 and consumes the whole strip, leaving exactly the active tab.
        expect(rest.directTabs, `tabs must stay directly reachable — ${JSON.stringify(rest)}`)
            .toBeGreaterThan(1);

        // Non-vacuity, second half, read AFTER the subject so it cannot disturb it: a withdrawn action
        // has no node, so "genuinely withdrawn" is proven by opening the gate through the same reactive
        // config the focus wiring writes and watching the rendered action cluster grow. No growth
        // means nothing was withdrawn during the measurement above, and the arm must red.
        const toolbarId = await main.locator(':scope > .neo-tab-header-toolbar').getAttribute('id');

        await page.evaluate(id => Neo.worker.App.setConfigs({id, contextualActionsVisible: true}), toolbarId);
        await expect.poll(async () => (await readRail(main)).actions,
            {message: `at least one action must actually have been withdrawn at rest — ${JSON.stringify(rest)}`})
            .toBeGreaterThan(rest.actions)
    })
});
