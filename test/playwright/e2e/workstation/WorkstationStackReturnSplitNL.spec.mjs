import {callWorkstationGesture} from '../utils/workstationGesture.mjs';
import {test, expect}           from '../../fixtures.mjs';

const
    MAIN           = 'workstation-main',
    phases         = ['documents-adopted', 'projections-settled', 'close-dispatched', 'close-acknowledged'],
    plainPace      = {attempts: 180, dwellDelay: 600, moveDelay: 16, moveSteps: 4, showCursor: false},
    ordinaryScreen = {height: 1080, width: 1920};

/**
 * @summary A vessel's stack returns home into a tabs node inside a split, and the return settles.
 *
 * The whole-stack return commits `transferNode`, which main projects on the in-place path. That path
 * must settle when the home tabs node sits in a split, or the emptied vessel stays open and main stops
 * projecting every later commit. FiveBeat scene 4 does not reach this case: its staging collapses
 * `right-bottom-tabs`. Each case asserts its premise first, that the home node is a split child, so a
 * changed default layout cannot turn it into a pass that witnesses nothing.
 */
test.describe('Workstation — a stack returned into a split settles', () => {
    test.setTimeout(120000);
    test.use({colorScheme: 'dark', contextOptions: {screen: ordinaryScreen}, viewport: {height: 800, width: 1280}});

    /**
     * Boots the workstation and connects the Neural Link bridge, collecting page errors from every window.
     * @param {Object} fixtures `{page, neuralLink}`
     * @returns {Promise<Object>} `{app, pageErrors, wsId}`
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

        return {app, pageErrors, wsId: workspaces[0].id}
    }

    /**
     * Tears one live pane out into its own vessel through the real pointer executor.
     * @returns {Promise<Object>} The vessel's Playwright page.
     */
    async function tearOut({app, page, wsId}, itemId, sourceNodeId) {
        const
            popupPromise = page.waitForEvent('popup', {timeout: 90000}),
            result       = await callWorkstationGesture(app, wsId, 'executeTearOutStep', [{itemId, sourceNodeId}, {}]);

        expect(result.errors ?? [], JSON.stringify(result.proof ?? null)).toEqual([]);
        expect(result.applied, `the ${itemId} tear-out must apply`).toBe(true);

        return popupPromise
    }

    /**
     * Docks a second live pane into an existing vessel, so the vessel holds a two-item stack.
     */
    async function dockInto({app, page, wsId}, itemId, sourceNodeId, targetItemId) {
        let sourcePopup = null;

        const onPopup = popup => sourcePopup = popup;

        page.on('popup', onPopup);

        try {
            const result = await callWorkstationGesture(app, wsId, 'executeCrossWindowDockStep', [
                {itemId, sourceNodeId, targetItemId}, plainPace
            ]);

            expect(result.errors ?? [], JSON.stringify(result.proof ?? null)).toEqual([]);
            expect(result.applied, `${itemId} must dock into the ${targetItemId} vessel`).toBe(true);

            sourcePopup && await expect.poll(() => sourcePopup.isClosed(), {timeout: 15000}).toBe(true)
        } finally {
            page.off('popup', onPopup)
        }
    }

    /**
     * Asserts the premise: the tabs node the stack will return to is a child of a split in main.
     */
    async function expectSplitHeldHome(app, wsId, nodeId) {
        const {dockModel} = await app.getComponent(wsId, ['dockModel']);

        expect(dockModel.nodes[nodeId]?.type, `${nodeId} must be a tabs node in main`).toBe('tabs');
        expect(
            Object.values(dockModel.nodes).some(node => node.type === 'split' && node.children?.includes(nodeId)),
            `${nodeId} must sit inside a split, or this case witnesses nothing`
        ).toBe(true)
    }

    /**
     * Returns the vessel's whole stack into `homeNodeId` and asserts the settled, closed outcome.
     */
    async function expectStackReturnSettles({app, wsId}, vessel, ownerItemId, itemIds, homeNodeId) {
        await expectSplitHeldHome(app, wsId, homeNodeId);

        const result = await callWorkstationGesture(app, wsId, 'executeStackReturnStep', [
            {ownerItemId}, {attempts: plainPace.attempts, moveDelay: plainPace.moveDelay, showCursor: false}
        ]);

        expect(result.errors, JSON.stringify(result.proof?.transfer ?? null)).toEqual([]);
        expect(result.proof.remoteSnapshot.preview.target.nodeId, 'the stack returns into the asserted home').toBe(homeNodeId);
        expect(result.applied, 'the whole stack must come home').toBe(true);
        expect(result.proof.phaseOrder, 'the return passes every phase in order').toEqual(phases);
        expect(result.proof.sourceItemIds).toEqual(itemIds);

        await expect.poll(() => vessel.isClosed(), {
            message: 'the emptied vessel must close after main adopts its stack',
            timeout: 15000
        }).toBe(true);

        const {dockModel} = await app.getComponent(wsId, ['dockModel']);

        expect(dockModel.nodes[homeNodeId].items, 'main lists the returned panes in their home node')
            .toEqual(expect.arrayContaining(itemIds))
    }

    test('a single pane returns into right-top-tabs, beside right-bottom-tabs', async ({page, neuralLink}) => {
        const context = {page, ...await boot({page, neuralLink})},
              vessel  = await tearOut(context, 'metrics', 'right-top-tabs');

        await expectStackReturnSettles(context, vessel, 'metrics', ['metrics'], 'right-top-tabs');

        expect(context.pageErrors).toEqual([])
    });

    test('a single pane returns into scale-tabs, beside heavy-tabs', async ({page, neuralLink}) => {
        const context = {page, ...await boot({page, neuralLink})},
              vessel  = await tearOut(context, 'commits', 'right-bottom-tabs');

        // `right-bottom-tabs` held only `commits` and collapsed, so the executor aims at main's first tabs node.
        await expectStackReturnSettles(context, vessel, 'commits', ['commits'], 'scale-tabs');

        expect(context.pageErrors).toEqual([])
    });

    test('a two-pane stack returns into right-top-tabs with its split intact', async ({page, neuralLink}) => {
        const context = {page, ...await boot({page, neuralLink})},
              vessel  = await tearOut(context, 'metrics', 'right-top-tabs');

        await dockInto(context, 'queues', 'left-tabs', 'metrics');
        await expectStackReturnSettles(context, vessel, 'metrics', ['metrics', 'queues'], 'right-top-tabs');

        expect(context.pageErrors).toEqual([])
    })
});
