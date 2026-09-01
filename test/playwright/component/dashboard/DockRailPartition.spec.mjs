import {test, expect} from '@playwright/test';

/**
 * A collapsed header action must not reach `Neo.tab.plugin.Overflow`'s measurement.
 *
 * A context-inactive action is removed from layout, so it reports an all-zero DOM rect. The plugin
 * reads each action rect's POSITION as well as its size, so measuring one places the action cluster
 * at offset 0 and the strip reads as fully consumed — every tab but the active one is driven into
 * the overflow menu. `Overflow#getActionItems()` therefore excludes collapsed actions rather than
 * measuring them.
 *
 * This lives on the dock fixture and not beside the other Overflow arms on purpose: a standalone
 * `tab.Container` has no focus subject, so its gated actions never withdraw, and an arm written
 * there passes whether or not the exclusion exists. The dock header is where a real gated action
 * and a real overflow control coexist on a wide strip, which is the only place the zero-rect
 * collapse is observable.
 */

const tabsNodeWith = (page, tabText) => page.locator('.neo-dashboard-dock-tabs', {
    has: page.locator(`.neo-tab-header-button:has-text("${tabText}")`)
});

/** Rail geometry for one dock header: strip width, direct tabs, and the collapsed action count. */
const readRail = node => node.locator(':scope > .neo-tab-header-toolbar').evaluate(bar => {
    const children = [...bar.children],
          actions  = children.filter(child => child.classList.contains('neo-toolbar-action'));

    return {
        barWidth  : Math.round(bar.getBoundingClientRect().width),
        directTabs: children.filter(child => child.classList.contains('neo-tab-header-button')).length,
        collapsed : actions.filter(action => getComputedStyle(action).display === 'none').length,
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

        const rail = await readRail(main);

        // Non-vacuity, both halves. Without a genuinely collapsed action there is no zero rect to
        // mis-measure, and without a wide strip a one-tab partition is indistinguishable from the
        // defect's output. Either precondition failing must red here rather than pass quietly.
        expect(rail.collapsed, `at least one action must actually be collapsed — ${JSON.stringify(rail)}`)
            .toBeGreaterThan(0);
        expect(rail.barWidth, `the strip must be wide enough to hold several tabs — ${JSON.stringify(rail)}`)
            .toBeGreaterThan(400);

        // The subject. Measuring a collapsed action's all-zero rect places the cluster at offset 0
        // and consumes the whole strip, leaving exactly the active tab.
        expect(rail.directTabs, `tabs must stay directly reachable — ${JSON.stringify(rail)}`)
            .toBeGreaterThan(1)
    })
});
