import {test, expect} from '@playwright/test';

/**
 * @summary `Neo.main.addon.GridHorizontalScrollSync` in a real page:
 * - a grid that registers before its nodes are in the document syncs its body and header once they are;
 * - a grid whose scrollbar moved before it registered takes that position at once;
 * - a wheel that a nested control consumes stays with that control;
 * - an unregistered grid no longer follows its scrollbar.
 *
 * The App worker's registration can reach the main thread ahead of the VDom worker's delta. So each arm registers a
 * probe grid first and builds its nodes after it: a scrollable scrollbar, a centre header, a body, and a view that
 * holds a nested control. The browser builds every event path, so the arms measure the addon's listeners, not a
 * stand-in.
 *
 * @see Neo.main.addon.GridHorizontalScrollSync
 */

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{body: String, header: Number, scroller: Number}>} The probe grid's horizontal positions
 */
const read = page => page.evaluate(() => ({
    body    : document.getElementById('probe-body').style.getPropertyValue('--neo-grid-scroll-left'),
    header  : document.getElementById('probe-header').scrollLeft,
    scroller: document.getElementById('probe-scroller').scrollLeft
}));

/**
 * A horizontal wheel on the nested control, which consumes it when asked to.
 * @param {import('@playwright/test').Page} page
 * @param {Boolean} consume
 * @returns {Promise<void>}
 */
const wheel = (page, consume) => page.evaluate(consume => {
    const control = document.getElementById('probe-control'),
          stop    = event => event.stopPropagation();

    consume && control.addEventListener('wheel', stop);
    control.dispatchEvent(new WheelEvent('wheel', {bubbles: true, deltaX: 40}));
    consume && control.removeEventListener('wheel', stop)
}, consume);

/**
 * Moves the scrollbar and sends its scroll event at once, rather than in the browser's next frame.
 * @param {import('@playwright/test').Page} page
 * @param {Number} left
 * @returns {Promise<void>}
 */
const scrollTo = (page, left) => page.evaluate(left => {
    const scroller = document.getElementById('probe-scroller');

    scroller.scrollLeft = left;
    scroller.dispatchEvent(new Event('scroll'))
}, left);

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/grid-focus/index.html');
    await page.waitForSelector('#grid-focus-long .neo-grid-row', {state: 'visible'});
    await expect.poll(() => page.evaluate(() => Neo.main?.addon?.GridHorizontalScrollSync?.registrations?.size ?? 0), {timeout: 15000})
        .toBeGreaterThanOrEqual(1);

    await page.evaluate(() => {
        Neo.main.addon.GridHorizontalScrollSync.register({
            id        : 'probe__h_scroll',
            scrollerId: 'probe-scroller',
            bodyId    : 'probe-body',
            headerId  : 'probe-header',
            viewId    : 'probe-view'
        });

        // The nodes land after the registration
        const node = (id, style, parent = document.body) => {
            const element = document.createElement('div');

            element.id = id;
            Object.assign(element.style, style);
            parent.appendChild(element);
            return element
        };

        node('probe-scroller-content', {height: '1px', width: '1000px'}, node('probe-scroller', {height: '20px', overflowX: 'auto', width: '300px'}));
        node('probe-header-content',   {height: '1px', width: '1000px'}, node('probe-header',   {height: '20px', overflowX: 'hidden', width: '300px'}));
        node('probe-body', {height: '20px', width: '300px'});
        node('probe-control', {height: '50px', width: '100px'}, node('probe-view', {height: '100px', width: '300px'}))
    })
});

test.describe('Neo.main.addon.GridHorizontalScrollSync in the browser', () => {
    test('a grid registered before its nodes syncs, and a nested control keeps the wheel it consumes', async ({page}) => {
        await wheel(page, false);
        await expect.poll(() => read(page)).toEqual({body: '40px', header: 40, scroller: 40});

        // A consumed wheel and then an ordinary one: only the ordinary one moves the grid
        await wheel(page, true);
        await wheel(page, false);
        await expect.poll(() => read(page), {message: 'the consumed wheel moved nothing'}).toEqual({body: '80px', header: 80, scroller: 80})
    });

    test('a grid keyed by data-neo-id syncs while useDomIds is false', async ({page}) => {
        await page.evaluate(() => {
            Neo.config.useDomIds = false;
            Neo.main.addon.GridHorizontalScrollSync.register({
                id        : 'probe-data__h_scroll',
                scrollerId: 'probe-data-scroller',
                bodyId    : 'probe-data-body',
                headerId  : 'probe-data-header',
                viewId    : 'probe-data-view'
            });

            // The renderer writes the Neo id as data-neo-id in this mode, and no DOM id
            const node = (id, style, parent = document.body) => {
                const element = document.createElement('div');

                element.dataset.neoId = id;
                Object.assign(element.style, style);
                parent.appendChild(element);
                return element
            };

            node('probe-data-scroller-content', {height: '1px', width: '1000px'}, node('probe-data-scroller', {height: '20px', overflowX: 'auto', width: '300px'}));
            node('probe-data-header-content',   {height: '1px', width: '1000px'}, node('probe-data-header',   {height: '20px', overflowX: 'hidden', width: '300px'}));
            node('probe-data-body', {height: '20px', width: '300px'});
            node('probe-data-control', {height: '50px', width: '100px'}, node('probe-data-view', {height: '100px', width: '300px'}))
        });

        await page.evaluate(() => document.querySelector('[data-neo-id="probe-data-control"]')
            .dispatchEvent(new WheelEvent('wheel', {bubbles: true, deltaX: 40})));

        await expect.poll(() => page.evaluate(() => {
            const node = id => document.querySelector(`[data-neo-id="${id}"]`);

            return {
                body    : node('probe-data-body').style.getPropertyValue('--neo-grid-scroll-left'),
                header  : node('probe-data-header').scrollLeft,
                scroller: node('probe-data-scroller').scrollLeft
            }
        })).toEqual({body: '40px', header: 40, scroller: 40})
    });

    test('a grid whose scrollbar moved before it registered takes that position at once (#21841)', async ({page}) => {
        const readLate = () => page.evaluate(() => ({
            body    : document.getElementById('late-body').style.getPropertyValue('--neo-grid-scroll-left'),
            header  : document.getElementById('late-header').scrollLeft,
            scroller: document.getElementById('late-scroller').scrollLeft
        }));

        // The nodes and a scroll first: the addon loads on demand, so no listener of its own heard this one
        await page.evaluate(() => {
            const node = (id, style, parent = document.body) => {
                const element = document.createElement('div');

                element.id = id;
                Object.assign(element.style, style);
                parent.appendChild(element);
                return element
            };

            node('late-scroller-content', {height: '1px', width: '1000px'}, node('late-scroller', {height: '20px', overflowX: 'auto', width: '300px'}));
            node('late-header-content',   {height: '1px', width: '1000px'}, node('late-header',   {height: '20px', overflowX: 'hidden', width: '300px'}));
            node('late-body', {height: '20px', width: '300px'});
            node('late-view', {height: '100px', width: '300px'});

            document.getElementById('late-scroller').scrollLeft = 120
        });

        expect(await readLate(), 'control: the scroll reached no grid node').toEqual({body: '', header: 0, scroller: 120});

        await page.evaluate(() => Neo.main.addon.GridHorizontalScrollSync.register({
            id        : 'late__h_scroll',
            scrollerId: 'late-scroller',
            bodyId    : 'late-body',
            headerId  : 'late-header',
            viewId    : 'late-view'
        }));

        expect(await readLate()).toEqual({body: '120px', header: 120, scroller: 120});

        // A re-registration seeds the scrollbar's position as it is now, zero included
        await page.evaluate(() => {
            const sync = Neo.main.addon.GridHorizontalScrollSync;

            sync.unregister({id: 'late__h_scroll'});
            document.getElementById('late-scroller').scrollLeft = 0;
            sync.register({id: 'late__h_scroll', scrollerId: 'late-scroller', bodyId: 'late-body', headerId: 'late-header', viewId: 'late-view'})
        });

        expect(await readLate(), 'a re-registration at zero').toEqual({body: '0px', header: 0, scroller: 0})
    });

    test('an unregistered grid no longer follows its scrollbar', async ({page}) => {
        await scrollTo(page, 40);
        expect(await read(page), 'control: the registered grid follows').toEqual({body: '40px', header: 40, scroller: 40});

        await page.evaluate(() => Neo.main.addon.GridHorizontalScrollSync.unregister({id: 'probe__h_scroll'}));

        await scrollTo(page, 80);
        expect(await read(page)).toEqual({body: '40px', header: 40, scroller: 80})
    });

    test('sync restores a clamped header to the live scrollbar position and keeps a post-drop scroll to 0 (#22245)', async ({page}) => {
        await scrollTo(page, 230);
        expect(await read(page)).toEqual({body: '230px', header: 230, scroller: 230});

        // Layout clamp to 0 while scroller remains at 230: sync restores 230 without reverse-rolling scroller
        await page.evaluate(() => {
            document.getElementById('probe-header').scrollLeft = 0;
            Neo.main.addon.GridHorizontalScrollSync.sync({id: 'probe__h_scroll'})
        });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        expect(await read(page), 'clamped header rejoins live scroller at 230').toEqual({body: '230px', header: 230, scroller: 230});

        // Scroller moves to 0 before late drag-end sync arrives: sync preserves 0 on both header and scroller
        await scrollTo(page, 0);
        await page.evaluate(() => Neo.main.addon.GridHorizontalScrollSync.sync({id: 'probe__h_scroll'}));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        expect(await read(page), 'late sync preserves post-drop scroll to 0').toEqual({body: '0px', header: 0, scroller: 0})
    })
});
