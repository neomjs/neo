import {expect, readWorkerId, test} from '../../fixtures.mjs';

const primaryApp   = 'Neo.examples.stateProvider.multiWindow',
      companionApp = 'Neo.examples.stateProvider.multiWindow2',
      sourceId     = 'gesture-source-probe',
      popupId      = 'gesture-popup-probe';

/**
 * @summary Installs a listener probe through the real shared App Worker and returns its Main locator.
 * @param {import('@playwright/test').Page} page The owning Main document.
 * @param {String} appName
 * @param {String} id
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function addGestureProbe(page, appName, id) {
    const componentUrl = new URL('/src/component/Base.mjs', page.url()).href,
          source       = `
              const {default: Component} = await import(${JSON.stringify(componentUrl)}),
                    app = Object.values(Neo.apps).find(app => app.name === ${JSON.stringify(appName)}),
                    id = ${JSON.stringify(id)},
                    target = app.mainView.add({module: Component, id, flex: 'none', height: 90, width: 180, text: id}),
                    source = Neo.getComponent(${JSON.stringify(sourceId)});

              source.gestureReceipt ??= {};
              const phases = source.gestureReceipt[id] = [];

              target.domListeners = ['start', 'end', 'cancel'].map(phase => ({
                  ['pan:' + phase]: event => phases.push(event.phase)
              }));`,
          path = `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`,
          result = await page.evaluate(path => Neo.worker.App.loadModule({path}), path),
          locator = page.locator(`#${id}`);

    expect(result?.data ?? result).toMatchObject({success: true});
    await expect(locator).toBeVisible();
    await expect.poll(() => page.evaluate(() => typeof Neo.main.addon?.Gesture?.on)).toBe('function');

    await locator.evaluate(node => {
        const addon = Neo.main.addon.Gesture;

        node.addEventListener('pointerdown', event => {node.testPointerId = event.pointerId});
        addon.on('contact', ({claim, kind}) => {
            if (kind === 'start' || kind === 'end') {
                addon.publish(claim, `pan:${kind}`)
            }
        })
    });

    return locator
}

/**
 * @summary Starts a native mouse contact on a probe and verifies capture in its actual document.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} target
 */
async function startGesture(page, target) {
    const box = await target.boundingBox();

    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.down();
    await expect.poll(() => target.evaluate(node => node.hasPointerCapture(node.testPointerId))).toBe(true)
}

test('cancels on hide and final popup port loss while the sibling can still recognize input', async ({page, context}) => {
    await page.goto('/examples/stateProvider/multiWindow/index.html');

    const sourceWorker = await readWorkerId(page, 15000);
    expect(sourceWorker).toBeTruthy();
    expect(await page.evaluate(() => Neo.config.useSharedWorkers)).toBe(true);

    const openSecondWindow = page.getByRole('button', {name: 'Open second window'});
    await expect(openSecondWindow).toBeVisible();

    const sourceWindow = await page.evaluate(() => Neo.worker.Manager.windowId),
          getReceipt   = () => page.evaluate(async id => {
              const reply = await Neo.worker.App.getConfigs({id, keys: 'gestureReceipt'});

              return reply?.data ?? reply
          }, sourceId),
          source       = await addGestureProbe(page, primaryApp, sourceId);

    await startGesture(page, source);
    await page.mouse.up();
    await expect.poll(async () => (await getReceipt())[sourceId]).toEqual(['start', 'end']);

    const [popup] = await Promise.all([
        context.waitForEvent('page'),
        openSecondWindow.click()
    ]);

    try {
        await expect(popup.getByRole('button', {name: 'Edit user'})).toBeVisible();
        expect(await readWorkerId(popup, 15000)).toBe(sourceWorker);
        expect(await popup.evaluate(() => Neo.worker.Manager.windowId)).not.toBe(sourceWindow);

        const target = await addGestureProbe(popup, companionApp, popupId);

        await startGesture(popup, target);
        await expect.poll(async () => (await getReceipt())[popupId]).toEqual(['start']);

        // Control the visibility bit directly so headless focus scheduling cannot substitute
        // for the handler being tested. Native mouse input and App transport stay in use.
        await popup.evaluate(() => {
            Object.defineProperty(document, 'hidden', {configurable: true, value: false});
            document.dispatchEvent(new Event('visibilitychange'))
        });
        expect((await getReceipt())[popupId]).toEqual(['start']);

        await popup.evaluate(() => {
            Object.defineProperty(document, 'hidden', {configurable: true, value: true});
            document.dispatchEvent(new Event('visibilitychange'))
        });
        await expect.poll(async () => (await getReceipt())[popupId]).toEqual(['start', 'cancel']);
        await expect.poll(() => target.evaluate(node => node.hasPointerCapture(node.testPointerId))).toBe(false);
        await popup.mouse.up();
        await popup.evaluate(() => {delete document.hidden});

        await startGesture(popup, target);
        await expect.poll(async () => (await getReceipt())[popupId]).toEqual(['start', 'cancel', 'start']);

        await popup.evaluate(() => {
            const manager = Neo.worker.Manager, sendMessage = manager.sendMessage.bind(manager);

            manager.sendMessage = (destination, message, transfer) => {
                // Keep the genuine disconnect. Omit only a Main cancel packet to exercise the
                // real App final-port fallback even if this browser delivers pagehide first.
                if (destination !== 'app' || message.action !== 'domEvent' || message.eventName !== 'pan:cancel') {
                    return sendMessage(destination, message, transfer)
                }
            }
        });

        await Promise.all([popup.waitForEvent('close'), popup.close({runBeforeUnload: true})]);
        await expect.poll(getReceipt).toEqual({
            [sourceId]: ['start', 'end'],
            [popupId] : ['start', 'cancel', 'start', 'cancel']
        });

        await startGesture(page, source);
        await page.mouse.up();
        await expect.poll(getReceipt).toEqual({
            [sourceId]: ['start', 'end', 'start', 'end'],
            [popupId] : ['start', 'cancel', 'start', 'cancel']
        })
    } finally {
        await popup.close().catch(() => {})
    }
});
