import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'WorkstationWorkspaceTest'
    }
});

import {test, expect}           from '@playwright/test';
import Neo                      from '../../../../../src/Neo.mjs';
import * as core                from '../../../../../src/core/_export.mjs';
import DockProjectionReconciler from '../../../../../src/dashboard/DockProjectionReconciler.mjs';
import DockZoneModel            from '../../../../../src/dashboard/DockZoneModel.mjs';
import {previewToOperation}     from '../../../../../src/dashboard/dockPreviewContract.mjs';
import '../../../../../src/manager/Instance.mjs';
import FeedPane  from '../../../../../apps/workstation/view/FeedPane.mjs';
import ScalePane from '../../../../../apps/workstation/view/ScalePane.mjs';
import Workspace from '../../../../../apps/workstation/view/Workspace.mjs';

import {initialDocument} from '../../../../../apps/workstation/tour/denseWorkstation.mjs';

/**
 * @summary Captures object identities for every live logical tab surface in one Workstation shell.
 * @param {Workstation.view.Workspace} workspace
 * @returns {Map<String,Object>}
 */
const readTabChrome = workspace => {
    const
        shell        = workspace.getReference('dock-host').items[0],
        itemIdByPane = new Map(Object.entries(workspace.paneCache).map(([itemId, pane]) => [pane, itemId]));

    return new Map([...DockProjectionReconciler.collectProjectedTabs(shell)].map(([nodeId, tab]) => {
        const
            bar     = tab.getTabBar(),
            body    = tab.getCardContainer(),
            buttons = new Map(body.items.map((pane, index) => [itemIdByPane.get(pane), bar.items[index]]));

        return [nodeId, {
            bar,
            body,
            buttons,
            overflow: bar.getPlugin('tab-overflow'),
            strip   : tab.getTabStrip(),
            tab
        }]
    }))
};

/**
 * @summary Builds one committed bare-owner + incoming-pane vessel pair without render effects.
 * @param {Workstation.view.Workspace} workspace
 * @param {String} [ownerItemId='alerts']
 * @param {String} [incomingItemId='security']
 * @returns {Object}
 */
const stageCommittedVessel = (workspace, ownerItemId='alerts', incomingItemId='security') => {
    const
        workspaceId = Workspace.vesselWorkspaceId(ownerItemId),
        tabsNodeId  = Workspace.vesselTabsNodeId(ownerItemId),
        detached    = DockZoneModel.applyOperation(workspace.dockModel, {
            operation: 'detachItem',
            itemId   : ownerItemId
        });

    if (detached.errors.length) throw new Error(detached.errors.join('; '));

    workspace.dockModel = detached.document;

    const
        provisional = workspace.createVesselWorkspaceDocument(ownerItemId),
        incoming    = DockZoneModel.transferItem(detached.document, provisional, {
            itemId           : incomingItemId,
            sourceWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
            targetWorkspaceId: workspaceId,
            target           : {operation: 'addTab', tabsNodeId}
        }),
        owner       = DockZoneModel.transferItem(incoming.sourceDocument, incoming.targetDocument, {
            itemId           : ownerItemId,
            sourceWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
            targetWorkspaceId: workspaceId,
            target           : {operation: 'addTab', tabsNodeId, index: 0}
        });

    if (incoming.errors.length || owner.errors.length) {
        throw new Error([...incoming.errors, ...owner.errors].join('; '))
    }

    const state = {
        app                 : {mainView: {isDestroyed: false}},
        closeRequested      : false,
        committed           : true,
        disconnected        : false,
        document            : provisional,
        host                : null,
        itemId              : ownerItemId,
        participation       : null,
        participationPromise: null,
        preview             : null,
        reconciling         : false,
        windowId            : `window-${ownerItemId}`,
        workspaceId
    };

    workspace.vesselWorkspaces.set(workspaceId, state);
    workspace.workspaceSet.register(workspaceId, {
        getDocument: () => state.document,
        setDocument: document => state.document = document
    });

    if (!workspace.workspaceSet.adoptTransfer({
        sourceDocument   : owner.sourceDocument,
        sourceWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
        targetDocument   : owner.targetDocument,
        targetWorkspaceId: workspaceId
    })) {
        throw new Error('workspace-set refused fixture transfer')
    }

    return {state, tabsNodeId, workspaceId}
};

/**
 * @summary Pins the composition choices Workstation itself owns: one provider with two stores,
 * an exact 100k Turbo scale set, a growing capped feed, and stable pane/store identities
 * across a reducer-driven coarse projection. Primitive grid/Canvas stress remains in its
 * existing suites; the browser journey owns rendered continuity.
 */
test.describe.serial('Workstation.view.Workspace', () => {
    test('renderer-rich scale columns carry unique pooling keys', () => {
        const
            dataFields     = ScalePane.config.columns.map(column => column.dataField),
            feedEvent      = FeedPane.config.columns.find(column => column.dataField === 'name'),
            feedState      = FeedPane.config.columns.find(column => column.dataField === 'status'),
            feedSparkline  = FeedPane.config.columns.find(column => column.type === 'sparkline'),
            feedValue      = FeedPane.config.columns.find(column => column.dataField === 'value'),
            scaleSparkline = ScalePane.config.columns.find(column => column.type === 'sparkline');

        expect(new Set(dataFields).size).toBe(dataFields.length);
        expect(ScalePane.config.body.bufferRowRange * ScalePane.config.rowHeight)
            .toBeGreaterThanOrEqual(0.28 * 1440);
        expect(ScalePane.config.rowHeight).toBe(50);
        expect(FeedPane.config.rowHeight).toBe(50);
        expect(scaleSparkline).toMatchObject({width: 160});
        expect(scaleSparkline.flex).toBeUndefined();
        expect(feedSparkline).toMatchObject({width: 160});
        expect(feedSparkline.flex).toBeUndefined();
        expect(ScalePane.config.columnDefaults.cellAlign).toBe('left');
        expect(FeedPane.config.columnDefaults.cellAlign).toBe('left');
        expect(feedEvent).toMatchObject({flex: 2, minWidth: 280});
        expect(feedState).toMatchObject({flex: 1, minWidth: 140});
        expect(feedValue).toMatchObject({flex: 1, minWidth: 120});
        expect(initialDocument.nodes['split-main'].sizes).toEqual([0.6, 0.4])
    });

    test('provider-owned stores and cached data panes survive split + return', async () => {
        const workspace = Neo.create(Workspace, {});

        try {
            const
                provider       = workspace.getStateProvider(),
                scaleStore     = provider.getStore('scale'),
                feedStore      = provider.getStore('feed'),
                scalePane      = workspace.resolvePane('scale', initialDocument.items.scale),
                feedPane       = workspace.resolvePane('feed', initialDocument.items.feed),
                feedBefore     = feedStore.count,
                initialChrome  = readTabChrome(workspace),
                initialNodeIds = [...initialChrome.keys()],
                securityButton = initialChrome.get('heavy-tabs').buttons.get('security');

            expect(new Set(initialNodeIds)).toEqual(new Set([
                'scale-tabs', 'heavy-tabs', 'left-tabs',
                'right-top-tabs', 'right-bottom-tabs', 'bottom-tabs'
            ]));

            expect(scaleStore.className).toBe('Workstation.store.Scale');
            expect(feedStore.className).toBe('Workstation.store.Feed');
            expect(scaleStore.count).toBe(100000);
            expect(scaleStore.autoInitRecords).toBe(false);
            expect(scaleStore.items.slice(0, 20).every(record => record.trend
                .slice(1).every((value, index) => Math.abs(value - record.trend[index]) <= 4)),
                'synthetic Sparkline series stay bounded instead of wrapping across the full plot').toBe(true);
            expect(feedBefore).toBeGreaterThanOrEqual(25);

            workspace.appendFeedBatch(5);
            expect(feedStore.count).toBeGreaterThanOrEqual(feedBefore + 5);
            expect(feedStore.count).toBeLessThanOrEqual(feedStore.maxRecords);

            workspace.appendFeedBatch(600);
            expect(feedStore.count).toBe(feedStore.maxRecords);
            expect(feedStore.items[0].id)
                .toBe(`feed-${String(workspace.feedSequence).padStart(8, '0')}`);
            expect(feedStore.items.at(-1).id)
                .toBe(`feed-${String(workspace.feedSequence - feedStore.maxRecords + 1).padStart(8, '0')}`);
            expect(Workspace.FEED_BATCH_SIZE * 1000 / Workspace.FEED_INTERVAL_MS).toBe(10);

            let result = workspace.applyDockZoneOperation({
                operation   : 'splitNode',
                itemId      : 'security',
                targetNodeId: 'scale-tabs',
                orientation : 'vertical',
                edge        : 'bottom',
                sizes       : [0.72, 0.28]
            });

            expect(result.errors).toEqual([]);
            workspace.onDockZoneDocumentChange(result.document);
            await workspace.refreshPromise;

            const
                splitChrome   = readTabChrome(workspace),
                temporaryNode = splitChrome.get('tabs-security-0'),
                destroyCounts = new Map();

            expect(splitChrome.size).toBe(initialChrome.size + 1);
            expect(temporaryNode).toBeTruthy();
            expect(temporaryNode.buttons.get('security')).toBe(securityButton);
            expect(temporaryNode.body.items[0]).toBe(workspace.resolvePane('security', initialDocument.items.security));
            expect(splitChrome.get('heavy-tabs').bar.sortZoneConfig.dockItemIds)
                .toEqual(initialDocument.nodes['heavy-tabs'].items.filter(itemId => itemId !== 'security'));

            initialNodeIds.forEach(nodeId => {
                const
                    before = initialChrome.get(nodeId),
                    after  = splitChrome.get(nodeId);

                expect(after.tab, `${nodeId} keeps its tab.Container`).toBe(before.tab);
                expect(after.bar, `${nodeId} keeps its header toolbar`).toBe(before.bar);
                expect(after.body, `${nodeId} keeps its body container`).toBe(before.body);
                expect(after.strip, `${nodeId} keeps its indicator strip`).toBe(before.strip);
                expect(after.overflow, `${nodeId} keeps its Overflow plugin`).toBe(before.overflow);

                before.buttons.forEach((button, itemId) => {
                    itemId !== 'security'
                        && expect(after.buttons.get(itemId), `${itemId} keeps its tab button`).toBe(button)
                })
            });

            [
                temporaryNode.tab,
                temporaryNode.bar,
                temporaryNode.body,
                temporaryNode.strip,
                temporaryNode.overflow
            ].forEach(component => {
                const destroy = component.destroy.bind(component);

                destroyCounts.set(component, 0);
                component.destroy = (...args) => {
                    destroyCounts.set(component, destroyCounts.get(component) + 1);
                    return destroy(...args)
                }
            });

            result = workspace.applyDockZoneOperation({
                operation : 'addTab',
                itemId    : 'security',
                tabsNodeId: 'heavy-tabs'
            });

            expect(result.errors).toEqual([]);
            workspace.onDockZoneDocumentChange(result.document);
            await workspace.refreshPromise;

            const returnedChrome = readTabChrome(workspace);

            expect(returnedChrome.size).toBe(initialChrome.size);
            expect(returnedChrome.has('tabs-security-0')).toBe(false);
            expect(returnedChrome.get('heavy-tabs').buttons.get('security')).toBe(securityButton);
            expect(returnedChrome.get('heavy-tabs').bar.sortZoneConfig.dockItemIds)
                .toEqual(result.document.nodes['heavy-tabs'].items);
            expect(returnedChrome.get('heavy-tabs').tab.activeIndex)
                .toBe(result.document.nodes['heavy-tabs'].items.indexOf('security'));
            expect(securityButton.pressed).toBe(true);
            destroyCounts.forEach(count => expect(count).toBe(1));

            initialNodeIds.forEach(nodeId => {
                const
                    before = initialChrome.get(nodeId),
                    after  = returnedChrome.get(nodeId);

                expect(after.tab).toBe(before.tab);
                expect(after.bar).toBe(before.bar);
                expect(after.body).toBe(before.body);
                expect(after.strip).toBe(before.strip);
                expect(after.overflow).toBe(before.overflow);
                before.buttons.forEach((button, itemId) => {
                    expect(after.buttons.get(itemId), `${itemId} returns with its original tab button`).toBe(button)
                })
            });

            expect(workspace.resolvePane('scale', initialDocument.items.scale)).toBe(scalePane);
            expect(workspace.resolvePane('feed', initialDocument.items.feed)).toBe(feedPane);
            expect(scalePane.store).toBe(scaleStore);
            expect(feedPane.store).toBe(feedStore);
            expect(provider.getStore('scale')).toBe(scaleStore);
            expect(provider.getStore('feed')).toBe(feedStore);
            expect(scalePane.isDestroyed).toBeFalsy();
            expect(feedPane.isDestroyed).toBeFalsy()
        } finally {
            workspace.destroy()
        }
    });

    test('cross-window source projection publishes stable workspace identity and conversion ownership', () => {
        const
            originalWindowPosition = Neo.main.addon.WindowPosition,
            windowPosition         = originalWindowPosition ?? Neo.ns('Neo.main.addon.WindowPosition', true),
            originalSetConfigs     = windowPosition.setConfigs,
            resizeCalls            = [];
        let workspace;

        try {
            windowPosition.setConfigs = data => resizeCalls.push(data);
            workspace = Neo.create(Workspace, {});

            const chrome = readTabChrome(workspace);

            expect(resizeCalls).toEqual([{
                observeResize: true,
                windowId     : workspace.windowId
            }]);
            expect(workspace.workspaceSet.ids()).toEqual([Workspace.MAIN_WORKSPACE_ID]);
            expect(workspace.workspaceSet.getDocument(Workspace.MAIN_WORKSPACE_ID)).toBe(workspace.dockModel);

            chrome.forEach(({bar}, nodeId) => {
                expect(bar.sortZoneConfig, `${nodeId} joins the one cross-window source group`).toMatchObject({
                    dockWorkspaceId       : Workspace.MAIN_WORKSPACE_ID,
                    enableVesselConversion: true,
                    sortGroup             : Workspace.CROSS_WINDOW_SORT_GROUP
                })
            })
        } finally {
            workspace?.destroy();
            if (originalWindowPosition) {
                originalSetConfigs
                    ? windowPosition.setConfigs = originalSetConfigs
                    : delete windowPosition.setConfigs
            } else {
                delete Neo.main.addon.WindowPosition
            }
        }
    });

    test('a connected vessel stays unregistered until an accepted drop seeds document ownership', async () => {
        const
            workspace   = Neo.create(Workspace, {}),
            workspaceId = Workspace.vesselWorkspaceId('alerts'),
            classes     = [],
            destroyed   = [],
            preview     = {dockPreview: null, applyTargetGeometry() {}},
            mainView    = {
                id           : 'workstation-vessel-view',
                isDestroyed  : false,
                add          : () => preview,
                addCls       : cls => classes.push(cls),
                promiseUpdate: async () => {}
            };

        try {
            await workspace.crossWindowParticipationPromise;

            workspace.createCrossWindowParticipation = async data => ({
                ...data,
                destroy: () => destroyed.push(data.workspaceId)
            });
            workspace.tearOutPanes.alerts = {windowId: 'window-alerts'};

            const state = await workspace.registerVesselWorkspaceTarget({
                app     : {mainView},
                itemId  : 'alerts',
                windowId: 'window-alerts'
            });

            expect(state).toMatchObject({
                committed: false,
                document : null,
                itemId   : 'alerts',
                windowId : 'window-alerts',
                workspaceId
            });
            expect(workspaceId).toBe('workstation-vessel:alerts');
            expect(workspaceId).not.toContain('window-alerts');
            expect(classes).toEqual(['workstation-vessel-target']);
            expect(workspace.workspaceSet.ids()).toEqual([Workspace.MAIN_WORKSPACE_ID]);
            expect(workspace.crossWindowParticipations.get(workspaceId)).toBe(state.participation);

            const provisional = workspace.getWorkspaceDocument(workspaceId);

            expect(DockZoneModel.validate(provisional)).toEqual([]);
            expect(provisional.items).toEqual({});
            expect(provisional.nodes[Workspace.vesselTabsNodeId('alerts')]).toEqual({
                activeItemId: null,
                items       : [],
                type        : 'tabs'
            });
            expect(workspace.workspaceSet.ids()).toEqual([Workspace.MAIN_WORKSPACE_ID]);

            const
                WindowManager = Neo.manager.Window,
                originalGet   = WindowManager.get;

            try {
                WindowManager.get = () => ({innerRect: {width: 480, height: 320}});

                const edgePreview = workspace.renderCrossWindowPreview(workspaceId, {
                    draggedItem: {
                        dockItemId           : 'security',
                        dockSourceWorkspaceId: Workspace.MAIN_WORKSPACE_ID
                    },
                    localX      : 1,
                    localY      : 1,
                    sourceNodeId: 'heavy-tabs'
                });

                expect(previewToOperation(edgePreview)).toEqual({
                    operation : 'addTab',
                    itemId    : 'security',
                    index     : null,
                    tabsNodeId: Workspace.vesselTabsNodeId('alerts')
                })
            } finally {
                WindowManager.get = originalGet
            }

            workspace.clearCrossWindowPreview(workspaceId);

            expect(state.document).toBeNull();
            expect(preview.dockPreview).toBeNull();
            expect(destroyed).toEqual([])
        } finally {
            workspace.destroy()
        }
    });

    test('first dock adopts A+B once; whole-stack return projects main before a refused close', async () => {
        const
            workspace     = Neo.create(Workspace, {}),
            workspaceId   = Workspace.vesselWorkspaceId('alerts'),
            tabsNodeId    = Workspace.vesselTabsNodeId('alerts'),
            originalAdopt = workspace.workspaceSet.adoptTransfer,
            order         = [];

        try {
            await workspace.refreshPromise;

            const detached = DockZoneModel.applyOperation(workspace.dockModel, {
                operation: 'detachItem',
                itemId   : 'alerts'
            });

            expect(detached.errors).toEqual([]);
            workspace.dockModel = detached.document;

            const state = {
                app          : {mainView: {isDestroyed: false}},
                committed    : false,
                document     : workspace.createVesselWorkspaceDocument('alerts'),
                host         : null,
                itemId       : 'alerts',
                participation: null,
                preview      : null,
                windowId     : 'window-alerts',
                workspaceId
            };

            workspace.tearOutPanes.alerts = {windowId: 'window-alerts'};
            workspace.vesselWorkspaces.set(workspaceId, state);
            workspace.timeout = async () => {};
            workspace.mountVesselWorkspace = async id => {
                order.push(['project-target', id]);
                return true
            };
            workspace.refreshCrossWindowParticipation = async id => order.push(['participation', id]);
            workspace.refreshDockWorkspace = async () => {
                order.push(['project-main']);
                await workspace.refreshCrossWindowParticipation(Workspace.MAIN_WORKSPACE_ID)
            };
            workspace.retireReturnedVessel = async id => {
                order.push(['close-refused', id]);
                return false
            };

            const transferIncoming = () => DockZoneModel.transferItem(
                workspace.dockModel,
                state.document,
                {
                    itemId           : 'security',
                    sourceWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
                    targetWorkspaceId: workspaceId,
                    target           : {operation: 'addTab', tabsNodeId}
                }
            );
            let incoming = transferIncoming();

            expect(incoming.errors).toEqual([]);

            workspace.workspaceSet.adoptTransfer = () => false;

            expect(workspace.commitCrossWindowTransfer({
                descriptor: {
                    operation        : 'transferItem',
                    itemId           : 'security',
                    sourceWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
                    targetWorkspaceId: workspaceId,
                    target           : {operation: 'addTab', tabsNodeId}
                },
                sourceDocument   : incoming.sourceDocument,
                sourceWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
                targetDocument   : incoming.targetDocument,
                targetWorkspaceId: workspaceId
            })).toBe(false);
            expect(workspace.workspaceSet.has(workspaceId)).toBe(false);
            expect(state).toMatchObject({committed: false, document: null});
            expect(workspace.dockModel).toBe(detached.document);
            expect(order).toEqual([]);

            state.document = workspace.createVesselWorkspaceDocument('alerts');
            incoming = transferIncoming();
            let adoptionCount = 0;

            workspace.workspaceSet.adoptTransfer = data => {
                adoptionCount++;
                order.push(['adopt']);
                return originalAdopt(data)
            };

            expect(workspace.commitCrossWindowTransfer({
                descriptor: {
                    operation        : 'transferItem',
                    itemId           : 'security',
                    sourceWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
                    targetWorkspaceId: workspaceId,
                    target           : {operation: 'addTab', tabsNodeId}
                },
                sourceDocument   : incoming.sourceDocument,
                sourceWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
                targetDocument   : incoming.targetDocument,
                targetWorkspaceId: workspaceId
            })).toBe(true);

            expect(adoptionCount).toBe(1);
            expect(order).toEqual([['adopt']]);
            expect(state.committed).toBe(true);
            expect(workspace.workspaceSet.has(workspaceId)).toBe(true);
            expect(state.document.nodes[tabsNodeId].items).toEqual(['alerts', 'security']);
            expect(workspace.dockModel.items.alerts).toBeUndefined();
            expect(workspace.dockModel.items.security).toBeUndefined();
            expect(state.document.items.alerts).toEqual(initialDocument.items.alerts);
            expect(state.document.items.security).toEqual(initialDocument.items.security);

            await workspace.refreshPromise;

            expect(order).toEqual([
                ['adopt'],
                ['project-target', workspaceId],
                ['project-main'],
                ['participation', Workspace.MAIN_WORKSPACE_ID]
            ]);
            expect(workspace.lastCrossWindowTransfer).toMatchObject({
                applied          : true,
                reconciled       : true,
                sourceWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
                targetWorkspaceId: workspaceId
            });

            order.length = 0;

            const returnDescriptor = {
                    operation        : 'transferNode',
                    nodeId           : DockZoneModel.resolveStackRoot(state.document),
                    sourceWorkspaceId: workspaceId,
                    targetWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
                    target           : {
                        targetNodeId: 'heavy-tabs',
                        placement   : {kind: 'tab-into'}
                    }
                },
                returned = DockZoneModel.transferNode(
                    state.document,
                    workspace.dockModel,
                    returnDescriptor
                );

            expect(returned.errors).toEqual([]);
            expect(workspace.commitCrossWindowTransfer({
                descriptor       : returnDescriptor,
                sourceDocument   : returned.sourceDocument,
                sourceWorkspaceId: workspaceId,
                targetDocument   : returned.targetDocument,
                targetWorkspaceId: Workspace.MAIN_WORKSPACE_ID
            })).toBe(true);
            expect(adoptionCount).toBe(2);
            expect(order).toEqual([['adopt']]);
            expect(workspace.dockModel.items.alerts).toEqual(initialDocument.items.alerts);
            expect(workspace.dockModel.items.security).toEqual(initialDocument.items.security);
            expect(state.document.items).toEqual({});

            await workspace.refreshPromise;

            expect(order).toEqual([
                ['adopt'],
                ['project-main'],
                ['participation', Workspace.MAIN_WORKSPACE_ID],
                ['close-refused', workspaceId]
            ]);
            expect(state.committed).toBe(true);
            expect(workspace.workspaceSet.has(workspaceId)).toBe(true);
            expect(workspace.dockModel.items.alerts).toEqual(initialDocument.items.alerts);
            expect(workspace.dockModel.items.security).toEqual(initialDocument.items.security)
        } finally {
            workspace.workspaceSet.adoptTransfer = originalAdopt;
            workspace.destroy()
        }
    });

    test('unexpected vessel death atomically recovers the whole A+B stack', () => {
        const
            workspace              = Neo.create(Workspace, {}),
            {state, workspaceId}   = stageCommittedVessel(workspace),
            originalTearOut        = workspace.tearOutHandlers,
            originalPark           = workspace.vesselParkHandlers,
            originalDocumentChange = workspace.onDockZoneDocumentChange,
            projections            = [];

        try {
            workspace.tearOutPlacements.alerts = {index: 0, tabsNodeId: 'heavy-tabs'};
            workspace.tearOutPanes.alerts = {
                admissionToken: 7,
                generation    : 3,
                windowId      : 'window-alerts',
                windowName    : 'tearout-alerts'
            };
            workspace.tearOutHandlers = {onVesselRetired() {}};
            workspace.vesselParkHandlers = {onVesselRetired() {}};
            workspace.onDockZoneDocumentChange = (document, options) => {
                projections.push({document, options})
            };

            workspace.onWindowDisconnect({windowId: 'window-alerts'});

            expect(workspace.dockModel.items.alerts).toEqual(initialDocument.items.alerts);
            expect(workspace.dockModel.items.security).toEqual(initialDocument.items.security);
            expect(state.document.items).toEqual({});
            expect(workspace.vesselWorkspaces.has(workspaceId)).toBe(false);
            expect(workspace.workspaceSet.has(workspaceId)).toBe(false);
            expect(workspace.tearOutPanes.alerts).toBeUndefined();
            expect(workspace.tearOutPlacements.alerts).toBeUndefined();
            expect(workspace.lastCrossWindowTransfer).toMatchObject({
                applied              : true,
                recoveredOnDisconnect: true,
                sourceWorkspaceId    : workspaceId,
                targetWorkspaceId    : Workspace.MAIN_WORKSPACE_ID,
                topologyExited       : true
            });
            expect(projections).toHaveLength(1);
            expect(new Set(projections[0].options.preserveItemIds)).toEqual(new Set(['alerts', 'security']))
        } finally {
            workspace.tearOutHandlers        = originalTearOut;
            workspace.vesselParkHandlers     = originalPark;
            workspace.onDockZoneDocumentChange = originalDocumentChange;
            workspace.destroy()
        }
    });

    test('a refused disconnect recovery retains the only A+B truth as a headless workspace', () => {
        const
            workspace            = Neo.create(Workspace, {}),
            {state, workspaceId} = stageCommittedVessel(workspace),
            originalAdopt        = workspace.workspaceSet.adoptTransfer,
            originalTearOut      = workspace.tearOutHandlers,
            originalPark         = workspace.vesselParkHandlers;

        try {
            workspace.tearOutPlacements.alerts = {index: 0, tabsNodeId: 'heavy-tabs'};
            workspace.tearOutPanes.alerts = {
                admissionToken: 7,
                generation    : 3,
                windowId      : 'window-alerts',
                windowName    : 'tearout-alerts'
            };
            workspace.tearOutHandlers = {onVesselRetired() {}};
            workspace.vesselParkHandlers = {onVesselRetired() {}};
            workspace.workspaceSet.adoptTransfer = () => false;

            workspace.onWindowDisconnect({windowId: 'window-alerts'});

            expect(workspace.dockModel.items.alerts).toBeUndefined();
            expect(workspace.dockModel.items.security).toBeUndefined();
            expect(state.document.items.alerts).toEqual(initialDocument.items.alerts);
            expect(state.document.items.security).toEqual(initialDocument.items.security);
            expect(workspace.vesselWorkspaces.get(workspaceId)).toBe(state);
            expect(workspace.workspaceSet.has(workspaceId)).toBe(true);
            expect(state).toMatchObject({
                app         : null,
                disconnected: true,
                host        : null,
                preview     : null,
                windowId    : null
            });
            expect(workspace.tearOutPlacements.alerts).toEqual({index: 0, tabsNodeId: 'heavy-tabs'});
            expect(workspace.lastCrossWindowTransfer).toMatchObject({
                applied: false,
                errors : ['workspace-set refused disconnected-vessel recovery']
            })
        } finally {
            workspace.workspaceSet.adoptTransfer = originalAdopt;
            workspace.tearOutHandlers            = originalTearOut;
            workspace.vesselParkHandlers         = originalPark;
            workspace.destroy()
        }
    });

    test('close acknowledgement retains workspace truth until exact topology exit', async () => {
        const
            workspace              = Neo.create(Workspace, {}),
            {state, workspaceId}   = stageCommittedVessel(workspace),
            originalResolve        = workspace.resolveTearOutVessel,
            originalClose          = workspace.closeTearOutVessel,
            originalTearOut        = workspace.tearOutHandlers,
            originalPark           = workspace.vesselParkHandlers,
            participantRetirements = [];

        try {
            const
                descriptor = {
                    operation        : 'transferNode',
                    nodeId           : DockZoneModel.resolveStackRoot(state.document),
                    sourceWorkspaceId: workspaceId,
                    targetWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
                    target           : {
                        targetNodeId: 'heavy-tabs',
                        placement   : {kind: 'tab-into'}
                    }
                },
                returned = DockZoneModel.transferNode(state.document, workspace.dockModel, descriptor);

            expect(returned.errors).toEqual([]);
            expect(workspace.workspaceSet.adoptTransfer({
                sourceDocument   : returned.sourceDocument,
                sourceWorkspaceId: workspaceId,
                targetDocument   : returned.targetDocument,
                targetWorkspaceId: Workspace.MAIN_WORKSPACE_ID
            })).toBe(true);

            state.participation = {destroy: () => participantRetirements.push('destroy')};
            workspace.crossWindowParticipations.set(workspaceId, state.participation);
            workspace.tearOutPlacements.alerts = {index: 0, tabsNodeId: 'heavy-tabs'};
            workspace.tearOutPanes.alerts = {
                admissionToken: 7,
                generation    : 3,
                windowId      : 'window-alerts',
                windowName    : 'tearout-alerts'
            };
            workspace.lastCrossWindowTransfer = {
                applied          : true,
                closeRequested   : false,
                sourceWorkspaceId: workspaceId,
                targetWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
                topologyExited   : false
            };
            workspace.resolveTearOutVessel = () => ({windowId: 'window-alerts'});
            workspace.closeTearOutVessel   = async () => true;

            await expect(workspace.retireReturnedVessel(workspaceId)).resolves.toBe(true);

            expect(state.closeRequested).toBe(true);
            expect(workspace.vesselWorkspaces.get(workspaceId)).toBe(state);
            expect(workspace.workspaceSet.has(workspaceId)).toBe(true);
            expect(workspace.lastCrossWindowTransfer).toMatchObject({
                closeRequested: true,
                topologyExited: false
            });
            expect(participantRetirements).toEqual(['destroy']);

            workspace.tearOutHandlers = {onVesselRetired() {}};
            workspace.vesselParkHandlers = {onVesselRetired() {}};
            workspace.onWindowDisconnect({windowId: 'window-alerts'});

            expect(workspace.vesselWorkspaces.has(workspaceId)).toBe(false);
            expect(workspace.workspaceSet.has(workspaceId)).toBe(false);
            expect(workspace.lastCrossWindowTransfer.topologyExited).toBe(true);
            expect(participantRetirements).toEqual(['destroy'])
        } finally {
            workspace.resolveTearOutVessel  = originalResolve;
            workspace.closeTearOutVessel    = originalClose;
            workspace.tearOutHandlers       = originalTearOut;
            workspace.vesselParkHandlers    = originalPark;
            workspace.destroy()
        }
    });

    test('vessel projection retires its one-shot incoming target after paint', async () => {
        const
            workspace   = Neo.create(Workspace, {}),
            workspaceId = Workspace.vesselWorkspaceId('alerts'),
            provisional = workspace.createVesselWorkspaceDocument('alerts'),
            moved       = DockZoneModel.transferItem(workspace.dockModel, provisional, {
                itemId           : 'alerts',
                sourceWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
                targetWorkspaceId: workspaceId,
                target           : {operation: 'addTab', tabsNodeId: Workspace.vesselTabsNodeId('alerts')}
            }),
            order       = [],
            preview     = {parent: {remove: () => order.push('preview-parked')}},
            host        = {
                isDestroyed  : false,
                promiseUpdate: async () => order.push('paint')
            },
            mainView    = {
                isDestroyed: false,
                add        : () => {
                    order.push('projection-created');
                    return host
                }
            },
            participation = {destroy: () => order.push('target-retired')};

        try {
            expect(moved.errors).toEqual([]);

            workspace.vesselWorkspaces.set(workspaceId, {
                app      : {mainView},
                committed: true,
                document : moved.targetDocument,
                host     : null,
                itemId   : 'alerts',
                participation,
                preview,
                windowId : 'window-alerts',
                workspaceId
            });
            workspace.crossWindowParticipations.set(workspaceId, participation);

            await expect(workspace.mountVesselWorkspace(workspaceId)).resolves.toBe(true);
            expect(order).toEqual([
                'preview-parked',
                'projection-created',
                'paint',
                'target-retired'
            ]);
            expect(workspace.crossWindowParticipations.has(workspaceId)).toBe(false);
            expect(workspace.vesselWorkspaces.get(workspaceId).participation).toBeNull()
        } finally {
            workspace.destroy()
        }
    });

    test('cross-window hit-testing follows live manager.Window dimensions', async () => {
        const
            workspace   = Neo.create(Workspace, {}),
            workspaceId = Workspace.vesselWorkspaceId('alerts');

        try {
            await workspace.crossWindowParticipationPromise;
            workspace.tearOutPanes.alerts = {windowId: 'window-alerts'};
            workspace.vesselWorkspaces.set(workspaceId, {
                itemId  : 'alerts',
                windowId: 'window-alerts'
            });

            const
                WindowManager = Neo.manager.Window,
                originalGet   = WindowManager.get;
            let innerRect = {width: 320, height: 240};

            try {
                WindowManager.get = () => ({innerRect});

                expect(workspace.hitTestCrossWindowTarget(
                    workspaceId,
                    300,
                    200
                )).toBe(true);

                innerRect = {width: 240, height: 160};

                expect(workspace.hitTestCrossWindowTarget(
                    workspaceId,
                    300,
                    200
                )).toBe(false)
            } finally {
                WindowManager.get = originalGet
            }
        } finally {
            workspace.destroy()
        }
    });

    test('physical vessel death clears both tear-out and park lifecycle owners', () => {
        const
            workspace       = Neo.create(Workspace, {}),
            originalTearOut = workspace.tearOutHandlers,
            originalPark    = workspace.vesselParkHandlers,
            calls           = [];

        try {
            workspace.tearOutConnects.alerts = {
                admissionToken: 7,
                generation    : 3,
                windowId      : 'tear-child'
            };
            workspace.tearOutHandlers = {
                onVesselRetired: data => calls.push(['tear-out', data])
            };
            workspace.vesselParkHandlers = {
                onVesselRetired: data => calls.push(['park', data])
            };

            workspace.onWindowDisconnect({windowId: 'tear-child'});

            expect(workspace.tearOutConnects.alerts).toBeUndefined();
            expect(calls).toEqual([
                ['tear-out', {
                    admissionToken: 7,
                    generation    : 3,
                    itemId        : 'alerts',
                    windowName    : 'tearout-alerts'
                }],
                ['park', {itemId: 'alerts', retirement: true}]
            ])
        } finally {
            workspace.tearOutHandlers  = originalTearOut;
            workspace.vesselParkHandlers = originalPark;
            workspace.destroy()
        }
    });

    test('a successor tear-out retries retained retirement before opening a fresh vessel', async () => {
        const
            workspace       = Neo.create(Workspace, {}),
            originalTearOut = workspace.tearOutHandlers,
            originalPark    = workspace.vesselParkHandlers,
            active          = {itemId: 'alerts', windowName: 'tearout-alerts'},
            calls           = [];
        let admitRetirement = true;

        workspace.tearOutHandlers = {
            activeVessel     : active,
            onDockTearOutExit: async data => {
                calls.push(['exit', data]);
                return true
            },
            retireActiveVessel: async data => {
                calls.push(['retire', data]);
                return admitRetirement
            }
        };
        workspace.vesselParkHandlers = {
            onVesselRetired: data => calls.push(['park-retired', data])
        };

        const data = {sortZone: {endWindowDrag: () => calls.push('end')}};

        try {
            await expect(workspace.onDockTearOutExit(data)).resolves.toBe(true);
            expect(calls).toEqual([
                ['retire', active],
                ['park-retired', {itemId: 'alerts', retirement: true}],
                ['exit', data]
            ]);

            calls.length    = 0;
            admitRetirement = false;

            await expect(workspace.onDockTearOutExit(data)).resolves.toBe(false);
            expect(calls).toEqual([
                ['retire', active],
                'end'
            ])
        } finally {
            workspace.tearOutHandlers  = originalTearOut;
            workspace.vesselParkHandlers = originalPark;
            workspace.destroy()
        }
    });

    test('previewLanguage maps to the dock-host modifier: initial, live swap, null reset, open values', () => {
        const workspace = Neo.create(Workspace, {previewLanguage: 'signal'});

        try {
            const host = workspace.getReference('dock-host');

            // initial value: the reactive afterSet fires before the host exists during
            // construction — the construct-time re-apply converges both orders
            expect(host.cls.includes('neo-preview-lang-signal')).toBe(true);

            // live swap: the old modifier leaves, the new one lands — one language at a time
            workspace.previewLanguage = 'blueprint';
            expect(host.cls.includes('neo-preview-lang-signal')).toBe(false);
            expect(host.cls.includes('neo-preview-lang-blueprint')).toBe(true);

            // null reset: back to the default affordance family — no modifier remains
            workspace.previewLanguage = null;
            expect(host.cls.includes('neo-preview-lang-blueprint')).toBe(false);
            expect(host.cls.some(cls => cls.startsWith('neo-preview-lang-'))).toBe(false);

            // the selector is open by design: any candidate name maps to its modifier —
            // unknown values are inert cls tokens, never errors (skin variants opt in via CSS)
            workspace.previewLanguage = 'solid';
            expect(host.cls.includes('neo-preview-lang-solid')).toBe(true)
        } finally {
            workspace.destroy()
        }
    })
});
