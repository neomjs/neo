import {test, expect} from '@playwright/test';

/**
 * @summary `Neo.main.addon.ScrollSync` in a real page: a view and a vertical scrollbar that register before their nodes
 * are in the document sync once they are, both ways, and an unregistered pair stops syncing.
 *
 * The App worker's registration can reach the main thread ahead of the VDom worker's delta, so each arm registers a
 * probe pair first and builds its nodes after it: two scrollable nodes. The browser builds every event path, so the
 * arms measure the addon's listener, not a stand-in.
 *
 * @see Neo.main.addon.ScrollSync
 */

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{bar: Number, view: Number}>} The probe pair's vertical positions
 */
const read = page => page.evaluate(() => ({
    bar : document.getElementById('probe-bar').scrollTop,
    view: document.getElementById('probe-view').scrollTop
}));

/**
 * Scrolls a probe node and sends its scroll event at once, rather than in the browser's next frame.
 * @param {import('@playwright/test').Page} page
 * @param {String} id
 * @param {Number} top
 * @returns {Promise<void>}
 */
const scrollTo = (page, id, top) => page.evaluate(({id, top}) => {
    const node = document.getElementById(id);

    node.scrollTop = top;
    node.dispatchEvent(new Event('scroll'))
}, {id, top});

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/grid-focus/index.html');
    await page.waitForSelector('#grid-focus-long .neo-grid-row', {state: 'visible'});
    await expect.poll(() => page.evaluate(() => Neo.main?.addon?.ScrollSync?.registrations?.size ?? 0), {timeout: 15000})
        .toBeGreaterThanOrEqual(1);

    await page.evaluate(() => {
        Neo.main.addon.ScrollSync.register({fromId: 'probe-view', id: 'probe', toId: 'probe-bar'});

        // The nodes land after the registration
        for (const id of ['probe-view', 'probe-bar']) {
            const node    = document.createElement('div'),
                  content = document.createElement('div');

            node.id = id;
            Object.assign(node.style, {height: '100px', overflowY: 'auto', width: '100px'});
            content.style.height = '1000px';
            node.appendChild(content);
            document.body.appendChild(node)
        }
    })
});

test.describe('Neo.main.addon.ScrollSync in the browser', () => {
    test('a pair registered before its nodes syncs, both ways', async ({page}) => {
        await scrollTo(page, 'probe-view', 40);
        expect(await read(page)).toEqual({bar: 40, view: 40});

        // The scrollbar holds the echo lock of the write at 40 for a moment
        await expect.poll(() => page.evaluate(() => Neo.main.addon.ScrollSync.coordinatingNodes.has('probe-bar'))).toBe(false);

        await scrollTo(page, 'probe-bar', 80);
        expect(await read(page), 'the scrollbar scrolls the view').toEqual({bar: 80, view: 80})
    });

    test('an unregistered pair stops syncing', async ({page}) => {
        await scrollTo(page, 'probe-view', 40);
        expect(await read(page), 'control: the registered pair syncs').toEqual({bar: 40, view: 40});

        await page.evaluate(() => Neo.main.addon.ScrollSync.unregister({id: 'probe'}));

        await scrollTo(page, 'probe-view', 90);
        expect(await read(page)).toEqual({bar: 40, view: 90})
    })
});
