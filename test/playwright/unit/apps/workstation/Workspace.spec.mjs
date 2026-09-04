import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'WorkstationWorkspaceTest'
    }
});

import {test, expect}           from '@playwright/test';
import Neo                      from '../../../../../src/Neo.mjs';
import * as core                from '../../../../../src/core/_export.mjs';
import DockProjectionReconciler from '../../../../../src/dashboard/dock/projection/Reconciler.mjs';
import Document                 from '../../../../../src/dashboard/dock/model/Document.mjs';
import Operations               from '../../../../../src/dashboard/dock/model/Operations.mjs';
import {previewToOperation}     from '../../../../../src/dashboard/dock/model/PreviewContract.mjs';
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
        detached    = Operations.applyOperation(workspace.dockModel, {
            operation: 'detachItem',
            itemId   : ownerItemId
        });

    if (detached.errors.length) throw new Error(detached.errors.join('; '));

    workspace.dockModel = detached.document;

    const
        provisional = workspace.createVesselWorkspaceDocument(ownerItemId),
        incoming    = Operations.transferItem(detached.document, provisional, {
            itemId           : incomingItemId,
            sourceWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
            targetWorkspaceId: workspaceId,
            target           : {operation: 'addTab', tabsNodeId}
        }),
        owner       = Operations.transferItem(incoming.sourceDocument, incoming.targetDocument, {
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

    test('film cursor retirement awaits physical body-node removal before settling', async () => {
        const
            realApplyDeltas = Neo.applyDeltas,
            workspace       = Neo.create(Workspace, {}),
            calls           = [],
            cursorDot       = {
                isDestroyed: false,
                vdom       : {id: 'film-cursor-1'},
                windowId   : 'source-window',
                destroy() {
                    calls.push({type: 'destroy'});
                    this.isDestroyed = true
                }
            };
        let resolveRemoval;

        try {
            const removalReceipt = new Promise(resolve => resolveRemoval = resolve);

            Neo.applyDeltas = (windowId, deltas) => {
                calls.push({deltas, type: 'remove-dispatched', windowId});
                return removalReceipt
            };

            let   settled    = false;
            const retirement = workspace.retireFilmCursorDot(cursorDot)
                .then(value => {
                    settled = true;
                    return value
                });

            await Promise.resolve();

            expect(calls).toEqual([{
                deltas  : {action: 'removeNode', id: 'film-cursor-1'},
                type    : 'remove-dispatched',
                windowId: 'source-window'
            }, {
                type: 'destroy'
            }]);
            expect(settled, 'replacement creation must stay behind the physical removal receipt').toBe(false);

            resolveRemoval();

            await expect(retirement).resolves.toBe(true);
            await expect(workspace.retireFilmCursorDot(cursorDot)).resolves.toBe(false);
            expect(calls).toHaveLength(2)
        } finally {
            Neo.applyDeltas = realApplyDeltas;
            workspace.destroy()
        }
    });

    test('non-film mode keeps all six cursor retirement boundaries side-effect free', async () => {
        const
            realApplyDeltas = Neo.applyDeltas,
            workspace       = Neo.create(Workspace, {}),
            deltaCalls      = [];

        try {
            Neo.applyDeltas = (...args) => {
                deltaCalls.push(args);
                return Promise.resolve()
            };

            const results = [];

            for (let boundary = 0; boundary < 6; boundary++) {
                results.push(await workspace.retireFilmCursorDot(null))
            }

            expect(results).toEqual([false, false, false, false, false, false]);
            expect(deltaCalls, 'showCursor=false must not dispatch a physical mutation').toEqual([])
        } finally {
            Neo.applyDeltas = realApplyDeltas;
            workspace.destroy()
        }
    });

    test('startTour preserves the structured receipt when host refresh settlement rejects', async () => {
        const
            feedStore = {count: 25, maxRecords: 500},
            failure   = new Error('projection vanished'),
            captions  = [];

        let host;

        host = {
            cueErrors           : [],
            cuePromise          : Promise.resolve(),
            cueReceipts         : [],
            cueSettlements      : new Map(),
            dockModel           : null,
            feedBatchCount      : 7,
            lastTourReceipt     : null,
            progressPromise     : Promise.resolve(),
            refreshPromise      : Promise.resolve(),
            getStateProvider    : () => ({getStore: () => feedStore}),
            refreshDockWorkspace: async () => {},
            setPipProgress      : async () => {},
            setTourCaption      : value => captions.push(value),
            tourRunner          : {
                running: false,
                async start() {
                    host.refreshPromise = Promise.reject(failure);

                    return {
                        completed: false,
                        errors   : ['scene[0] host step settlement failed: projection vanished'],
                        log      : [{sceneIndex: 0, stepIndex: 0, type: 'op'}]
                    }
                }
            }
        };

        const receipt = await Workspace.prototype.startTour.call(host);

        expect(receipt).toBe(host.lastTourReceipt);
        expect(receipt.completed).toBe(false);
        expect(receipt.errors).toEqual([
            'scene[0] host step settlement failed: projection vanished'
        ]);
        expect(captions.at(-1)).toContain('Tour stopped')
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

            const
                chrome            = readTabChrome(workspace),
                targetWorkspaceId = Workspace.vesselWorkspaceId('alerts');

            workspace.vesselWorkspaces.set(targetWorkspaceId, {windowId: 'window-alerts'});
            chrome.get('right-top-tabs').tab.fire('dockVesselConversionIn', {
                itemId  : 'audit',
                record  : {sourceRect: null},
                targetId: targetWorkspaceId
            });

            // Movement observation rides the same call: the main render target's poll is owned by
            // config, so a titlebar grabbed from outside page content still publishes.
            expect(resizeCalls).toEqual([{
                observeMovement: true,
                observeResize  : true,
                windowId       : workspace.windowId
            }]);
            expect(workspace.workspaceSet.ids()).toEqual([Workspace.MAIN_WORKSPACE_ID]);
            expect(workspace.workspaceSet.getDocument(Workspace.MAIN_WORKSPACE_ID)).toBe(workspace.dockModel);
            expect(workspace.vesselConversionTargetWindowId).toBe('window-alerts');

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

    test('target-proxy staging uses the physical parked popup instead of the source sort-zone window', async () => {
        const
            workspace       = Neo.create(Workspace, {}),
            originalProxy   = workspace.vesselProxyEmbodiment,
            settledPayloads = [],
            stagedPayloads  = [];
        let participation;

        try {
            workspace.tearOutConnects.audit = {windowId: 'parked-audit-popup'};
            workspace.vesselWorkspaces.set('proxy-target-workspace', {
                preview: {
                    dockPreview: {itemId: 'audit'},
                    promiseUpdate() {
                        settledPayloads.push('preview-rendered')
                    }
                }
            });
            workspace.vesselProxyEmbodiment = {
                move: data => {
                    stagedPayloads.push(data);
                    return true
                },
                promote: () => true,
                restore: () => true,
                whenSettled(data) {
                    settledPayloads.push(data);
                    return true
                }
            };

            participation = await workspace.createCrossWindowParticipation({
                windowId   : 'proxy-target-window',
                workspaceId: 'proxy-target-workspace'
            });

            const payload = {
                draggedItem   : {dockItemId: 'audit'},
                proxyRect     : {height: 80, width: 160, x: 20, y: 30},
                sourceSortZone: {windowId: workspace.windowId}
            };

            expect(participation.target.stageDragEmbodiment(payload)).toBe(true);
            expect(stagedPayloads).toEqual([{
                ...payload,
                sourceWindowId: 'parked-audit-popup',
                targetWindowId: 'proxy-target-window'
            }]);
            await expect(participation.target.awaitDragEmbodiment(payload)).resolves.toBe(true);
            expect(settledPayloads).toEqual([{
                itemId        : 'audit',
                sourceWindowId: 'parked-audit-popup',
                targetWindowId: 'proxy-target-window'
            }, 'preview-rendered'])
        } finally {
            participation?.destroy();
            workspace.vesselProxyEmbodiment = originalProxy;
            workspace.destroy()
        }
    });

    test('large-over-small park uses both live extents and restores the same exact popup', async () => {
        const
            workspace          = Neo.create(Workspace, {}),
            originalDragDrop   = Neo.main.addon.DragDrop,
            originalFocus      = Neo.Main.windowNativeFocus,
            originalManagerGet = Neo.manager.Window.get,
            focusCalls         = [],
            parkCalls          = [],
            resumeCalls        = [];

        const
            sourceRoute = {
                capabilities   : {close: true, focus: true, position: true, resize: true},
                nativeHandleKey: 'handle-source',
                ownerWindowId  : workspace.windowId,
                targetWindowId : 'source-window'
            },
            targetRoute = {
                capabilities   : {close: true, focus: true, position: true, resize: true},
                nativeHandleKey: 'handle-target',
                ownerWindowId  : workspace.windowId,
                targetWindowId : 'target-window'
            },
            // Real-chrome shapes: each window's viewport sits below its frame by the published chrome.
            // The park lands the source FRAME on the target's frame origin; a re-show takes the
            // source's own chrome off the content rect it is handed.
            records = new Map([
                ['source-window', {
                    chrome     : {bottom: 0, left: 0, right: 0, top: 67},
                    innerRect  : {height: 479, width: 640, x: 40, y: 127},
                    nativeRoute: sourceRoute,
                    outerRect  : {height: 546, width: 640, x: 40, y: 60}
                }],
                ['target-window', {
                    chrome     : {bottom: 0, left: 0, right: 0, top: 67},
                    innerRect  : {height: 260, width: 360, x: 800, y: 187},
                    nativeRoute: targetRoute,
                    outerRect  : {height: 327, width: 360, x: 800, y: 120}
                }]
            ]);

        workspace.tearOutConnects.audit = {
            nativeRoute: sourceRoute,
            windowId   : 'source-window',
            windowName : 'tearout-audit'
        };
        workspace.vesselConversionTargetWindowId = 'target-window';
        Neo.manager.Window.get = id => records.get(id) ?? null;
        Neo.Main.windowNativeFocus = async data => {
            focusCalls.push(data);
            return true
        };
        Neo.main.addon.DragDrop = {
            parkWindowDrag: async data => {
                parkCalls.push(data);
                return true
            },
            resumeWindowDrag: async data => {
                resumeCalls.push(data);
                return true
            }
        };

        try {
            await expect(workspace.parkTearOutVessel({
                itemId: 'audit', windowName: 'tearout-audit'
            })).resolves.toBe(true);
            expect(focusCalls).toEqual([
                {
                    nativeHandleKey: 'handle-target',
                    targetWindowId : 'target-window',
                    windowId       : workspace.windowId
                },
                {
                    nativeHandleKey: 'handle-target',
                    targetWindowId : 'target-window',
                    windowId       : workspace.windowId
                }
            ]);
            expect(parkCalls).toEqual([{
                nativeHandleKey: 'handle-source',
                parkSize       : {height: 260, width: 360},
                restoreRect    : {height: 546, width: 640, x: 40, y: 60},
                targetWindowId : 'source-window',
                windowId       : workspace.windowId,
                windowName     : 'tearout-audit',
                x              : 800,
                y              : 120
            }]);
            expect(workspace.tearOutParkGeometries.audit).toEqual({
                park   : {height: 260, width: 360, x: 800, y: 120},
                restore: {height: 546, width: 640, x: 40, y: 60}
            });
            expect(workspace.lastVesselParkReceipt).toMatchObject({
                needsResize: true,
                parked     : true,
                parkSize   : {height: 260, width: 360}
            });

            await expect(workspace.reshowTearOutVessel({
                itemId    : 'audit',
                rect      : {height: 120, width: 200, x: 420, y: 240},
                windowName: 'tearout-audit'
            })).resolves.toBe(true);
            // the content re-shows at (420, 240): the frame goes 67 px higher, under the title bar
            expect(resumeCalls).toEqual([{
                nativeHandleKey: 'handle-source',
                targetWindowId : 'source-window',
                windowId       : workspace.windowId,
                windowName     : 'tearout-audit',
                x              : 420,
                y              : 173
            }]);
            expect(workspace.lastVesselRestoreReceipt).toMatchObject({
                frame: {x: 420, y: 173},
                rect : {height: 120, width: 200, x: 420, y: 240}
            });
            expect(workspace.tearOutParkGeometries.audit).toBeUndefined();

            sourceRoute.capabilities.resize = false;

            await expect(workspace.parkTearOutVessel({
                itemId: 'audit', windowName: 'tearout-audit'
            })).resolves.toBe(false);
            expect(focusCalls).toHaveLength(2);
            expect(parkCalls).toHaveLength(1);
            expect(workspace.lastVesselParkReceipt).toMatchObject({
                authority: {sourceResizeCapable: false},
                reason   : 'native route or live cover geometry refused'
            })
        } finally {
            Neo.main.addon.DragDrop  = originalDragDrop;
            Neo.Main.windowNativeFocus = originalFocus;
            Neo.manager.Window.get   = originalManagerGet;
            workspace.destroy()
        }
    });

    test('terminal restore compensates safely until exact extent and position both succeed', async () => {
        let
            moveAdmitted       = false,
            parkResizeAdmitted = true;

        const
            workspace        = Neo.create(Workspace, {}),
            originalDragDrop = Neo.main.addon.DragDrop,
            originalMove     = Neo.Main.windowNativeMoveTo,
            originalResize   = Neo.Main.windowNativeResizeTo,
            calls            = [],
            sourceRoute      = {
                capabilities   : {close: true, focus: true, position: true, resize: true},
                nativeHandleKey: 'handle-source',
                ownerWindowId  : workspace.windowId,
                targetWindowId : 'source-window'
            },
            geometry           = {
                park   : {height: 260, width: 360, x: 800, y: 120},
                restore: {height: 546, width: 640, x: 40, y: 60}
            };

        workspace.tearOutConnects.audit = {
            nativeRoute: sourceRoute,
            windowId   : 'source-window',
            windowName : 'tearout-audit'
        };
        workspace.tearOutParkGeometries.audit = geometry;
        Neo.main.addon.DragDrop = {
            acknowledgeWindowDragOrphanRecovery: async () => true,
            hasWindowDragOrphanRecovery        : async () => false,
            resumeWindowDrag                   : async () => false
        };
        Neo.Main.windowNativeResizeTo = async data => {
            calls.push(['resize', data]);
            return data.width === geometry.park.width ? parkResizeAdmitted : true
        };
        Neo.Main.windowNativeMoveTo = async data => {
            calls.push(['move', data]);
            return moveAdmitted
        };

        const requested = {
            itemId    : 'audit',
            rect      : {height: 120, width: 200, x: 420, y: 240},
            terminal  : true,
            windowName: 'tearout-audit'
        };

        try {
            await expect(workspace.reshowTearOutVessel(requested)).resolves.toBe(false);
            expect(calls).toEqual([
                ['resize', {
                    height         : 546,
                    nativeHandleKey: 'handle-source',
                    targetWindowId : 'source-window',
                    width          : 640,
                    windowId       : workspace.windowId,
                    x              : 40,
                    y              : 60
                }],
                ['move', {
                    nativeHandleKey: 'handle-source',
                    targetWindowId : 'source-window',
                    windowId       : workspace.windowId,
                    x              : 420,
                    y              : 240
                }],
                ['resize', {
                    height         : 260,
                    nativeHandleKey: 'handle-source',
                    targetWindowId : 'source-window',
                    width          : 360,
                    windowId       : workspace.windowId,
                    x              : 800,
                    y              : 120
                }],
                ['move', {
                    nativeHandleKey: 'handle-source',
                    targetWindowId : 'source-window',
                    windowId       : workspace.windowId,
                    x              : 800,
                    y              : 120
                }]
            ]);
            expect(workspace.tearOutParkGeometries.audit).toBe(geometry);

            calls.length        = 0;
            parkResizeAdmitted = false;

            await expect(workspace.reshowTearOutVessel(requested)).resolves.toBe(false);
            expect(calls.map(([type]) => type)).toEqual(['resize', 'move', 'resize']);
            expect(calls.some(([type, data]) => (
                type === 'move' && data.x === geometry.park.x && data.y === geometry.park.y
            ))).toBe(false);
            expect(workspace.lastVesselRestoreReceipt).toMatchObject({
                compensationResized: false,
                moved              : false
            });

            calls.length         = 0;
            moveAdmitted         = true;
            parkResizeAdmitted   = true;

            await expect(workspace.reshowTearOutVessel(requested)).resolves.toBe(true);
            expect(calls.map(([type]) => type)).toEqual(['resize', 'move']);
            expect(workspace.tearOutParkGeometries.audit).toBeUndefined();
            expect(workspace.lastVesselRestoreReceipt).toMatchObject({
                admitted: true,
                moved   : true,
                resized : true,
                terminal: true
            })
        } finally {
            Neo.main.addon.DragDrop       = originalDragDrop;
            Neo.Main.windowNativeMoveTo   = originalMove;
            Neo.Main.windowNativeResizeTo = originalResize;
            workspace.destroy()
        }
    });

    test('target refocus refusal never admits conversion, regardless of source-restore outcome', async () => {
        const
            workspace          = Neo.create(Workspace, {}),
            originalDragDrop   = Neo.main.addon.DragDrop,
            originalFocus      = Neo.Main.windowNativeFocus,
            originalManagerGet = Neo.manager.Window.get,
            sourceRoute        = {
                capabilities   : {close: true, focus: true, position: true, resize: true},
                nativeHandleKey: 'handle-source',
                ownerWindowId  : workspace.windowId,
                targetWindowId : 'source-window'
            },
            targetRoute = {
                capabilities   : {close: true, focus: true, position: true, resize: true},
                nativeHandleKey: 'handle-target',
                ownerWindowId  : workspace.windowId,
                targetWindowId : 'target-window'
            },
            // Real-chrome shapes: each window's viewport sits below its frame by the published chrome.
            // The park lands the source FRAME on the target's frame origin; a re-show takes the
            // source's own chrome off the content rect it is handed.
            records = new Map([
                ['source-window', {
                    chrome     : {bottom: 0, left: 0, right: 0, top: 67},
                    innerRect  : {height: 479, width: 640, x: 40, y: 127},
                    nativeRoute: sourceRoute,
                    outerRect  : {height: 546, width: 640, x: 40, y: 60}
                }],
                ['target-window', {
                    chrome     : {bottom: 0, left: 0, right: 0, top: 67},
                    innerRect  : {height: 260, width: 360, x: 800, y: 187},
                    nativeRoute: targetRoute,
                    outerRect  : {height: 327, width: 360, x: 800, y: 120}
                }]
            ]);

        let
            compensate,
            focusOutcomes = [],
            resumeCalls   = [];

        workspace.tearOutConnects.audit = {
            nativeRoute: sourceRoute,
            windowId   : 'source-window',
            windowName : 'tearout-audit'
        };
        workspace.vesselConversionTargetWindowId = 'target-window';
        Neo.manager.Window.get = id => records.get(id) ?? null;
        Neo.Main.windowNativeFocus = async () => focusOutcomes.shift();
        Neo.main.addon.DragDrop = {
            parkWindowDrag  : async () => true,
            resumeWindowDrag: async data => {
                resumeCalls.push(data);
                return compensate
            }
        };

        try {
            for (compensate of [true, false]) {
                focusOutcomes = [true, false];

                await expect(workspace.parkTearOutVessel({
                    itemId: 'audit', windowName: 'tearout-audit'
                })).resolves.toBe(false);
                expect(workspace.lastVesselParkReceipt).toMatchObject({
                    compensated: compensate,
                    focused    : true,
                    parked     : !compensate,
                    refocused  : false
                });
                expect(resumeCalls.at(-1)).toMatchObject({x: 40, y: 60});

                if (compensate) {
                    expect(workspace.tearOutParkGeometries.audit).toBeUndefined()
                } else {
                    expect(workspace.tearOutParkGeometries.audit).toEqual({
                        park   : {height: 260, width: 360, x: 800, y: 120},
                        restore: {height: 546, width: 640, x: 40, y: 60}
                    })
                }
            }
        } finally {
            Neo.main.addon.DragDrop    = originalDragDrop;
            Neo.Main.windowNativeFocus = originalFocus;
            Neo.manager.Window.get     = originalManagerGet;
            workspace.destroy()
        }
    });

    test('convert-out restores the target proxy before the exact parked popup is re-shown', () => {
        const workspace = Neo.create(Workspace, {});
        const
            chrome        = readTabChrome(workspace),
            originalPark  = workspace.vesselParkHandlers,
            originalProxy = workspace.vesselProxyEmbodiment,
            order         = [];

        try {
            workspace.vesselProxyEmbodiment = {
                isStaged: () => true,
                restore : data => {
                    order.push(['proxy-restored', data.itemId]);
                    return true
                }
            };
            workspace.vesselParkHandlers = {
                onConversionOut: data => {
                    order.push(['popup-reshown', data.rect]);
                    return true
                }
            };

            const admitted = {
                itemId     : 'audit',
                logicalRect: {height: 120, width: 200, x: 40, y: 60}
            };

            chrome.get('right-top-tabs').tab.fire('dockVesselConversionOut', admitted);

            expect(admitted.admission).toBe(true);
            expect(order).toEqual([
                ['proxy-restored', 'audit'],
                ['popup-reshown', admitted.logicalRect]
            ]);

            order.length = 0;
            workspace.vesselProxyEmbodiment.restore = data => {
                order.push(['proxy-refused', data.itemId]);
                return false
            };

            const refused = {itemId: 'audit', logicalRect: admitted.logicalRect};

            chrome.get('right-top-tabs').tab.fire('dockVesselConversionOut', refused);

            expect(refused.admission).toBe(false);
            expect(order).toEqual([['proxy-refused', 'audit']])
        } finally {
            workspace.vesselParkHandlers      = originalPark;
            workspace.vesselProxyEmbodiment = originalProxy;
            workspace.destroy()
        }
    });

    test('a connected vessel stays unregistered until an accepted drop seeds document ownership', async () => {
        const
            workspace   = Neo.create(Workspace, {}),
            workspaceId = Workspace.vesselWorkspaceId('alerts'),
            classes     = [],
            destroyed   = [],
            indicators  = {
                activeCandidate: null,
                candidateSet   : null,
                clear() {
                    this.activeCandidate = this.candidateSet = null
                },
                hostRect: null,
                updatePointer() {
                    return null
                }
            },
            preview     = {dockPreview: null, applyTargetGeometry() {}},
            overlays    = [preview, indicators],
            mainView    = {
                id         : 'workstation-vessel-view',
                isDestroyed: false,
                add        : () => overlays.shift(),
                addCls     : cls => classes.push(cls),
                getDomRect : async () => [
                    {x: 0, y: 0, width: 480, height: 320},
                    {x: 0, y: 0, width: 480, height: 320}
                ],
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

            expect(Document.validate(provisional)).toEqual([]);
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

                await workspace.ensureCrossWindowPreviewGeometry(
                    workspaceId,
                    Workspace.vesselTabsNodeId('alerts')
                );

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
                });
                expect(indicators.hostRect).toEqual({height: 320, width: 480, x: 0, y: 0});
                expect(indicators.candidateSet).toMatchObject({
                    itemId: 'security',
                    zone  : {nodeId: Workspace.vesselTabsNodeId('alerts')},
                    cross : [
                        {position: 'center'},
                        {position: 'top'},
                        {position: 'right'},
                        {position: 'bottom'},
                        {position: 'left'}
                    ]
                });

                expect(workspace.renderCrossWindowPreview(workspaceId, {
                    draggedItem: {
                        dockItemId           : 'security',
                        dockSourceWorkspaceId: Workspace.MAIN_WORKSPACE_ID
                    },
                    localX      : 481,
                    localY      : 1,
                    sourceNodeId: 'heavy-tabs'
                })).toBeNull();
                expect(preview.dockPreview).toBeNull();
                expect(indicators.candidateSet).toBeNull()
            } finally {
                WindowManager.get = originalGet
            }

            workspace.clearCrossWindowPreview(workspaceId);

            expect(state.document).toBeNull();
            expect(preview.dockPreview).toBeNull();
            expect(indicators.candidateSet).toBeNull();
            expect(destroyed).toEqual([])
        } finally {
            workspace.destroy()
        }
    });

    test('remote main previews resolve through the affordance geometry: the full grammar on the pointed zone, the stored-home tab-into off-zone', async () => {
        const
            workspace         = Neo.create(Workspace, {}),
            sourceWorkspaceId = Workspace.vesselWorkspaceId('queues'),
            hostRect          = {x: 100, y: 80, width: 900, height: 600},
            leftRect          = {x: 160, y: 140, width: 260, height: 260},
            heavyRect         = {x: 520, y: 140, width: 300, height: 300},
            farRect           = {x: 2000, y: 2000, width: 100, height: 100},
            paintedRects      = [],
            measuredIds       = [];

        try {
            await workspace.crossWindowParticipationPromise;

            const
                host        = workspace.getReference('dock-host'),
                affordances = workspace.dragAffordances,
                renderer    = affordances.preview,
                zoneId      = nodeId => host.down({dockNodeId: nodeId}).id,
                tabsZoneIds = Object.entries(workspace.dockModel.nodes)
                    .filter(([, node]) => node.type === 'tabs')
                    .map(([nodeId]) => zoneId(nodeId)),
                rects                   = {[host.id]: hostRect, [zoneId('left-tabs')]: leftRect, [zoneId('heavy-tabs')]: heavyRect},
                local                   = rect => ({x: rect.x - hostRect.x, y: rect.y - hostRect.y, width: rect.width, height: rect.height}),
                render                  = (point, sourceWorkspace = sourceWorkspaceId) => workspace.renderCrossWindowPreview(
                    Workspace.MAIN_WORKSPACE_ID,
                    {
                        draggedItem : {dockItemId: 'queues', dockSourceWorkspaceId: sourceWorkspace},
                        localX      : point.x,
                        localY      : point.y,
                        sourceNodeId: Workspace.vesselTabsNodeId('queues')
                    }
                ),
                WindowManager           = Neo.manager.Window,
                originalGet             = WindowManager.get,
                originalGetDomRect      = host.getDomRect,
                originalApplyTargetRect = renderer.applyTargetGeometry,
                originalWindowId        = workspace.windowId;

            workspace.windowId = 'window-main';
            workspace.vesselWorkspaces.set(sourceWorkspaceId, {itemId: 'queues'});
            workspace.tearOutPlacements.queues = {index: 0, tabsNodeId: 'left-tabs'};

            try {
                WindowManager.get = () => ({innerRect: {x: 0, y: 0, width: 1280, height: 720}});
                host.getDomRect = async ids => {
                    measuredIds.push(ids);
                    return ids.map(id => rects[id] ?? farRect)
                };
                renderer.applyTargetGeometry = rect => paintedRects.push(rect);

                // The first frame warms the SAME once-per-gesture measurement the indicator tier
                // uses — the host plus EVERY projected tabs zone — and hides until it settles.
                expect(render({x: 290, y: 180})).toBeNull();
                expect(measuredIds).toHaveLength(1);
                expect(measuredIds[0][0]).toBe(host.id);
                expect([...measuredIds[0]].sort()).toEqual([host.id, ...tabsZoneIds].sort());

                await affordances.ensureGeometry();

                // Four edges of the stored home resolve against its exact measured rect (its parent is
                // the edge-zone root, so every side is a node-splitting edge).
                const points = {
                    top   : {x: 290, y: 180},
                    right : {x: 419, y: 270},
                    bottom: {x: 290, y: 399},
                    left  : {x: 161, y: 270}
                };

                Object.entries(points).forEach(([edge, point]) => {
                    const preview = render(point);

                    expect(preview.target.nodeId).toBe('left-tabs');
                    expect(preview.placement.kind).toBe(`edge-${edge}`)
                });

                expect(paintedRects).toEqual(Array(4).fill(local(leftRect)));
                expect(measuredIds, 'one measurement serves the whole gesture').toHaveLength(1);

                // The full grammar on ANY pointed zone: heavy-tabs sits in a horizontal split, so its
                // left band is a sibling insertion — the region a native popup's corner selects.
                const split = render({x: 530, y: 320});

                expect(split.target.nodeId).toBe('heavy-tabs');
                expect(split.placement.kind).toBe('split-before');
                expect(paintedRects.at(-1)).toEqual(local(heavyRect));
                expect(renderer.dockPreview?.previewId).toBe(split.previewId);

                // Off every zone but inside the window: the stored home acquires the drop as a
                // tab-into, painted on the home's exact rect — never on the pointer's empty position.
                workspace.tearOutPlacements.queues = {index: 1, tabsNodeId: 'right-top-tabs'};

                const offZone = render({x: 450, y: 500}, Workspace.MAIN_WORKSPACE_ID);

                expect(offZone?.target.nodeId, 'a main-origin native popup recovers its saved semantic home off-zone')
                    .toBe('right-top-tabs');
                expect(offZone.placement.kind).toBe('tab-into');
                expect(paintedRects.at(-1)).toEqual(local(farRect));

                // …while a pointed zone still wins over the stored home.
                expect(render({x: 290, y: 300}, Workspace.MAIN_WORKSPACE_ID)).toMatchObject({
                    placement: {kind: 'tab-into'},
                    target   : {nodeId: 'left-tabs'}
                });

                // A main-window resize mid-gesture re-measures: the in-flight frame hides stale
                // pixels, the settled one paints again.
                let settleReplacement;

                WindowManager.get = () => ({innerRect: {x: 0, y: 0, width: 1279, height: 720}});
                host.getDomRect = async ids => {
                    measuredIds.push(ids);

                    return new Promise(resolve => settleReplacement = () => resolve(ids.map(id => rects[id] ?? farRect)))
                };

                expect(render(points.top)).toBeNull();
                expect(renderer.dockPreview, 'an in-flight replacement must hide stale pixels').toBeNull();
                expect(measuredIds).toHaveLength(2);

                settleReplacement();
                await affordances.ensureGeometry();

                expect(render(points.top)).toMatchObject({placement: {kind: 'edge-top'}, target: {nodeId: 'left-tabs'}})
            } finally {
                WindowManager.get            = originalGet;
                host.getDomRect              = originalGetDomRect;
                renderer.applyTargetGeometry = originalApplyTargetRect;
                workspace.windowId           = originalWindowId;
                workspace.vesselWorkspaces.delete(sourceWorkspaceId);
                delete workspace.tearOutPlacements.queues
            }
        } finally {
            workspace.destroy()
        }
    });

    test('the remote affordance feed never clears the semantic stored-home renderer after it settles (#16309)', async () => {
        const
            workspace         = Neo.create(Workspace, {}),
            sourceWorkspaceId = Workspace.vesselWorkspaceId('queues'),
            hostRect          = {x: 100, y: 80, width: 900, height: 600},
            targetRect        = {x: 120, y: 120, width: 260, height: 260};

        try {
            await workspace.crossWindowParticipationPromise;

            workspace.windowId = 'window-main';
            workspace.vesselWorkspaces.set(sourceWorkspaceId, {itemId: 'queues'});
            workspace.tearOutPlacements.queues = {index: 0, tabsNodeId: 'left-tabs'};

            // The construct-time participation resolves before windowId exists in this
            // harness — refresh it now that the window identity is set.
            const participation = await workspace.refreshCrossWindowParticipation(Workspace.MAIN_WORKSPACE_ID);

            const
                host               = workspace.getReference('dock-host'),
                homeId             = host.down({dockNodeId: 'left-tabs'}).id,
                farRect            = {x: 2000, y: 2000, width: 100, height: 100},
                renderer           = workspace.dragAffordances.preview,
                WindowManager      = Neo.manager.Window,
                originalGet        = WindowManager.get,
                originalGetDomRect = host.getDomRect,
                originalWindowId   = workspace.windowId;

            try {
                WindowManager.get = () => ({innerRect: {x: 0, y: 0, width: 1280, height: 720}});
                host.getDomRect   = async ids => ids.map(id => id === host.id ? hostRect : id === homeId ? targetRect : farRect);

                await workspace.dragAffordances.ensureGeometry();

                // Off-zone but window-admitted: inside the host rect, outside every zone rect —
                // the stored-home fallback must paint the grouped tab-into…
                participation.target.onRemoteDragMove({
                    draggedItem: {
                        dockGroupNodeId      : 'workstation-vessel-tabs:queues',
                        dockItemId           : 'queues',
                        dockSourceWorkspaceId: sourceWorkspaceId
                    },
                    localX      : 700,
                    localY      : 500,
                    sourceNodeId: Workspace.vesselTabsNodeId('queues')
                });

                const semanticPreview = participation.target.currentPreview;

                expect(semanticPreview?.previewId).toBe('preview:group:workstation-vessel-tabs:queues:left-tabs:tab-into');
                expect(renderer.dockPreview?.previewId).toBe(semanticPreview.previewId);

                // …and once the fire-and-forget affordance feed settles, its async tier
                // must not clear or replace a renderer it does not own.
                await new Promise(resolve => setTimeout(resolve, 0));
                await new Promise(resolve => setTimeout(resolve, 0));
                await new Promise(resolve => setTimeout(resolve, 0));

                expect(renderer.dockPreview?.previewId).toBe(semanticPreview.previewId);
                expect(participation.target.currentPreview?.previewId).toBe(renderer.dockPreview.previewId)
            } finally {
                WindowManager.get  = originalGet;
                host.getDomRect    = originalGetDomRect;
                workspace.windowId = originalWindowId;
                workspace.vesselWorkspaces.delete(sourceWorkspaceId);
                delete workspace.tearOutPlacements.queues
            }
        } finally {
            workspace.destroy()
        }
    });

    test('pane identity remains readable after the catalog moves into a vessel workspace', () => {
        const workspace = Neo.create(Workspace, {});

        try {
            const
                alertsIdentity   = workspace.getPaneIdentity('alerts'),
                securityIdentity = workspace.getPaneIdentity('security');

            stageCommittedVessel(workspace);

            expect(workspace.dockModel.items.alerts).toBeUndefined();
            expect(workspace.dockModel.items.security).toBeUndefined();
            expect(workspace.getPaneIdentity('alerts')).toBe(alertsIdentity);
            expect(workspace.getPaneIdentity('security')).toBe(securityIdentity)
        } finally {
            workspace.destroy()
        }
    });

    test('native-titlebar source discovery resolves the exact live bare-vessel pane and rejects stale topology', () => {
        const
            workspace   = Neo.create(Workspace, {}),
            itemId      = 'alerts',
            pane        = workspace.paneCache[itemId],
            workspaceId = Workspace.vesselWorkspaceId(itemId),
            detached    = Operations.applyOperation(workspace.dockModel, {
                operation: 'detachItem',
                itemId
            }),
            state       = {
                app           : {mainView: {isDestroyed: false}},
                closeRequested: false,
                committed     : false,
                disconnected  : false,
                document      : null,
                itemId,
                windowId      : 'window-alerts',
                workspaceId
            };

        try {
            expect(detached.errors).toEqual([]);
            workspace.dockModel = detached.document;
            workspace.tearOutPanes[itemId] = {
                windowId  : 'window-alerts',
                windowName: 'tearout-alerts'
            };
            workspace.vesselWorkspaces.set(workspaceId, state);

            const source = workspace.resolveNativeTearOutDrag('window-alerts');

            expect(source).toMatchObject({
                draggedItem      : pane,
                embodyNativeHover: true,
                sourceWindowId   : 'window-alerts',
                widgetName       : itemId
            });
            expect(source.draggedItem).toBe(pane);
            expect(pane.dockItemId).toBe(itemId);
            expect(pane.dockSourceWorkspaceId).toBe(Workspace.MAIN_WORKSPACE_ID);
            expect(pane.dockGroupNodeId).toBeUndefined();
            expect(workspace.resolveNativeTearOutDrag('window-other')).toBeNull();

            state.disconnected = true;
            expect(workspace.resolveNativeTearOutDrag('window-alerts')).toBeNull();

            state.disconnected = false;
            state.committed    = true;
            expect(workspace.resolveNativeTearOutDrag('window-alerts')).toBeNull();

            state.committed = false;
            state.windowId  = 'window-mismatch';
            expect(workspace.resolveNativeTearOutDrag('window-alerts')).toBeNull()
        } finally {
            workspace.destroy()
        }
    });

    test('a native-titlebar park onto the MAIN window is satisfied without a platform effect — the hold is the gesture', async () => {
        // A drop INTO this main window lands when the dwell completes and retires the popup right after,
        // so there is nothing to park; the focus step could never be granted on this path anyway (no
        // user activation reaches a popup during an OS titlebar drag). The park answers `true` with no
        // focus and no move, so the coordinator proceeds to embodiment and the commit — and the receipt
        // says the park was not physical.
        const
            workspace           = Neo.create(Workspace, {}),
            originalManagerGet  = Neo.manager.Window.get,
            originalNativeFocus = Neo.Main.windowNativeFocus,
            originalNativeMove  = Neo.Main.windowNativeMoveTo,
            originalWindowFocus = Neo.Main.windowFocus,
            platformCalls       = [],
            ownerWindowId       = workspace.windowId,
            sourceWindowId      = 'window-alerts',
            sourceRect          = {height: 320, width: 480, x: 420, y: 240},
            targetRect          = {height: 700, width: 1000, x: 30, y: 50};

        try {
            workspace.tearOutPanes.alerts = {windowId: sourceWindowId, windowName: 'tearout-alerts'};
            workspace.vesselConversionTargetWindowId = ownerWindowId;

            Neo.manager.Window.get = windowId => ({
                [sourceWindowId]: {
                    innerRect  : sourceRect,
                    nativeRoute: {capabilities: {position: true}, nativeHandleKey: 'handle-alerts', ownerWindowId, targetWindowId: sourceWindowId}
                },
                [ownerWindowId]: {innerRect: targetRect, nativeRoute: null}
            })[windowId] ?? null;
            Neo.Main.windowFocus        = async data => { platformCalls.push(['focus', data]); return false };
            Neo.Main.windowNativeFocus  = async data => { platformCalls.push(['nativeFocus', data]); return false };
            Neo.Main.windowNativeMoveTo = async data => { platformCalls.push(['move', data]); return false };

            await expect(workspace.parkTearOutVessel({
                itemId        : 'alerts',
                nativeTitlebar: true,
                windowName    : 'tearout-alerts'
            }), 'the park is satisfied without asking the platform').resolves.toBe(true);

            expect(platformCalls, 'no focus, no move — nothing was parked').toEqual([]);
            expect(workspace.lastVesselParkReceipt).toMatchObject({parked: true, physical: false});
            expect(workspace.lastVesselParkReceipt.authority.sourceHasHandle, 'the source route is still checked').toBe(true)
        } finally {
            Neo.manager.Window.get      = originalManagerGet;
            Neo.Main.windowFocus        = originalWindowFocus;
            Neo.Main.windowNativeFocus  = originalNativeFocus;
            Neo.Main.windowNativeMoveTo = originalNativeMove;
            workspace.destroy()
        }
    });

    test('native-titlebar parking onto a POPUP target uses the exact native route and compensates without pointer drag state', async () => {
        // The physical park path: a popup target is focused through its owner-minted route, the source
        // moves behind it, the refocus decides the outcome. (A main-window target no longer parks
        // physically — the arm above — so this arm targets a popup, where the choreography still runs.)
        const
            workspace           = Neo.create(Workspace, {}),
            originalDragDrop    = Neo.main.addon.DragDrop,
            originalManagerGet  = Neo.manager.Window.get,
            originalNativeFocus = Neo.Main.windowNativeFocus,
            originalNativeMove  = Neo.Main.windowNativeMoveTo,
            originalWindowFocus = Neo.Main.windowFocus,
            focusResults        = [true, true, true, false],
            focusCalls          = [],
            nativeFocusCalls    = [],
            nativeMoveCalls     = [],
            pointerCalls        = [],
            ownerWindowId       = workspace.windowId,
            sourceWindowId      = 'window-alerts',
            targetWindowId      = 'window-target',
            sourceRect          = {height: 320, width: 480, x: 420, y: 240},
            targetRect          = {height: 700, width: 1000, x: 30, y: 50},
            routeFor            = (targetWindowId, capabilities) => ({
                capabilities,
                nativeHandleKey: `handle-${targetWindowId}`,
                ownerWindowId,
                targetWindowId
            });

        try {
            workspace.tearOutPanes.alerts = {
                windowId  : sourceWindowId,
                windowName: 'tearout-alerts'
            };
            workspace.vesselConversionTargetWindowId = targetWindowId;

            Neo.manager.Window.get = windowId => ({
                [sourceWindowId]: {
                    innerRect  : sourceRect,
                    nativeRoute: routeFor(sourceWindowId, {position: true})
                },
                [targetWindowId]: {
                    innerRect  : targetRect,
                    nativeRoute: routeFor(targetWindowId, {focus: true})
                }
            })[windowId] ?? null;
            Neo.Main.windowFocus = async data => {
                focusCalls.push(data);
                return true
            };
            Neo.Main.windowNativeFocus = async data => {
                nativeFocusCalls.push(data);
                return focusResults.shift()
            };
            Neo.Main.windowNativeMoveTo = async data => {
                nativeMoveCalls.push(data);
                return true
            };
            Neo.main.addon.DragDrop = {
                parkWindowDrag: async data => {
                    pointerCalls.push(['park', data]);
                    return true
                },
                resumeWindowDrag: async data => {
                    pointerCalls.push(['resume', data]);
                    return true
                }
            };

            await expect(workspace.parkTearOutVessel({
                itemId        : 'alerts',
                nativeTitlebar: true,
                windowName    : 'tearout-alerts'
            })).resolves.toBe(true);

            expect(nativeMoveCalls).toEqual([{
                nativeHandleKey: `handle-${sourceWindowId}`,
                targetWindowId : sourceWindowId,
                windowId       : ownerWindowId,
                windowName     : 'tearout-alerts',
                x              : targetRect.x,
                y              : targetRect.y
            }]);
            expect(pointerCalls, 'a terminal titlebar drag has no live pointer DragDrop session').toEqual([]);

            const targetFocus = {nativeHandleKey: `handle-${targetWindowId}`, targetWindowId, windowId: ownerWindowId};

            expect(nativeFocusCalls, 'focus then refocus, both through the target\'s owner-minted route').toEqual([targetFocus, targetFocus]);
            expect(focusCalls, 'the opener verb is for a main-window target only').toEqual([]);

            nativeMoveCalls.length = 0;

            // The second park sees its refocus refused: on a popup target the source may still cover
            // the target, so the move is compensated back to the source rect and the park is refused.
            await expect(workspace.parkTearOutVessel({
                itemId        : 'alerts',
                nativeTitlebar: true,
                windowName    : 'tearout-alerts'
            })).resolves.toBe(false);

            expect(workspace.lastVesselParkReceipt).toMatchObject({focused: true, moved: true, refocused: false, compensated: true, refusedAt: 'refocus'});
            expect(nativeMoveCalls.map(({x, y}) => ({x, y})), 'the park move, then the compensation').toEqual([
                {x: targetRect.x, y: targetRect.y},
                {x: sourceRect.x, y: sourceRect.y}
            ]);
            expect(nativeFocusCalls).toEqual([targetFocus, targetFocus, targetFocus, targetFocus]);
            expect(focusCalls).toEqual([]);
            expect(pointerCalls).toEqual([])
        } finally {
            Neo.main.addon.DragDrop     = originalDragDrop;
            Neo.manager.Window.get      = originalManagerGet;
            Neo.Main.windowNativeFocus  = originalNativeFocus;
            Neo.Main.windowNativeMoveTo = originalNativeMove;
            Neo.Main.windowFocus        = originalWindowFocus;
            workspace.destroy()
        }
    });

    /**
     * The coordinator retries a refused park until the OS releases the popup; a stalled retry must
     * read live as a rising attempt count with the same `refusedAt`, and a park that finally lands
     * (or a main-window park, which is satisfied without a platform effect) resets the count.
     */
    test('a refused park counts its attempts per vessel, and the count resets after a park', async () => {
        const
            workspace           = Neo.create(Workspace, {}),
            originalDragDrop    = Neo.main.addon.DragDrop,
            originalManagerGet  = Neo.manager.Window.get,
            originalNativeFocus = Neo.Main.windowNativeFocus,
            originalNativeMove  = Neo.Main.windowNativeMoveTo,
            originalWindowFocus = Neo.Main.windowFocus,
            focusResults        = [false, true, true, true, true], // the OS still holds the source, then the user lets go
            nativeMoveCalls     = [],
            ownerWindowId       = workspace.windowId,
            sourceWindowId      = 'window-alerts',
            targetWindowId      = 'window-target',
            sourceRect          = {height: 320, width: 480, x: 420, y: 240},
            targetRect          = {height: 700, width: 1000, x: 30, y: 50},
            routeFor            = (targetWindowId, capabilities) => ({
                capabilities,
                nativeHandleKey: `handle-${targetWindowId}`,
                ownerWindowId,
                targetWindowId
            });

        try {
            workspace.tearOutPanes.alerts = {windowId: sourceWindowId, windowName: 'tearout-alerts'};
            workspace.vesselConversionTargetWindowId = targetWindowId;

            Neo.manager.Window.get = windowId => ({
                [sourceWindowId]: {innerRect: sourceRect, nativeRoute: routeFor(sourceWindowId, {position: true})},
                [targetWindowId]: {innerRect: targetRect, nativeRoute: routeFor(targetWindowId, {focus: true})}
            })[windowId] ?? null;
            Neo.Main.windowFocus        = async () => true;
            Neo.Main.windowNativeFocus  = async () => focusResults.shift();
            Neo.Main.windowNativeMoveTo = async data => {
                nativeMoveCalls.push(data);
                return true
            };
            Neo.main.addon.DragDrop = {
                parkWindowDrag  : async () => true,
                resumeWindowDrag: async () => true
            };

            const park = () => workspace.parkTearOutVessel({itemId: 'alerts', nativeTitlebar: true, windowName: 'tearout-alerts'});

            // Attempt 1: the OS still holds the source — the owner's focus of the target is refused,
            // the park is refused at the focus, and the receipt counts the attempt.
            await expect(park(), 'refused while the OS holds the window').resolves.toBe(false);
            expect(workspace.lastVesselParkReceipt).toMatchObject({focused: false, parkAttempts: 1, refusedAt: 'focus'});
            expect(nativeMoveCalls, 'nothing moved on a refused focus').toEqual([]);

            // Attempt 2: released — focus, move and refocus are granted; the park lands and the count
            // reads the retry that got it there.
            await expect(park(), 'parks on release').resolves.toBe(true);
            expect(workspace.lastVesselParkReceipt).toMatchObject({focused: true, moved: true, refocused: true, parked: true, parkAttempts: 2});

            // A later park starts a fresh count.
            await expect(park()).resolves.toBe(true);
            expect(workspace.lastVesselParkReceipt.parkAttempts, 'the count resets after a park').toBe(1);

            // A main-window park is satisfied without a platform effect and resets the count as well.
            workspace.tearOutParkAttempts.alerts = 3;
            workspace.vesselConversionTargetWindowId = ownerWindowId;
            Neo.manager.Window.get = windowId => ({
                [sourceWindowId]: {innerRect: sourceRect, nativeRoute: routeFor(sourceWindowId, {position: true})},
                [ownerWindowId] : {innerRect: targetRect, nativeRoute: null}
            })[windowId] ?? null;

            await expect(park()).resolves.toBe(true);
            expect(workspace.lastVesselParkReceipt).toMatchObject({parked: true, physical: false, parkAttempts: 4});
            expect(workspace.tearOutParkAttempts.alerts, 'a satisfied main-window park clears the count').toBeUndefined()
        } finally {
            Neo.main.addon.DragDrop     = originalDragDrop;
            Neo.manager.Window.get      = originalManagerGet;
            Neo.Main.windowNativeFocus  = originalNativeFocus;
            Neo.Main.windowNativeMoveTo = originalNativeMove;
            Neo.Main.windowFocus        = originalWindowFocus;
            workspace.destroy()
        }
    });

    test('control: a POPUP target still refuses the park when its owner-routed focus is refused', async () => {
        const
            workspace           = Neo.create(Workspace, {}),
            originalDragDrop    = Neo.main.addon.DragDrop,
            originalManagerGet  = Neo.manager.Window.get,
            originalNativeFocus = Neo.Main.windowNativeFocus,
            originalNativeMove  = Neo.Main.windowNativeMoveTo,
            originalWindowFocus = Neo.Main.windowFocus,
            nativeMoveCalls     = [],
            ownerWindowId       = workspace.windowId,
            sourceWindowId      = 'window-alerts',
            targetWindowId      = 'window-target',
            sourceRect          = {height: 320, width: 480, x: 420, y: 240},
            targetRect          = {height: 700, width: 1000, x: 30, y: 50},
            routeFor            = (targetWindowId, capabilities) => ({
                capabilities,
                nativeHandleKey: `handle-${targetWindowId}`,
                ownerWindowId,
                targetWindowId
            });

        try {
            workspace.tearOutPanes.alerts = {windowId: sourceWindowId, windowName: 'tearout-alerts'};
            workspace.vesselConversionTargetWindowId = targetWindowId;

            Neo.manager.Window.get = windowId => ({
                [sourceWindowId]: {innerRect: sourceRect, nativeRoute: routeFor(sourceWindowId, {position: true})},
                [targetWindowId]: {innerRect: targetRect, nativeRoute: routeFor(targetWindowId, {focus: true})}
            })[windowId] ?? null;
            Neo.Main.windowFocus        = async () => true;
            Neo.Main.windowNativeFocus  = async () => false; // the owner's focus of a window it opened — refused here
            Neo.Main.windowNativeMoveTo = async data => {
                nativeMoveCalls.push(data);
                return true
            };
            Neo.main.addon.DragDrop = {
                parkWindowDrag  : async () => true,
                resumeWindowDrag: async () => true
            };

            await expect(workspace.parkTearOutVessel({
                itemId        : 'alerts',
                nativeTitlebar: true,
                windowName    : 'tearout-alerts'
            }), 'a popup target keeps the strict focus gate').resolves.toBe(false);

            expect(workspace.lastVesselParkReceipt).toMatchObject({focused: false, refusedAt: 'focus'});
            expect(nativeMoveCalls, 'nothing moved').toEqual([])
        } finally {
            Neo.main.addon.DragDrop     = originalDragDrop;
            Neo.manager.Window.get      = originalManagerGet;
            Neo.Main.windowNativeFocus  = originalNativeFocus;
            Neo.Main.windowNativeMoveTo = originalNativeMove;
            Neo.Main.windowFocus        = originalWindowFocus;
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

            const detached = Operations.applyOperation(workspace.dockModel, {
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

            const transferIncoming = () => Operations.transferItem(
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
                    nodeId           : Document.resolveStackRoot(state.document),
                    sourceWorkspaceId: workspaceId,
                    targetWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
                    target           : {
                        targetNodeId: 'heavy-tabs',
                        placement   : {kind: 'tab-into'}
                    }
                },
                returned = Operations.transferNode(
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
            originalClose          = workspace.closeTearOutVessel,
            originalTearOut        = workspace.tearOutHandlers,
            originalPark           = workspace.vesselParkHandlers,
            participantRetirements = [];
        let closedVessel;

        try {
            const
                descriptor = {
                    operation        : 'transferNode',
                    nodeId           : Document.resolveStackRoot(state.document),
                    sourceWorkspaceId: workspaceId,
                    targetWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
                    target           : {
                        targetNodeId: 'heavy-tabs',
                        placement   : {kind: 'tab-into'}
                    }
                },
                returned = Operations.transferNode(state.document, workspace.dockModel, descriptor);

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
            workspace.closeTearOutVessel = async vessel => {
                closedVessel = vessel;
                return true
            };

            await expect(workspace.retireReturnedVessel(workspaceId)).resolves.toBe(true);

            expect(closedVessel).toMatchObject({
                itemId    : 'alerts',
                windowId  : 'window-alerts',
                windowName: 'tearout-alerts'
            });
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
            workspace.closeTearOutVessel = originalClose;
            workspace.tearOutHandlers    = originalTearOut;
            workspace.vesselParkHandlers = originalPark;
            workspace.destroy()
        }
    });

    test('vessel projection retires its one-shot incoming target after paint', async () => {
        const
            workspace   = Neo.create(Workspace, {}),
            workspaceId = Workspace.vesselWorkspaceId('alerts'),
            provisional = workspace.createVesselWorkspaceDocument('alerts'),
            moved       = Operations.transferItem(workspace.dockModel, provisional, {
                itemId           : 'alerts',
                sourceWorkspaceId: Workspace.MAIN_WORKSPACE_ID,
                targetWorkspaceId: workspaceId,
                target           : {operation: 'addTab', tabsNodeId: Workspace.vesselTabsNodeId('alerts')}
            }),
            order       = [],
            preview     = {parent: {remove: () => order.push('preview-parked')}},
            indicators  = {parent: {remove: () => order.push('indicators-parked')}},
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
                indicators,
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
                'indicators-parked',
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
            originalProxy   = workspace.vesselProxyEmbodiment,
            calls           = [];

        try {
            workspace.tearOutConnects.alerts = {
                admissionToken: 7,
                generation    : 3,
                windowId      : 'tear-child'
            };
            workspace.tearOutParkGeometries.alerts = {
                park   : {height: 260, width: 360, x: 800, y: 120},
                restore: {height: 546, width: 640, x: 40, y: 60}
            };
            workspace.tearOutHandlers = {
                onVesselRetired: data => calls.push(['tear-out', data])
            };
            workspace.vesselParkHandlers = {
                onVesselRetired: data => calls.push(['park', data])
            };
            workspace.vesselProxyEmbodiment = {
                restoreByWindow: windowId => {
                    calls.push(['proxy', windowId]);
                    return true
                }
            };

            workspace.onWindowDisconnect({windowId: 'tear-child'});

            expect(workspace.tearOutConnects.alerts).toBeUndefined();
            expect(workspace.tearOutParkGeometries.alerts).toBeUndefined();
            expect(calls).toEqual([
                ['proxy', 'tear-child'],
                ['tear-out', {
                    admissionToken: 7,
                    generation    : 3,
                    itemId        : 'alerts',
                    windowName    : 'tearout-alerts'
                }],
                ['park', {itemId: 'alerts', retirement: true}]
            ])
        } finally {
            workspace.tearOutHandlers         = originalTearOut;
            workspace.vesselParkHandlers      = originalPark;
            workspace.vesselProxyEmbodiment = originalProxy;
            workspace.destroy()
        }
    });

    test('tear-out navigation carries the workspace active theme into each admitted child', async () => {
        const
            workspace          = Neo.create(Workspace, {theme: 'neo-theme-neo-light'}),
            originalGetByPath  = Neo.Main.getByPath,
            originalWindowData = Neo.Main.getWindowData,
            originalWindowOpen = Neo.Main.windowOpen,
            bootstrapCalls     = [],
            calls              = [];

        Neo.Main.getWindowData = async () => ({
            innerHeight: 700,
            outerHeight: 760,
            screenLeft : 10,
            screenTop  : 20
        });
        Neo.Main.getByPath = async data => {
            bootstrapCalls.push(data);

            return {
                defaultTheme: 'neo-theme-neo-dark',
                schemes     : {
                    'neo-theme-neo-dark' : 'dark',
                    'neo-theme-neo-light': 'light'
                }
            }
        };
        Neo.Main.windowOpen = async data => {
            calls.push(data);

            return true
        };

        try {
            await workspace.openTearOutVessel({
                itemId   : 'alerts',
                proxyRect: {height: 320, width: 480, x: 40, y: 60}
            });

            workspace.theme = 'neo-theme-neo-dark';

            await workspace.openTearOutVessel({
                itemId   : 'security',
                proxyRect: {height: 320, width: 480, x: 80, y: 100}
            });

            workspace.theme = 'neo-theme-candidate';

            await workspace.openTearOutVessel({
                itemId   : 'memory',
                proxyRect: {height: 320, width: 480, x: 120, y: 140}
            });

            expect(calls).toHaveLength(3);
            expect(calls.map(call => new URL(call.url, 'https://example.test').searchParams.get('theme')))
                .toEqual(['neo-theme-neo-light', 'neo-theme-neo-dark', 'neo-theme-neo-dark']);
            expect(calls.map(call => new URL(call.url, 'https://example.test').searchParams.get('vesselFlow')))
                .toEqual(['tear-out', 'tear-out', 'tear-out']);
            expect(calls.map(call => call.stagedColorScheme))
                .toEqual(['light', 'dark', 'dark']);
            expect(bootstrapCalls).toEqual([
                {path: 'WorkstationBootstrap', windowId: workspace.windowId},
                {path: 'WorkstationBootstrap', windowId: workspace.windowId},
                {path: 'WorkstationBootstrap', windowId: workspace.windowId}
            ])
        } finally {
            Neo.Main.getByPath   = originalGetByPath;
            Neo.Main.getWindowData = originalWindowData;
            Neo.Main.windowOpen    = originalWindowOpen;
            workspace.destroy()
        }
    });

    test('a missing theme bootstrap fails loud before an unthemed tear-out can open', async () => {
        const
            workspace          = Neo.create(Workspace, {theme: 'neo-theme-neo-light'}),
            originalGetByPath  = Neo.Main.getByPath,
            originalWindowData = Neo.Main.getWindowData,
            originalWindowOpen = Neo.Main.windowOpen,
            windowOpenCalls    = [];

        Neo.Main.getWindowData = async () => ({
            innerHeight: 700,
            outerHeight: 760,
            screenLeft : 10,
            screenTop  : 20
        });
        Neo.Main.getByPath = async () => {
            throw new Error('WorkstationBootstrap unavailable')
        };
        Neo.Main.windowOpen = async data => {
            windowOpenCalls.push(data);
            return true
        };

        try {
            const result = await workspace.openTearOutVessel({
                itemId   : 'alerts',
                proxyRect: {height: 320, width: 480, x: 40, y: 60}
            });

            expect(result).toBeNull();
            expect(windowOpenCalls).toEqual([]);
            expect(workspace.lastVesselOpen).toEqual({
                error : 'WorkstationBootstrap unavailable',
                itemId: 'alerts',
                stage : 'threw'
            });
            expect(workspace.vesselOwnerGrants.has('tear-out:alerts')).toBe(false)
        } finally {
            Neo.Main.getByPath    = originalGetByPath;
            Neo.Main.getWindowData = originalWindowData;
            Neo.Main.windowOpen     = originalWindowOpen;
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

/**
 * Builds the minimal host surface `onTourBeat` consumes, with a scripted `executeCue`.
 * @param {Object} cueResult Receipt the scripted executor resolves.
 * @returns {Object}
 */
function createCueHost(cueResult) {
    return {
        captions      : [],
        cueErrors     : [],
        cuePromise    : Promise.resolve(),
        cueReceipts   : [],
        cueSettlements: new Map(),
        executeCue() {
            return Promise.resolve(cueResult)
        },
        setTourCaption(text) {
            this.captions.push(text)
        }
    }
}

test.describe('cue settlement truth-binding (prototype-call)', () => {
    const beat = {cue: {type: 'cross-zone-showcase'}, sceneIndex: 0, stepIndex: 0};

    test('an un-applied, error-free, non-cancel receipt fails the settlement and retains its forensics', async () => {
        const host = createCueHost({applied: false, errors: []});

        Workspace.prototype.onTourBeat.call(host, beat);
        await host.cueSettlements.get('0:0');

        expect(host.cueErrors).toEqual(['cross-zone-showcase: terminal effect did not apply']);
        expect(host.cueReceipts, 'the forensic receipt is retained alongside the failure')
            .toHaveLength(1);
        expect(host.captions.at(-1)).toContain('Surface cue failed')
    });

    test('a receipt carrying errors fails the settlement with those errors', async () => {
        const host = createCueHost({applied: true, errors: ['zone unreachable', 'no candidate']});

        Workspace.prototype.onTourBeat.call(host, beat);
        await host.cueSettlements.get('0:0');

        expect(host.cueErrors).toEqual(['cross-zone-showcase: zone unreachable; no candidate']);
        expect(host.cueReceipts).toHaveLength(1)
    });

    test('a cancel terminal settles legitimately un-applied', async () => {
        const host = createCueHost({applied: false, cancelled: true, errors: []});

        Workspace.prototype.onTourBeat.call(host, beat);
        await host.cueSettlements.get('0:0');

        expect(host.cueErrors).toEqual([]);
        expect(host.cueReceipts).toHaveLength(1)
    });

    test('a healthy applied receipt settles clean', async () => {
        const host = createCueHost({applied: true, beatLog: [], errors: []});

        Workspace.prototype.onTourBeat.call(host, beat);
        await host.cueSettlements.get('0:0');

        expect(host.cueErrors).toEqual([]);
        expect(host.cueReceipts).toHaveLength(1)
    });
});

test.describe('replay probe transaction (prototype-call)', () => {
    test('a rejecting entry projection still restores the displaced document under restoreDocument', async () => {
        const
            liveDocument = {nodes: {marker: 'live'}},
            refreshCalls = [],
            host         = {
                dockModel     : liveDocument,
                id            : 'fake-workspace',
                isDestroyed   : false,
                refreshPromise: Promise.resolve(),
                refreshDockWorkspace(tabInsertDescriptor, document, options) {
                    refreshCalls.push(options ?? {});

                    return refreshCalls.length === 1
                        ? Promise.reject(new Error('entry projection rejected'))
                        : Promise.resolve()
                }
            };

        await expect(
            Workspace.prototype.runTourSpec.call(host, null, {restoreDocument: true}),
            'the transaction error propagates'
        ).rejects.toThrow('entry projection rejected');

        expect(host.dockModel, 'the exact displaced document is restored').toBe(liveDocument);
        expect(refreshCalls, 'entry projection + restore projection both ran').toHaveLength(2)
    });

    test('a successful replay surfaces a rejecting restore projection instead of swallowing it', async () => {
        const
            liveDocument = {nodes: {marker: 'live'}},
            refreshCalls = [],
            host         = {
                dockModel     : liveDocument,
                id            : 'fake-workspace',
                isDestroyed   : false,
                refreshPromise: Promise.resolve(),
                refreshDockWorkspace(tabInsertDescriptor, document, options) {
                    refreshCalls.push(options ?? {});

                    // entry projection succeeds; the restore projection rejects
                    return refreshCalls.length === 1
                        ? Promise.resolve()
                        : Promise.reject(new Error('restore projection rejected'))
                }
            },
            script = {
                schema: 'neo.tour.script.v1',
                id    : 'clean-pause',
                title : 'clean pause',
                scenes: [{id: 's1', title: 'pause', steps: [{type: 'pause', ms: 1}]}]
            };

        await expect(
            Workspace.prototype.runTourSpec.call(host, script, {restoreDocument: true}),
            'a probe may not report success over an un-projected surface'
        ).rejects.toThrow('restore projection rejected');

        expect(host.dockModel, 'the displaced document is still restored').toBe(liveDocument);
        expect(refreshCalls).toHaveLength(2)
    });

    test('a structured runner failure returns intact — a rejecting restore projection may not replace it', async () => {
        const
            liveDocument = {nodes: {marker: 'live'}},
            refreshCalls = [],
            host         = {
                dockModel     : liveDocument,
                id            : 'fake-workspace-unregistered',
                isDestroyed   : false,
                refreshPromise: Promise.resolve(),
                refreshDockWorkspace(tabInsertDescriptor, document, options) {
                    refreshCalls.push(options ?? {});

                    return refreshCalls.length === 1
                        ? Promise.resolve()
                        : Promise.reject(new Error('restore projection rejected'))
                }
            },
            // The unregistered holder id makes every dock-service step fail STRUCTURALLY:
            // the runner reports {completed:false, errors:[...]} without throwing.
            script = {
                schema: 'neo.tour.script.v1',
                id    : 'structured-failure',
                title : 'structured failure',
                scenes: [{
                    id   : 's1',
                    title: 'assert',
                    steps: [{type: 'topology-assert', expect: [{path: 'nodes.missing.items', equals: ['x']}]}]
                }]
            };

        const result = await Workspace.prototype.runTourSpec.call(host, script, {restoreDocument: true});

        expect(result.completed, 'the structured failure reaches the caller').toBe(false);
        expect(
            result.errors.some(error => !error.includes('restore projection failed')),
            'the runner forensics survive the restore'
        ).toBe(true);
        expect(
            result.errors.some(error => error.includes('restore projection failed: restore projection rejected')),
            'the suppressed restore failure is recorded on the structured result'
        ).toBe(true);
        expect(host.dockModel, 'the displaced document is still restored').toBe(liveDocument);
        expect(refreshCalls, 'the rejecting restore projection ran and was recorded').toHaveLength(2)
    });

    test('the entry projection requests validated in-place admission; the restore stays full', async () => {
        const
            // A REAL same-topology document, not the `{nodes: {marker: 'live'}}` stub the sibling
            // cases use. The entry flag is now DERIVED from a topology compare of this document
            // against the one being reset into place, so the stub would fail the diff's shape gate
            // and the derivation would fail closed — turning this assertion into a statement about
            // an unparseable fixture rather than about same-topology admission.
            liveDocument = Document.clone(initialDocument),
            refreshCalls = [],
            host         = {
                dockModel     : liveDocument,
                id            : 'fake-workspace',
                isDestroyed   : false,
                refreshPromise: Promise.resolve(),
                refreshDockWorkspace(tabInsertDescriptor, document, options) {
                    refreshCalls.push(options ?? {});

                    return Promise.resolve()
                }
            },
            script = {
                schema: 'neo.tour.script.v1',
                id    : 'clean-pause',
                title : 'clean pause',
                scenes: [{id: 's1', title: 'pause', steps: [{type: 'pause', ms: 1}]}]
            };

        await Workspace.prototype.runTourSpec.call(host, script, {restoreDocument: true});

        // Entry declares admission to the validated in-place path (reconcileStableTopology
        // null-falls-back to the staged transaction on any topology delta — the fallback
        // contract is pinned in DockProjectionReconciler.spec.mjs). The staged shell swap's
        // cleared-body intermediate frame must never ride the same-topology entry.
        expect(refreshCalls[0], 'the entry projection requests geometry-only admission')
            .toEqual({geometryOnly: true});

        // The restore transition can genuinely change topology (the replay edited the
        // workspace); it stays on the full staged path with no admission declared.
        expect(refreshCalls[1], 'the restore projection stays full').toEqual({});
        expect(host.dockModel, 'the displaced document is restored').toBe(liveDocument)
    });

    test('a rejecting entry projection leaves the driver default without a restore', async () => {
        const
            liveDocument = {nodes: {marker: 'live'}},
            refreshCalls = [],
            host         = {
                dockModel     : liveDocument,
                id            : 'fake-workspace',
                isDestroyed   : false,
                refreshPromise: Promise.resolve(),
                refreshDockWorkspace(tabInsertDescriptor, document, options) {
                    refreshCalls.push(options ?? {});

                    return Promise.reject(new Error('entry projection rejected'))
                }
            };

        await expect(
            Workspace.prototype.runTourSpec.call(host, null)
        ).rejects.toThrow('entry projection rejected');

        expect(host.dockModel, 'the driver contract keeps the baseline (no silent restore)')
            .not.toBe(liveDocument);
        expect(refreshCalls).toHaveLength(1)
    });
});


test.describe('cross-zone dwell candidate re-verification (prototype-call)', () => {
    // Drives `executeCrossZoneShowcaseStep` to its first dwell with a fake host, then applies
    // `onDwell` to the indicators when the dwell-length timeout fires — covering both mid-dwell
    // loss modes: expiry (the candidate is gone) and preemption (a different candidate is live).
    const runDwellScenario = async onDwell => {
        const
            dwellDelay = 600,
            events     = [],
            timeouts   = [],
            indicators = {
                candidateSet: {
                    zone : {nodeId: 'zone-a'},
                    cross: [{preview: {placement: {kind: 'before'}, previewId: 'preview-a', target: {nodeId: 'zone-a'}}}]
                },
                activeCandidate     : {preview: {placement: {kind: 'before'}, previewId: 'preview-a', target: {nodeId: 'zone-a'}}},
                getCandidateHitPoint: () => ({x: 360, y: 360})
            },
            button = {
                id        : 'fake-tab-button',
                windowId  : 'fake-cross-zone-window',
                getDomRect: async () => [{height: 20, width: 40, x: 100, y: 100}]
            },
            sortZone = {enableProxyToPopup: true, isDestroyed: false},
            host     = {
                dockModel      : {nodes: {'source-tabs': {items: ['item-1'], type: 'tabs'}}},
                id             : 'fake-workspace-cross-zone',
                isDestroyed    : false,
                refreshPromise : Promise.resolve(),
                dragAffordances: {
                    indicators,
                    ensureGeometry: async () => ({zones: [
                        {nodeId: 'zone-a', rect: {height: 100, width: 100, x: 300, y: 300}},
                        {nodeId: 'zone-b', rect: {height: 100, width: 100, x: 500, y: 500}}
                    ]})
                },
                interactionService: {
                    simulateEvent(payload) {
                        events.push(...payload.events);

                        return Promise.resolve()
                    }
                },
                getReference: () => ({down: () => ({getTabAtIndex: () => button, getTabBar: () => ({sortZone})})}),
                timeout(ms) {
                    timeouts.push(ms);

                    if (ms >= dwellDelay) {
                        onDwell(indicators)
                    }

                    return Promise.resolve()
                },
                cancelTearOutGesture   : async () => ({}),
                retireFilmCursorDot    : async () => {},
                waitForTearOutDragArmed: async () => true
            },
            step = {
                itemId      : 'item-1',
                sourceNodeId: 'source-tabs',
                dwells      : [
                    {placementKind: 'before', targetNodeId: 'zone-a'},
                    {placementKind: 'after',  targetNodeId: 'zone-b'}
                ]
            };

        // Dynamic import AFTER setup() — the manager singleton touches `Neo.currentWorker` at
        // construct time, so a static import would run before the test env wires the worker and
        // poison the whole file's module load (same reason the production method imports it lazily).
        const {default: WindowManager} = await import('../../../../../src/manager/Window.mjs');

        WindowManager.register({id: 'fake-cross-zone-window', innerRect: {height: 800, width: 1200, x: 0, y: 0}, windowId: 'fake-cross-zone-window'});

        try {
            return await Workspace.prototype.executeCrossZoneShowcaseStep.call(host, step, {dwellDelay});
        } finally {
            WindowManager.unregister('fake-cross-zone-window')
        }
    };

    test('an active candidate lost during the dwell fails the step with a gate-named executor error', async () => {
        // Expiry mode: a human-pause dwell outlives the gesture claim's arbitration TTL and the
        // candidate is gone when the dwell elapses. The unguarded read threw an unattributed
        // TypeError from inside the executor; the guard converts it into a gate-named receipt.
        const result = await runDwellScenario(indicators => {
            indicators.activeCandidate = null
        });

        expect(result.applied, 'the step fails closed').toBe(false);
        expect(
            result.errors[0],
            'the loss surfaces as a gate-named executor receipt, not an unattributed null-read'
        ).toMatch(/active candidate 'preview-a' lost during the 600ms dwell — gate=dwell-reverify active=null dwell=1\/2/);
    });

    test('an active candidate swapped during the dwell fails the step instead of adopting the wrong preview', async () => {
        // Preemption mode: a different (truthy) candidate takes over mid-dwell. A presence-only
        // guard would silently adopt the swap — the final preview, beat log, and committed
        // operation would all name a candidate this gesture never verified.
        const result = await runDwellScenario(indicators => {
            indicators.activeCandidate = {preview: {placement: {kind: 'after'}, previewId: 'preview-b', target: {nodeId: 'zone-b'}}}
        });

        expect(result.applied, 'the step fails closed').toBe(false);
        expect(
            result.errors[0],
            'the swap surfaces as the same gate-named receipt, with the live candidate named'
        ).toMatch(/active candidate 'preview-a' lost during the 600ms dwell — gate=dwell-reverify active=preview-b dwell=1\/2/);
    });
});

test.describe('refreshDockWorkspace — DockFlip is told the OUTCOME, not the request', () => {
    /**
     * @summary Drives one refresh with a stubbed reconciler outcome and captures DockFlip's options.
     *
     * The contract under test is a seam, not a predicate: `geometryOnly` is an admission REQUEST
     * that `reconcileProjection` validates and may abandon for the staged shell swap. `DockFlip.play`
     * declares something stronger — "no topology swap can be pending" — so it must receive the
     * reconciler's reported `landedInPlace`. Forwarding the request is how a reset across a diverged
     * layout used to declare stable topology over a swap that had already happened.
     * @param {Object}  options
     * @param {Boolean} options.requested Value the caller passes as `geometryOnly`
     * @param {Boolean} options.landedInPlace Outcome the reconciler reports
     * @returns {Promise<Object|null>} The options DockFlip received, or null if it was never called
     */
    async function captureFlipOptions({requested, landedInPlace}) {
        const
            originalReconcile = DockProjectionReconciler.reconcileProjection,
            originalAddon     = Neo.main?.addon,
            workspace         = Neo.create(Workspace, {appName: 'WorkstationWorkspaceTest'});

        let flipOptions = null;

        Neo.main       = Neo.main || {};
        Neo.main.addon = {...(originalAddon || {}), DockFlip: {play: async options => {flipOptions = options}}};

        DockProjectionReconciler.reconcileProjection = async () => ({
            currentTabs    : new Map(),
            landedInPlace,
            nextShell      : workspace.getReference('dock-host')?.items?.[0],
            overflowPlugins: [],
            plans          : []
        });

        try {
            await workspace.refreshDockWorkspace({geometryOnly: requested})
        } catch (error) {/* the stubbed projection short-circuits the rest of the refresh */}
        finally {
            DockProjectionReconciler.reconcileProjection = originalReconcile;
            Neo.main.addon                               = originalAddon;
            workspace.destroy()
        }

        return flipOptions
    }

    test('a staged fallback is NOT reported to DockFlip as geometry-only, even when requested', async () => {
        // The defect this replaces: the caller asked for in-place admission, the reconciler fell
        // back to the staged shell swap, and DockFlip was still told the topology was stable.
        const options = await captureFlipOptions({requested: true, landedInPlace: false});

        expect(options, 'DockFlip must actually have been reached — a null capture proves nothing').not.toBeNull();
        expect(options.geometryOnly, 'the request must not survive a staged fallback').toBe(false)
    });

    test('an in-place landing IS reported to DockFlip as geometry-only', async () => {
        // The other direction, so the fix cannot be the trivially safe "always false" — which would
        // cost every same-topology reset the staged shell swap's cleared-body frame on camera.
        const options = await captureFlipOptions({requested: true, landedInPlace: true});

        expect(options, 'DockFlip must actually have been reached — a null capture proves nothing').not.toBeNull();
        expect(options.geometryOnly, 'a proven in-place landing keeps its admission').toBe(true)
    })
});

test.describe('Workspace — the theme toggle reveals from the pointer (#18125)', () => {
    /**
     * Runs `toggleWorkspaceTheme` against a stubbed engine, capturing the theme as it stood at the
     * moment the transition was requested. That snapshot is the whole point: the reveal only shows a
     * difference if the flip lands INSIDE the transition's capture window, i.e. after this call.
     * @param {Object} config {data, startResult, startingTheme}
     * @returns {Promise<Object>} {calls, themeAtCall, themeAfter, threw}
     */
    async function toggleWithStubbedTransition({data, startResult = true, reject = false, startingTheme = 'neo-theme-neo-light'} = {}) {
        const
            originalDomAccess = Neo.main.DomAccess,
            domAccess         = originalDomAccess ?? Neo.ns('Neo.main.DomAccess', true),
            originalStart     = domAccess.startViewTransition,
            calls             = [];

        let workspace, themeAtCall = null, themeAfter = null, threw = null;

        domAccess.startViewTransition = async payload => {
            calls.push(payload);
            themeAtCall = workspace.theme;

            if (reject) {
                throw new Error('remote round trip rejected')
            }

            return startResult
        };

        try {
            workspace = Neo.create(Workspace, {theme: startingTheme});

            try {
                themeAfter = await workspace.toggleWorkspaceTheme(data)
            } catch (error) {
                threw = error
            }

            return {calls, themeAtCall, themeAfter, threw}
        } finally {
            originalStart
                ? domAccess.startViewTransition = originalStart
                : delete domAccess.startViewTransition;

            workspace?.destroy()
        }
    }

    test('the flip lands inside the capture window, not before the transition starts', async () => {
        const {calls, themeAtCall, themeAfter} = await toggleWithStubbedTransition({
            data: {clientX: 120, clientY: 40}
        });

        expect(calls, 'the engine transition must actually have been requested').toHaveLength(1);

        // The discriminating assertion. Flipping first would leave the transition capturing the
        // already-dark DOM as both states — a reveal playing over no visible difference, which no
        // end-state check can tell apart from a working one.
        expect(themeAtCall, 'the OLD theme must still be applied when the transition is requested')
            .toBe('neo-theme-neo-light');

        expect(themeAfter, 'and the new theme is applied once the window is open').toBe('neo-theme-neo-dark')
    });

    test('the pointer and window reach the engine, which owns the reveal geometry', async () => {
        const {calls} = await toggleWithStubbedTransition({data: {clientX: 120, clientY: 40}});

        expect(calls[0].reveal, 'raw coordinates travel; no radius is computed in the app')
            .toEqual({x: 120, y: 40});

        expect(calls[0].delay, 'the caller declares its own capture window').toBe(100);
        expect(calls[0]).toHaveProperty('windowId')
    });

    test('a browser without the View Transition API still flips the theme', async () => {
        const {themeAfter, threw} = await toggleWithStubbedTransition({startResult: false});

        expect(threw, 'a false return is the documented no-API answer, not a failure').toBeNull();

        // The reveal is decorative: today's instant flip is the floor this change must not regress.
        expect(themeAfter, 'the theme flips whether or not the transition ran').toBe('neo-theme-neo-dark')
    });

    test('a rejected remote round trip still flips the theme', async () => {
        // The engine resolves rather than rejects, but this is a REMOTE method and the transport can
        // fail for reasons the callee never sees. Before this method awaited anything it was
        // infallible; without the guard a rejected round trip would skip the flip and leave the
        // button doing nothing — a worse outcome than the animation it was meant to protect.
        const {themeAfter, threw} = await toggleWithStubbedTransition({reject: true});

        expect(threw, 'a decorative reveal must never take the flip down with it').toBeNull();
        expect(themeAfter, 'the theme flips even when the transition never happened').toBe('neo-theme-neo-dark')
    });

    test('a toggle with no event neither throws nor invents a reveal origin', async () => {
        const {calls, themeAfter, threw} = await toggleWithStubbedTransition({data: undefined});

        expect(threw, 'a missing event must not reach the engine as a crash').toBeNull();

        // Undefined coordinates are how `createRevealAnimation` is told there is no origin — it
        // returns null and the transition runs as the browser's default cross-fade. Passing a
        // made-up origin here would paint a circle from a place the user never clicked.
        expect(calls[0].reveal, 'no origin is fabricated').toEqual({x: undefined, y: undefined});

        expect(themeAfter, 'and the flip still happens').toBe('neo-theme-neo-dark')
    })
});

test.describe('getRefreshOptions — BOTH admissions are the ENGINE\'s, not a list this host keeps', () => {
    /**
     * @summary Reads this host's refresh options, optionally with the engine's default neutered.
     *
     * The host used to hand-list `['resizeEdgeZone', 'resizeSplit']` — a verbatim restatement of
     * `Operations.operationChangeClass`, which is why a consumer that did not know to write the
     * same list got the full staged transaction on every drag-resize. The VALUES below are
     * unchanged; only their source moved, and an arm that asserts values alone cannot tell the
     * difference. Neutering the engine can: a private list survives it, delegation does not.
     * `dockModel` is what makes the railed arms real rather than stubbed: the engine's item-flag
     * guard resolves placement through `isDockRailedItem`, which reads `dockModel.items[itemId]`.
     * Passing a document exercises the engine's own predicate instead of replacing it with a
     * hand-held boolean, so an arm still fails if that predicate changes underneath this host.
     * @param {Object|null} descriptor
     * @param {Boolean} [neuterEngine=false] Make the engine's default contribute nothing
     * @param {Object|null} [dockModel=null] The pre-commit document the railed guard reads
     * @returns {Object}
     */
    function refreshOptionsFor(descriptor, neuterEngine=false, dockModel=null) {
        const
            enginePrototype = Object.getPrototypeOf(Workspace.prototype),
            original        = enginePrototype.getRefreshOptions,
            workspace       = Neo.create(Workspace, {appName: 'WorkstationWorkspaceTest'});

        dockModel && (workspace.dockModel = dockModel);

        neuterEngine && (enginePrototype.getRefreshOptions = () => ({}));

        try {
            return workspace.getRefreshOptions(descriptor, null)
        } finally {
            enginePrototype.getRefreshOptions = original;
            workspace.destroy()
        }
    }

    test('a resize still admits the in-place path, and it now comes from the change class', () => {
        expect(refreshOptionsFor({operation: 'resizeSplit'}),
            'a split boundary move is unchanged for this host')
            .toEqual({geometryOnly: true, retainTopology: false});

        expect(refreshOptionsFor({operation: 'resizeEdgeZone'}),
            'and so is an edge-zone extent')
            .toEqual({geometryOnly: true, retainTopology: false});

        // The discriminating half. With the engine contributing nothing, a host that still kept
        // its own operation list would answer `true` here.
        expect(refreshOptionsFor({operation: 'resizeSplit'}, true),
            'with the engine neutered the host has no geometry answer of its own')
            .toEqual({geometryOnly: false, retainTopology: false})
    });

    test('the two jobs that are genuinely this host\'s survive the delegation', () => {
        // This host's own paths commit with an options object rather than a semantic descriptor,
        // so an explicit `geometryOnly` carries no operation the engine could classify. It must
        // still be honoured — with the engine neutered, to prove the host answers it alone.
        expect(refreshOptionsFor({geometryOnly: true}, true),
            'an explicit request on an options-object commit is the host\'s to answer')
            .toEqual({geometryOnly: true, retainTopology: false});

        expect(refreshOptionsFor({operation: 'detachItem'}),
            'the stable-topology mapping is untouched by this change')
            .toEqual({geometryOnly: false, retainTopology: true});

        expect(refreshOptionsFor({operation: 'moveItem', preserveItemIds: ['editor']}),
            'and a commit-scoped park still rides along')
            .toEqual({geometryOnly: false, retainTopology: false, preserveItemIds: ['editor']})
    });

    // #18152 removed the lock flicker in the engine by deriving `{retainTopology: true}` for the
    // item-flag class. It never reached this host, because the override wrote `retainTopology`
    // unconditionally: for `setItemLocked` the operation test is `false`, and an unconditional
    // `false` overwrites the engine's `true` instead of falling back to it. The host is where the
    // operator demoed docking, so the flicker was still live exactly where it was reported.
    test('a lock on a shell item reaches this host\'s item-only refresh', () => {
        const shellItem = {items: {editor: {locked: false}}};

        expect(refreshOptionsFor({operation: 'setItemLocked', itemId: 'editor'}, false, shellItem),
            'the engine derives the item-only path and this host no longer shadows it')
            .toEqual({geometryOnly: false, retainTopology: true});

        // The discriminating half, mirroring the geometry arm above. A host that still answered
        // `retainTopology` from its own operation list would be unmoved by neutering the engine —
        // and would answer `false` here either way, which is the bug this arm fails on.
        expect(refreshOptionsFor({operation: 'setItemLocked', itemId: 'editor'}, true, shellItem),
            'with the engine neutered this host has no item-flag answer of its own')
            .toEqual({geometryOnly: false, retainTopology: false})
    });

    test('a railed item still takes the full transaction — delegation inherits the guard, a naive merge would not', () => {
        // `isDockRailedItem` is `autoHidden === true && pinned !== true`: auto-hide is rail
        // membership and pinning is the override that keeps the pane open in the shell. A railed
        // pane projects OUTSIDE the shell, so an item-only refresh would leave a stale copy on the
        // rail — worse than the slow path it replaces. The engine answers `{}` for it.
        expect(refreshOptionsFor(
            {operation: 'setItemLocked', itemId: 'editor'}, false,
            {items: {editor: {autoHidden: true}}}
        ), 'the engine declines, and adding two unrelated operations to a decline is still a decline')
            .toEqual({geometryOnly: false, retainTopology: false});

        // Control on the axis the guard actually turns on. Same operation, same item, one field
        // different — an arm that only ever saw the railed case could not tell this delegation
        // apart from a blanket `false`.
        expect(refreshOptionsFor(
            {operation: 'setItemLocked', itemId: 'editor'}, false,
            {items: {editor: {autoHidden: true, pinned: true}}}
        ), 'a pinned pane is open in the shell, so it is not railed and the fast path holds')
            .toEqual({geometryOnly: false, retainTopology: true})
    })
});
