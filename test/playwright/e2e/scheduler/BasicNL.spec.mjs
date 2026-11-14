import {test, expect} from '../../fixtures.mjs';

for (const theme of ['neo-theme-neo-light', 'neo-theme-neo-dark']) {
    test(`default drag previews move and resize without changing a booking until release (${theme})`, async ({page, neuralLink}, testInfo) => {
        await page.goto(`/examples/scheduler/basic/index.html?theme=${theme}`);
        const bar = page.locator('.neo-timeline-bar[data-event-id="ev-3"]');
        await expect(bar).toBeVisible();
        const app         = await neuralLink.connectToApp('SchedulerBasic');
        const [scheduler] = await app.findInstances({className: 'Neo.scheduler.Container'}, ['id']);
        expect((await app.getComponent(scheduler.id, ['eventDragZoneConfig'])).eventDragZoneConfig).toBeNull();
        await expect.poll(() => page.locator('.neo-scheduler').first().evaluate((el, cls) => !!el.closest(`.${cls}`), theme)).toBe(true);
        const read = async () => {
            const record = await app.callMethod(scheduler.id, 'resolveEventRecord', ['ev-3']);
            return [record.startDate, record.endDate, record.resourceId]
        };
        const initial         = await read(), original = await bar.boundingBox();
        const proxy           = page.locator('.neo-dragproxy');
        const assertUnchanged = async () => expect(await read()).toEqual(initial);

        // A real pointer move displays a displaced preview without committing the event.
        const x = original.x + original.width / 2, y = original.y + original.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 60, y, {steps: 12});
        await expect(proxy).toBeVisible();
        await expect.poll(async () => (await proxy.boundingBox())?.x).toBeGreaterThan(original.x + 20);
        expect((await proxy.boundingBox()).width).toBeCloseTo(original.width, 0);
        await assertUnchanged();
        await testInfo.attach(`scheduler-${theme}-move`, {body: await page.screenshot(), contentType: 'image/png'});
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(proxy).toHaveCount(0);
        await assertUnchanged();
        await expect.poll(async () => (await bar.boundingBox())?.x).toBeCloseTo(original.x, 0);

        // Resize from the lower edge so the physical handle and its preview are tested.
        const handle = await bar.locator('.neo-resizable-end').boundingBox();
        const rx     = handle.x + handle.width / 2, ry = original.y + original.height * .8;
        await page.mouse.move(rx, ry);
        await page.mouse.down();
        await page.mouse.move(rx + 60, ry, {steps: 12});
        await expect(proxy).toBeVisible();
        await expect.poll(async () => (await proxy.boundingBox())?.width).toBeGreaterThan(original.width + 20);
        expect((await proxy.boundingBox()).x).toBeCloseTo(original.x, 0);
        await assertUnchanged();
        await testInfo.attach(`scheduler-${theme}-resize`, {body: await page.screenshot(), contentType: 'image/png'});
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(proxy).toHaveCount(0);
        await assertUnchanged();
        await expect.poll(async () => (await bar.boundingBox())?.width).toBeCloseTo(original.width, 0);
    });
}

test('bookings move by keyboard and pointer and survive a reload', async ({page, neuralLink}) => {
    await page.goto('/examples/scheduler/basic/index.html');
    const bar   = page.locator('.neo-timeline-bar[data-event-id="ev-1"]');
    const other = page.locator('.neo-timeline-bar[data-event-id="ev-2"]');
    await expect(bar).toBeVisible();
    await expect(other).toBeVisible();
    await expect(bar).toHaveAttribute('data-lane-count', '2');
    const app         = await neuralLink.connectToApp('SchedulerBasic');
    const [scheduler] = await app.findInstances({className: 'Neo.scheduler.Container'}, ['id']);
    expect(scheduler.id).toBeTruthy();

    const header   = page.locator('.neo-scheduler .neo-grid-header-toolbar');
    const resource = await header.locator('.neo-grid-header-button.neo-locked-start').boundingBox();
    const timeline = await header.locator('.neo-timeline-header').boundingBox();
    expect(resource.y).toEqual(timeline.y);
    expect(resource.height).toEqual(timeline.height);
    expect(resource.height).toBeGreaterThanOrEqual((await header.first().boundingBox()).height - 2);

    // A single-lane booking exposes the full resize edge, including the area below its grip.
    const scoreMix = page.locator('.neo-timeline-bar[data-event-id="ev-3"]');
    const handle   = scoreMix.locator('.neo-resizable-end');
    const fullBar  = await scoreMix.boundingBox();
    const edge     = await handle.boundingBox();
    expect(edge.height).toBeGreaterThanOrEqual(fullBar.height - 2);
    const endX = edge.x + edge.width / 2, lowerY = fullBar.y + fullBar.height * 0.8;
    await page.mouse.move(endX, lowerY);
    await page.mouse.down();
    await page.mouse.move(endX + 30, lowerY, {steps: 12});
    const resizing = page.locator('.neo-dragproxy');
    await expect(resizing).toBeVisible();
    const resizePreview = await resizing.boundingBox();
    expect((await app.callMethod(scheduler.id, 'resolveEventRecord', ['ev-3'])).endDate).toBe('2026-11-09T08:00:00.000Z');
    await page.mouse.up();
    await expect.poll(async () => {
        const record = await app.callMethod(scheduler.id, 'resolveEventRecord', ['ev-3']);
        return [record.startDate, record.endDate, record.resourceId]
    }).toEqual(['2026-11-09T05:00:00.000Z', '2026-11-09T09:00:00.000Z', 'r-2']);
    await expect.poll(async () => (await scoreMix.boundingBox())?.width).toBeCloseTo(resizePreview.width, 0);

    await bar.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await app.callMethod(scheduler.id, 'resolveEventRecord', ['ev-1'])).startDate)
        .toBe('2026-11-09T00:30:00.000Z');
    await expect(page.getByText('Saved on this device')).toBeVisible();

    const box       = await bar.boundingBox();
    const target    = page.locator('.neo-grid-row').filter({hasText: 'Mixing suite'});
    const targetBox = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(targetBox).not.toBeNull();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 15, y, {steps: 5});
    const proxy = page.locator('.neo-dragproxy');
    await expect(proxy).toBeVisible();
    await expect(proxy.locator('.neo-scheduler-drag-preview'))
        .toHaveCSS('background-color', await bar.evaluate(el => getComputedStyle(el).backgroundColor));
    await expect(page.locator('.neo-scheduler')).toHaveClass(/neo-is-dragging/);
    const firstProxy = await proxy.boundingBox();
    expect(firstProxy).not.toBeNull();
    await page.mouse.move(x + 60, targetBox.y + targetBox.height / 2, {steps: 15});
    await expect.poll(async () => (await proxy.boundingBox())?.x).toBeGreaterThan(firstProxy.x + 20);
    await expect(proxy).toBeVisible();
    const dropPreview = await proxy.boundingBox();
    expect((await app.callMethod(scheduler.id, 'resolveEventRecord', ['ev-1'])).startDate).toBe('2026-11-09T00:30:00.000Z');
    await page.mouse.up();
    await expect.poll(async () => {
        const record = await app.callMethod(scheduler.id, 'resolveEventRecord', ['ev-1']);
        return [record.startDate, record.resourceId]
    }).toEqual(['2026-11-09T02:30:00.000Z', 'r-2']);
    await expect.poll(async () => (await bar.boundingBox())?.x).toBeCloseTo(dropPreview.x, 0);
    await expect(proxy).toHaveCount(0);
    await expect(bar.locator('xpath=ancestor::*[contains(@class,"neo-grid-row")][1]'))
        .toHaveAttribute('data-record-id', await target.getAttribute('data-record-id'));
    await expect(page.getByText('Saved on this device')).toBeVisible();

    await bar.focus();
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(async () => (await app.callMethod(scheduler.id, 'resolveEventRecord', ['ev-1'])).endDate)
        .toBe('2026-11-09T07:00:00.000Z');
    await expect(page.getByText('Saved on this device')).toBeVisible();

    await page.reload();
    await expect(bar).toBeVisible();
    const restoredApp         = await neuralLink.connectToApp('SchedulerBasic');
    const [restoredScheduler] = await restoredApp.findInstances({className: 'Neo.scheduler.Container'}, ['id']);
    await expect.poll(async () => {
        const record = await restoredApp.callMethod(restoredScheduler.id, 'resolveEventRecord', ['ev-1']);
        return [record?.startDate, record?.endDate, record?.resourceId]
    }).toEqual(['2026-11-09T02:30:00.000Z', '2026-11-09T07:00:00.000Z', 'r-2']);
    await expect(bar).toHaveCSS('left', '75px')
});
