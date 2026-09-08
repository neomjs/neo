import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Proves ordinary controls work before lazy playback and the real Start action completes it.
 */
test('Workstation activates one playback controller through Start and retains its ordinary owners', async ({page, neuralLink}, testInfo) => {
    test.setTimeout(120000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto('/apps/workstation/index.html');
    await page.waitForSelector('.workstation-tour-play');
    await page.waitForSelector('.neo-tab-overflow-control');
    const app            = await neuralLink.connectToApp('Workstation'),
          workspaces     = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
          workspaceId    = workspaces[0].id,
          bar            = await app.callMethod(workspaceId, 'getReference', ['tour-bar']),
          provider       = await app.callMethod(workspaceId, 'getStateProvider'),
          paneIds        = await Promise.all(['scale', 'feed'].map(id => app.callMethod(workspaceId, 'getPaneIdentity', [id]))),
          readController = async () => (await app.getComponent(bar.id, ['controller'])).controller,
          namespaces     = ['Workstation.view.TourController', 'Workstation.tour.GestureDriver', 'Workstation.tour.NativeGestureDriver'],
          readRuntime    = () => Promise.all(namespaces.map(async name => (await app.checkNamespace(name)).exists));

    expect(await readController()).toBeNull();
    expect(await readRuntime()).toEqual([false, false, false]);
    const resize = await app.executeDockOperation(workspaceId, {
        operation: 'resizeSplit', splitNodeId: 'split-main', sizes: [0.55, 0.45]
    });
    expect(resize.applied).toBe(true);
    expect((await app.getDockTopology(workspaceId)).document.nodes['split-main'].sizes).toEqual([0.55, 0.45]);
    expect(await readRuntime(), 'ordinary docking must not load playback').toEqual([false, false, false]);
    const initialTheme = (await app.getComponent(workspaceId, ['theme'])).theme;
    await page.locator('.workstation-theme-button').click();
    await expect.poll(async () => (await app.getComponent(workspaceId, ['theme'])).theme).not.toBe(initialTheme);
    expect(await readController(), 'ordinary theme controls must not activate playback').toBeNull();
    expect(await readRuntime()).toEqual([false, false, false]);

    await page.locator('.workstation-tour-play').click();
    await expect.poll(async () => (await readController())?.id).toBeTruthy();
    const controller = await readController();
    expect(controller.className).toBe('Workstation.view.TourController');
    let receipt;
    await expect.poll(async () => {
        receipt = await app.callMethod(controller.id, 'getTourReceipt');
        return Boolean(receipt)
    }, {timeout: 60000, intervals: [100, 250, 500]}).toBe(true);
    expect(receipt.errors, JSON.stringify(receipt)).toEqual([]);
    expect(receipt.completed).toBe(true);
    await expect(page.locator('.workstation-tour-caption')).toContainText('Tour complete');
    await expect(page.locator('.workstation-pip-done')).toHaveCount(receipt.log.length);
    await expect(page.locator('.workstation-tour-play')).toBeEnabled();
    expect((await readController()).id).toBe(controller.id);
    expect((await app.callMethod(workspaceId, 'getStateProvider')).id).toBe(provider.id);
    expect(await Promise.all(['scale', 'feed'].map(id => app.callMethod(workspaceId, 'getPaneIdentity', [id])))).toEqual(paneIds);
    expect(await readRuntime(), 'the same worker-side probe must see the activated runtime').toEqual([true, true, true]);
    expect(pageErrors).toEqual([]);
    await testInfo.attach('tour-complete', {body: await page.screenshot(), contentType: 'image/png'})
});
