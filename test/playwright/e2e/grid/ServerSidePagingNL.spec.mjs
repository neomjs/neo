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
    const props = grid?.properties;
    if (!props) return {count: null, total: null, page: null, request: null, loading: false};
    return {
        count  : props['store.count'], total: props['store.totalCount'], page: props['store.currentPage'],
        request: props['store.pipeline.connection.lastRequest'], loading: !!props.isLoading
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

    await page.getByRole('columnheader', {name: 'Amount €', exact: true}).click();
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
    expect(await readGrid(app)).toMatchObject({count: 50, total: 12539, page: 1,
        request: {number: 4, filters: [{property: 'country', operator: '===', value: 'DE'}],
            sorters: [{property: 'amount', direction: 'ASC'}]}});
    const [grid] = await app.queryComponent({reference: 'grid'}, ['store.id']),
          data   = await app.inspectStore(grid.properties['store.id']);
    expect(data.items).toHaveLength(50);
    expect(data.items.every(row => row.country === 'DE')).toBe(true);
    const amounts = data.items.map(row => row.amount);
    expect(amounts).toEqual(amounts.slice().sort((a, b) => a - b));
    await expect(page.locator('.server-side-request')).toContainText('50 of 12,539 rows');

    await page.getByRole('button', {name: 'Last', exact: true}).click();
    await expect.poll(async () => (await readGrid(app)).page).toBe(251);
    await expect.poll(async () => (await readGrid(app)).count).toBe(39);
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
            await expect(page.locator('.neo-grid-container')).toHaveCSS('color-scheme', dark ? 'dark' : 'light');
            await expect(page.getByRole('columnheader', {name: 'Order', exact: true})
                .locator('.neo-button-text')).toHaveCSS('font-weight', '600');
            await expect(page.locator('.server-side-scope')).toBeVisible();
            await expect(page.locator('.server-side-page-total')).toHaveText('Total: 100,000 rows');
            await widenObservationWindow(app);
            await page.getByRole('heading', {name: 'One page. 100,000 orders.', exact: true}).click();
            await page.mouse.move(0, 0);
            const next = page.getByRole('button', {name: 'Next', exact: true});
            await expect(next).toBeInViewport();
            const layout = await page.evaluate(() => ({width: innerWidth, scroll: document.documentElement.scrollWidth}));
            expect(layout.scroll).toBeLessThanOrEqual(layout.width);
            for (const name of ['Order', 'Customer', 'Country', 'Amount €']) {
                await expect(page.getByRole('columnheader', {name, exact: true})).toBeInViewport({ratio: 1})
            }
            await expect.poll(async () => page.locator('[role="columnheader"] .neo-button-text').evaluateAll(elements =>
                elements.filter(element => element.scrollWidth > element.clientWidth).map(element => element.textContent))
            ).toEqual([]);
            const bodyBounds = await page.locator('.neo-grid-body').boundingBox();
            for (const field of ['id', 'customer', 'country', 'amount']) {
                const cell = page.locator(`.neo-grid-cell[data-field="${field}"]`).first();
                await expect(cell).toBeInViewport();
                const bounds = await cell.boundingBox();
                // Check column fit independently of fractional vertical clipping at the virtual row boundary.
                expect(bounds.x).toBeGreaterThanOrEqual(bodyBounds.x - 1);
                expect(bounds.x + bounds.width).toBeLessThanOrEqual(bodyBounds.x + bodyBounds.width + 1)
            }
            if (viewport.width === 390) {
                const buttons = await page.locator('.server-side-page-button').evaluateAll(elements =>
                    elements.map(element => ({top: element.getBoundingClientRect().top,
                        right: element.getBoundingClientRect().right})));
                expect(buttons).toHaveLength(4);
                expect(new Set(buttons.map(button => button.top)).size).toBe(1);
                expect(Math.max(...buttons.map(button => button.right))).toBeLessThanOrEqual(viewport.width)
            }
            await expect(page.locator(`.server-side-heading .${dark ? 'fa-sun' : 'fa-moon'}`)).toBeVisible();
            await testInfo.attach('first-page', {body: await page.screenshot(), contentType: 'image/png'});

            await next.click();
            await expect(page.locator('.server-side-request')).toContainText('Loading…');
            await page.getByRole('heading', {name: 'One page. 100,000 orders.', exact: true}).click();
            await page.mouse.move(0, 0);
            await expect.poll(async () => (await readGrid(app)).loading).toBe(true);
            await expect(page.locator('.neo-loading-message')).toContainText('Fetching page 2');
            await expect(page.locator('.server-side-controls .neo-combobox')).not.toHaveClass(/neo-disabled/);
            await expect(page.locator('.neo-grid-header-toolbar')).not.toHaveClass(/neo-disabled/);
            await expect(page.locator('.server-side-controls')).toHaveCSS('pointer-events', 'none');
            await expect(page.locator('.neo-grid-header-toolbar')).toHaveCSS('pointer-events', 'none');
            await expect(page.locator('.server-side-paging')).toHaveClass(/neo-disabled/);
            await expect(page.locator('.server-side-page-button .neo-button-ripple-wrapper')).toHaveCount(0);
            await testInfo.attach('pending-request', {body: await page.screenshot(), contentType: 'image/png'});
            await expect(page.locator('.server-side-request')).toContainText('50 of 100,000 rows');
            expect(await readGrid(app)).toMatchObject({count: 50, page: 2, request: {number: 2}})
        })
    }
}
