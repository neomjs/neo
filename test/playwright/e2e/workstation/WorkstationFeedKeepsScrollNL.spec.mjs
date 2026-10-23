import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The live feed keeps a reader's scroll across its ticks.
 *
 * Workstation's feed adds a batch and trims its oldest records every 500 ms. A tick continues the view a reader
 * may be scrolled into, so the grid keeps that scroll instead of returning to the top on every tick. At the top,
 * the feed stays at the top and its newest event is the store's first record.
 */
const asArray = value => Array.isArray(value) ? value : value ? [value] : [];

test.describe('Workstation — the live feed keeps the reader\'s scroll across its ticks', () => {
    test.setTimeout(90000);
    test.use({viewport: {height: 900, width: 1600}});

    test('a scrolled feed keeps its position across three ticks; at the top it stays at the top', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-workspace', {timeout: 30000});

        const app     = await neuralLink.connectToApp('Workstation'),
              storeId = asArray(await app.findInstances({className: 'Workstation.store.Feed'}, ['id']))[0]?.id,
              paneId  = asArray(await app.findInstances({className: 'Workstation.view.FeedPane'}, ['id']))[0]?.id;

        expect(storeId, 'the feed store exists').toBeTruthy();
        expect(paneId, 'the feed pane exists').toBeTruthy();

        await page.locator('.neo-tab-header-button', {hasText: 'Live Event Stream'}).first().click();

        const viewId    = (await app.getComponent(paneId, ['view.id']))['view.id'],
              ticks     = async () => (await app.getComponent(storeId, ['batchCount'])).batchCount,
              overflow  = () => page.evaluate(id => {const view = document.getElementById(id); return view.scrollHeight - view.clientHeight}, viewId),
              scrollTo  = top => page.evaluate(([id, value]) => {const view = document.getElementById(id); view.scrollTop = value; return view.scrollTop}, [viewId, top]),
              scrollTop = () => page.evaluate(id => document.getElementById(id).scrollTop, viewId);

        expect(viewId, 'the feed grid has a view').toBeTruthy();
        await expect.poll(overflow, {message: 'the feed has rows below its fold', timeout: 20000}).toBeGreaterThan(300);

        const offset = await scrollTo(300),
              start  = await ticks();

        expect(offset).toBe(300);
        await expect.poll(ticks, {message: 'three feed ticks pass', timeout: 10000}).toBeGreaterThanOrEqual(start + 3);
        expect(await scrollTop(), 'the reader keeps their position across the ticks').toBe(offset);

        await scrollTo(0);
        const next = await ticks() + 1;

        await expect.poll(ticks, {message: 'another tick passes', timeout: 5000}).toBeGreaterThanOrEqual(next);
        expect(await scrollTop(), 'at the top, the feed stays at the top').toBe(0);

        const {sequence} = await app.getComponent(storeId, ['sequence']),
              newest     = await app.callMethod(storeId, 'getAt', [0]);

        expect(newest?.id, 'the newest event is the first record').toBe(`feed-${String(sequence).padStart(8, '0')}`)
    })
});
