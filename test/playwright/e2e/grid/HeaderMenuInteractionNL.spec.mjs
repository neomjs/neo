import {test, expect} from '../../fixtures.mjs';

test.use({viewport: {width: 1600, height: 900}});

/** @summary Discovers this page's worker-owned grid and named header, without borrowing another app session. */
async function openGrid(page, neuralLink, enabled=false) {
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
    expect(app.sessionId, 'all reads and writes belong to the new test page').toBe(workerId);
    const grids = await app.queryComponent({className: 'Neo.examples.grid.bigData.GridContainer'}, [
        'id', 'store.id', 'headerToolbar.id', 'body.id', 'columnMenu'
    ]);
    expect(grids).toHaveLength(1);
    const grid = grids[0], props = grid.properties;
    if (enabled) await app.setProperties(grid.id, {columnMenu: true});
    const headers = await app.queryComponent({className: 'Neo.grid.header.Button'}, ['id', 'dataField', 'parentId']);
    const header  = headers.find(item => item.properties.dataField === 'firstname');
    expect(header).toBeTruthy();
    const result = {app, gridId: grid.id, storeId: props['store.id'], toolbarId: props['headerToolbar.id'],
        bodyId: props['body.id'], headerId: header.id};
    await expect(page.locator(`#${result.headerId}`)).toBeVisible();
    if (enabled) {
        await expect.poll(async () => {
            const plugins = await app.findInstances({className: 'Neo.grid.header.plugin.Menu'}, ['id', 'owner.id', 'trigger.id']);
            return plugins.some(plugin => plugin.properties['owner.id'] === result.headerId && plugin.properties['trigger.id'])
        }).toBe(true);
        const plugins = await app.findInstances({className: 'Neo.grid.header.plugin.Menu'}, ['id', 'owner.id', 'trigger.id']);
        const plugin  = plugins.find(item => item.properties['owner.id'] === result.headerId);
        Object.assign(result, {pluginId: plugin.id, triggerId: plugin.properties['trigger.id']});
        await expect(page.locator(`#${result.triggerId}`)).toBeAttached()
    }
    return result
}

/** @summary Requires the discovered floating surface to be visible in both worker and DOM. */
async function expectOpen(page, state) {
    const {app, pluginId} = state;
    await expect.poll(async () => (await app.getComponent(pluginId, ['surface.id']))['surface.id']).toBeTruthy();
    const props     = await app.getComponent(pluginId, ['surface.id', 'valuePicker.id', 'optionsStore.id']);
    const surfaceId = props['surface.id'];
    if (state.surfaceId) expect(surfaceId, 'reopening reuses the same owned surface').toBe(state.surfaceId);
    Object.assign(state, {surfaceId, pickerId: props['valuePicker.id'], optionsStoreId: props['optionsStore.id']});
    await expect.poll(() => app.getComponent(surfaceId, ['hidden', 'mounted'])).toMatchObject({hidden: false, mounted: true});
    await expect(page.locator(`#${surfaceId}`)).toBeVisible();
    return page.locator(`#${surfaceId}`)
}

/** @summary Dismissal must withdraw the DOM and the worker's mounted surface together. */
async function expectClosed(page, state, restoreFocus=false) {
    await expect.poll(() => state.app.getComponent(state.surfaceId, ['hidden', 'mounted']))
        .toMatchObject({hidden: true, mounted: false});
    await expect(page.locator(`#${state.surfaceId}`)).toHaveCount(0);
    if (restoreFocus) await expect(page.locator(`#${state.headerId}`)).toBeFocused()
}

/** @summary Captures sort and column order so menu input cannot silently sort or begin a drag. */
async function headerTruth(state) {
    const [header, grid] = await Promise.all([
        state.app.getComponent(state.headerId, ['isSorted']),
        state.app.getComponent(state.gridId, ['centerColumns'])
    ]);
    return {sort: header.isSorted, order: grid.centerColumns.map(column => column.dataField)}
}

/** @summary Reads the whole composed header slots against first-row body cells, clipped to this discovered region. */
function readPairs(page, state) {
    return page.evaluate(({toolbarId, bodyId}) => {
        const body  = document.getElementById(bodyId), toolbar = document.getElementById(toolbarId),
            clip    = body.getBoundingClientRect(), row = body.querySelector('[role="row"]'),
            inClip  = rect => rect.width > 0 && rect.right > clip.left + 1 && rect.left < clip.right - 1,
            visible = node => getComputedStyle(node).visibility !== 'hidden';
        const headers = [...toolbar.children].map(node => ({node, rect: node.getBoundingClientRect()}))
            .filter(({node, rect}) => visible(node) && inClip(rect))
            .map(({node, rect}) => ({id: node.id, x: rect.x, width: rect.width}));
        const cells = [...row.children].map(node => ({node, rect: node.getBoundingClientRect()}))
            .filter(({node, rect}) => getComputedStyle(node).display !== 'none' && inClip(rect))
            .map(({node, rect}) => ({id: node.id, x: rect.x, width: rect.width}));
        return {headers, cells}
    }, {toolbarId: state.toolbarId, bodyId: state.bodyId})
}

/** @summary Fails on held-gesture alignment drift, even when the final drop repairs it. */
function assertAligned(pairs, label, held=false) {
    const {headers, cells} = pairs, dump = JSON.stringify(pairs);
    expect(headers.length, `${label}: real visible slots`).toBeGreaterThan(2);
    if (!held) expect(headers.length, `${label}: slot parity ${dump}`).toBe(cells.length);
    for (const header of headers) {
        const cell = cells.find(item => Math.abs(item.x - header.x) <= 1);
        expect(cell, `${label}: cell under ${header.id} ${dump}`).toBeDefined();
        expect(Math.abs(cell.width - header.width), `${label}: width of ${header.id} ${dump}`).toBeLessThanOrEqual(1)
    }
}

/** @summary Waits for the held gesture's worker paint to converge, without releasing the pointer. */
async function expectAligned(page, state, held=false) {
    await expect.poll(async () => {
        const {headers, cells} = await readPairs(page, state);
        return headers.length > 2 && (held || headers.length === cells.length) && headers.every(header =>
            cells.some(cell => Math.abs(cell.x - header.x) <= 1 && Math.abs(cell.width - header.width) <= 1))
    }).toBe(true)
}

/** @summary Drives a real header reorder and checks its held geometry, trace and final three-surface identity. */
async function reorder(page, state, testInfo) {
    const {app, headerId, toolbarId} = state, header = page.locator(`#${headerId}`),
        before                       = await headerTruth(state), box = await header.boundingBox();
    await app.getDragTrace(true);
    const motion = app.observeMotion({componentIds: [headerId], durationMs: 1800, intervalMs: 32});
    await page.mouse.move(box.x + 45, box.y + box.height / 2);
    await page.mouse.down();
    try {
        await page.mouse.move(box.x + box.width + 90, box.y + box.height / 2, {steps: 35});
        await expect(page.locator(`#${toolbarId}`)).toHaveClass(/neo-is-dragging/);
        await expect.poll(async () => {
            const trace = await app.getDragTrace();
            return trace.traces.some(item => item.events.some(event => event.t === 'switch'))
        }).toBe(true);
        await expectAligned(page, state, true);
        assertAligned(await readPairs(page, state), 'held reorder after menu lifecycle', true)
    } finally {
        await page.mouse.up()
    }
    await expect.poll(async () => (await headerTruth(state)).order.indexOf('firstname')).toBeGreaterThan(before.order.indexOf('firstname'));
    await expect(page.locator(`#${toolbarId}`)).not.toHaveClass(/neo-is-dragging/);
    await expectAligned(page, state);
    assertAligned(await readPairs(page, state), 'reorder drop');
    const trace = await app.getDragTrace(), current = trace.traces.at(-1);
    expect(current.ownerId).toBe(toolbarId);
    expect(current.startIndex).toBe(before.order.indexOf('firstname'));
    expect(current.events.some(event => event.t === 'switch')).toBe(true);
    expect(current.events.some(event => event.t === 'end')).toBe(true);
    const observed = await motion;
    expect(observed.samples.length, 'motion sampling observed real drag frames').toBeGreaterThan(2);
    expect(observed.samples.some(sample => sample.rects[0]?.width > 0)).toBe(true);
    await testInfo.attach('header-reorder-motion-and-trace', {
        body: Buffer.from(JSON.stringify({motion: observed, trace: current})), contentType: 'application/json'
    });
    const consistency = await app.verifyComponentConsistency(toolbarId);
    // The perception API reports physical wrapper IDs; the stable wrapper convention maps those to their component owners.
    const owners = ids => ids.map(id => id.endsWith('__wrapper') ? id.slice(0, -9) : id);
    expect(consistency.mismatches.filter(item => item.type !== 'order-or-membership')).toEqual([]);
    expect(owners(consistency.domIds)).toEqual(consistency.itemIds);
    expect(consistency.vdomIds).toEqual(consistency.itemIds);
    expect(new Set(consistency.domIds).size).toBe(consistency.domIds.length)
}

test.describe('Grid header value-menu native interactions', () => {
    test('default-off preserves ordinary sorting and real header reordering', async ({page, neuralLink}, testInfo) => {
        const state = await openGrid(page, neuralLink), header = page.locator(`#${state.headerId}`);
        expect((await state.app.getComponent(state.gridId, ['columnMenu'])).columnMenu).toBe(false);
        expect(await state.app.findInstances({className: 'Neo.grid.header.plugin.Menu'}, ['id'])).toEqual([]);
        await expect(page.locator('.neo-grid-menu-trigger')).toHaveCount(0);
        await expect(page.locator('.neo-grid-menu-wrapper')).toHaveCount(0);
        const before = await headerTruth(state);
        await header.click({button: 'right', position: {x: 40, y: 15}});
        await header.focus();
        await page.keyboard.press('Shift+F10');
        await expect(page.locator('.neo-grid-column-menu')).toHaveCount(0);
        expect(await headerTruth(state)).toEqual(before);
        await header.click({position: {x: 40, y: 15}});
        await expect.poll(async () => (await headerTruth(state)).sort).toBe('ASC');
        await reorder(page, state, testInfo);
        await expect(page.locator('.neo-grid-column-menu')).toHaveCount(0)
    });

    test('menu-disabled header in a grid with menus shows the off hint and never the browser menu while menu-free grids stay unchanged', async ({page, neuralLink}) => {
        const state   = await openGrid(page, neuralLink),
              header  = page.locator(`#${state.headerId}`),
              before  = await headerTruth(state),
              headers = await state.app.queryComponent({className: 'Neo.grid.header.Button'}, ['id', 'dataField']),
              sibling = headers.find(item => item.properties.dataField === 'lastname');
        expect(sibling).toBeTruthy();

        // 1. Grid without any header menus: right-click does not prevent default and opens no surface
        await page.evaluate(() => {
            window.__headerContextDefault = null;
            document.addEventListener('contextmenu', event => queueMicrotask(() => {
                window.__headerContextDefault = {prevented: event.defaultPrevented, trusted: event.isTrusted}
            }), {once: true})
        });
        await header.click({button: 'right', position: {x: 40, y: 15}});
        await expect.poll(() => page.evaluate(() => window.__headerContextDefault)).toEqual({prevented: false, trusted: true});
        await expect(page.locator('.neo-grid-column-menu')).toHaveCount(0);

        // 2. Enable a value menu on `lastname` while `firstname` stays `columnMenu: false` (unwrapped, no trigger)
        await state.app.setProperties(sibling.id, {columnMenu: true});
        await expect.poll(async () => {
            const plugins = await state.app.findInstances({className: 'Neo.grid.header.plugin.Menu'}, ['id', 'owner.id']);
            return plugins.length === 1 && plugins[0].properties['owner.id'] === sibling.id
        }).toBe(true);

        expect((await state.app.getComponent(state.headerId, ['columnMenu', 'menuRootWrapped']))).toEqual({
            columnMenu     : false,
            menuRootWrapped: false
        });

        await page.evaluate(() => {
            window.__headerContextDefault = null;
            document.addEventListener('contextmenu', event => queueMicrotask(() => {
                window.__headerContextDefault = {prevented: event.defaultPrevented, trusted: event.isTrusted}
            }), {once: true})
        });
        await header.click({button: 'right', position: {x: 40, y: 15}});
        await expect.poll(() => page.evaluate(() => window.__headerContextDefault)).toEqual({prevented: true, trusted: true});

        const wrappers = await state.app.queryComponent({className: 'Neo.grid.header.Wrapper'}, ['id', 'cls']);
        expect(wrappers).toHaveLength(1);
        expect(wrappers[0].properties.cls).toContain('neo-grid-has-column-menus');

        const hint = page.locator('.neo-grid-column-menu');
        await expect(hint).toBeVisible();
        await expect(hint.locator('[role="status"]')).toHaveText('Value filtering is off for this column.');
        await expect(hint.locator('input')).toHaveCount(0);
        await expect(hint.locator('[role="listbox"]')).toHaveCount(0);

        const headerBox = await header.boundingBox(), hintBox = await hint.boundingBox();
        expect(Math.abs(hintBox.x - headerBox.x), 'hint aligns to the menu-disabled header').toBeLessThanOrEqual(1);
        expect(Math.abs(hintBox.y - headerBox.y - headerBox.height), 'hint starts below the header').toBeLessThanOrEqual(1);
        expect(await headerTruth(state)).toEqual(before);

        // Escape dismisses the hint and keeps focus on the header; Shift+F10 reopens and outside click dismisses
        await page.keyboard.press('Escape');
        await expect(hint).toHaveCount(0);
        await expect(header).toBeFocused();

        await page.keyboard.press('Shift+F10');
        await expect(hint).toBeVisible();
        const bodyBox = await page.locator(`#${state.bodyId}`).boundingBox();
        await page.mouse.click(bodyBox.x + bodyBox.width - 40, bodyBox.y + 200);
        await expect(hint).toHaveCount(0);
        expect(await headerTruth(state)).toEqual(before)
    });

    test('right-click, sibling trigger and keyboard open without sorting; inside pointers and dismissal preserve the island', async ({page, neuralLink}) => {
        const state = await openGrid(page, neuralLink, true), header = page.locator(`#${state.headerId}`),
            trigger = page.locator(`#${state.triggerId}`), before = await headerTruth(state);
        await expect(header).toHaveJSProperty('tagName', 'BUTTON');
        await expect(trigger).toHaveJSProperty('tagName', 'BUTTON');
        await expect(header.locator('button')).toHaveCount(0);
        expect(await trigger.evaluate((node, headerId) => node.parentElement === document.getElementById(headerId).parentElement,
            state.headerId), 'trigger and sort button are native siblings').toBe(true);
        await state.app.getDragTrace(true);
        await page.evaluate(() => {
            window.__headerContextDefault = null;
            document.addEventListener('contextmenu', event => queueMicrotask(() => {
                window.__headerContextDefault = {prevented: event.defaultPrevented, trusted: event.isTrusted}
            }), {once: true})
        });
        await header.click({button: 'right', position: {x: 40, y: 15}});
        let menu = await expectOpen(page, state);
        await expect.poll(() => page.evaluate(() => window.__headerContextDefault)).toEqual({prevented: true, trusted: true});
        const headerBox = await header.boundingBox(), menuBox = await menu.boundingBox();
        expect(Math.abs(menuBox.x - headerBox.x), 'surface aligns to the whole native header').toBeLessThanOrEqual(1);
        expect(Math.abs(menuBox.y - headerBox.y - headerBox.height), 'surface starts below the header').toBeLessThanOrEqual(1);
        await expect(menu.locator('input')).toBeFocused();
        const picker = await state.app.getComponent(state.pickerId, ['height', 'mounted']);
        expect(picker).toMatchObject({height: 240, mounted: true});
        await menu.locator('input').click();
        await menu.getByRole('option', {name: /^Amanda, /}).click();
        await expect.poll(async () => (await state.app.getComponent(state.pickerId, ['selection'])).selection.length).toBe(1);
        await expectOpen(page, state);
        await menu.locator('input').fill('Michael');
        await expect.poll(async () => (await state.app.getComponent(state.pickerId, ['searchValue'])).searchValue).toBe('Michael');
        await expect(menu.getByRole('option', {name: /^Amanda, /})).toHaveAttribute('aria-selected', 'true');
        await expect(menu.getByRole('option', {name: /^Michael, /})).toBeVisible();
        await page.keyboard.press('Escape');
        await expectClosed(page, state, true);
        for (const key of ['Shift+F10', 'ContextMenu']) {
            await page.keyboard.press(key);
            menu = await expectOpen(page, state);
            await expect(menu.locator('input')).toBeFocused();
            await page.keyboard.press('Escape');
            await expectClosed(page, state, true)
        }
        await trigger.click();
        menu = await expectOpen(page, state);
        await trigger.click();
        await expectOpen(page, state);
        await page.keyboard.press('Escape');
        await expectClosed(page, state, true);
        await trigger.focus();
        await page.keyboard.press('Enter');
        await expectOpen(page, state);
        const bodyBox = await page.locator(`#${state.bodyId}`).boundingBox();
        await page.mouse.click(bodyBox.x + bodyBox.width - 40, bodyBox.y + 200);
        await expectClosed(page, state);
        await trigger.focus();
        await page.keyboard.press('Space');
        await expectOpen(page, state);
        await page.keyboard.press('Escape');
        await expectClosed(page, state, true);
        const triggerBox = await trigger.boundingBox();
        await page.mouse.move(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(triggerBox.x + 60, triggerBox.y + triggerBox.height / 2, {steps: 15});
        await page.mouse.up();
        expect(await headerTruth(state)).toEqual(before);
        expect((await state.app.getDragTrace()).traces).toEqual([])
    });

    test('after opening and closing, native sort, resize and reorder retain geometry and column authority', async ({page, neuralLink}, testInfo) => {
        const state = await openGrid(page, neuralLink, true), header = page.locator(`#${state.headerId}`);
        await page.locator(`#${state.triggerId}`).click();
        await expectOpen(page, state);
        await page.keyboard.press('Escape');
        await expectClosed(page, state, true);
        await header.click({position: {x: 40, y: 15}});
        await expect.poll(async () => (await headerTruth(state)).sort).toBe('ASC');
        assertAligned(await readPairs(page, state), 'before resize');
        const box  = await header.boundingBox(), x = box.x + box.width - 3, y = box.y + box.height / 2,
            motion = state.app.observeMotion({componentIds: [state.headerId], durationMs: 1800, intervalMs: 32});
        await page.mouse.move(x, y);
        await expect(header.locator('.neo-resizable-right')).toBeAttached();
        await page.mouse.down();
        try {
            await page.mouse.move(x + 65, y, {steps: 30});
            await expect.poll(async () => (await header.boundingBox()).width).toBeGreaterThan(box.width + 40);
            await expectAligned(page, state);
            assertAligned(await readPairs(page, state), 'resize with pointer held');
            await expect(page.locator('.neo-grid-column-menu')).toHaveCount(0)
        } finally {
            await page.mouse.up()
        }
        await expect.poll(async () => (await state.app.getComponent(state.headerId, ['width'])).width).toBeGreaterThan(box.width + 40);
        await expect(page.locator(`#${state.toolbarId}`)).not.toHaveClass(/neo-is-resizing/);
        await expectAligned(page, state);
        assertAligned(await readPairs(page, state), 'resize drop');
        const observed = await motion;
        expect(observed.samples.some(sample => sample.rects[0]?.width > box.width + 40)).toBe(true);
        await testInfo.attach('header-resize-motion', {body: Buffer.from(JSON.stringify(observed)), contentType: 'application/json'});
        await reorder(page, state, testInfo);
        await expect(page.locator('.neo-grid-column-menu')).toHaveCount(0)
    });
});

test.describe('Grid header value-menu touch affordance', () => {
    test.use({hasTouch: true});

    test('a no-hover touch device sees and activates the sibling trigger with trusted touch input', async ({page, neuralLink}) => {
        const state = await openGrid(page, neuralLink, true), trigger = page.locator(`#${state.triggerId}`),
            before  = await headerTruth(state);
        expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
        await expect(trigger).toHaveCSS('opacity', '1');
        await page.evaluate(() => {
            window.__headerTouch = [];
            document.addEventListener('pointerdown', event => {
                window.__headerTouch.push({type: event.pointerType, trusted: event.isTrusted})
            })
        });
        const box = await trigger.boundingBox();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        const menu = await expectOpen(page, state);
        await expect.poll(() => page.evaluate(() => window.__headerTouch)).toContainEqual({type: 'touch', trusted: true});
        const inputBox = await menu.locator('input').boundingBox();
        await page.touchscreen.tap(inputBox.x + 10, inputBox.y + inputBox.height / 2);
        await expectOpen(page, state);
        await page.keyboard.press('Escape');
        await expectClosed(page, state, true);
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        await expectOpen(page, state);
        const bodyBox    = await page.locator(`#${state.bodyId}`).boundingBox();
        const touchCount = (await page.evaluate(() => window.__headerTouch)).length;
        await page.touchscreen.tap(bodyBox.x + bodyBox.width - 40, bodyBox.y + 200);
        await expect.poll(async () => (await page.evaluate(() => window.__headerTouch)).length).toBe(touchCount + 1);
        expect((await page.evaluate(() => window.__headerTouch)).at(-1)).toEqual({type: 'touch', trusted: true});
        await expectClosed(page, state);
        expect(await headerTruth(state)).toEqual(before)
    });
});
