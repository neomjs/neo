import {test, expect} from '../../fixtures.mjs';

const
    ITEM           = 'feed',
    MAIN           = 'workstation-main',
    VESSEL         = `workstation-vessel:${ITEM}`,
    phases         = ['documents-adopted', 'projections-settled', 'close-dispatched', 'close-acknowledged'],
    ordinaryScreen = {height: 1080, width: 1920};

/**
 * @summary A popup re-opened for its workspace closes once a stack return empties it.
 *
 * Undo re-opens a closed popup through `NativeVesselTransaction.embodyWorkspace`, the seam a restored
 * perspective uses too. That window holds no tear-out record, so its identity is the Group binding alone.
 * Emptied by a whole-stack transfer into main, it must close as a torn-out popup does, and the returned
 * pane must stay in main. The torn-out popup runs first as the control.
 */
test.describe('Workstation — a re-opened popup returns home and closes', () => {
    test.setTimeout(150000);
    test.use({colorScheme: 'dark', contextOptions: {screen: ordinaryScreen}, viewport: {height: 800, width: 1280}});

    /**
     * Boots the workstation and connects the Neural Link bridge, collecting page errors from every window.
     * @param {Object} fixtures `{page, neuralLink}`
     * @returns {Promise<Object>} `{app, page, pageErrors, paneId, wsId}`
     */
    async function boot({page, neuralLink}) {
        const pageErrors = [];

        page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
        page.on('popup', popup => popup.on('pageerror', error => pageErrors.push(`[popup] ${error?.message || error}`)));

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-tour-play',    {timeout: 30000});
        await page.waitForSelector('.neo-tab-overflow-control', {timeout: 30000});

        const
            app        = await neuralLink.connectToApp('Workstation'),
            found      = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
            workspaces = Array.isArray(found) ? found : found ? [found] : [];

        expect(workspaces, 'the connected page must own exactly one current Workspace').toHaveLength(1);

        const wsId = workspaces[0].id;

        return {app, page, pageErrors, paneId: await app.callMethod(wsId, 'getPaneIdentity', [ITEM]), wsId}
    }

    /**
     * Lists the participants whose document holds the item.
     */
    async function holdersOf(app, wsId) {
        const workspaces = await app.callMethod(wsId, 'getDockTopologyWorkspaces');

        return Object.entries(workspaces).filter(([, document]) => document?.items?.[ITEM]).map(([key]) => key).sort()
    }

    /**
     * Pops the item out through its header action.
     * @returns {Promise<Object>} The popup's Playwright page, its pane shown.
     */
    async function popOut({app, page, paneId, wsId}) {
        const
            workspaces = await app.callMethod(wsId, 'getDockTopologyWorkspaces'),
            nodeId     = Object.entries(workspaces[MAIN].nodes).find(([, node]) => node.type === 'tabs' && node.items?.includes(ITEM))[0],
            chrome     = await app.callMethod(wsId, 'getTabChromeIdentity', [nodeId]);

        await page.locator(`#${chrome.buttons[ITEM]}`).click();
        await expect(page.locator(`#${paneId}`)).toBeVisible({timeout: 10000});

        const action = await app.callMethod(chrome.containerId, 'getAction', ['pop-out']),
              opened = page.waitForEvent('popup', {timeout: 30000});

        await page.locator(`#${action?.id}`).click();

        const popup = await opened;

        await expect(popup.locator(`#${paneId}`)).toBeVisible({timeout: 30000});

        return popup
    }

    /**
     * Transfers the vessel's whole stack into main's first tabs node and asserts the settled, closed outcome.
     */
    async function expectStackTransferCloses({app, page, paneId, wsId}, popup) {
        expect(await holdersOf(app, wsId)).toEqual([VESSEL]);

        const
            topology = await app.callMethod(wsId, 'controller.getTopologyState'),
            vessel   = topology.snapshot.participants[VESSEL],
            target   = Object.entries(topology.snapshot.participants[MAIN].nodes).find(([, node]) => node.type === 'tabs')[0],
            nodeId   = vessel.nodes[vessel.root].zones.center.nodeId;

        expect(await app.callMethod(wsId, 'commitCrossWindowTransfer', [{
            sourceWorkspaceId: VESSEL, targetWorkspaceId: MAIN,
            descriptor       : {
                operation: 'transferNode', nodeId, sourceWorkspaceId: VESSEL, targetWorkspaceId: MAIN,
                target   : {targetNodeId: target, placement: {kind: 'tab-into'}}
            }
        }]), 'the whole stack transfers home').toBe(true);

        await expect.poll(() => popup.isClosed(), {
            message: 'the emptied popup must close after main adopts its stack',
            timeout: 15000
        }).toBe(true);

        const {lastCrossWindowTransfer: transfer} = await app.getComponent(wsId, ['lastCrossWindowTransfer']);

        expect(transfer.phases, 'the return passes every phase in order').toEqual(phases);
        expect(transfer.topologyExited, 'the popup left the topology').toBe(true);
        expect(await holdersOf(app, wsId), 'main alone owns the returned pane').toEqual([MAIN]);
        await expect(page.locator(`#${paneId}`)).toHaveCount(1)
    }

    test('control: a torn-out popup closes once its stack returns home', async ({page, neuralLink}) => {
        const context = await boot({page, neuralLink});

        await expectStackTransferCloses(context, await popOut(context));
        expect(context.pageErrors).toEqual([])
    });

    test('a popup re-opened by Undo closes once its stack returns home', async ({page, neuralLink, workerErrors}) => {
        // One known Undo-path render error, independent of this close path and captured as defect-note
        // a93f3f742aff4b33: the re-opened window's Sparklines registering before it joined a canvas group.
        // Named exactly, so any other worker error still fails the test.
        workerErrors.expect(/^App Worker: Error: CanvasGroups: window \S+ belongs to no canvas group(\n|$)/);

        const context = await boot({page, neuralLink}),
              popup   = await popOut(context);

        await popup.close({runBeforeUnload: true});
        await expect.poll(() => holdersOf(context.app, context.wsId), {message: 'closing the popup returns its pane'})
            .toEqual([MAIN]);
        await expect(page.locator(`#${context.paneId}`), 'main shows the returned pane before Undo').toBeVisible({timeout: 30000});

        const undo     = page.getByRole('button', {name: /^Undo/}).first(),
              reopened = page.waitForEvent('popup', {timeout: 30000});

        await expect(undo).toBeEnabled({timeout: 10000});
        await undo.click();

        const window = await reopened;

        await expect(window.locator(`#${context.paneId}`), 'the re-opened popup shows its pane').toBeVisible({timeout: 30000});

        // The closed popup's strip keeps its button while its projection waits for the remount; Undo must
        // retire it rather than pair the returning pane beside it, which shows two headers.
        const vessel = (await context.app.callMethod(context.wsId, 'controller.getTopologyState')).snapshot.participants[VESSEL];

        await expect(window.locator('.neo-tab-header-button'), 'one tab header per pane').toHaveCount(Object.keys(vessel.items).length);
        expect(await context.app.getConsoleLogs('warn', 'the repair attempt failed too'), 'no terminal projection failure').toEqual([]);
        await expectStackTransferCloses(context, window);
        expect(context.pageErrors).toEqual([])
    })
});
