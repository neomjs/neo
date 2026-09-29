import {test, expect, loadNeuralLinkModules} from '../../fixtures.mjs';

const {NeuralLink_ConnectionService} = await loadNeuralLinkModules();

/**
 * @summary Exercises opt-in close policies in an independent Dock host with real popup windows.
 * Physical close and reload drive the lifecycle; Neural Link reads document, pane and Group truth.
 * No app-specific return or replay implementation is loaded by this host.
 */
test.describe('Dock native workspace return (Neural Link)', () => {
    test.setTimeout(90000);
    test.use({viewport: {height: 800, width: 1100}});

    /** @summary Resolves the two live document owners and the Engine's Group history. */
    const boot = async (page, neuralLink, policy) => {
        await page.goto(`/test/playwright/component/apps/dock-native-return/?policy=${policy}`);
        await page.getByRole('button', {name: 'Open popup', exact: true}).waitFor();
        const app     = await neuralLink.connectToApp('Test.Playwright.DockNativeReturn'),
              records = await app.findInstances({className: 'Test.Playwright.DockNativeReturn.Workspace'},
                  ['id', 'workspaceKey', 'topologyGroupId']),
              root = records.find(record => record.properties.workspaceKey === 'landing-document'),
              popup = records.find(record => record.properties.workspaceKey === 'detached-document'),
              groupId = root.properties.topologyGroupId,
              read = async () => ({
                  root : (await app.getComponent(root.id, ['dockModel'])).dockModel,
                  popup: (await app.getComponent(popup.id, ['dockModel'])).dockModel
              }),
              history = () => NeuralLink_ConnectionService.call(app.sessionId, 'list_transactions', {groupId});

        expect(root.id).toBeTruthy();
        expect(popup.id).toBeTruthy();
        expect(groupId).toBeTruthy();
        expect(await app.callMethod(popup.id, 'nativeWindows.sources.has', [popup.id]),
            'the opt-in workspace has registered its engine native lifecycle source').toBe(true);
        expect(await history()).toMatchObject({groupId, cursor: -1, committed: [], redo: []});
        return {app, groupId, history, popupId: popup.id, read, rootId: root.id}
    };

    /** @summary Opens a physical popup through the host's ordinary command and waits for its render target. */
    const open = async (page, app, popupId) => {
        const pending = page.waitForEvent('popup');
        await page.getByRole('button', {name: 'Open popup', exact: true}).click();
        const popup = await pending;
        await popup.waitForSelector('.neo-dashboard-dock-tabs');
        await expect.poll(async () => (await app.getComponent(popupId, ['nativeRoute'])).nativeRoute?.nativeHandleKey,
            {message: 'the physical popup publishes its opener-minted native route'}).toBeTruthy();
        return popup
    };

    /** @summary Reads the actual ordinary pane instances, excluding their tab-header buttons. */
    const panes = async app => (await app.findInstances({className: 'Neo.component.Base'},
        ['id', 'dockItemId', 'windowId', 'isDestroyed']))
        .filter(record => ['alpha', 'beta'].includes(record.properties.dockItemId))
        .map(record => ({id: record.id, ...record.properties})).sort((left, right) => left.dockItemId.localeCompare(right.dockItemId));

    test('physical close returns all panes in one row; undo and redo reuse the semantic owner and pane instances',
        async ({page, neuralLink}) => {
            const {app, groupId, history, popupId, read, rootId} = await boot(page, neuralLink, 'return'),
                  popup                                          = await open(page, app, popupId),
                  before                                         = await read(),
                  beforePanes                                    = await panes(app),
                  rootWindowId                                   = (await app.getComponent(rootId, ['windowId'])).windowId;

            expect(beforePanes).toHaveLength(2);
            expect(before.popup.nodes['departure-tabs'].items).toEqual(['beta', 'alpha']);
            const originalBinding = await app.callMethod(popupId, 'workspaceSet.manager.getBinding', [groupId, 'secondary-slot']);
            await popup.reload();
            await popup.waitForSelector('.neo-dashboard-dock-tabs');
            await expect.poll(async () => (await app.callMethod(popupId, 'workspaceSet.manager.getBinding',
                [groupId, 'secondary-slot'])).generation).toBe(originalBinding.generation + 1);
            expect((await app.callMethod(popupId, 'workspaceSet.manager.getBinding',
                [groupId, 'secondary-slot'])).generationToken).toBe(originalBinding.generationToken);
            expect(await read()).toEqual(before);
            expect((await panes(app)).map(pane => pane.id)).toEqual(beforePanes.map(pane => pane.id));
            expect(await history()).toMatchObject({cursor: -1, committed: [], redo: []});
            const physicalClose = popup.waitForEvent('close');
            await popup.close({runBeforeUnload: true});
            await physicalClose;
            await expect.poll(async () => (await app.getComponent(popupId, ['lastReturnReceipt'])).lastReturnReceipt,
                {message: 'the shared return reports its semantic outcome', timeout: 10000}).toMatchObject({returned: true});
            await expect.poll(async () => Object.keys((await read()).popup.items),
                {message: 'a confirmed physical close returns the whole source catalog', timeout: 10000}).toEqual([]);
            await expect.poll(async () => (await read()).root.nodes['landing-tabs'].items).toEqual(['anchor', 'alpha', 'beta']);
            await expect.poll(async () => (await panes(app)).map(pane => pane.windowId)).toEqual([rootWindowId, rootWindowId]);
            expect((await panes(app)).map(pane => pane.id)).toEqual(beforePanes.map(pane => pane.id));

            const returned = await read(), committed = await history(), row = committed.committed[0];
            expect(committed).toMatchObject({groupId, cursor: 0});
            expect(committed.committed).toHaveLength(1);
            expect(row).toMatchObject({opCount: 2, labels: ['popup-close'], status: 'committed'});
            const archive = await NeuralLink_ConnectionService.call(app.sessionId, 'save_transaction', {groupId, txId: row.txId});
            expect(archive.saved).toBe(true);
            expect(archive.transaction.ops).toEqual([
                {workspaceKey: 'detached-document', before: before.popup, after: returned.popup, provenance: {origin: 'human'}},
                {workspaceKey: 'landing-document', before: before.root, after: returned.root, provenance: {origin: 'human'}}
            ]);
            expect((await app.getComponent(popupId, ['lastReturnReceipt'])).lastReturnReceipt.itemIds).toEqual(['alpha', 'beta']);

            const reopened = page.waitForEvent('popup');
            await page.getByRole('button', {name: 'Undo', exact: true}).click();
            const undoPopup = await reopened;
            await undoPopup.waitForSelector('.neo-dashboard-dock-tabs');
            await expect.poll(read).toEqual(before);
            await expect.poll(async () => (await app.getComponent(popupId, ['windowId'])).windowId).toBeTruthy();
            const undoWindowId = (await app.getComponent(popupId, ['windowId'])).windowId;
            await expect.poll(async () => (await panes(app)).map(pane => pane.windowId)).toEqual([undoWindowId, undoWindowId]);
            expect((await panes(app)).map(pane => pane.id)).toEqual(beforePanes.map(pane => pane.id));
            expect(await history()).toMatchObject({cursor: -1, committed: [], redo: [expect.objectContaining({txId: row.txId})]});

            const closed = undoPopup.waitForEvent('close');
            await page.getByRole('button', {name: 'Redo', exact: true}).click();
            await closed;
            await expect.poll(read).toEqual(returned);
            const redone = await history();
            expect(redone).toMatchObject({cursor: 0, redo: []});
            expect(redone.committed).toHaveLength(1);
            expect(redone.committed[0].txId).toBe(row.txId);
            expect((await panes(app)).map(pane => pane.id)).toEqual(beforePanes.map(pane => pane.id))
        });

    test('warm reload preserves identity and documents; retain parks the same owner without a history row',
        async ({page, neuralLink}) => {
            const {app, groupId, history, popupId, read} = await boot(page, neuralLink, 'retain'),
                  popup                                  = await open(page, app, popupId),
                  before                                 = await read(),
                  beforePanes                            = await panes(app),
                  beforeBinding                          = await app.callMethod(popupId, 'workspaceSet.manager.getBinding', [groupId, 'secondary-slot']);

            await popup.reload();
            await popup.waitForSelector('.neo-dashboard-dock-tabs');
            await expect.poll(async () => (await app.callMethod(popupId, 'workspaceSet.manager.getBinding',
                [groupId, 'secondary-slot'])).generation).toBe(beforeBinding.generation + 1);
            const afterBinding = await app.callMethod(popupId, 'workspaceSet.manager.getBinding', [groupId, 'secondary-slot']);
            expect(afterBinding.generationToken).toBe(beforeBinding.generationToken);
            expect(afterBinding.workspaceKey).toBe('secondary-slot');
            expect(await read()).toEqual(before);
            expect((await panes(app)).map(pane => pane.id)).toEqual(beforePanes.map(pane => pane.id));

            const physicalClose = popup.waitForEvent('close');
            await popup.close({runBeforeUnload: true});
            await physicalClose;
            await expect.poll(async () => (await app.getComponent(popupId, ['windowId'])).windowId).toBeNull();
            expect(await read()).toEqual(before);
            expect(await history()).toMatchObject({groupId, cursor: -1, committed: [], redo: []});
            expect((await panes(app)).map(pane => pane.id)).toEqual(beforePanes.map(pane => pane.id));
            expect(await app.callMethod(popupId, 'workspaceSet.ids')).toEqual(['landing-document', 'detached-document'])
        })
});
