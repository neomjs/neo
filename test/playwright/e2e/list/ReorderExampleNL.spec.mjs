import {test, expect} from '../../fixtures.mjs';

const STEPS = '.neo-reorder-steps .neo-list-item',
      CARDS = '.neo-reorder-wall .neo-list-item';

/**
 * @summary Drags one item onto a point of another in small pointer steps, which the main thread's sensor follows.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} source
 * @param {import('@playwright/test').Locator} target
 * @param {Number} fx Where on the target to release, as a fraction of its width
 * @param {Number} fy Where on the target to release, as a fraction of its height
 */
async function drag(page, source, target, fx, fy) {
    const from = await source.boundingBox(),
          to   = await target.boundingBox(),
          x    = from.x + from.width  / 2,
          y    = from.y + from.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();

    for (let i = 1; i <= 12; i++) {
        await page.mouse.move(x + (to.x + to.width * fx - x) * i / 12, y + (to.y + to.height * fy - y) * i / 12)
    }

    await page.mouse.up()
}

/**
 * @summary Reads a list's store through the Neural Link: each record's id and order, in the store's sort.
 * @param {Object} app
 * @param {String} className
 * @returns {Promise<Array<Number[]>>}
 */
async function storeOrder(app, className) {
    const [list]  = await app.queryComponent({className}, ['store']),
          {store} = list.properties,
          data    = await app.inspectStore(store.id || store, 20, 0);

    return data.items.map(item => item.data || item).map(record => [record.id, record.order])
}

test.describe('examples/list/reorder', () => {
    let app;

    test.beforeEach(async ({page, neuralLink}) => {
        await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
        await page.goto('/examples/list/reorder/index.html');
        await expect(page.locator(`${CARDS} img`)).toHaveCount(15);
        app = await neuralLink.connectToApp('Neo.examples.list.reorder')
    });

    test('a step dropped on the lower half of the third row lands below it, and the store renumbers', async ({page}) => {
        const steps = page.locator(STEPS);

        await drag(page, steps.nth(0), steps.nth(2), .5, .8);

        await expect(page.locator(`${STEPS} .neo-reorder-text`)).toHaveText([
            'Run the full test suite', 'Write the release notes', 'Freeze the release branch', 'Bump the version',
            'Tag the release', 'Publish to npm', 'Deploy the website', 'Announce the release'
        ]);
        await expect(page.locator(`${STEPS} .neo-reorder-place`)).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8']);

        expect(await storeOrder(app, 'Neo.examples.list.reorder.StepList')).toEqual([
            [2, 0], [3, 1], [1, 2], [4, 3], [5, 4], [6, 5], [7, 6], [8, 7]
        ])
    });

    test('a portrait dropped on the right half of the third card lands after it in the grid', async ({page}) => {
        const cards = page.locator(CARDS),
              names = page.locator(`${CARDS} .neo-reorder-name`);

        const before = await names.allTextContents();

        await drag(page, cards.nth(0), cards.nth(2), .8, .5);

        await expect(names).toHaveText([before[1], before[2], before[0], ...before.slice(3)]);

        const order = await storeOrder(app, 'Neo.examples.list.reorder.PersonList');

        // SortZone renumbers the siblings from 0, so the store's order is the grid's
        expect(order.map(([, place]) => place)).toEqual([...Array(15).keys()]);
        expect(order[2][0]).toBe(1)
    })
});
