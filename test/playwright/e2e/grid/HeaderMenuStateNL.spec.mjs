import {test, expect} from '../../fixtures.mjs';

test.use({viewport: {width: 1600, height: 900}});

const rows = [
    {id: 1, status: 'Open', region: 'North'}, {id: 2, status: 'Open', region: 'South'},
    {id: 3, status: 'Closed', region: 'North'}, {id: 4, status: 'Closed', region: 'South'},
    {id: 5, status: 'Pending', region: 'North'}
];
const columns = () => [
    {dataField: 'status', text: 'Status', width: 180}, {dataField: 'region', text: 'Region', width: 180}
];
const inline      = value => ({property: 'status', ownerRole: 'header-inline', operator: 'like', value});
const application = {property: 'status', operator: '!=', value: 'Pending'};
const region      = {property: 'region', operator: '===', value: 'North'};

/** @summary Creates fully local eager source records, independently of the example's generated population. */
async function createStore(app, data=rows, filters=[]) {
    return app.createInstance({className: 'Neo.data.Store', config: {
        keyProperty: 'id', model: {fields: [{name: 'id', type: 'Int'}, {name: 'status'}, {name: 'region'}]},
        data, filters
    }})
}

/** @summary Binds all RPCs to this exact page before replacing its grid's source or creating another host. */
async function setup(page, neuralLink, filters=[]) {
    await page.goto('/examples/grid/bigData/index.html');
    await expect(page.locator('.neo-grid-body [role="row"]').first()).toBeVisible();
    let workerId;
    await expect.poll(async () => {
        workerId = await page.evaluate(async () => {
            const reply = await window.Neo?.worker?.App?.getWorkerId?.();
            return typeof reply === 'string' ? reply : reply?.data
        });
        return typeof workerId === 'string' && workerId.length > 0
    }).toBe(true);
    const app = await neuralLink.connectToApp(workerId);
    expect(app.sessionId).toBe(workerId);
    // JSON RPC cannot carry an existing Neo instance. Resolve only the test's explicit Store handle,
    // then run the unchanged production setter with the same object an application would supply.
    await app.inspectClass('Neo.grid.Container');
    expect(await app.getMethodSource('Neo.grid.Container', 'beforeSetStore')).toBeTruthy();
    await app.manageNeoConfig('set', {enableHotPatching: true});
    expect((await app.patchCode('Neo.grid.Container', 'beforeSetStore', `(() => {
        const original = Neo.grid.Container.prototype.beforeSetStore;
        return function(value, oldValue) {
            return original.call(this, typeof value === 'string' && value.startsWith('neo-store-') ? Neo.get(value) : value, oldValue)
        }
    })()`)).success).toBe(true);
    const [grid] = await app.queryComponent({className: 'Neo.examples.grid.bigData.GridContainer'}, ['parentId']);
    const source = await createStore(app, rows, filters);
    await app.setProperties(grid.id, {store: source.id, columns: columns(), columnMenu: true, width: 480, flex: 'none'});
    return {app, gridId: grid.id, parentId: grid.properties.parentId, storeId: source.id}
}

/** @summary Finds the real physical header and its current menu after any header recreation. */
async function menuFor(state, gridId=state.gridId, field='status') {
    const toolbar = (await state.app.getComponent(gridId, ['headerToolbar.id']))['headerToolbar.id'];
    let header, plugin;
    await expect.poll(async () => {
        const headers = await state.app.queryComponent({className: 'Neo.grid.header.Button'}, ['dataField', 'parentId']);
        header = headers.find(item => item.properties.dataField === field && item.properties.parentId === toolbar);
        if (!header) return false;
        const plugins = await state.app.findInstances({className: 'Neo.grid.header.plugin.Menu'}, ['owner.id', 'trigger.id']);
        plugin = plugins.find(item => item.properties['owner.id'] === header.id);
        return Boolean(plugin?.properties['trigger.id'])
    }).toBe(true);
    return {...state, gridId, headerId: header.id, pluginId: plugin.id, triggerId: plugin.properties['trigger.id']}
}

/** @summary Opens through the production plugin and waits for its worker-owned island to reach the DOM. */
async function open(page, state, native=false) {
    if (native) await page.locator(`#${state.triggerId}`).click();
    else await state.app.callMethod(state.pluginId, 'open');
    await expect.poll(async () => (await state.app.getComponent(state.pluginId, ['surface.id']))['surface.id']).toBeTruthy();
    const props = await state.app.getComponent(state.pluginId, ['surface.id', 'valuePicker.id', 'optionsStore.id']);
    Object.assign(state, {surfaceId: props['surface.id'], pickerId: props['valuePicker.id'], optionsId: props['optionsStore.id']});
    await expect.poll(() => state.app.getComponent(state.surfaceId, ['hidden', 'mounted']))
        .toMatchObject({hidden: false, mounted: true});
    await expect(page.locator(`#${state.surfaceId}`)).toBeVisible();
    return page.locator(`#${state.surfaceId}`)
}

/** @summary Reads source contributions rather than treating checked pixels as predicate authority. */
async function filters(state, storeId=state.storeId) {
    return (await state.app.getComponent(storeId, ['filters'])).filters
}

/** @summary Returns the canonical typed picker value set from the exact owner tuple. */
async function selected(state, field='status') {
    const filter = await state.app.callMethod(state.storeId, 'getFilter', [field, 'header-picker']);
    return filter?.value ?? []
}

/** @summary Projects an exact current option key through the same handler used by native checkbox requests. */
async function select(state, values) {
    const selection = [];
    for (const value of values) selection.push(await state.app.callMethod(state.pluginId, 'getOptionKey', [value]));
    await state.app.callMethod(state.pluginId, 'onSelectionChange', [{selection}])
}

/** @summary Instruments an existing production method without re-evaluating its lexical dependencies. */
async function watchRecounts(app) {
    await app.inspectClass('Neo.grid.header.plugin.Menu');
    const original = await app.getMethodSource('Neo.grid.header.plugin.Menu', 'refreshOptions');
    expect(original.source || original).toBeTruthy();
    await app.manageNeoConfig('set', {enableHotPatching: true});
    const patched = await app.patchCode('Neo.grid.header.plugin.Menu', 'refreshOptions', `(() => {
        const original = Neo.grid.header.plugin.Menu.prototype.refreshOptions;
        return function(...args) {this.__recountWitness = (this.__recountWitness || 0) + 1; return original.apply(this, args)}
    })()`);
    expect(patched.success).toBe(true)
}

/** @summary Counts actual picker write-handler entries so equivalent projected values cannot hide echo writes. */
async function watchSelectionRequests(app) {
    expect(await app.getMethodSource('Neo.grid.header.plugin.Menu', 'onSelectionChange')).toBeTruthy();
    expect((await app.patchCode('Neo.grid.header.plugin.Menu', 'onSelectionChange', `(() => {
        const original = Neo.grid.header.plugin.Menu.prototype.onSelectionChange;
        return function(...args) {this.__selectionRequests = (this.__selectionRequests || 0) + 1; return original.apply(this, args)}
    })()`)).success).toBe(true)
}

/** @summary Reads the input witness without changing the source predicate. */
async function requestCount(state) {
    return (await state.app.getComponent(state.pluginId, ['__selectionRequests'])).__selectionRequests || 0
}

test.describe('Grid header value-menu shared state and lifetime', () => {
    test('native selection, final uncheck and Clear preserve same-field inline/application predicates in both orders',
        async ({page, neuralLink}) => {
            const state  = await menuFor(await setup(page, neuralLink, [application, region, inline(null)]));
            const before = await filters(state), surface = await open(page, state, true);
            await expect(surface.getByRole('option', {name: 'Open, 1 matches', exact: true})).toBeVisible();
            await expect(surface.getByRole('option', {name: 'Closed, 1 matches', exact: true})).toBeVisible();
            expect(await filters(state)).toEqual(before);
            await surface.getByRole('option', {name: 'Open, 1 matches', exact: true}).click();
            await expect.poll(() => selected(state)).toEqual(['Open']);
            await expect.poll(async () => (await state.app.getComponent(state.storeId, ['count'])).count).toBe(1);
            expect((await filters(state)).filter(item => item.ownerRole !== 'header-picker')).toEqual(before);
            await surface.getByRole('option', {name: 'Open, 1 matches', exact: true}).click();
            await expect.poll(() => selected(state)).toEqual([]);
            expect(await filters(state)).toEqual(before);
            await surface.getByRole('option', {name: 'Closed, 1 matches', exact: true}).click();
            await expect.poll(() => selected(state)).toEqual(['Closed']);
            await surface.getByRole('button', {name: 'Clear', exact: true}).click();
            await expect.poll(() => filters(state)).toEqual(before);

            // Exercise both creation orders against the production inline writer and picker writer.
            for (const pickerFirst of [true, false]) {
                await state.app.setProperties(state.storeId, {filters: [application, region]});
                if (pickerFirst) await select(state, ['Open']);
                await state.app.callMethod(state.headerId, 'changeFilterValue', [{value: 'Closed'}]);
                if (!pickerFirst) await select(state, ['Closed']);
                const intended = pickerFirst ? ['Open'] : ['Closed'];
                expect(await selected(state)).toEqual(intended);
                expect((await filters(state)).filter(item => item.ownerRole === 'header-inline')).toHaveLength(1);
                await select(state, []);
                expect((await filters(state)).filter(item => item.ownerRole === 'header-picker')).toEqual([]);
                expect((await filters(state)).find(item => item.ownerRole === 'header-inline').value).toBe('Closed');
                expect((await filters(state)).find(item => item.ownerRole == null)).toMatchObject(application)
            }
        });

    test('a checked picker keeps its column marked and its trigger shown after the inline field is cleared (#19793)',
        async ({page, neuralLink}) => {
            const state = await menuFor(await setup(page, neuralLink));
            await state.app.setProperties(state.gridId, {showHeaderFilters: true});
            const header = page.locator(`#${state.headerId}`), trigger = page.locator(`#${state.triggerId}`),
                opacity  = () => trigger.evaluate(node => getComputedStyle(node).opacity);
            // The 480 px grid sits top left: the far corner is away from every header, so :hover cannot show the trigger
            await page.mouse.move(1590, 890);
            expect(await trigger.evaluate(node => node.parentElement.matches(':hover, :focus-within'))).toBe(false);
            await expect(header).not.toHaveClass(/neo-grid-column-filtered/);
            await expect(trigger).toHaveAttribute('aria-label', 'Filter Status');
            await expect.poll(opacity).toBe('0');

            // The ticket's drive: a value checked in the picker, which then closes, and an inline term typed and cleared again
            await open(page, state);
            await select(state, ['Open']);
            await state.app.callMethod(state.pluginId, 'close');
            await state.app.callMethod(state.headerId, 'changeFilterValue', [{value: 'Op'}]);
            await state.app.callMethod(state.headerId, 'changeFilterValue', [{value: ''}]);
            expect(await selected(state)).toEqual(['Open']);
            // Closing returns focus to the header; only the filtered state may keep the trigger shown
            await page.evaluate(() => document.activeElement?.blur());
            expect(await trigger.evaluate(node => node.parentElement.matches(':hover, :focus-within'))).toBe(false);
            await expect(header).toHaveClass(/neo-grid-column-filtered/);
            await expect(trigger).toHaveAttribute('aria-label', 'Filter Status, active');
            await expect(trigger).toHaveText('▾');
            await expect.poll(opacity).toBe('1');

            // Unchecking leaves only the cleared inline filter, which no longer narrows the rows
            await select(state, []);
            await expect(header).not.toHaveClass(/neo-grid-column-filtered/);
            await expect(trigger).toHaveAttribute('aria-label', 'Filter Status');
            await expect(trigger).toHaveText('▿');
            await expect.poll(opacity).toBe('0');

            // An application predicate on the same field is not the column's own state
            await state.app.setProperties(state.storeId, {filters: [application]});
            await expect.poll(async () => (await state.app.getComponent(state.storeId, ['count'])).count).toBe(4);
            await expect(header).not.toHaveClass(/neo-grid-column-filtered/)
        });

    test('two real grids share checks and contextual counts; append and record edits update both open islands',
        async ({page, neuralLink}) => {
            const state  = await setup(page, neuralLink, [application, region]);
            const second = await state.app.createInstance({className: 'Neo.grid.Container', parentId: state.parentId,
                config: {store: state.storeId, columns: columns(), columnMenu: true, width: 480, flex: 'none'}});
            const a = await menuFor(state), b = await menuFor(state, second.id);
            await open(page, a);
            await state.app.setProperties(state.storeId, {filters: [application, region, {
                property: 'status', ownerRole: 'header-picker', operator: 'typedIncluded', reapplyOnRecordChange: true,
                value   : ['Open', 'Missing']
            }]});
            const left = await open(page, a), right = await open(page, b);
            for (const surface of [left, right]) {
                await expect(surface.getByRole('option', {name: 'Open, 1 matches', exact: true})).toHaveAttribute('aria-selected', 'true');
                await expect(surface.getByRole('option', {name: 'Missing, 0 matches', exact: true})).toHaveAttribute('aria-selected', 'true');
                await expect(surface.getByRole('option', {name: 'Closed, 1 matches', exact: true})).toHaveAttribute('aria-selected', 'false')
            }
            const before = await filters(a);
            await state.app.callMethod(state.storeId, 'add', [{id: 6, status: 'Open', region: 'North'}]);
            for (const surface of [left, right]) {
                await expect(surface.getByRole('option', {name: 'Open, 2 matches', exact: true})).toHaveAttribute('aria-selected', 'true')
            }
            await state.app.callMethod(state.gridId, 'bulkUpdateRecords', [[{id: 1, status: 'Closed'}]]);
            for (const surface of [left, right]) {
                await expect(surface.getByRole('option', {name: 'Open, 1 matches', exact: true})).toHaveAttribute('aria-selected', 'true');
                await expect(surface.getByRole('option', {name: 'Closed, 2 matches', exact: true})).toBeVisible()
            }
            expect(await filters(a)).toEqual(before);
            await select(b, []);
            for (const surface of [left, right]) {
                await expect(surface.getByRole('option', {name: 'Open, 1 matches', exact: true})).toHaveAttribute('aria-selected', 'false');
                await expect(surface.getByRole('option', {name: /^Missing, /})).toHaveCount(0)
            }
        });

    test('recreation, field/source rebinding and external replacement have zero projection writes; retired observers stay detached',
        async ({page, neuralLink}, testInfo) => {
            const base = await setup(page, neuralLink), state = await menuFor(base);
            await open(page, state);
            await watchSelectionRequests(state.app);
            await select(state, ['Open']);
            expect(await requestCount(state)).toBe(1);
            const sourceIntent = await filters(state), staleKey = await state.app.callMethod(state.pluginId, 'getOptionKey', ['Open']);
            const retired      = {header: state.headerId, plugin: state.pluginId, surface: state.surfaceId, options: state.optionsId};
            const toolbarId    = (await state.app.getComponent(state.gridId, ['headerToolbar.id']))['headerToolbar.id'];
            await state.app.callMethod(toolbarId, 'removeAt', [0]);
            await expect.poll(async () => (await state.app.findInstances({id: retired.header}, ['id'])).length).toBe(0);
            await state.app.callMethod(toolbarId, 'insert', [0, {ntype: 'grid-header-button',
                dataField: 'status', text: 'Status', width: 180, columnMenu: true}]);
            const recreated = await menuFor(base);
            expect(recreated.headerId).not.toBe(retired.header);
            await open(page, recreated);
            await expect(page.locator(`#${retired.surface}`)).toHaveCount(0);
            const instances = await state.app.findInstances({}, ['id']);
            for (const id of Object.values(retired)) expect(instances.some(item => item.id === id)).toBe(false);
            expect(await filters(state)).toEqual(sourceIntent);
            expect(await selected(recreated)).toEqual(['Open']);
            expect(await requestCount(recreated)).toBe(0);
            await testInfo.attach('recreated-surface', {body: Buffer.from(JSON.stringify({
                header: await state.app.getComponent(recreated.headerId, ['mounted', 'parentId', 'windowId']),
                menu  : await state.app.getComponent(recreated.pluginId, ['surface.hidden', 'surface.mounted',
                    'valuePicker.hidden', 'valuePicker.selection', 'optionsStore.count']),
                dom: await page.evaluate(id => document.getElementById(id)?.outerHTML || null, recreated.surfaceId)
            })), contentType: 'application/json'});
            await expect(page.locator(`#${recreated.surfaceId}`).getByRole('option', {name: 'Open, 2 matches', exact: true}))
                .toHaveAttribute('aria-selected', 'true');

            const next = await createStore(state.app, [{id: 20, status: 'Open', region: 'Open'}], [
                {property: 'region', ownerRole: 'header-picker', operator: 'typedIncluded', value: ['Open']}
            ]);
            await state.app.callMethod(recreated.pluginId, 'close');
            await expect(page.locator(`#${recreated.surfaceId}`)).toHaveCount(0);
            await state.app.setProperties(recreated.gridId, {store: next.id});
            recreated.storeId = next.id;
            await state.app.setProperties(recreated.headerId, {dataField: 'region'});
            const currentIntent = await filters(recreated);
            expect(await requestCount(recreated)).toBe(0);
            await state.app.callMethod(recreated.pluginId, 'onSelectionChange', [{selection: [staleKey]}]);
            await state.app.callMethod(recreated.pluginId, 'onSelectionChange', [{selection: [], removed: [staleKey]}]);
            await state.app.callMethod(recreated.pluginId, 'onClearClick', [{path: [
                {id: (await state.app.callMethod(recreated.surfaceId, 'getItem', ['clear'])).id,
                    data: {pickerScope: `${JSON.stringify([state.storeId, 'status'])}:`}}
            ]}]);
            expect(await filters(recreated)).toEqual(currentIntent);
            expect(await requestCount(recreated)).toBe(2);
            expect(await filters(state)).toEqual(sourceIntent);

            await open(page, recreated);
            await expect(page.locator(`#${recreated.surfaceId}`).getByRole('option', {name: 'Open, 1 matches', exact: true}))
                .toHaveAttribute('aria-selected', 'true');

            await watchRecounts(state.app);
            await state.app.callMethod(recreated.pluginId, 'refreshOptions');
            const countBefore = (await state.app.getComponent(recreated.pluginId, ['__recountWitness'])).__recountWitness;
            await state.app.setProperties(state.storeId, {filters: []});
            await state.app.callMethod(state.storeId, 'add', [{id: 21, status: 'New', region: 'Elsewhere'}]);
            // A read in the active worker drains the queued old-source microtask, if one survived rebinding.
            await state.app.getComponent(state.storeId, ['count']);
            expect((await state.app.getComponent(recreated.pluginId, ['__recountWitness'])).__recountWitness).toBe(countBefore);

            const replacement = [{property: 'region', ownerRole: 'application', operator: 'typedIncluded', value: ['Open']}];
            await state.app.setProperties(next.id, {filters: replacement});
            await expect(page.locator(`#${recreated.surfaceId}`).getByRole('option', {name: 'Open, 1 matches', exact: true}))
                .toHaveAttribute('aria-selected', 'false');
            expect(await filters(recreated)).toEqual(replacement.map(item => expect.objectContaining(item)));
            await state.app.setProperties(next.id, {filters: [{property: 'region', ownerRole: 'header-picker',
                operator: 'typedIncluded', reapplyOnRecordChange: true, value: ['Open']}]});
            await expect(page.locator(`#${recreated.surfaceId}`).getByRole('option', {name: 'Open, 1 matches', exact: true}))
                .toHaveAttribute('aria-selected', 'true');
            const finalIntent = await filters(recreated), owned = {surface: recreated.surfaceId, options: recreated.optionsId,
                picker: recreated.pickerId, trigger: recreated.triggerId, plugin: recreated.pluginId};
            await state.app.setProperties(recreated.headerId, {columnMenu: false});
            await expect(page.locator(`#${owned.surface}`)).toHaveCount(0);
            await expect(page.locator(`#${owned.trigger}`)).toHaveCount(0);
            const remaining = await state.app.findInstances({}, ['id']);
            for (const id of Object.values(owned)) expect(remaining.some(item => item.id === id)).toBe(false);
            expect(await filters(recreated)).toEqual(finalIntent);
            await testInfo.attach('source-intent-and-owned-lifetimes', {body: Buffer.from(JSON.stringify({
                retired, owned, sourceIntent, currentIntent, finalIntent, countBefore
            })), contentType: 'application/json'})
        });
});
