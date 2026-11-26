import {test, expect} from '@playwright/test';

test.use({hasTouch: true});

test.describe('Component touchend and touchcancel DOM listeners', () => {
    let componentId;

    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});
    });

    test.afterEach(async ({page}) => {
        if (componentId) {
            await page.evaluate(async id => {
                await Neo.worker.App.destroyNeoInstance(id)
            }, componentId);
            componentId = null
        }
    });

    test('delivers touchend once per tap, preserves native click, and delivers touchcancel once', async ({page}) => {
        expect(await page.evaluate(() => Neo.config.hasTouchEvents)).toBe(true);

        await expect.poll(() => page.workers().some(w => w.url().includes('/worker/App'))).toBe(true);
        const appWorker = page.workers().find(w => w.url().includes('/worker/App'));

        componentId = await appWorker.evaluate(async () => {
            const {default: Component} = await import('../component/Base.mjs'),
                  viewport             = Neo.getComponent('component-test-viewport'),
                  target               = Neo.create(Component, {
                      appName : viewport.appName,
                      cls     : ['touch-tap-target'],
                      height  : 80,
                      parentId: viewport.id,
                      style   : {backgroundColor: '#336699', margin: '24px'},
                      text    : 'Tap target',
                      width   : 180,
                      windowId: viewport.windowId
                  });

            viewport.add(target);
            return target.id
        });

        const targetLocator = page.locator(`#${componentId}`);
        await expect(targetLocator).toBeVisible();

        await appWorker.evaluate(id => {
            const target = Neo.getComponent(id);

            target.__counts = {
                click      : 0,
                touchcancel: 0,
                touchend   : 0,
                touchstart : 0
            };

            target.addDomListeners([
                {click      : () => {target.__counts.click++},       scope: target},
                {touchcancel: () => {target.__counts.touchcancel++}, scope: target},
                {touchend   : () => {target.__counts.touchend++},    scope: target},
                {touchstart : () => {target.__counts.touchstart++},  scope: target}
            ])
        }, componentId);

        await expect.poll(() => appWorker.evaluate(id => {
            return !Object.hasOwn(Neo.manager.DomEvent.mountTimeouts, id)
        }, componentId)).toBe(true);

        await page.evaluate(id => {
            window.__nativeClicks = 0;
            document.getElementById(id).addEventListener('click', () => {
                window.__nativeClicks++
            })
        }, componentId);

        // 1. One native touch tap invokes touchend once and still produces one native click
        await targetLocator.tap();

        await expect.poll(() => appWorker.evaluate(id => Neo.getComponent(id).__counts.touchend, componentId), {
            timeout: 2000
        }).toBeGreaterThanOrEqual(1);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

        await expect.poll(async () => ({
            counts      : await appWorker.evaluate(id => Neo.getComponent(id).__counts, componentId),
            nativeClicks: await page.evaluate(() => window.__nativeClicks)
        }), {timeout: 1500}).toEqual({
            counts: {
                click      : 1,
                touchcancel: 0,
                touchend   : 1,
                touchstart : 1
            },
            nativeClicks: 1
        });

        // 2. A cancelled touch gesture invokes touchcancel exactly once
        const box     = await targetLocator.boundingBox(),
              centerX = Math.round(box.x + box.width / 2),
              centerY = Math.round(box.y + box.height / 2),
              cdp     = await page.context().newCDPSession(page);

        await cdp.send('Input.dispatchTouchEvent', {
            type       : 'touchStart',
            touchPoints: [{id: 1, x: centerX, y: centerY}]
        });
        await cdp.send('Input.dispatchTouchEvent', {
            type       : 'touchCancel',
            touchPoints: []
        });

        await expect.poll(() => appWorker.evaluate(id => Neo.getComponent(id).__counts.touchcancel, componentId), {
            timeout: 2000
        }).toBe(1);

        const countsAfterCancel = await appWorker.evaluate(id => Neo.getComponent(id).__counts, componentId);
        expect(countsAfterCancel).toEqual({
            click      : 1,
            touchcancel: 1,
            touchend   : 1,
            touchstart : 2
        })
    })
});
