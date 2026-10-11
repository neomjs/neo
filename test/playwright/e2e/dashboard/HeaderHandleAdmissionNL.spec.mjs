import {test, expect} from '../../fixtures.mjs';

/**
 * @summary A descendant handle scopes the native gesture as well as App-worker sorting.
 * Initial and inserted panes preserve body selection, input and scrolling, while their headers
 * still engage sorting and its selection guard.
 */
test('descendant drag handles leave body interactions native', async ({page, neuralLink}, testInfo) => {
    await neuralLink.routeConfig(page, config => ({...config,
        mainThreadAddons: ['DragDrop', 'Navigator', 'Stylesheet'],
        useAiClient     : true
    }), '**/examples/dashboard/base/neo-config.json*');
    await page.goto('/examples/dashboard/base/index.html');
    const app = await neuralLink.connectToApp('Neo.examples.dashboard.base');
    await expect.poll(async () => (await app.findInstances({className: 'Neo.dashboard.Container'}, ['id'])).length,
        {message: 'the dashboard instance is available'}).toBe(1);
    const [oldDashboard] = await app.findInstances({className: 'Neo.dashboard.Container'}, ['parentId']);
    const parentId       = oldDashboard.properties.parentId;
    const item           = id => ({ntype: 'component', id, vdom: {cn: [
        {tag: 'div', cls: ['neo-draggable', 'native-pane-handle'], text: 'Drag this header'},
        {tag: 'p', cls: ['native-pane-body'], text: 'Select these ordinary words inside the pane body without starting a drag.'},
        {tag: 'input', cls: ['native-pane-input']},
        {tag: 'div', cls: ['native-pane-scroll'], style: {height: '50px', overflowY: 'auto'},
            cn: [{tag: 'div', style: {height: '250px'}, text: 'Scrollable body'}]}
    ]}});
    await app.callMethod(parentId, 'removeAll');
    await app.createComponent(parentId, {
        className     : 'Neo.dashboard.Container', id: 'native-handle-dashboard',
        sortZoneConfig: {dragHandleSelector: '.native-pane-handle'},
        items         : [item('initial-handle-pane')]
    });
    await expect.poll(async () => (await app.getComponent('native-handle-dashboard', ['sortZone.id']))['sortZone.id']).toBeTruthy();
    const sortZoneId = (await app.getComponent('native-handle-dashboard', ['sortZone.id']))['sortZone.id'];
    await app.callMethod('native-handle-dashboard', 'add', [item('inserted-handle-pane')]);
    const outcomes = [];

    for (const id of ['initial-handle-pane', 'inserted-handle-pane']) {
        const pane = page.locator(`#${id}`), body = pane.locator('.native-pane-body');
        await expect(body).toBeVisible();
        await page.evaluate(() => getSelection().removeAllRanges());
        const box = await body.boundingBox();
        await page.mouse.move(box.x + 4, box.y + box.height / 2);
        await page.mouse.down();
        let claimed;
        try {
            claimed = await page.evaluate(() => document.body.classList.contains('neo-drag-active'));
            await page.mouse.move(box.x + 160, box.y + box.height / 2, {steps: 20})
        } finally {
            await page.mouse.up()
        }
        outcomes.push({id, claimed, selection: await page.evaluate(() => getSelection().toString())});
        await pane.locator('.native-pane-input').click();
        await pane.locator('.native-pane-input').fill('Body input stays usable');
        await expect(pane.locator('.native-pane-input')).toHaveValue('Body input stays usable');
        const scroll = pane.locator('.native-pane-scroll');
        await scroll.hover();
        await page.mouse.wheel(0, 150);
        await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
        expect((await app.getComponent(sortZoneId, ['currentIndex'])).currentIndex).toBe(-1)
    }

    await testInfo.attach('native-body-interactions', {body: Buffer.from(JSON.stringify(outcomes)), contentType: 'application/json'});
    for (const outcome of outcomes) {
        expect(outcome.claimed, outcome.id).toBe(false);
        expect(outcome.selection, outcome.id).not.toBe('')
    }

    const handle = page.locator('#initial-handle-pane .native-pane-handle'), box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    try {
        await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, {steps: 30});
        await expect.poll(async () => (await app.getComponent(sortZoneId, ['dragComponent.id']))['dragComponent.id']).toBe('initial-handle-pane');
        expect(await page.evaluate(() => document.body.classList.contains('neo-drag-active'))).toBe(true)
    } finally {
        await page.mouse.up()
    }
    await expect.poll(async () => (await app.getComponent(sortZoneId, ['currentIndex'])).currentIndex).toBe(-1);
    expect(await page.evaluate(() => document.body.classList.contains('neo-drag-active'))).toBe(false)
});
