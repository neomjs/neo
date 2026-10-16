import {test, expect} from '../../fixtures.mjs';

test.use({viewport: {width: 1600, height: 900}});

const examples = {
    Grid: {path: '/examples/grid/bigData/index.html', containerClass: 'Neo.examples.grid.bigData.GridContainer',
        headerClass: 'Neo.grid.header.Button', selector: '.neo-grid-container'},
    Table: {path: '/examples/table/container/index.html', containerClass: 'Neo.table.Container',
        headerClass: 'Neo.table.header.Button', selector: '.neo-table-container'}
};

/** @summary Builds a local source with an Auto lastname field, exercising the supported untyped inline writer. */
function sourceConfig(filters=[]) {
    return {
        model: {fields: [{name: 'id', type: 'Int'}, {name: 'firstname', type: 'String'}, {name: 'lastname'},
            {name: 'score', type: 'Int'}]},
        data: [{id: 1, firstname: 'Alice', lastname: 'Able', score: 1},
            {id: 2, firstname: 'Bob', lastname: 'Baker', score: 2},
            {id: 3, firstname: 'Carol', lastname: 'Carter', score: 3}],
        filters
    }
}

const inline = (property, value, operator='like') => ({property, value, operator, ownerRole: 'header-inline'});

test('Grid: inline filter gestures preserve sorting while header captions still sort', async ({page, neuralLink}) => {
    const state    = await openExample(page, neuralLink, examples.Grid), {app, containerId} = state;
    const original = await app.getMethodSource(state.headerClass, 'onClick');
    expect(original.source).toContain('onClick');
    expect(await app.patchCode(state.headerClass, 'onClick', `(function(original) {
        return function(data) {
            const result = original.call(this, data);
            this.__headerClickCount = (this.__headerClickCount || 0) + 1;
            return result
        }
    })(Neo.ns('${state.headerClass}').prototype.onClick)`)).toMatchObject({success: true});
    await app.setProperties(containerId, {store: sourceConfig(), columns: [
        {dataField: 'firstname', text: 'Name', width: 260, showHeaderFilter: true, resizable: false}
    ]});
    const storeId = (await app.getComponent(containerId, ['store.id']))['store.id'];
    let   header  = await findHeader(state, 'firstname');

    /** @summary Waits for the real header dispatch before checking that a child gesture did not sort. */
    const click = async locator => {
        const before = (await app.getComponent(header.headerId, ['__headerClickCount'])).__headerClickCount || 0;
        await locator.click();
        await expect.poll(async () =>
            (await app.getComponent(header.headerId, ['__headerClickCount'])).__headerClickCount).toBe(before + 1)
    };
    /** @summary Reads sort intent from both the header and its source Store. */
    const sortState = async () => ({
        header : (await app.getComponent(header.headerId, ['isSorted'])).isSorted,
        sorters: (await app.getComponent(storeId, ['sorters'])).sorters.map(({property, direction}) => ({property, direction}))
    });
    const initial = await sortState(), input = page.locator(`#${header.fieldId} input`);
    expect(initial).toEqual({header: null, sorters: []});
    await click(input);
    expect(await sortState()).toEqual(initial);
    await input.fill('Al');
    await input.press('Enter');
    await expect.poll(() => filtersOf(app, storeId)).toContainEqual(expect.objectContaining({property: 'firstname', value: 'Al'}));
    await click(input);
    expect(await sortState()).toEqual(initial);
    await page.locator(`#${header.fieldId} .neo-trigger-clear`).click();
    await expect.poll(async () => (await filtersOf(app, storeId))[0]?.value).toBeNull();
    expect(await sortState()).toEqual(initial);

    const caption = page.locator(`#${header.headerId} .neo-button-text`);
    await click(caption);
    expect(await sortState()).toEqual({header: 'DESC', sorters: [{property: 'firstname', direction: 'DESC'}]});
    await click(caption);
    expect(await sortState()).toEqual({header: 'ASC', sorters: [{property: 'firstname', direction: 'ASC'}]});

    await app.callMethod(state.workerId, 'loadModule', [{path: '../filter/NumberContainer.mjs'}]);
    await app.setProperties(containerId, {columns: [
        {dataField: 'score', text: 'Score', width: 260, showHeaderFilter: true, resizable: false,
            editorConfig: {className: 'Neo.filter.NumberContainer'}}
    ]});
    header = await findHeader(state, 'score');
    const beforeOperator = await sortState(),
        operatorId       = await expectNumber(page, app, header.fieldId, null, null, '===');
    await page.locator(`#${operatorId}`).click();
    await expect.poll(async () => (await filtersOf(app, storeId)).find(filter => filter.property === 'score'))
        .toMatchObject({operator: '>', value: null});
    expect(await sortState()).toEqual(beforeOperator)
});

/** @summary Identifies this exact page worker before any runtime write and instruments the real inline writers. */
async function openExample(page, neuralLink, definition) {
    await neuralLink.routeConfig(page, config => ({...config, useAiClient: true, enableHotPatching: true}));
    await page.goto(definition.path);
    await expect(page.locator(definition.selector)).toBeVisible();
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
    expect(app.sessionId, 'every write targets this page, never a same-named older app').toBe(workerId);
    const containers = await app.queryComponent({className: definition.containerClass}, ['id']);
    expect(containers).toHaveLength(1);
    for (const [method, counter] of [['changeFilterValue', '__inlineValueWrites'], ['changeFilterOperator', '__inlineOperatorWrites']]) {
        const original = await app.getMethodSource(definition.headerClass, method);
        expect(original.source).toContain(method);
        const callable = original.source.startsWith('function') ? original.source : 'function ' + original.source;
        await app.patchCode(definition.headerClass, method,
            `function(data) { this.${counter} = (this.${counter} || 0) + 1; return (${callable}).call(this, data) }`)
    }
    return {app, workerId, containerId: containers[0].id, ...definition}
}

/** @summary Discovers the current header and its field after creation or column recreation. */
async function findHeader(state, dataField) {
    const props = await state.app.getComponent(state.containerId, ['headerToolbar.id']);
    let headerId, fieldId;
    await expect.poll(async () => {
        const header = await state.app.callMethod(props['headerToolbar.id'], 'getColumn', [dataField]);
        headerId = header?.id;
        if (!headerId) return false;
        fieldId = (await state.app.getComponent(headerId, ['filterField.id']))['filterField.id'];
        return Boolean(fieldId)
    }).toBe(true);
    await state.app.callMethod(headerId, 'ensureHeaderFilterProjection');
    return {headerId, fieldId}
}

/** @summary Reads the source-owned contribution identities, independently of any field projection. */
async function filtersOf(app, storeId) {
    const props = await app.getComponent(storeId, ['filters']);
    return props.filters.map(filter => ({id: filter.id, property: filter.property, ownerRole: filter.ownerRole,
        operator: filter.operator, value: filter.value}))
}

/** @summary Requires no inline writer calls caused by source observation or field synchronization. */
async function expectNoEcho(app, headerId) {
    const props = await app.getComponent(headerId, ['__inlineValueWrites', '__inlineOperatorWrites']);
    expect(props.__inlineValueWrites || 0).toBe(0);
    expect(props.__inlineOperatorWrites || 0).toBe(0)
}

/** @summary Verifies the field's logical value and the actual painted input together. */
async function expectText(page, app, fieldId, value) {
    await expect.poll(() => app.getComponent(fieldId, ['value'])).toMatchObject({value});
    await expect(page.locator(`#${fieldId} input`)).toHaveValue(value ?? '')
}

/** @summary Verifies both public numeric configs, both child configs and their painted affordances. */
async function expectNumber(page, app, fieldId, value, operator, text=operator) {
    await expect.poll(() => app.getComponent(fieldId, ['value', 'operator', 'items.0.value', 'items.0.text', 'items.1.value']))
        .toMatchObject({value, operator, 'items.0.value': operator, 'items.0.text': text, 'items.1.value': value});
    const props = await app.getComponent(fieldId, ['items.0.id', 'items.1.id']);
    await expect(page.locator(`#${props['items.0.id']} .neo-button-text`)).toHaveText(text);
    await expect(page.locator(`#${props['items.1.id']} input`)).toHaveValue(value === null ? '' : String(value));
    return props['items.0.id']
}

for (const [kind, definition] of Object.entries(examples)) {
    test(`${kind}: external inline replacement, recreation and source/field rebinding paint without echo writes`, async ({page, neuralLink}, testInfo) => {
        const state  = await openExample(page, neuralLink, definition), {app, containerId} = state;
        const others = [{property: 'score', operator: '>=', value: 0},
            {property: 'lastname', operator: 'typedIncluded', value: ['Able', 'Baker', 'Carter'], ownerRole: 'header-picker'}];
        await app.setProperties(containerId, {store: sourceConfig([inline('firstname', 'Al'), ...others])});
        const storeId = (await app.getComponent(containerId, ['store.id']))['store.id'];
        const columns = [{dataField: 'firstname', text: 'Name', width: 260, showHeaderFilter: true, resizable: false}];
        await app.setProperties(containerId, {columns});
        let header = await findHeader(state, 'firstname');
        await expectText(page, app, header.fieldId, 'Al');
        const before = await filtersOf(app, storeId);
        await app.setProperties(storeId, {filters: [inline('firstname', 'Bo', 'startsWith'), ...others]});
        await expectText(page, app, header.fieldId, 'Bo');
        const replaced = await filtersOf(app, storeId);
        expect(replaced[0].id).not.toBe(before[0].id);
        expect(replaced.slice(1)).toEqual(before.slice(1));
        await expectNoEcho(app, header.headerId);
        await app.setProperties(storeId, {filters: others});
        await expectText(page, app, header.fieldId, null);
        expect(await filtersOf(app, storeId)).toEqual(before.slice(1));
        await expectNoEcho(app, header.headerId);

        await app.setProperties(storeId, {filters: [inline('firstname', 'Ca'), ...others]});
        const retired = header;
        await app.setProperties(containerId, {columns});
        header = await findHeader(state, 'firstname');
        expect(header.headerId).not.toBe(retired.headerId);
        expect(header.fieldId).not.toBe(retired.fieldId);
        await expectText(page, app, header.fieldId, 'Ca');
        expect((await filtersOf(app, storeId)).slice(1)).toEqual(before.slice(1));
        await expectNoEcho(app, header.headerId);

        await app.setProperties(containerId, {store: sourceConfig([
            inline('firstname', 'Re', 'startsWith'), inline('lastname', 'Reset', '===')
        ])});
        const replacementStoreId = (await app.getComponent(containerId, ['store.id']))['store.id'];
        expect(replacementStoreId).not.toBe(storeId);
        await expectText(page, app, header.fieldId, 'Re');
        await app.setProperties(storeId, {filters: [inline('firstname', 'obsolete')]});
        await expectText(page, app, header.fieldId, 'Re');
        if (kind === 'Grid') {
            const props  = await app.getComponent(containerId, ['columns.id']);
            const column = await app.callMethod(props['columns.id'], 'get', ['firstname']);
            expect(column.id).toBeTruthy();
            await app.setProperties(column.id, {dataField: 'lastname'})
        } else await app.setProperties(header.headerId, {dataField: 'lastname'});
        await expectText(page, app, header.fieldId, 'Reset');
        await expectNoEcho(app, header.headerId);

        // The actual user path proves the zero-echo counters above can observe a writer, including Table's Auto field.
        const input = page.locator(`#${header.fieldId} input`);
        await input.fill('User');
        await input.press('Enter');
        await expect.poll(async () => (await filtersOf(app, replacementStoreId)).find(filter =>
            filter.property === 'lastname' && filter.ownerRole === 'header-inline')?.value).toBe('User');
        await expect.poll(async () => (await app.getComponent(header.headerId, ['__inlineValueWrites'])).__inlineValueWrites).toBeGreaterThan(0);
        await testInfo.attach('inline-projection-rebind-receipt', {
            body: Buffer.from(JSON.stringify({workerId: state.workerId, originalStoreId: storeId, replacementStoreId,
                retired, current: header, filters: await filtersOf(app, replacementStoreId)})), contentType: 'application/json'
        })
    });

    test(`${kind}: numeric inline projection paints child value/operator and resets the null default`, async ({page, neuralLink}, testInfo) => {
        const state = await openExample(page, neuralLink, definition), {app, containerId} = state;
        expect(await app.callMethod(state.workerId, 'loadModule', [{path: '../filter/NumberContainer.mjs'}])).toMatchObject({success: true});
        await app.setProperties(containerId, {store: sourceConfig([inline('score', 2, '>=')])});
        const storeId = (await app.getComponent(containerId, ['store.id']))['store.id'];
        const columns = [{dataField: 'score', text: 'Score', width: 260, showHeaderFilter: true, resizable: false,
            editorConfig: {className: 'Neo.filter.NumberContainer'}}];
        await app.setProperties(containerId, {columns});
        let header = await findHeader(state, 'score');
        await expectNumber(page, app, header.fieldId, 2, '>=');
        await app.setProperties(storeId, {filters: [inline('score', 3, '<')]});
        await expectNumber(page, app, header.fieldId, 3, '<');
        await expectNoEcho(app, header.headerId);
        await app.setProperties(storeId, {filters: []});
        await expectNumber(page, app, header.fieldId, null, null, '===');
        expect(await filtersOf(app, storeId)).toEqual([]);
        await expectNoEcho(app, header.headerId);

        const retired = header;
        await app.setProperties(containerId, {columns});
        header = await findHeader(state, 'score');
        expect(header.fieldId).not.toBe(retired.fieldId);
        const operatorId = await expectNumber(page, app, header.fieldId, null, null, '===');
        await expectNoEcho(app, header.headerId);
        await page.locator(`#${operatorId}`).click();
        await expect.poll(async () => (await filtersOf(app, storeId)).find(filter => filter.ownerRole === 'header-inline'))
            .toMatchObject({property: 'score', operator: '>', value: null});
        await expect.poll(async () => (await app.getComponent(header.headerId, ['__inlineOperatorWrites'])).__inlineOperatorWrites).toBeGreaterThan(0);
        await testInfo.attach('numeric-inline-projection-receipt', {
            body: Buffer.from(JSON.stringify({workerId: state.workerId, storeId, retired, current: header,
                filters: await filtersOf(app, storeId)})), contentType: 'application/json'
        })
    });
}
