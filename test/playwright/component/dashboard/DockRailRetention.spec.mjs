import {test, expect} from '@playwright/test';

/**
 * @summary A staged dock commit keeps an unchanged edge rail by identity, so a reveal and its pressed
 * tab survive it: one open before the commit, and one a real click accepts while the commit's
 * projection is still pending.
 *
 * The rail's reveal state is runtime-only, in the instance, so a rebuilt rail would come back idle.
 * A tab selection takes the staged path, which makes it the smallest commit that exercises this.
 */
const HOST         = '.dock-preview-geometry-host';
const RAIL_TAB     = `${HOST} .neo-dashboard-dock-edge-rail-left .neo-dashboard-dock-rail-tab`;
const WORKSPACE_ID = 'dock-preview-geometry-workspace';

const railedDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'edge',
    items : {
        main : {reference: 'main',  title: 'Main'},
        other: {reference: 'other', title: 'Other'},
        left : {reference: 'left',  title: 'Left', autoHidden: true}
    },
    nodes: {
        edge       : {type: 'edge-zone', zones: {center: {nodeId: 'main-tabs'}, left: {nodeId: 'left-tabs', extent: 0.25}}},
        'main-tabs': {type: 'tabs', items: ['main', 'other'], activeItemId: 'main'},
        'left-tabs': {type: 'tabs', items: ['left'], activeItemId: 'left'}
    }
};

const selectOther = {operation: 'setActiveItem', tabsNodeId: 'main-tabs', itemId: 'other'};

const setWorkspace = (page, configs) => page.evaluate(data => Neo.worker.App.setConfigs(data), {id: WORKSPACE_ID, ...configs});

// `getConfigs` answers positionally, in `keys` order.
const readGuard = async page => {
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data),
              {id: WORKSPACE_ID, keys: ['dockProjectionBusy', 'dockProjectionSettles']}),
          [busy, settles] = reply?.data ?? reply ?? [];

    return {busy, settles}
};

const commit = async (page, descriptor) => {
    const {settles} = await readGuard(page);

    await setWorkspace(page, {applyOperationJson: JSON.stringify(descriptor)});
    await expect.poll(() => readGuard(page)).toEqual({busy: false, settles: settles + 1})
};

// The rail element, its tab's pressed class and the reveal overlay, read in one frame. The overlay is
// open while it carries neither its hidden nor its leaving class.
const readRail = page => page.evaluate(selector => {
    const tab     = document.querySelector(selector),
          overlay = document.querySelector('.neo-dashboard-dock-reveal-overlay');

    return {
        open   : !!overlay && !['hidden', 'leaving'].some(state => overlay.classList.contains(`neo-dashboard-dock-reveal-overlay-${state}`)),
        pressed: tab?.classList.contains('pressed') ?? null,
        railId : tab?.closest('.neo-dashboard-dock-edge-rail-left')?.id ?? null,
        title  : overlay?.querySelector('.neo-dashboard-dock-reveal-title')?.textContent ?? null
    }
}, RAIL_TAB);

const revealed = {open: true, pressed: true, title: 'Left'};

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-preview-geometry/index.html');
    await page.waitForSelector(`#${WORKSPACE_ID}`, {state: 'attached'});
    await expect.poll(async () => (await readGuard(page)).settles, {timeout: 10000}).toBeGreaterThan(0);
    await commit(page, {operation: 'applyDocument', document: railedDocument});
    await expect(page.locator(RAIL_TAB)).toHaveCount(1)
});

test('a reveal that is open survives a staged selection, on the same rail', async ({page}) => {
    await page.locator(RAIL_TAB).click();
    await expect.poll(() => readRail(page)).toMatchObject(revealed);

    const {railId} = await readRail(page);

    await commit(page, selectOther);

    expect(await readRail(page)).toEqual({...revealed, railId})
});

test('a rail click accepted while a staged selection is pending survives it', async ({page}) => {
    const {railId}  = await readRail(page),
          {settles} = await readGuard(page);

    // Hold the projection open, then click the rail it is about to re-project.
    await setWorkspace(page, {holdProjectionMs: 1500});
    await setWorkspace(page, {applyOperationJson: JSON.stringify(selectOther)});
    await expect.poll(async () => (await readGuard(page)).busy).toBe(true);

    await page.locator(RAIL_TAB).click();
    await expect.poll(() => readRail(page)).toMatchObject(revealed);
    expect((await readGuard(page)).busy, 'the click landed inside the pending projection').toBe(true);

    await expect.poll(() => readGuard(page)).toEqual({busy: false, settles: settles + 1});

    expect(await readRail(page)).toEqual({...revealed, railId})
});
