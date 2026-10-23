import {test, expect}        from '../../fixtures.mjs';
import {readNativeLifecycle} from '../utils/dockNativeLifecycle.mjs';
import {popOut}              from '../utils/workstationPopOut.mjs';

const
    ITEM    = 'commits',
    asArray = value => Array.isArray(value) ? value : value ? [value] : [],
    closes  = {
        'a close that runs beforeunload (control)'   : popup => popup.close({runBeforeUnload: true}),
        'a target close, which fires no beforeunload': popup => popup.close()
    };

/**
 * @summary A popup that closes without `beforeunload` still returns its pane.
 *
 * A window used to announce its departure to the SharedWorkers only in `beforeunload`. An automation's target
 * close (`page.close()`, CDP `Target.closeTarget`) fires `pagehide` and `unload` but no `beforeunload`, so the
 * App Worker kept the dead window's binding: the pane never came back, the close never became a history row,
 * and the vessel's components went on sending updates to a window that could not answer. The control closes the
 * same way the specs always did, with `beforeunload`.
 */
test.describe('Workstation — a popup closed without beforeunload', () => {
    test.setTimeout(120000);

    async function boot({page, neuralLink}) {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-workspace', {timeout: 30000});

        const app         = await neuralLink.connectToApp('Workstation'),
              workspaceId = asArray(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']))[0]?.id;

        expect(workspaceId, 'the page owns a Workspace').toBeTruthy();

        return {app, paneId: await app.callMethod(workspaceId, 'getPaneIdentity', [ITEM]), workspaceId}
    }

    const historyCount = async (app, workspaceId) =>
        (await app.callMethod(workspaceId, 'controller.getTopologyState')).historyCount;

    /**
     * Whether the worker released the popup's binding and main shows the pane again.
     */
    async function returned({app, page, paneId, workspaceId}) {
        const {owners}    = await readNativeLifecycle(app, workspaceId),
              {dockModel} = await app.getComponent(workspaceId, ['dockModel']);

        return {
            inMainDocument: Boolean(dockModel.items[ITEM]),
            owner         : owners[ITEM]?.windowId ?? null,
            shownInMain   : await page.locator(`#${paneId}`).count()
        }
    }

    const home = {inMainDocument: true, owner: null, shownInMain: 1};

    for (const [name, close] of Object.entries(closes)) {
        test(`${name} returns the pane with a history row and leaves no update wedged`, async ({page, neuralLink}) => {
            const context   = {page, ...await boot({page, neuralLink})},
                  {popup}   = await popOut({...context, itemId: ITEM}),
                  committed = await historyCount(context.app, context.workspaceId);

            await close(popup);

            await expect.poll(() => returned(context), {message: 'the pane comes back to main', timeout: 10000})
                .toEqual(home);
            expect(await historyCount(context.app, context.workspaceId), 'the close is one history row')
                .toBe(committed + 1);

            // wall-clock-under-test: the App Worker reports an update in flight for 5 s as wedged
            // (VDomUpdate's watchdog); the workerErrors fixture fails the test on that report.
            await page.waitForTimeout(6000)
        })
    }

    test('Undo after a target close re-opens the pane, Redo returns it, and its node still maximizes', async ({page, neuralLink, workerErrors}) => {
        // The known Undo re-open render error, as WorkstationReopenedPopupReturnNL names it (defect-note
        // a93f3f742aff4b33). Named exactly, so any other worker error, a wedged update included, still fails.
        workerErrors.expect(/^App Worker: Error: CanvasGroups: window \S+ belongs to no canvas group(\n|$)/);

        const context                    = {page, ...await boot({page, neuralLink})},
              {app, paneId, workspaceId} = context,
              {popup}                    = await popOut({...context, itemId: ITEM});

        await popup.close();
        await expect.poll(() => returned(context), {message: 'the pane comes back to main', timeout: 10000})
            .toEqual(home);

        const undo     = page.getByRole('button', {name: /^Undo/}).first(),
              redo     = page.getByRole('button', {name: /^Redo/}).first(),
              reopened = page.waitForEvent('popup', {timeout: 30000});

        await expect(undo).toBeEnabled({timeout: 10000});
        await undo.click();

        const window = await reopened;

        await expect(window.locator(`#${paneId}`), 'Undo re-opens the pane in a popup').toBeVisible({timeout: 30000});

        await redo.click();
        await expect.poll(() => window.isClosed(), {message: 'Redo closes the re-opened popup', timeout: 15000}).toBe(true);
        await expect.poll(() => returned(context), {message: 'Redo returns the pane to main', timeout: 10000})
            .toEqual(home);

        const {dockModel} = await app.getComponent(workspaceId, ['dockModel']),
              nodeId      = Object.entries(dockModel.nodes)
                  .find(([, node]) => node.type === 'tabs' && node.items?.includes(ITEM))[0],
              pluginId    = (await app.callMethod(workspaceId, 'getPlugin', ['dock-maximize'])).id,
              maximized   = async () => (await app.getComponent(pluginId, ['maximizedNodeId'])).maximizedNodeId;

        let chrome = await app.callMethod(workspaceId, 'getTabChromeIdentity', [nodeId]);

        await page.locator(`#${chrome.buttons[ITEM]}`).click();

        let action;

        await expect.poll(async () => {
            chrome = await app.callMethod(workspaceId, 'getTabChromeIdentity', [nodeId]);
            action = chrome?.containerId && await app.callMethod(chrome.containerId, 'getAction', ['maximize']);

            return Boolean(action?.id && await page.locator(`#${action.id}`).isVisible())
        }, {message: 'maximize is reachable on the returned pane', timeout: 10000}).toBe(true);

        await page.locator(`#${action.id}`).click();
        await expect.poll(maximized, {message: 'the returned pane\'s node maximizes', timeout: 10000}).toBe(nodeId);
        await page.locator(`#${action.id}`).click();
        await expect.poll(maximized, {message: 'and restores', timeout: 10000}).toBeNull();

        // wall-clock-under-test: the App Worker reports an update in flight for 5 s as wedged
        // (VDomUpdate's watchdog); the workerErrors fixture fails the test on that report.
        await page.waitForTimeout(6000)
    })
});
