import {test, expect} from '@playwright/test';

/**
 * The grid pressed is the grid scrolled. `Neo.main.addon.GridDragScroll` adds one capture `mousedown` listener per
 * registered view, so a press inside a grid that sits in another grid's view (a component cell, content a package
 * hosts in the view) has both views in its path and runs the handler once per view. Before the fix the first
 * registration in the map won, which is the outer grid, and the second run armed a second press timer that threw on
 * a quick click.
 *
 * The fixture (`apps/grid-focus`) has no grid inside a grid, so each arm builds the smallest real one: a scrollable
 * `neo-grid-view` with a tall `neo-grid-row`, placed in a cell of a plain row of the long grid and registered with
 * the addon after the outer grid, the order a nested grid renders in. The browser builds the event path and runs
 * both capture listeners, so the arms measure the addon, not a stand-in.
 */
const outerViewId = page => page.locator('#grid-focus-long .neo-grid-view').first().getAttribute('id');

const scrollTopOf = (page, id) => page.evaluate(id => document.getElementById(id).scrollTop, id);

/**
 * A plain pointer drag in steps, held past the activation delay.
 * @param {import('@playwright/test').Page} page
 * @param {{x: Number, y: Number}} from
 * @param {{x: Number, y: Number}} to
 * @returns {Promise<void>}
 */
const drag = async (page, from, to) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.waitForTimeout(150);

    for (let i = 1; i <= 12; i++) {
        await page.mouse.move(from.x + (to.x - from.x) * i / 12, from.y + (to.y - from.y) * i / 12);
        await page.waitForTimeout(25)
    }

    await page.mouse.up()
};

const centreOf = async locator => {
    const box = await locator.boundingBox();
    return {x: box.x + box.width / 2, y: box.y + box.height / 2}
};

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/grid-focus/index.html');
    await page.waitForSelector('#grid-focus-long .neo-grid-row', {state: 'visible'});
    await expect.poll(() => page.evaluate(() => Neo.main?.addon?.GridDragScroll?.registrations?.size ?? 0), {timeout: 15000})
        .toBeGreaterThanOrEqual(2);

    // the inner grid: a short scrollable view whose only row is taller than it, filling the widest cell of a
    // visible row. The fixture's native drag sources are `.neo-grid-row:nth-child(-n+3)`, so neither the host row
    // nor the inner row may match that selector: three empty nodes precede the inner row.
    await page.evaluate(() => {
        const dragSource = '.neo-grid-row:nth-child(-n+3)',
              outer      = document.querySelector('#grid-focus-long .neo-grid-view').getBoundingClientRect(),
              host       = [...document.querySelectorAll('#grid-focus-long .neo-grid-row')].find(row => {
                  const box = row.getBoundingClientRect();
                  return !row.matches(dragSource) && box.top >= outer.top && box.bottom <= outer.bottom
              }),
              cells      = [...host.querySelectorAll('.neo-grid-cell')],
              cell       = cells.reduce((a, b) => b.offsetWidth > a.offsetWidth ? b : a),
              view       = document.createElement('div'),
              row        = document.createElement('div');

        view.id            = 'nested-inner-view';
        view.className     = 'neo-grid-view';
        view.style.cssText = 'width: 100%; height: 30px; flex: none; overflow: auto; position: relative; z-index: 1; background: #fff';
        row.className      = 'neo-grid-row';
        row.style.cssText  = 'height: 400px';
        row.textContent    = 'inner';

        view.append(...Array.from({length: 3}, () => document.createElement('div')), row);
        cell.appendChild(view);

        Neo.main.addon.GridDragScroll.register({viewId: 'nested-inner-view', containerId: 'nested-inner-view', id: 'nested-inner'})
    })
});

test.describe('grid drag-to-scroll — a grid nested in another grid\'s view', () => {
    test('a press-drag on the inner grid\'s rows scrolls the inner grid only', async ({page}) => {
        const outerId = await outerViewId(page),
              before  = await scrollTopOf(page, outerId),
              from    = await centreOf(page.locator('#nested-inner-view'));

        await drag(page, from, {x: from.x, y: from.y - 60});

        await expect.poll(() => scrollTopOf(page, 'nested-inner-view'), {message: 'the inner grid scrolled'}).toBeGreaterThan(0);
        expect(await scrollTopOf(page, outerId), 'the outer grid did not').toBe(before)
    });

    test('control: a press-drag on the outer grid\'s rows still scrolls the outer grid', async ({page}) => {
        const outerId = await outerViewId(page),
              box     = await page.locator(`#${outerId}`).boundingBox(),
              before  = await scrollTopOf(page, outerId),
              from    = {x: box.x + box.width / 2, y: box.y + box.height * 0.85};

        await drag(page, from, {x: from.x, y: from.y - 160});

        await expect.poll(() => scrollTopOf(page, outerId), {message: 'the outer grid scrolled'}).toBeGreaterThan(before)
    });

    test('a click inside the inner grid, released within the delay, logs no error', async ({page}) => {
        const errors = [];

        page.on('pageerror', error => errors.push(error.message));

        await page.locator('#nested-inner-view').click();
        await page.waitForTimeout(300); // past the addon's delay: a second, orphaned timer would have fired

        expect(errors).toEqual([]);
        expect(await page.evaluate(() => Boolean(Neo.main.addon.GridDragScroll.monitorDrag))).toBe(false)
    });

    test('a press-drag inside an input the view hosts outside its rows scrolls nothing', async ({page}) => {
        const outerId = await outerViewId(page);

        await page.evaluate(id => {
            const input = document.createElement('input');

            input.id            = 'outer-view-input';
            input.value         = 'some text to select in the input';
            input.style.cssText = 'position: absolute; top: 0; left: 0; width: 240px; z-index: 2';
            document.getElementById(id).appendChild(input)
        }, outerId);

        const before = await scrollTopOf(page, outerId),
              box    = await page.locator('#outer-view-input').boundingBox(),
              from   = {x: box.x + 10, y: box.y + box.height / 2};

        await drag(page, from, {x: from.x + 120, y: from.y - 60});
        await page.waitForTimeout(200);

        expect(await scrollTopOf(page, outerId), 'the outer grid did not scroll').toBe(before);
        expect(await page.evaluate(() => Boolean(Neo.main.addon.GridDragScroll.activeDrag)), 'no drag-scroll started').toBe(false)
    })
});
