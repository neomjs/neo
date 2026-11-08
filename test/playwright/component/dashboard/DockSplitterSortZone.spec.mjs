import {test, expect} from '@playwright/test';

/**
 * A splitter inside a sortable dashboard owns its gesture. Every splitter carries `neo-draggable`, the
 * delegate a `dashboard.Container`'s SortZone listens on, so a splitter's `drag:start` that bubbles to
 * the dashboard opens a sort session there: the dashboard is stamped `neo-is-dragging`, and the page
 * shield keyed on that class (`body:has(.neo-is-dragging) *`) stays up after the release.
 */

let dashboardId, splitterId;

const sessionState = (page, id) => page.evaluate(dashboard => ({
    gesture: document.body.classList.contains('neo-drag-active'),
    stamped: document.getElementById(dashboard).classList.contains('neo-is-dragging')
}), id);

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-splitter/index.html');
    await page.waitForSelector('#dock-splitter-test-viewport', {state: 'attached'});

    ({dashboardId, splitterId} = await page.evaluate(async () => {
        const dashboard = await Neo.worker.App.createNeoInstance({
            importPath: '../dashboard/Container.mjs',
            ntype     : 'dashboard',
            parentId  : 'dock-splitter-test-viewport'
        });

        if (!dashboard.success) throw new Error(`dashboard: ${dashboard.error.message}`);

        const splitter = await Neo.worker.App.createNeoInstance({
            importPath : '../dashboard/dock/interaction/DockSplitter.mjs',
            ntype      : 'dashboard-dock-splitter',
            orientation: 'horizontal',
            parentId   : dashboard.id
        });

        if (!splitter.success) throw new Error(`splitter: ${splitter.error.message}`);

        return {dashboardId: dashboard.id, splitterId: splitter.id}
    }));

    await page.waitForSelector('.neo-dashboard-dock-splitter', {state: 'attached'})
});

test.afterEach(async ({page}) => {
    await page.evaluate(async ids => {
        for (const id of ids) id && await Neo.worker.App.destroyNeoInstance(id)
    }, [splitterId, dashboardId])
});

test.describe('DockSplitter inside a sortable dashboard', () => {
    test('a splitter drag opens no sort session on the dashboard', async ({page}) => {
        const box = await page.locator('.neo-dashboard-dock-splitter').first().boundingBox();

        expect(box).not.toBeNull();

        const x = box.x + box.width  / 2,
              y = box.y + box.height / 2;

        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 60, y, {steps: 12});

        // Held past the sensor's 100 ms arming delay: a parent session would have stamped by now
        await page.waitForTimeout(500);

        const held = await sessionState(page, dashboardId);

        await page.mouse.up();

        expect(held.gesture, 'non-vacuity: the sensor holds a live gesture for the splitter').toBe(true);
        expect(held.stamped, 'the dashboard opens no sort session during a splitter drag').toBe(false);

        await expect.poll(() => sessionState(page, dashboardId), {timeout: 2000})
            .toEqual({gesture: false, stamped: false})
    });
});
