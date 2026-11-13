import {test, expect} from '../../fixtures.mjs';

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
    await expect(page.locator('.neo-scheduler')).toHaveClass(/neo-is-dragging/);
    const firstProxy = await proxy.boundingBox();
    expect(firstProxy).not.toBeNull();
    await page.mouse.move(x + 60, targetBox.y + targetBox.height / 2, {steps: 15});
    await expect.poll(async () => (await proxy.boundingBox())?.x).toBeGreaterThan(firstProxy.x + 20);
    await expect(proxy).toBeVisible();
    await page.mouse.up();
    await expect.poll(async () => {
        const record = await app.callMethod(scheduler.id, 'resolveEventRecord', ['ev-1']);
        return [record.startDate, record.resourceId]
    }).toEqual(['2026-11-09T02:30:00.000Z', 'r-2']);
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
