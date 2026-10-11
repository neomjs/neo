import {test, expect} from '@playwright/test';

/**
 * @summary A tab reordered in a dock header keeps naming its own item for the gestures after it, on the
 * real pointer path: a click activates the item its button shows, and a drag into another zone moves
 * that item in the committed document together with its pane.
 *
 * Driven on `examples/dashboard/dock`, the consumer this was found on. The reorder commits the right
 * document on its own, so a witness that stops there proves nothing; the gestures that follow it are
 * the ones resolving an item through its index in the header.
 *
 * Tab names come from the committed document: its boot order picks the dragged tab and the tab it lands
 * behind, and its titles map a button to its item. The bridge is off (`useAiClient: false`), so a run
 * registers no Neural Link session on a developer's live bridge.
 *
 * Run: npx playwright test component/dashboard/DockTabReorderGesture -c test/playwright/playwright.config.component.mjs
 */

const NODE = 'main-tabs';

test.use({viewport: {height: 1000, width: 1600}});

test.beforeEach(async ({page}) => {
    let routed = false;

    await page.route('**/examples/dashboard/dock/neo-config.json', async route => {
        const response = await route.fetch();

        routed = true;
        await route.fulfill({json: {...await response.json(), useAiClient: false}, response})
    });

    await page.goto('examples/dashboard/dock/index.html');
    await expect(page.locator('.neo-dashboard-dock-tabs .neo-tab-header-button').first()).toBeVisible({timeout: 30000});

    expect(routed, 'the example booted with the bridge disabled').toBe(true)
});

/**
 * Reads configs of one App Worker instance, in key order.
 * @param {Object} page
 * @param {String} id
 * @param {String[]} keys
 * @returns {Promise<Array>}
 */
const readInstance = async (page, id, keys) => {
    // The main-realm remote answers with the worker-message envelope; the values ride `.data`.
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data), {id, keys});

    return reply?.data ?? reply
};

const readDocument = async (page, workspaceId) => (await readInstance(page, workspaceId, ['dockModel']))[0];

const buttonX = (page, label) => page.evaluate(text => {
    const rect = [...document.querySelectorAll('.neo-tab-header-button')].find(el => el.textContent.trim() === text)?.getBoundingClientRect();

    return rect ? rect.x + rect.width / 2 : null
}, label);

/**
 * Resolves the tab button showing `label` once the pointer can trust its rect: no counted dock motion,
 * nothing animating inside the dock host and, for a drag, the tab admitted by its `neo-draggable` mark.
 * A projection glides by transform, so a rect read mid-glide is not where a press lands.
 * @param {Object} page
 * @param {String} label
 * @param {Boolean} [draggable=false]
 * @returns {Promise<Object>} The button centre and right edge, and its tabs container's id and centre
 */
async function restingTab(page, label, draggable=false) {
    let tab = null;

    await expect.poll(async () => {
        tab = await page.evaluate(({draggable, label}) => {
            const host   = document.querySelector('.neo-dock-workspace'),
                  button = [...document.querySelectorAll('.neo-tab-header-button')].find(el => el.textContent.trim() === label),
                  tabs   = button?.closest('.neo-dashboard-dock-tabs');

            if (!tabs || document.querySelector('.neo-dashboard-dock-animating') || host.getAnimations({subtree: true}).length > 0
                || (draggable && !button.closest('.neo-draggable'))) {
                return null
            }

            const rect = button.getBoundingClientRect(),
                  zone = tabs.getBoundingClientRect();

            return {
                right : rect.right,
                tabsId: tabs.id,
                x     : rect.x + rect.width / 2,
                y     : rect.y + rect.height / 2,
                zone  : {x: zone.x + zone.width / 2, y: zone.y + zone.height / 2}
            }
        }, {draggable, label});

        return tab !== null
    }, {message: `"${label}" is at rest${draggable ? ' and admitted to a drag' : ''}`, timeout: 15000}).toBe(true);

    return tab
}

/**
 * Presses a real pointer on the tab button showing `label` and steps it past the drag threshold until
 * the header drag holds.
 * @param {Object} page
 * @param {String} label
 * @returns {Promise<Object>} The tab as it rested before the press
 */
async function grab(page, label) {
    const tab = await restingTab(page, label, true);

    await page.mouse.move(tab.x, tab.y);
    await page.mouse.down();
    await page.mouse.move(tab.x + 12, tab.y, {steps: 3});
    await expect(page.locator('.neo-dragproxy'), 'the tab drag started').toHaveCount(1);

    return tab
}

/**
 * Drags the tab at boot index 1 behind the tab at boot index 3, then waits until the projection of that
 * move landed: a move activates the moved item, and the header's active index follows it there.
 * @param {Object} page
 * @returns {Promise<{order: String[], titles: Object<String,String>, workspaceId: String}>}
 */
async function reorder(page) {
    const workspaceId = await page.locator('.neo-dock-workspace').first().getAttribute('id'),
          boot        = await readDocument(page, workspaceId),
          order       = boot.nodes[NODE].items,
          titles      = Object.fromEntries(Object.entries(boot.items).map(([itemId, item]) => [itemId, item.title])),
          expected    = [order[0], order[2], order[3], order[1], ...order.slice(4)],
          behind      = await restingTab(page, titles[order[3]]),
          dragged     = await grab(page, titles[order[1]]);

    await page.mouse.move(behind.right - 4, dragged.y, {steps: 16});
    await expect.poll(() => buttonX(page, titles[order[3]]),
        {message: 'the tab it lands behind shifts into the gap'}).toBeLessThan(behind.x);
    await page.mouse.up();
    await expect(page.locator('.neo-dragproxy'), 'the drag ended').toHaveCount(0);

    await expect.poll(async () => (await readDocument(page, workspaceId)).nodes[NODE].items,
        {message: 'the reorder commits the move'}).toEqual(expected);
    await expect.poll(async () => (await readInstance(page, dragged.tabsId, ['activeIndex']))[0],
        {message: 'the header active index follows the moved tab'}).toBe(expected.indexOf(order[1]));

    return {order, titles, workspaceId}
}

test.describe('examples/dashboard/dock — a reordered header keeps naming its items', () => {
    test('a click after a reorder activates the item its button shows', async ({page}) => {
        const {order, titles, workspaceId} = await reorder(page),
              clicked                      = order[3],
              tab                          = await restingTab(page, titles[clicked]);

        await page.mouse.click(tab.x, tab.y);

        await expect.poll(async () => (await readDocument(page, workspaceId)).nodes[NODE].activeItemId,
            {message: `clicking "${titles[clicked]}" activates ${clicked}`}).toBe(clicked)
    });

    test('a drag after a reorder moves the item its button shows, pane and all', async ({page}) => {
        const {order, titles, workspaceId} = await reorder(page),
              moving                       = order[3],
              title                        = titles[moving],
              before                       = await readDocument(page, workspaceId),
              targetNodeId                 = Object.keys(before.nodes).find(nodeId => before.nodes[nodeId].items?.includes('logs')),
              tab                          = await restingTab(page, title);

        // A tab container mounts only its active card: activate the tab so its pane exists to follow.
        await page.mouse.click(tab.x, tab.y);
        await expect.poll(() => page.evaluate(label => {
            const pane = [...document.querySelectorAll('.neo-example-dock-pane')].find(el => el.textContent.trim() === label);

            return pane?.checkVisibility() ? (pane.dockReorderWitness = true) : false
        }, title), {message: `the ${title} pane shows and carries the witness mark`}).toBe(true);

        const target = await restingTab(page, titles.logs);

        await grab(page, title);
        await page.mouse.move(target.zone.x, target.zone.y, {steps: 24});
        await expect.poll(() => page.evaluate(({x, y}) => {
            const rect = document.querySelector('.neo-dragproxy')?.getBoundingClientRect();

            return !!rect && Math.abs(rect.x + rect.width / 2 - x) < rect.width && Math.abs(rect.y + rect.height / 2 - y) < rect.height
        }, target.zone), {message: 'the proxy follows the pointer onto the target zone'}).toBe(true);
        await page.mouse.up();
        await expect(page.locator('.neo-dragproxy'), 'the drag ended').toHaveCount(0);

        await expect.poll(async () => (await readDocument(page, workspaceId)).nodes[targetNodeId].items,
            {message: `the drop moves ${moving} into ${targetNodeId}`}).toContain(moving);
        expect((await readDocument(page, workspaceId)).nodes[NODE].items, `${moving} left ${NODE}`).not.toContain(moving);

        await expect.poll(() => page.evaluate(({label, zoneId}) => {
            const pane = [...document.querySelectorAll('.neo-example-dock-pane')].find(el => el.textContent.trim() === label);

            return {inZone: !!document.getElementById(zoneId)?.contains(pane ?? null), sameNode: pane?.dockReorderWitness === true}
        }, {label: title, zoneId: target.tabsId}), {message: 'the pane arrives in the target zone as the same DOM node'})
            .toEqual({inZone: true, sameNode: true})
    })
});
