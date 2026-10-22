import {callWorkstationGesture} from '../utils/workstationGesture.mjs';
import {test, expect}           from '../../fixtures.mjs';

const
    plainPace      = {attempts: 180, dwellDelay: 600, moveDelay: 16, moveSteps: 4, showCursor: false},
    ordinaryScreen = {height: 1080, width: 1920};

/**
 * @summary Moving one tab from a multi-tab strip into an existing popup vessel retires the departing
 * tab's header button in the surviving source strip and activates the remaining tab's live pane.
 *
 * Existing cross-window dock coverage moved tabs out of single-tab strips (`right-bottom-tabs: ['commits']`,
 * `left-tabs: ['queues']`), which collapse out of `dockModel.nodes` when emptied. When a tab leaves a
 * multi-tab strip (`right-top-tabs: ['metrics', 'audit']`), the source strip survives with `['audit']`
 * and must retire the departing `'metrics'` tab header, remove any provisional vessel stand-in, and
 * display the remaining `'audit'` card without throwing an `inexact item set` projection error.
 */
test.describe('Workstation — transferring a tab from a multi-tab strip into a popup vessel retires its source header', () => {
    test.setTimeout(120000);
    test.use({colorScheme: 'dark', contextOptions: {screen: ordinaryScreen}, viewport: {height: 800, width: 1280}});

    /**
     * Boots the workstation and connects the Neural Link bridge, collecting page errors and warnings.
     * @param {Object} fixtures `{page, neuralLink}`
     * @returns {Promise<Object>} `{app, consoleWarnings, pageErrors, wsId}`
     */
    async function boot({page, neuralLink}) {
        const
            consoleWarnings = [],
            pageErrors      = [];

        page.on('console', msg => {
            if (msg.type() === 'warning' || msg.type() === 'error') {
                consoleWarnings.push(msg.text())
            }
        });
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

        return {app, consoleWarnings, pageErrors, wsId: workspaces[0].id}
    }

    /**
     * Tears one live pane out into its own vessel through the real pointer executor.
     * @returns {Promise<Object>} The vessel's Playwright page.
     */
    async function tearOut({app, page, wsId}, itemId, sourceNodeId) {
        const chrome = await app.callMethod(wsId, 'getTabChromeIdentity', [sourceNodeId]);

        if (!(await page.locator(`#${chrome.buttons[itemId]}`).isVisible())) {
            const activated = await app.executeDockOperation(wsId, {
                itemId,
                operation : 'setActiveItem',
                tabsNodeId: sourceNodeId
            });

            expect(activated.errors ?? []).toEqual([]);
            await expect(page.locator(`#${chrome.buttons[itemId]}`)).toBeVisible({timeout: 10000})
        }

        const
            popupPromise = page.waitForEvent('popup', {timeout: 90000}),
            result       = await callWorkstationGesture(app, wsId, 'executeTearOutStep', [{itemId, sourceNodeId}, {}]);

        expect(result.errors ?? [], JSON.stringify(result.proof ?? null)).toEqual([]);
        expect(result.applied, `the ${itemId} tear-out must apply`).toBe(true);

        return popupPromise
    }

    /**
     * Docks a live pane from a multi-tab strip into an existing vessel.
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

    test('moving metrics from right-top-tabs into the logs popup vessel retires Metrics from right-top-tabs and activates Audit', async ({page, neuralLink}) => {
        const context                                  = {page, ...await boot({page, neuralLink})},
              {app, consoleWarnings, pageErrors, wsId} = context;

        const {dockModel: initialModel} = await app.getComponent(wsId, ['dockModel']);

        expect(
            initialModel.nodes['right-top-tabs']?.items,
            'premise: right-top-tabs starts as a multi-tab strip so it survives after metrics departs'
        ).toEqual(['metrics', 'audit']);

        const vesselPage = await tearOut(context, 'logs', 'heavy-tabs');

        await dockInto(context, 'metrics', 'right-top-tabs', 'logs');

        const
            mainDoc      = await app.callMethod(wsId, 'getWorkspaceDocument', ['workstation-main']),
            vesselDoc    = await app.callMethod(wsId, 'getWorkspaceDocument', ['workstation-vessel:logs']),
            sourceChrome = await app.callMethod(wsId, 'getTabChromeIdentity', ['right-top-tabs']),
            auditPaneId  = await app.callMethod(wsId, 'getPaneIdentity', ['audit']);

        expect(mainDoc.nodes['right-top-tabs'], 'committed main document retains only audit in right-top-tabs').toMatchObject({
            activeItemId: 'audit',
            items       : ['audit'],
            type        : 'tabs'
        });

        expect(
            Object.values(vesselDoc.nodes).find(node => node.type === 'tabs'),
            'committed vessel document adopts metrics alongside logs'
        ).toMatchObject({
            activeItemId: 'metrics',
            items       : ['logs', 'metrics'],
            type        : 'tabs'
        });

        expect(
            Object.keys(sourceChrome.buttons),
            `the surviving source strip owns only the audit tab button (warnings=${JSON.stringify(consoleWarnings)}, chrome=${JSON.stringify(sourceChrome)})`
        ).toEqual(['audit']);
        expect(
            consoleWarnings.filter(msg => msg.includes('Dock projection failed')),
            'reconciling the surviving source strip must not fail with an inexact item set'
        ).toEqual([]);

        const
            headerButtons              = page.locator(`#${sourceChrome.containerId} .neo-tab-header-button`),
            standIns                   = page.locator(`#${sourceChrome.containerId} .neo-dashboard-dock-vessel-placeholder`),
            auditBox                   = await page.locator(`#${auditPaneId}`).boundingBox(),
            consistency                = await app.verifyComponentConsistency(sourceChrome.containerId),
            {provisionalVesselChromes} = await app.getComponent(wsId, ['provisionalVesselChromes']);

        await expect(headerButtons, 'only the Audit tab header remains in right-top-tabs').toHaveCount(1);
        await expect(headerButtons.first()).toContainText('Audit');
        await expect(standIns, 'no vessel stand-in remains in the surviving source strip').toHaveCount(0);

        expect(auditBox?.width,  'the remaining audit pane is visible with non-zero width').toBeGreaterThan(0);
        expect(auditBox?.height, 'the remaining audit pane is visible with non-zero height').toBeGreaterThan(0);
        expect(consistency.consistent, 'surviving source tab container items/vdom/DOM are consistent').toBe(true);
        expect(consistency.duplicateDomIds ?? [], 'no duplicate DOM ids in the surviving source tab container').toEqual([]);
        expect(provisionalVesselChromes, 'retired riding vessel leaves no provisional vessel chrome behind').toEqual({});

        await expect(vesselPage.locator('.neo-tab-header-button'), 'the popup vessel renders both Logs and Metrics tab headers').toHaveCount(2);
        expect(pageErrors).toEqual([])
    })
});
