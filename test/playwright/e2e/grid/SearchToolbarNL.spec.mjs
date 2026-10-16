import {test, expect} from '../../fixtures.mjs';

test.use({viewport: {width: 1400, height: 850}});

const rows = [
    {id: 101, state: 'open', title: 'Falcon', summary: 'retry waits', area: 'grid'},
    {id: 102, state: 'closed', title: 'Falcon', summary: 'retry needs', area: 'grid'},
    {id: 103, state: 'open', title: 'falcon retry', summary: 'stale note', area: 'Store'},
    {id: 104, state: 'open', title: 'Worker', summary: 'Falcon retry', area: 'Store'},
    {id: 105, state: 'open', title: 'Queue', summary: 'ordinary work', area: 'grid'}
].map(row => ({type: 'Bug', author: 'fixture', created: '2026-01-01T00:00:00Z', comments: 0, ...row}));

/** @summary Binds the page's own worker and discovers the grid's live toolbar/Store identities. */
async function open(page, neuralLink, bigData=false) {
    await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
    await page.goto(`/examples/grid/${bigData ? 'bigData' : 'issues'}/index.html`);
    const app = await neuralLink.connectToApp(`Neo.examples.grid.${bigData ? 'bigData' : 'issues'}`);
    let grid;
    await expect.poll(async () => {
        [grid] = await app.queryComponent({className: bigData ? 'Neo.examples.grid.bigData.GridContainer' : 'Neo.grid.Container'}, ['id']);
        return Boolean(grid)
    }).toBe(true);
    const props = await app.getComponent(grid.id, ['store.id', 'searchToolbar.id']);
    await expect.poll(async () => (await app.getComponent(props['store.id'], ['count'])).count).toBeGreaterThan(0);
    return {app, gridId: grid.id, storeId: props['store.id'], toolbarId: props['searchToolbar.id']}
}

/** @summary Reads the actual filtered records rather than the virtualized row pool. */
async function ids(state) {
    const items = await state.app.callMethod(state.storeId, 'getRange', [0, 100]);
    return items.map(item => item.id).sort((a, b) => a - b)
}

/** @summary The overlay follows the actual row viewport, including chrome that changes height at runtime. */
async function expectScrollbarBounds(page, gridId) {
    await expect.poll(() => page.locator(`#${gridId}`).evaluate(grid => {
        const view = grid.querySelector('.neo-grid-view').getBoundingClientRect(),
              bar  = grid.querySelector('.neo-grid-vertical-scrollbar').getBoundingClientRect();
        return Math.max(Math.abs(view.top - bar.top), Math.abs(view.bottom - bar.bottom))
    })).toBeLessThanOrEqual(1)
}

test('showcase searches Title and Summary, scopes, and clears only grid-owned predicates', async ({page, neuralLink}, testInfo) => {
    const state   = await open(page, neuralLink), {app, gridId, toolbarId} = state;
    const toolbar = page.locator(`#${toolbarId}`), input = toolbar.locator('input'),
          initialCount = (await app.getComponent(state.storeId, ['count'])).count;
    await input.fill('header menus');
    await expect.poll(async () => (await app.getComponent(state.storeId, ['count'])).count).toBeLessThan(initialCount);
    expect((await app.getComponent(state.storeId, ['count'])).count).toBeGreaterThan(0);
    await expect(toolbar).toContainText('“header menus”');
    await page.screenshot({path: testInfo.outputPath('real-showcase-search.png')});
    await input.fill('');
    await expect.poll(async () => (await app.getComponent(state.storeId, ['count'])).count).toBe(initialCount);
    await app.setProperties(state.storeId, {
        data   : rows,
        filters: [{property: 'state', operator: '===', value: 'open'}]
    });
    await expect(input).toBeVisible();
    await input.fill('Falcon retry');
    await expect.poll(() => ids(state)).toEqual([101, 103, 104]);
    await expect(toolbar).toContainText('Application restriction: State');
    await toolbar.getByRole('button', {name: 'Match case', exact: true}).click();
    await expect.poll(() => ids(state)).toEqual([101, 104]);
    await toolbar.getByRole('button', {name: /search fields/}).click();
    await page.locator('.neo-menu-list').filter({visible: true}).getByText('Title', {exact: true}).click();
    await expect.poll(() => app.callMethod(toolbarId, 'getSearchFields')).toEqual(['title']);
    await expect.poll(() => ids(state)).toEqual([]);
    await toolbar.getByRole('button', {name: 'Match case', exact: true}).click();
    await expect.poll(() => ids(state)).toEqual([103]);
    await app.setProperties(state.storeId, {filters: [
        {property: 'state', operator: '===', value: 'open'},
        {property: 'area', operator: 'typedIncluded', value: ['Store'], ownerRole: 'header-picker'},
        {property: 'title', operator: 'like', value: 'falcon', ownerRole: 'header-inline'}]});
    await app.callMethod(toolbarId, 'writeSearch', [{value: 'Falcon retry', fields: ['title']}]);
    await expect.poll(() => ids(state)).toEqual([103]);
    await toolbar.getByRole('button', {name: 'Clear filters', exact: true}).click();
    await expect.poll(() => ids(state)).toEqual([101, 103, 104, 105]);
    expect((await app.getComponent(state.storeId, ['filters'])).filters).toHaveLength(1);
    await expect(input).toHaveValue('');
    await expect(toolbar).toContainText('Application restriction: State');
    await testInfo.attach('search-showcase.png', {body: await page.screenshot(), contentType: 'image/png'})
});

test('narrow toolbar keeps every summary and reset reachable', async ({page, neuralLink}, testInfo) => {
    const {app, gridId, toolbarId, storeId} = await open(page, neuralLink);
    await app.setProperties(storeId, {
        data   : [{...rows[0], title: 'a long searchable title'}],
        filters: [{property: 'state', value: 'open'}, {property: 'title', value: 'long', ownerRole: 'header-inline'}]
    });
    await app.setProperties(gridId, {width: 320, flex: 'none'});
    const toolbar = page.locator(`#${toolbarId}`);
    await toolbar.locator('input').fill('searchable title');
    await expect(toolbar).toContainText('searchable title');
    await expect(toolbar).toContainText('Application restriction');
    await expect(toolbar.getByRole('button', {name: 'Clear filters', exact: true})).toBeVisible();
    await expectScrollbarBounds(page, gridId);
    const geometry = await toolbar.evaluate(el => ({client: el.clientWidth, scroll: el.scrollWidth,
        children: [...el.querySelectorAll('button')].map(button => ({width: button.getBoundingClientRect().width,
            right: button.getBoundingClientRect().right - el.getBoundingClientRect().left}))}));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
    expect(geometry.children.every(button => button.width > 0 && button.right <= geometry.client + 1)).toBe(true);
    await testInfo.attach('search-narrow.png', {body: await toolbar.screenshot(), contentType: 'image/png'})
});

test('optional toolbar is absent by default and records 100k-row typing response', async ({page, neuralLink}, testInfo) => {
    const state = await open(page, neuralLink, true), {app, gridId, storeId} = state;
    expect(state.toolbarId).toBeFalsy();
    await expect(page.locator('.neo-grid-search-toolbar')).toHaveCount(0);
    await app.setProperties(storeId, {amountRows: 100000});
    await expect.poll(async () => (await app.getComponent(storeId, ['count'])).count).toBe(100000);
    await app.setProperties(gridId, {searchToolbar: {}});
    state.toolbarId = (await app.getComponent(gridId, ['searchToolbar.id']))['searchToolbar.id'];
    const input = page.locator(`#${state.toolbarId} input`), samples = [];
    await expect(input).toBeVisible();
    await expectScrollbarBounds(page, gridId);
    let value = '';
    for (const character of 'Amanda') {
        value += character;
        const start = performance.now();
        await input.press(character);
        const inputMs = performance.now() - start;
        await expect.poll(async () => (await app.callMethod(state.toolbarId, 'getSearchFilter'))?.value).toBe(value);
        await expect.poll(async () => (await app.getComponent(storeId, ['count'])).count).toBeLessThan(100000);
        const workerResponseMs = performance.now() - start;
        await expect.poll(async () => {
            const texts = await page.locator(`#${gridId} .neo-grid-row`).allTextContents();
            return texts.length > 0 && texts.every(text => text.toLowerCase().includes(value.toLowerCase()))
        }).toBe(true);
        samples.push({value, inputMs, workerResponseMs, rowResponseMs: performance.now() - start,
            count: (await app.getComponent(storeId, ['count'])).count})
    }
    expect(samples.at(-1).count).toBeGreaterThan(0);
    await expectScrollbarBounds(page, gridId);
    await input.fill('');
    await expect.poll(async () => (await app.getComponent(storeId, ['count'])).count).toBe(100000);
    await expectScrollbarBounds(page, gridId);
    await app.setProperties(gridId, {searchToolbar: null});
    await expect(page.locator('.neo-grid-search-toolbar')).toHaveCount(0);
    await expectScrollbarBounds(page, gridId);
    await testInfo.attach('search-100k-latency.json', {body: Buffer.from(JSON.stringify({rows: 100000, samples})), contentType: 'application/json'})
});
