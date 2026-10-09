import {test, expect} from '@playwright/test';

/**
 * @summary A projection's outgoing shell leaves the host's layout at the visibility swap, whatever its
 * base class, and a retained root is never marked.
 *
 * The fixture's root is a tabs node, so its shell is a `neo-tab-container` rather than a
 * `neo-container`, and it carries no stylesheet: the engine sheet alone has to take the shell out.
 */
const HOST         = '.dock-preview-geometry-host';
const WORKSPACE_ID = 'dock-preview-geometry-workspace';

const applyOperation = (page, descriptor) => page.evaluate(data => Neo.worker.App.setConfigs(data), {
    id: WORKSPACE_ID, applyOperationJson: JSON.stringify(descriptor)
});

const readProbe = page => page.evaluate(() => window.__shellProbe);

// Completed projections while none is running, else -1.
const readSettles = async page => {
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data),
              {id: WORKSPACE_ID, keys: ['dockProjectionBusy', 'dockProjectionSettles']}),
          [busy, settles] = reply?.data ?? reply ?? [];

    return busy === false ? settles : -1
};

test('a tab-root shell leaves layout at the swap, and a retained tab root is never marked', async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-preview-geometry/index.html');
    await page.waitForSelector(`#${WORKSPACE_ID}`, {state: 'attached'});
    await expect.poll(() => readSettles(page), {timeout: 10000}).toBeGreaterThan(0);

    // Read in the task that applied each flight: a staged shell's arrival, and the outgoing shell's
    // retirement before its destruction.
    await page.evaluate(selector => {
        const host  = document.querySelector(selector),
              probe = window.__shellProbe = {marked: [], staged: 0};

        new MutationObserver(records => records.forEach(({addedNodes, target, type}) => {
            if (type === 'childList') {
                target === host && (probe.staged += addedNodes.length)
            } else if (target.parentElement === host && target.classList.contains('neo-dashboard-dock-shell-retiring') &&
                !probe.marked.some(entry => entry.id === target.id)) {
                probe.marked.push({
                    display     : getComputedStyle(target).display,
                    id          : target.id,
                    incomingLeft: Math.round(target.nextElementSibling.getBoundingClientRect().left - host.getBoundingClientRect().left)
                })
            }
        })).observe(host, {attributeFilter: ['class'], childList: true, subtree: true})
    }, HOST);

    const id = await page.locator(`${HOST} > .neo-tab-container`).getAttribute('id');

    let settles = await readSettles(page);

    // Activating a tab stages its projection around the retained root tab container.
    await applyOperation(page, {operation: 'setActiveItem', tabsNodeId: 'root', itemId: 'aside'});
    await expect.poll(() => readSettles(page)).toBeGreaterThan(settles);

    const control = await readProbe(page);

    expect(control.staged, 'the projection staged a shell').toBeGreaterThan(0);
    expect(control.marked, 'a retained root is never marked').toEqual([]);
    await expect(page.locator(`#${id}`)).toHaveCSS('display', 'flex');

    settles = await readSettles(page);

    // A document rooted at a new tabs node replaces the tab root outright.
    await applyOperation(page, {operation: 'applyDocument', document: {
        schema: 'neo.dock.zone.v1',
        root  : 'fresh',
        items : {main: {reference: 'main', title: 'Main'}, aside: {reference: 'aside', title: 'Aside'}},
        nodes : {fresh: {type: 'tabs', items: ['main', 'aside'], activeItemId: 'main'}}
    }});
    await expect.poll(() => readSettles(page)).toBeGreaterThan(settles);

    expect((await readProbe(page)).marked, 'the outgoing tab root left layout at the swap')
        .toEqual([{display: 'none', id, incomingLeft: 0}]);
    await expect(page.locator(`#${id}`)).toHaveCount(0)
});
