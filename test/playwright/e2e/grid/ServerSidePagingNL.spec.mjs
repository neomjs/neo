import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Reads the real App Worker's Store and connection receipts after native browser gestures.
 * @param {Object} app Neural Link app connection.
 * @returns {Promise<Object>}
 */
async function readGrid(app) {
    const [grid] = await app.queryComponent({reference: 'grid'}, [
        'store.count', 'store.totalCount', 'store.currentPage',
        'store.pipeline.connection.lastRequest', 'isLoading'
    ]);
    const props = grid.properties;
    return {
        count  : props['store.count'], total: props['store.totalCount'], page: props['store.currentPage'],
        request: props['store.pipeline.connection.lastRequest'], loading: props.isLoading
    }
}

/**
 * @summary Widens only the test's injectable delay so slow screenshot runners can observe the pending state.
 * @param {Object} app Neural Link app connection.
 * @returns {Promise<void>}
 */
async function widenObservationWindow(app) {
    const [grid] = await app.queryComponent({reference: 'grid'}, ['store.pipeline.connection.id']);
    await app.setProperties(grid.properties['store.pipeline.connection.id'], {delay: 1500})
}

test('page, header sort and country filter each make one server request', async ({page, neuralLink}) => {
    await page.goto('/examples/grid/serverSide/index.html');
    const app = await neuralLink.connectToApp('Neo.examples.grid.serverSide');
    await expect.poll(async () => (await readGrid(app)).count).toBe(50);
    expect(await readGrid(app)).toMatchObject({total: 100000, page: 1, request: {number: 1, pageSize: 50}});
    await widenObservationWindow(app);

    await page.getByRole('button', {name: 'Next', exact: true}).focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await readGrid(app)).loading).toBe(true);
    expect(await readGrid(app)).toMatchObject({count: 0, request: {number: 2, page: 2}});
    await expect.poll(async () => (await readGrid(app)).loading).toBe(false);
    expect(await readGrid(app)).toMatchObject({count: 50, total: 100000, page: 2, request: {number: 2, page: 2}});

    await page.getByRole('columnheader', {name: 'Amount', exact: true}).click();
    await expect.poll(async () => {
        const state = await readGrid(app);
        return state.request.number === 3 && !state.loading && state.count === 50
    }).toBe(true);
    expect((await readGrid(app)).request).toMatchObject({page: 1, sorters: [{property: 'amount', direction: 'ASC'}]});

    await page.getByRole('combobox', {name: 'Country', exact: true}).press('ArrowDown');
    await page.getByRole('option', {name: 'DE', exact: true}).click();
    await expect.poll(async () => {
        const state = await readGrid(app);
        return state.request.number === 4 && !state.loading && state.count === 50
    }).toBe(true);
    expect(await readGrid(app)).toMatchObject({count: 50, total: 12500, page: 1,
        request: {number: 4, filters: [{property: 'country', operator: '===', value: 'DE'}],
            sorters: [{property: 'amount', direction: 'ASC'}]}});
    const [grid] = await app.queryComponent({reference: 'grid'}, ['store.id']),
          data   = await app.inspectStore(grid.properties['store.id']);
    expect(data.items).toHaveLength(50);
    expect(data.items.every(row => row.country === 'DE')).toBe(true);
    const amounts = data.items.map(row => row.amount);
    expect(amounts).toEqual(amounts.slice().sort((a, b) => a - b));
    await expect(page.locator('.server-side-request')).toContainText('50 of 12,500 rows');

    await page.getByRole('button', {name: 'Last', exact: true}).click();
    await expect.poll(async () => (await readGrid(app)).page).toBe(250);
    await expect.poll(async () => (await readGrid(app)).count).toBe(50);
    expect((await readGrid(app)).request.number).toBe(5)
});

for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
    for (const dark of [false, true]) {
        test(`first page and pending request at ${viewport.width}px, ${dark ? 'dark' : 'light'}`, async ({page, neuralLink}, testInfo) => {
            await page.setViewportSize(viewport);
            await page.goto('/examples/grid/serverSide/index.html');
            const app = await neuralLink.connectToApp('Neo.examples.grid.serverSide');
            await expect(page.locator('.server-side-request')).toContainText('50 of 100,000 rows');
            if (dark) {
                await page.getByRole('button', {name: 'Dark theme', exact: true}).click();
                await expect(page.getByRole('button', {name: 'Light theme', exact: true})).toBeVisible()
            }
            await expect(page.locator('.server-side-scope')).toBeVisible();
            await widenObservationWindow(app);
            await page.mouse.move(0, 0);
            const next = page.getByRole('button', {name: 'Next', exact: true});
            await expect(next).toBeInViewport();
            const layout = await page.evaluate(() => ({width: innerWidth, scroll: document.documentElement.scrollWidth}));
            expect(layout.scroll).toBeLessThanOrEqual(layout.width);
            await testInfo.attach('first-page', {body: await page.screenshot(), contentType: 'image/png'});

            await next.click();
            await expect(page.locator('.server-side-request')).toContainText('Loading…');
            await page.mouse.move(0, 0);
            await expect.poll(async () => (await readGrid(app)).loading).toBe(true);
            await testInfo.attach('pending-request', {body: await page.screenshot(), contentType: 'image/png'});
            await expect(page.locator('.server-side-request')).toContainText('50 of 100,000 rows');
            expect(await readGrid(app)).toMatchObject({count: 50, page: 2, request: {number: 2}})
        })
    }
}
