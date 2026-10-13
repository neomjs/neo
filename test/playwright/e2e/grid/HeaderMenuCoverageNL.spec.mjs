import {performance}  from 'node:perf_hooks';
import {test, expect} from '../../fixtures.mjs';

test.use({viewport: {width: 1600, height: 900}});

const gridClass = 'Neo.examples.grid.bigData.GridContainer';

/** @summary Requires an exact page-worker identity before any Neural Link read or write. */
async function openApp(page, neuralLink) {
    await page.goto('/examples/grid/bigData/index.html');
    await expect(page.locator('.neo-grid-body [role="row"]').first()).toBeVisible();
    let workerId;
    await expect.poll(async () => {
        workerId = await page.evaluate(async () => {
            const remote = window.Neo?.worker?.App?.getWorkerId;
            if (!remote) return null;
            const reply = await remote();
            return typeof reply === 'string' ? reply : reply?.data
        });
        return typeof workerId === 'string' && workerId.length > 0
    }).toBe(true);
    const app = await neuralLink.connectToApp(workerId);
    expect(app.sessionId).toBe(workerId);
    const grids = await app.queryComponent({className: gridClass}, ['id', 'store.id', 'body.id', 'view.id', 'headerToolbar.id']);
    expect(grids).toHaveLength(1);
    const grid = grids[0];
    return {app, gridId: grid.id, storeId: grid.properties['store.id'], bodyId: grid.properties['body.id'],
        viewId: grid.properties['view.id'], toolbarId: grid.properties['headerToolbar.id']}
}

/** @summary Binds a header plugin by its discovered owner, rather than generated instance order. */
async function discoverMenu(page, state, dataField) {
    const headers = await state.app.queryComponent({className: 'Neo.grid.header.Button'}, ['id', 'dataField']);
    const current = await state.app.callMethod(state.gridId, 'getButton', [dataField]);
    const header  = headers.find(item => item.id === current?.id && item.properties.dataField === dataField);
    expect(header).toBeTruthy();
    await expect.poll(async () => {
        const plugins = await state.app.findInstances({className: 'Neo.grid.header.plugin.Menu'}, ['id', 'owner.id']);
        return plugins.some(plugin => plugin.properties['owner.id'] === header.id)
    }).toBe(true);
    const plugins = await state.app.findInstances({className: 'Neo.grid.header.plugin.Menu'}, ['id', 'owner.id', 'trigger.id']);
    const plugin  = plugins.find(item => item.properties['owner.id'] === header.id);
    const menu    = {headerId: header.id, pluginId: plugin.id, triggerId: plugin.properties['trigger.id']};
    await expect(page.locator(`#${menu.triggerId}`)).toBeAttached();
    return menu
}

/** @summary Opens through trusted input and waits for the same worker-owned surface and DOM. */
async function openMenu(page, state, menu) {
    const started = performance.now();
    await page.locator(`#${menu.triggerId}`).click();
    await expect.poll(async () => (await state.app.getComponent(menu.pluginId, ['surface.id']))['surface.id']).toBeTruthy();
    const props = await state.app.getComponent(menu.pluginId, ['surface.id', 'valuePicker.id', 'optionsStore.id']);
    Object.assign(menu, {surfaceId: props['surface.id'], pickerId: props['valuePicker.id'], optionsStoreId: props['optionsStore.id']});
    await expect.poll(() => state.app.getComponent(menu.surfaceId, ['hidden', 'mounted'])).toMatchObject({hidden: false, mounted: true});
    await expect(page.locator(`#${menu.surfaceId} input`)).toBeFocused();
    return performance.now() - started
}

/** @summary Requires complete withdrawal before another input path begins. */
async function closeMenu(page, state, menu) {
    await page.keyboard.press('Escape');
    await expect.poll(() => state.app.getComponent(menu.surfaceId, ['hidden', 'mounted'])).toMatchObject({hidden: true, mounted: false});
    await expect(page.locator(`#${menu.surfaceId}`)).toHaveCount(0)
}

test('Date menu labels follow the locale and native selection retains the typed value', async ({page, neuralLink}, testInfo) => {
    const state = await openApp(page, neuralLink);
    await state.app.manageNeoConfig('set', {locale: 'en-US'});
    await state.app.setProperties(state.gridId, {
        columns   : [{dataField: 'created', text: 'Created', width: 340, columnMenu: true}],
        columnMenu: true,
        store     : {ntype: 'store', model: {fields: [{name: 'id', type: 'Int'}, {name: 'created', type: 'Date'}]},
            data: [{id: 1, created: '2026-01-15T00:00:00'}, {id: 2, created: '2026-01-15T13:14:15'},
                {id: 3, created: '2026-01-15T00:00:00'}]}
    });
    state.storeId = (await state.app.getComponent(state.gridId, ['store.id']))['store.id'];
    const menu = await discoverMenu(page, state, 'created');
    await openMenu(page, state, menu);
    const surface = page.locator(`#${menu.surfaceId}`), options = surface.getByRole('option');
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toContainText('Jan 15, 2026');
    await expect(options.nth(0)).not.toContainText('AM');
    await expect(options.nth(1)).toContainText('Jan 15, 2026, 1:14:15 PM');
    const before = await state.app.inspectStore(menu.optionsStoreId, 3);
    expect(before.items.map(item => [item.label, item.count])).toEqual([
        ['Jan 15, 2026', 2], ['Jan 15, 2026, 1:14:15 PM', 1]
    ]);
    expect(before.items.every(item => item.key.includes(':date:'))).toBe(true);
    await testInfo.attach('date-menu-en-US', {body: await surface.screenshot(), contentType: 'image/png'});
    await state.app.manageNeoConfig('set', {locale: 'de-DE'});
    await state.app.callMethod(menu.pluginId, 'refreshOptions');
    await expect(options.nth(0)).toContainText('15.01.2026');
    await expect(options.nth(1)).toContainText('15.01.2026, 13:14:15');
    const localized = await state.app.inspectStore(menu.optionsStoreId, 3);
    expect(localized.items.map(item => [item.key, item.value, item.count])).toEqual(
        before.items.map(item => [item.key, item.value, item.count]));
    await options.nth(1).click();
    await expect.poll(async () => (await state.app.inspectStore(state.storeId, 3)).items.map(item => item.id)).toEqual([2]);
    const filter = await state.app.callMethod(state.storeId, 'getFilter', ['created', 'header-picker']);
    expect(filter.operator).toBe('typedIncluded');
    expect(filter.value).toEqual([before.items[1].value]);
    await testInfo.attach('date-menu-typed-selection', {body: Buffer.from(JSON.stringify({before, localized, filter})),
        contentType: 'application/json'});
    await closeMenu(page, state, menu)
});

const refusals = [
    {code: 'remote-projection', message: 'Values cannot be counted for a remote projection.', store: {remoteFilter: true}},
    {code: 'incomplete-population', message: 'Wait for the complete data before filtering values.', store: {isLoading: true}},
    {code: 'raw-complex-fields', message: 'Value counts need canonical records for complex fields.',
        field: {name: 'category', mapping: 'raw'}, row: id => ({id, raw: 'a'})},
    {code: 'noncanonical-field', message: 'These values have not been normalized for counting.',
        field: {name: 'category', type: 'Int'}, row: id => ({id, category: '2'})},
    {code: 'unsupported-value', message: 'This column contains values the picker cannot compare.',
        field: {name: 'category'}, row: id => ({id, category: {label: 'object'}})},
    {code: 'tree-population', message: 'Value filtering is available for flat data.', dataField: 'id',
        store: {ntype: 'tree-store', model: undefined}, row: id => ({id, isLeaf: true})},
    {code: 'unknown-field', message: 'This column does not name a known data field.', dataField: 'missing'}
];

test.describe('Grid header menu real unsupported populations', () => {
    for (const refusal of refusals) {
        test(`renders ${refusal.code} without a source contribution`, async ({page, neuralLink}, testInfo) => {
            const state = await openApp(page, neuralLink), dataField = refusal.dataField || 'category';
            if (refusal.code === 'tree-population') {
                const loaded = await state.app.callMethod(state.app.sessionId, 'loadModule', [{path: '/src/data/TreeStore.mjs'}]);
                expect(loaded.success).toBe(true)
            }
            const store = {ntype: 'store', autoInitRecords: false,
                model: {fields: [{name: 'id', type: 'Int'}, refusal.field || {name: 'category', type: 'String'}]},
                data : Array.from({length: 200}, (_, index) => (refusal.row || (id => ({id, category: 'a'})))(index + 1)),
                ...refusal.store};
            if (store.model === undefined) delete store.model;
            await state.app.setProperties(state.gridId, {columns: [{dataField, text: dataField, width: 180, columnMenu: true}], store, columnMenu: true});
            state.storeId = (await state.app.getComponent(state.gridId, ['store.id']))['store.id'];
            if (refusal.code === 'incomplete-population') await state.app.setProperties(state.storeId, {isLoading: true});
            const menu = await discoverMenu(page, state, dataField);
            expect(await state.app.callMethod(state.storeId, 'getFilterValues', [dataField])).toEqual({refused: true, reason: refusal.code});
            const before = (await state.app.getComponent(state.storeId, ['filters'])).filters;
            expect(before).toEqual([]);
            await openMenu(page, state, menu);
            const surface = page.locator(`#${menu.surfaceId}`);
            await expect(surface.getByRole('status')).toHaveText(refusal.message);
            await expect(surface.getByRole('option')).toHaveCount(0);
            await expect(surface.getByRole('button', {name: 'Clear', exact: true})).toHaveCount(0);
            expect(await state.app.getComponent(menu.pickerId, ['hidden', 'selection'])).toMatchObject({hidden: true, selection: []});
            await surface.locator('input').fill('a');
            await closeMenu(page, state, menu);
            await openMenu(page, state, menu);
            await expect(surface.getByRole('status')).toHaveText(refusal.message);
            const after = (await state.app.getComponent(state.storeId, ['filters'])).filters;
            expect(after).toEqual(before);
            await testInfo.attach(`refusal-${refusal.code}`, {body: Buffer.from(JSON.stringify({code: refusal.code,
                sourceStoreId: state.storeId, message: refusal.message, filtersBefore: before, filtersAfter: after})), contentType: 'application/json'})
        })
    }
});

/**
 * @summary Test-page-only observation over real Stores: direct raw samples, an independent surname cohort pass,
 * and timing wrappers that call the original production methods without changing inputs or results.
 */
async function installCoverageProbe(state) {
    const {app}         = state;
    const countSource   = await app.getMethodSource('Neo.data.Store', 'getFilterValues');
    const refreshSource = await app.getMethodSource('Neo.grid.header.plugin.Menu', 'refreshOptions');
    expect(countSource.success).toBe(true);
    expect(countSource.source).toContain('getFilteredItems');
    expect(refreshSource.success).toBe(true);
    expect(refreshSource.source).toContain('getFilterValues');
    await app.manageNeoConfig('set', {enableHotPatching: true});
    const source = `function({action, pluginId, field='firstname', lastname=null}) {
        const store = this.store, population = store.allItems?._items || store._items;
        this.__headerCoverage ||= {times: []};
        const coverage = this.__headerCoverage;
        if (action === 'observe') {
            const plugin = Neo.get(pluginId), refresh = plugin.refreshOptions;
            if (!coverage.countObserved) {
                const count = store.getFilterValues;
                store.getFilterValues = function(...args) {
                    const start = performance.now(), result = count.apply(this, args);
                    coverage.times.push({method: 'getFilterValues', field: args[0], ms: performance.now() - start});
                    return result
                };
                coverage.countObserved = true
            }
            plugin.refreshOptions = function(...args) {
                const start = performance.now(), result = refresh.apply(this, args);
                coverage.times.push({method: 'refreshOptions', field: this.owner.dataField, ms: performance.now() - start});
                return result
            };
            return {observing: true}
        }
        const rawSamples = [50000, 75000, 99999].map(index => {
            const item = population[index], keys = Object.keys(item).sort();
            return {id: item.id, raw: !item.isRecord, keys, values: Object.fromEntries(keys.map(key => [key, item[key]]))}
        });
        if (action === 'snapshot') return {rawSamples, count: population.length, autoInitRecords: store.autoInitRecords};
        const reference = new Map();
        for (const item of population) {
            if (lastname !== null && item.lastname !== lastname) continue;
            reference.set(item[field], (reference.get(item[field]) || 0) + 1)
        }
        const plugin = Neo.get(pluginId), options = plugin.optionsStore,
            records = options?.allItems?._items || options?._items || [],
            optionCounts = records.map(item => [item.value, item.count]);
        const total = values => values.reduce((sum, [, count]) => sum + count, 0);
        return {rawSamples, population: population.length, visibleSource: store.count,
            reference: field === 'id' ? null : [...reference].sort(([a], [b]) => String(a).localeCompare(String(b))),
            optionCounts: field === 'id' ? null : optionCounts.sort(([a], [b]) => String(a).localeCompare(String(b))),
            referenceTotal: total([...reference]), optionTotal: total(optionCounts),
            referenceDistinct: reference.size, optionDistinct: records.length,
            idCountsAreOne: field === 'id' && optionCounts.every(([value, count]) => Number.isInteger(value) && count === 1),
            rawOptionSamples: field === 'id' ? [2000, 50000, 90000].map(index => {
                const item = records[index];
                return {key: item.key, value: item.value, raw: !item.isRecord, keys: Object.keys(item).sort()}
            }) : null,
            admittedOptions: options?.count, timings: coverage.times.slice(-40)}
    }`;
    expect(await app.patchCode(gridClass, 'headerCoverageProbe', source)).toMatchObject({success: true})
}

/** @summary Reads only the bounded observer result; the reference never calls Store.get/getAt or getFilterValues. */
function probe(state, args) {
    return state.app.callMethod(state.gridId, 'headerCoverageProbe', [args])
}

/** @summary Records browser input-to-option-paint latency from the real input event and a DOM mutation. */
async function search(page, state, menu, value) {
    await page.evaluate(({surfaceId, pickerId}) => {
        const input = document.querySelector(`#${surfaceId} input`), picker = document.getElementById(pickerId);
        window.__headerCoverageInput = null;
        input.addEventListener('input', event => {
            const started = performance.now();
            window.__headerCoverageInput = {value: input.value, trusted: event.isTrusted, started};
            const observer = new MutationObserver(() => {
                window.__headerCoverageInput.optionPaintMs = performance.now() - started;
                observer.disconnect()
            });
            observer.observe(picker, {subtree: true, childList: true, characterData: true, attributes: true})
        }, {once: true})
    }, {surfaceId: menu.surfaceId, pickerId: menu.pickerId});
    const started = performance.now();
    await page.locator(`#${menu.surfaceId} input`).fill(value);
    await expect.poll(async () => (await state.app.getComponent(menu.pickerId, ['searchValue'])).searchValue).toBe(value);
    await expect.poll(() => page.evaluate(() => window.__headerCoverageInput?.optionPaintMs)).toBeGreaterThanOrEqual(0);
    return {...await page.evaluate(() => window.__headerCoverageInput), workerAndDomSettleMs: performance.now() - started}
}

test('normal Turbo 100k firstname counts, raw invariance and real scroll/resize latency with a capped id picker', async ({page, neuralLink}, testInfo) => {
    test.setTimeout(90000);
    const state = await openApp(page, neuralLink), receipt = {measurements: {}, sessionId: state.app.sessionId,
        timingScope: 'one isolated App Worker; end-to-end input settlement includes RPC/poll overhead; worker timings are transparent production-method wrappers'};
    await state.app.setProperties(state.storeId, {amountRows: 100000});
    await expect.poll(async () => (await state.app.getComponent(state.storeId, ['count'])).count).toBe(100000);
    await state.app.setProperties(state.gridId, {columnMenu: true});
    const firstname = await discoverMenu(page, state, 'firstname');
    await installCoverageProbe(state);
    const before = await probe(state, {action: 'snapshot'});
    expect(before.autoInitRecords).toBe(false);
    expect(before.rawSamples.every(item => item.raw)).toBe(true);
    await probe(state, {action: 'observe', pluginId: firstname.pluginId});
    receipt.measurements.firstnameOpenMs = await openMenu(page, state, firstname);
    let counted = await probe(state, {action: 'read', pluginId: firstname.pluginId});
    expect(counted.referenceTotal).toBe(100000);
    expect(counted.optionCounts).toEqual(counted.reference);
    expect(counted.rawSamples).toEqual(before.rawSamples);
    receipt.firstnameBuckets = counted.optionDistinct;
    receipt.measurements.searchBeforeScroll = await search(page, state, firstname, 'Michael');
    await expect(page.locator(`#${firstname.surfaceId}`).getByRole('option', {name: /^Michael, /})).toBeVisible();
    const previousRows = await page.locator(`#${state.bodyId} [role="row"]`).first().getAttribute('data-record-id');
    const bodyBox      = await page.locator(`#${state.bodyId}`).boundingBox(), wheelStart = performance.now();
    await page.mouse.move(bodyBox.x + 800, bodyBox.y + 300);
    await page.mouse.wheel(0, 600);
    await expect.poll(async () => (await state.app.getComponent(state.bodyId, ['startIndex'])).startIndex).toBeGreaterThan(0);
    await expect(page.locator(`#${state.bodyId} [role="row"]`).first()).not.toHaveAttribute('data-record-id', previousRows);
    receipt.measurements.visibleRowsAfterWheelMs = performance.now() - wheelStart;
    await expect(page.locator(`#${firstname.surfaceId}`)).toBeVisible();
    const recountStart = performance.now();
    await state.app.setProperties(state.storeId, {filters: [{property: 'lastname', value: 'Brown', ownerRole: 'coverage-app'}]});
    await expect.poll(async () => {
        const snapshot = await probe(state, {action: 'read', pluginId: firstname.pluginId, lastname: 'Brown'});
        return JSON.stringify(snapshot.optionCounts) === JSON.stringify(snapshot.reference)
    }).toBe(true);
    receipt.measurements.recountAndOptionsSettleMs = performance.now() - recountStart;
    counted = await probe(state, {action: 'read', pluginId: firstname.pluginId, lastname: 'Brown'});
    expect(counted.optionTotal).toBe(counted.referenceTotal);
    expect(counted.referenceTotal).toBeGreaterThan(0);
    expect(counted.referenceTotal).toBeLessThan(100000);
    expect(counted.rawSamples).toEqual(before.rawSamples);
    receipt.contextualPopulation = counted.referenceTotal;
    receipt.measurements.searchAfterRecount = await search(page, state, firstname, 'Amanda');
    await state.app.setProperties(state.storeId, {filters: []});
    await expect.poll(async () => (await state.app.getComponent(state.storeId, ['count'])).count).toBe(100000);
    await expect.poll(async () => {
        const snapshot = await probe(state, {action: 'read', pluginId: firstname.pluginId});
        return snapshot.optionTotal === 100000 && JSON.stringify(snapshot.optionCounts) === JSON.stringify(snapshot.reference)
    }).toBe(true);
    receipt.resizeVisiblePopulation = 100000;
    await closeMenu(page, state, firstname);
    const header = page.locator(`#${firstname.headerId}`), headerBox = await header.boundingBox(),
        x        = headerBox.x + headerBox.width - 3, y = headerBox.y + headerBox.height / 2;
    await page.mouse.move(x, y);
    await expect(header.locator('.neo-resizable-right')).toBeAttached();
    const resizeStart  = performance.now();
    const triggerNodes = () => page.locator(`#${firstname.triggerId}`).evaluateAll(nodes => nodes.map(node => ({
        id       : node.id, cls: node.className, parentId: node.parentElement.id, parentCls: node.parentElement.className,
        ancestors: [...function*() {for (let parent = node.parentElement; parent; parent = parent.parentElement) yield parent}()]
            .slice(0, 4).map(parent => ({id: parent.id, cls: parent.className}))
    })));
    await page.mouse.down();
    try {
        await page.mouse.move(x + 70, y, {steps: 30});
        await expect.poll(async () => (await header.boundingBox()).width).toBeGreaterThan(headerBox.width + 40);
        await expect.poll(() => page.evaluate(({headerId, bodyId}) => {
            const box = document.getElementById(headerId).getBoundingClientRect(),
                cell  = document.querySelector(`#${bodyId} [role="row"] [data-field="firstname"]`);
            return Boolean(cell && Math.abs(cell.getBoundingClientRect().width - box.width) <= 1)
        }, {headerId: firstname.headerId, bodyId: state.bodyId})).toBe(true);
        receipt.measurements.heldResizePaintMs = performance.now() - resizeStart;
        receipt.resizeHeldTriggerNodes = await triggerNodes()
    } finally {
        await page.mouse.up()
    }
    await expect(page.locator(`#${state.toolbarId}`)).not.toHaveClass(/neo-is-resizing/);
    await expect(page.locator(`#${firstname.triggerId}`), 'the proxy fully retires before another menu gesture').toHaveCount(1);
    receipt.resizeAfterIdleTriggerNodes = await triggerNodes();
    receipt.measurements.reopenAfterResizeMs = await openMenu(page, state, firstname);
    receipt.measurements.inputAfterResize = await search(page, state, firstname, 'Michael');
    counted = await probe(state, {action: 'read', pluginId: firstname.pluginId});
    expect(counted.optionCounts).toEqual(counted.reference);
    expect(counted.rawSamples).toEqual(before.rawSamples);
    await closeMenu(page, state, firstname);
    await state.app.setProperties(state.storeId, {filters: []});
    await expect.poll(async () => (await state.app.getComponent(state.storeId, ['count'])).count).toBe(100000);
    const ids = await discoverMenu(page, state, 'id');
    await probe(state, {action: 'observe', pluginId: ids.pluginId});
    receipt.measurements.idOpenMs = await openMenu(page, state, ids);
    counted = await probe(state, {action: 'read', pluginId: ids.pluginId, field: 'id'});
    expect(counted.referenceDistinct).toBe(100000);
    expect(counted.optionDistinct).toBe(100000);
    expect(counted.optionTotal).toBe(100000);
    expect(counted.idCountsAreOne).toBe(true);
    expect((await state.app.getComponent(ids.optionsStoreId, ['autoInitRecords'])).autoInitRecords).toBe(false);
    expect(counted.rawOptionSamples.every(item => item.raw), 'offscreen options remain on the Turbo data path').toBe(true);
    const picker = await state.app.getComponent(ids.pickerId, ['maxMatchingOptions', 'availableRows', 'bufferRowRange']);
    expect(counted.admittedOptions).toBe(picker.maxMatchingOptions);
    await expect(page.locator(`#${ids.pickerId}__refine`)).toHaveText('100,000 values match, narrow the search');
    const mounted = await page.locator(`#${ids.pickerId} [role="option"]`).count();
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThanOrEqual(picker.availableRows + 2 * picker.bufferRowRange);
    expect(counted.rawSamples).toEqual(before.rawSamples);
    receipt.highCardinality = {sourceCount: counted.population, optionPopulation: counted.optionDistinct,
        admittedOptions    : counted.admittedOptions, mountedOptions: mounted, cap: picker.maxMatchingOptions, refineShown: true,
        offscreenRawSamples: counted.rawOptionSamples};
    receipt.measurements.highCardinalityInput = await search(page, state, ids, '99999');
    const idOption = page.locator(`#${ids.surfaceId}`).getByRole('option', {name: /^99999, /});
    await expect(idOption).toBeVisible();
    await expect(page.locator(`#${ids.pickerId}__refine`)).toHaveCount(0);
    await idOption.click();
    await expect.poll(async () => {
        const filters = (await state.app.getComponent(state.storeId, ['filters'])).filters;
        return filters.filter(filter => filter.property === 'id' && filter.ownerRole === 'header-picker')
            .map(filter => ({operator: filter.operator, value: filter.value}))
    }).toEqual([{operator: 'typedIncluded', value: [99999]}]);
    await expect(idOption).toHaveAttribute('aria-selected', 'true');
    receipt.highCardinality.nativeSelectedValue = 99999;
    receipt.highCardinality.nativeSelectedType = 'number';
    counted = await probe(state, {action: 'read', pluginId: ids.pluginId, field: 'id'});
    expect(counted.rawSamples).toEqual(before.rawSamples);
    receipt.workerTimings = counted.timings;
    receipt.rawSamplesBefore = before.rawSamples;
    receipt.rawSamplesAfter = counted.rawSamples;
    await testInfo.attach('header-menu-100k-coverage', {body: Buffer.from(JSON.stringify(receipt, null, 2)), contentType: 'application/json'});
    await state.app.manageNeoConfig('set', {enableHotPatching: false})
});
