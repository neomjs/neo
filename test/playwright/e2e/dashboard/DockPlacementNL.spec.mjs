import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Real-window proof of the Group placement participant: native movement, main-frame
 * rebasing, correlated undo/redo effects, durable hints and popup generation replacement.
 * @description CDP supplies physical window movement only. The real WindowPosition publisher,
 * manager, placement participant and Group history carry every semantic observation.
 */
test.describe('observed dock popup placement', () => {
    test.setTimeout(180000);
    test.use({viewport: null});

    test('free movement records once, main rebasing preserves history, and undo never records its own native effect', async ({page, neuralLink}) => {
        await page.goto('/examples/dashboard/crossWindow/index.html');
        await page.waitForSelector('.agentos-dockdemo-counter-pane', {timeout: 30000});
        const app         = await neuralLink.connectToApp('Neo.examples.dashboard.crossWindow');
        const [workspace] = await app.findInstances({className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace'}, ['id', 'topologyGroupId', 'dockPlacement.id']);
        const [manager]   = await app.findInstances({className: 'Neo.manager.Transaction'}, ['id']);
        const wsId        = workspace.id, groupId = workspace.properties.topologyGroupId;
        const placementId = workspace.properties['dockPlacement.id'];
        expect(placementId).toBeTruthy();

        const readHints    = () => app.callMethod(wsId, 'getPlacementHints');
        const readGroup    = () => app.callMethod(manager.id, 'get', [groupId]);
        const readReceipts = () => app.getComponent(placementId, ['receipts']).then(value => value.receipts);
        const readRect     = target => target.evaluate(() => ({x: screenX, y: screenY, width: outerWidth, height: outerHeight}));
        const rootCdp      = await page.context().newCDPSession(page);
        const rootWindow   = await rootCdp.send('Browser.getWindowForTarget');
        const screen       = await page.evaluate(() => ({left: window.screen.availLeft, top: window.screen.availTop, width: window.screen.availWidth, height: window.screen.availHeight}));
        await rootCdp.send('Browser.setWindowBounds', {windowId: rootWindow.windowId, bounds: {left: screen.left + 30, top: screen.top + 30, width: 800, height: 700}});

        const popupPromise = page.waitForEvent('popup');
        const opened       = app.callMethod(wsId, 'openCrossWindowStage', ['demo-b-popup']);
        const popup        = await popupPromise;
        await opened;
        await popup.waitForFunction(() => globalThis.Neo?.main?.addon?.WindowPosition?.observeMovement === true);
        const popupCdp    = await page.context().newCDPSession(popup);
        const popupWindow = await popupCdp.send('Browser.getWindowForTarget');
        const root        = await readRect(page);
        const initial     = {left: root.x + root.width + 40, top: root.y + 30, width: 600, height: 450};
        expect(initial.left + initial.width + 150).toBeLessThanOrEqual(screen.left + screen.width);
        await popupCdp.send('Browser.setWindowBounds', {windowId: popupWindow.windowId, bounds: initial});
        await expect.poll(async () => (await readHints())['demo-b-popup']?.dx).toBe(initial.left - root.x);
        expect(await app.callMethod(manager.id, 'setHistoryDepth', [{groupId, depth: 6}])).toBe(true);
        const before = await readHints();

        await Promise.all([20, 40, 60].map(delta => popupCdp.send('Browser.setWindowBounds', {
            windowId: popupWindow.windowId, bounds: {left: initial.left + delta, top: initial.top + 20}
        })));
        await expect.poll(async () => (await readGroup()).history?.count).toBe(1);
        const moved          = await readRect(popup), main = await readRect(page);
        const groupAfterMove = await readGroup();
        expect((await readHints())['demo-b-popup']).toMatchObject({dx: moved.x - main.x, dy: moved.y - main.y});
        expect(groupAfterMove.history.rows[0].participants[0].before['demo-b-popup']).toEqual(before['demo-b-popup']);
        expect(groupAfterMove.history.rows[0].cause).toBe('native-popup-move');
        const historyBeforeRebase = JSON.stringify(groupAfterMove.history);

        await rootCdp.send('Browser.setWindowBounds', {windowId: rootWindow.windowId, bounds: {left: root.x + 40, top: root.y + 20}});
        await expect.poll(async () => (await readHints())['demo-b-popup']?.dx).toBe(moved.x - root.x - 40);
        expect(await readRect(popup)).toEqual(moved);
        expect(JSON.stringify((await readGroup()).history)).toBe(historyBeforeRebase);

        const [coordinator] = await app.findInstances({className: 'Neo.manager.DragCoordinator'}, ['nativeWindowDropSettleMs']);
        const quietMs       = coordinator.properties.nativeWindowDropSettleMs;
        await popup.evaluate(() => {
            const original = Neo.Main.getWindowData;
            Neo.Main.getWindowData = function(...args) {
                const data = original.apply(this, args);
                window.placementGeometryObservation = {at: Date.now(), effectId: data.nativeEffect?.effectId ?? null};
                return data
            }
        });
        const waitForEffectQuiet = async transactionId => {
            const receipt = (await readReceipts()).find(row => row.transactionId === transactionId);
            await popup.waitForFunction(({effectId, quietMs}) =>
                window.placementGeometryObservation?.effectId === effectId &&
                Date.now() - window.placementGeometryObservation.at >= quietMs,
            {effectId: receipt.effectId, quietMs}, {timeout: 5000}).catch(async error => {
                const observation = await popup.evaluate(() => window.placementGeometryObservation);
                throw new Error(`${error.message}; receipt=${JSON.stringify(receipt)}; observation=${JSON.stringify(observation)}`)
            })
        };

        const undo = await app.callMethod(manager.id, 'undo', [{groupId}]);
        await expect.poll(async () => (await readReceipts()).find(row => row.transactionId === undo.transactionId)?.status).toBe('applied');
        await waitForEffectQuiet(undo.transactionId);
        const undone = await readGroup();
        expect(undone.history.count).toBe(1);
        expect(undone.history.cursor).toBe(-1);
        const redo = await app.callMethod(manager.id, 'redo', [{groupId}]);
        await expect.poll(async () => (await readReceipts()).find(row => row.transactionId === redo.transactionId)?.status).toBe('applied');
        await waitForEffectQuiet(redo.transactionId);
        expect((await readGroup()).history.count).toBe(1);
        expect((await readGroup()).history.cursor).toBe(0);

        const afterRedo = await readRect(popup);
        await popupCdp.send('Browser.setWindowBounds', {windowId: popupWindow.windowId, bounds: {left: afterRedo.x + 20, top: afterRedo.y}});
        await expect.poll(async () => (await readGroup()).history?.count).toBe(2);
        expect(await app.callMethod(wsId, 'capturePerspective', ['Placement', {scope: 'topology'}])).toMatchObject({saved: true, errors: []});
        const collection = (await app.getComponent(wsId, ['topologyCollection'])).topologyCollection;
        expect(collection.topologies['demo-b-placement'].placementHints).toEqual(await readHints());
        expect(JSON.stringify(collection.topologies['demo-b-placement'].placementHints)).not.toMatch(/windowId|outerRect|screen|nativeEffect/);

        const hintsBeforeReload = await readHints(), historyBeforeReload = JSON.stringify((await readGroup()).history);
        await popup.reload();
        await popup.waitForFunction(() => globalThis.Neo?.worker?.Manager?.windowId);
        await expect.poll(async () => (await app.callMethod(manager.id, 'getBinding', [groupId, 'demo-b-popup']))?.generation).toBe(2);
        expect(await readHints()).toEqual(hintsBeforeReload);
        expect(JSON.stringify((await readGroup()).history)).toBe(historyBeforeReload);
        await page.screenshot({path: 'test/playwright/test-results/dock-placement-main.png'});
        await popup.screenshot({path: 'test/playwright/test-results/dock-placement-popup.png'});
        await popup.close()
    });
});
