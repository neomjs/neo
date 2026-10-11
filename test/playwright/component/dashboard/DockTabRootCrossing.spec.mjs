import {test, expect} from '@playwright/test';

/**
 * @summary A commit that moves a tabs node across the dock root keeps every tab container on screen.
 *
 * The fixture's root is a tabs node. Splitting it nests that root tab container inside a new split;
 * collapsing a split to one of its tabs nodes makes that tab container the root. Either way the
 * retained container survives the projection: it must end visible, in layout, as the same component,
 * and the host must hold a single shell.
 */
const HOST         = '.dock-preview-geometry-host';
const WORKSPACE_ID = 'dock-preview-geometry-workspace';

const applyOperation = (page, descriptor) => page.evaluate(data => Neo.worker.App.setConfigs(data), {
    id: WORKSPACE_ID, applyOperationJson: JSON.stringify(descriptor)
});

// Completed projections while none is running, else -1.
const readSettles = async page => {
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data),
              {id: WORKSPACE_ID, keys: ['dockProjectionBusy', 'dockProjectionSettles']}),
          [busy, settles] = reply?.data ?? reply ?? [];

    return busy === false ? settles : -1
};

const commit = async (page, descriptor) => {
    const settles = await readSettles(page);

    await applyOperation(page, descriptor);
    await expect.poll(() => readSettles(page)).toBeGreaterThan(settles)
};

// The host's shells (its children besides the two overlays) and every tab container, as laid out.
const readLayout = page => page.evaluate(selector => {
    const host  = document.querySelector(selector),
          width = Math.round(host.getBoundingClientRect().width);

    return {
        shells: [...host.children].filter(node => !node.matches('.neo-dock-preview, .neo-dashboard-dock-drop-indicators')).map(node => ({
            fills: Math.round(node.getBoundingClientRect().left - host.getBoundingClientRect().left) === 0 && Math.round(node.getBoundingClientRect().width) === width,
            id   : node.id
        })),
        tabs: [...host.querySelectorAll('.neo-tab-container')].map(node => ({
            id     : node.id,
            text   : node.innerText.replace(/\n/g, '|'),
            visible: node.checkVisibility({visibilityProperty: true}) && node.getBoundingClientRect().width > 0
        }))
    }
}, HOST);

const boot = async page => {
    await page.goto('test/playwright/component/apps/dock-preview-geometry/index.html');
    await page.waitForSelector(`#${WORKSPACE_ID}`, {state: 'attached'});
    await expect.poll(() => readSettles(page), {timeout: 10000}).toBeGreaterThan(0)
};

const items = {main: {reference: 'main', title: 'Main'}, aside: {reference: 'aside', title: 'Aside'}};

test('splitting the tab root nests its tab container, visible beside the new one', async ({page}) => {
    await boot(page);

    const rootId = await page.locator(`${HOST} > .neo-tab-container`).getAttribute('id');

    await commit(page, {operation: 'splitNode', itemId: 'aside', orientation: 'horizontal', targetNodeId: 'root'});

    const {shells, tabs} = await readLayout(page);

    expect(shells).toHaveLength(1);
    expect(shells[0].fills, 'the split fills the host').toBe(true);
    expect(tabs.map(({id, visible}) => ({id, visible}))).toEqual([{id: rootId, visible: true}, {id: expect.any(String), visible: true}]);
    expect(tabs[1].text).toContain('Aside');
    await expect(page.locator('.neo-dashboard-dock-shell-retiring')).toHaveCount(0)
});

test('collapsing a split to one of its tabs nodes makes that tab container the only shell', async ({page}) => {
    await boot(page);
    await commit(page, {operation: 'applyDocument', document: {schema: 'neo.dock.zone.v1', root: 's', items, nodes: {
        s : {type: 'split', orientation: 'horizontal', children: ['t1', 't2'], sizes: [0.5, 0.5]},
        t1: {type: 'tabs', items: ['main'],  activeItemId: 'main'},
        t2: {type: 'tabs', items: ['aside'], activeItemId: 'aside'}
    }}});

    const mainId = (await readLayout(page)).tabs.find(tab => tab.text.includes('Main')).id;

    await commit(page, {operation: 'moveItem', itemId: 'aside', targetNodeId: 't1'});

    const {shells, tabs} = await readLayout(page);

    expect(shells).toEqual([{fills: true, id: mainId}]);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].visible).toBe(true);
    await expect(page.locator('.neo-dashboard-dock-shell-retiring')).toHaveCount(0)
});
