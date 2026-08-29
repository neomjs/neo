import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'DockDemoWorkspaceBTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import '../../../../../../src/manager/Instance.mjs'; // defines Neo.get — the container child-add path resolves parents through it
import Component                from '../../../../../../src/component/Base.mjs';
import Container                from '../../../../../../src/container/Base.mjs';
import DemoBWorkspace           from '../../../../../../examples/dashboard/crossWindow/DemoBWorkspace.mjs';
import DockPreview              from '../../../../../../src/dashboard/dock/interaction/Preview.mjs';
import DockProjectionReconciler from '../../../../../../src/dashboard/dock/projection/Reconciler.mjs';
import Document                 from '../../../../../../src/dashboard/dock/model/Document.mjs';
import Operations               from '../../../../../../src/dashboard/dock/model/Operations.mjs';

import {demoBTourScript, initialDocument} from '../../../../../../examples/dashboard/crossWindow/demoBPerspectives.mjs';

/**
 * @summary Installs deterministic popup-vessel seams for the worker-side workspace specs.
 * The real OS-window round-trip is owned by the E2E witness; these seams isolate document
 * ownership, rollback, and no-spawn behavior without weakening their call contract.
 * @param {Object} [options={}]
 * @param {Error|null} [options.openError=null]
 * @param {Error|null} [options.closeError=null]
 * @param {Boolean|Function} [options.nativeCloseResult=true]
 * @param {Boolean|Function} [options.nativeFocusResult=true]
 * @param {Boolean} [options.nativeMoveResult=true]
 * @param {Boolean} [options.parkResult=true]
 * @param {Boolean} [options.resumeResult=true]
 * @returns {Object}
 */
function installWindowVessel({
    openError=null,
    closeError=null,
    nativeCloseResult=true,
    nativeFocusResult=true,
    nativeMoveResult=true,
    parkResult=true,
    resumeResult=true
} = {}) {
    let previous = {
            dragDrop          : Neo.main.addon.DragDrop,
            getWindowData     : Neo.Main.getWindowData,
            windowClose       : Neo.Main.windowClose,
            windowNativeClose : Neo.Main.windowNativeClose,
            windowNativeFocus : Neo.Main.windowNativeFocus,
            windowNativeMoveTo: Neo.Main.windowNativeMoveTo,
            windowOpen        : Neo.Main.windowOpen
        },
        state = {
            closeCalls: [], closeCount: 0, nativeCloseCalls: [], nativeMoveCalls: [],
            events    : [], focusCalls: [], openCalls: [], openCount: 0, parkCalls: [], resumeCalls: []
        };

    Neo.Main.getWindowData = async () => ({screenLeft: 10, screenTop: 20});
    Neo.Main.windowOpen    = async data => {
        state.openCalls.push(data);
        state.openCount++;
        if (openError) throw openError;
        return true
    };
    Neo.Main.windowClose   = async data => {
        state.closeCalls.push(data);
        state.closeCount++;
        if (closeError) throw closeError
    };
    Neo.Main.windowNativeClose = async data => {
        state.nativeCloseCalls.push(data);
        return typeof nativeCloseResult === 'function' ? nativeCloseResult(data) : nativeCloseResult
    };
    Neo.Main.windowNativeFocus = async data => {
        state.focusCalls.push(data);
        state.events.push('focus');
        return typeof nativeFocusResult === 'function' ? nativeFocusResult(data) : nativeFocusResult
    };
    Neo.Main.windowNativeMoveTo = async data => {
        state.nativeMoveCalls.push(data);
        return nativeMoveResult
    };
    Neo.main.addon.DragDrop = {
        parkWindowDrag: async data => {
            state.parkCalls.push(data);
            state.events.push('park');
            return parkResult
        },
        resumeWindowDrag: async data => {
            state.resumeCalls.push(data);
            return resumeResult
        }
    };

    return {
        get closeCount() { return state.closeCount },
        get closeCalls() { return state.closeCalls },
        get events() { return state.events },
        get focusCalls() { return state.focusCalls },
        get nativeCloseCalls() { return state.nativeCloseCalls },
        get nativeMoveCalls() { return state.nativeMoveCalls },
        get openCalls() { return state.openCalls },
        get openCount() { return state.openCount },
        get parkCalls() { return state.parkCalls },
        get resumeCalls() { return state.resumeCalls },
        restore() {
            Neo.main.addon.DragDrop = previous.dragDrop;
            Object.assign(Neo.Main, {
                getWindowData     : previous.getWindowData,
                windowClose       : previous.windowClose,
                windowNativeClose : previous.windowNativeClose,
                windowNativeFocus : previous.windowNativeFocus,
                windowNativeMoveTo: previous.windowNativeMoveTo,
                windowOpen        : previous.windowOpen
            })
        }
    }
}

/**
 * @summary Installs exact child-window connection seams for vessel-owner tests.
 * Each registered child carries the production-shaped native route minted by its opener;
 * URL parameters alone therefore never stand in for physical-window authority.
 * @param {Neo.component.Base} workspace
 * @returns {{addedTo: Function, connect: Function, register: Function, restore: Function}}
 */
function installWindowConnectHarness(workspace) {
    let previous = {
            getByPath    : Neo.Main.getByPath,
            getWindowData: Neo.Main.getWindowData,
            managerGet   : Neo.manager.Window.get,
            windowOpen   : Neo.Main.windowOpen
        },
        managerRecords = new Map(),
        windows        = new Map();

    Neo.Main.getByPath = async ({windowId}) => windows.get(windowId)?.url;
    Neo.Main.getWindowData = async () => ({
        innerHeight: 700,
        outerHeight: 740,
        screenLeft : 10,
        screenTop  : 20
    });
    Neo.manager.Window.get = windowId => managerRecords.get(windowId) ?? previous.managerGet.call(Neo.manager.Window, windowId);

    return {
        addedTo(windowId) {
            return windows.get(windowId)?.added ?? []
        },

        async connect(windowId, url) {
            let added       = [],
                nativeRoute = {
                    capabilities   : {close: true, focus: true, position: true},
                    nativeHandleKey: `handle-${windowId}`,
                    ownerWindowId  : workspace.windowId,
                    targetWindowId : windowId
                };

            windows.set(windowId, {added, url: new URL(url, 'https://example.test').href});
            managerRecords.set(windowId, {
                innerRect: {height: 320, width: 480, x: 40, y: 60},
                outerRect: {height: 360, width: 480, x: 40, y: 60},
                nativeRoute
            });
            Neo.apps[windowId] = {
                mainView: {
                    add: pane => added.push(pane)
                }
            };

            await workspace.onWindowConnect({
                windowData: {
                    nativeRoute
                },
                windowId
            })
        },

        register(windowId, {
            innerRect={height: 520, width: 600, x: 874, y: 55},
            outerRect={height: 560, width: 600, x: 874, y: 55}
        } = {}) {
            managerRecords.set(windowId, {
                innerRect,
                outerRect,
                nativeRoute: {
                    capabilities   : {close: true, focus: true, position: true},
                    nativeHandleKey: `handle-${windowId}`,
                    ownerWindowId  : workspace.windowId,
                    targetWindowId : windowId
                }
            })
        },

        restore() {
            Object.assign(Neo.Main, {
                getByPath    : previous.getByPath,
                getWindowData: previous.getWindowData,
                windowOpen   : previous.windowOpen
            });
            Neo.manager.Window.get = previous.managerGet;
            windows.forEach((value, windowId) => delete Neo.apps[windowId])
        }
    }
}

/**
 * @summary Contract specs for the Demo-B workspace: the dock-holder contract, the live
 * perspective capture→load round-trip over the real store, pane-instance permanence across
 * re-projections, the pop-out bookkeeping guards, and the store-born switcher. The window
 * side of pop-out (real popup + reparent) is live-surface behavior; the e2e sibling leaf
 * owns it post-merge — these specs pin every seam the workspace itself decides.
 */
test.describe.serial('Neo.examples.dashboard.crossWindow.DemoBWorkspace', () => {
    let workspace;

    test.beforeEach(() => {
        workspace = Neo.create(DemoBWorkspace, {})
    });

    test.afterEach(() => {
        workspace?.destroy?.();
        workspace = null
    });

    test('the holder contract: an own cloned stage, readable before any operation', () => {
        const doc = workspace.getDockZoneDocument();

        expect(doc).not.toBe(initialDocument);
        expect(doc.nodes.root.zones.center).toBe('workbench-tabs');
        expect(doc.nodes['side-tabs'].items).toEqual(['inspector', 'timeline', 'console'])
    });

    test('this host conditionally activates one semantic cross-window step', () => {
        const steps = demoBTourScript.scenes.flatMap(scene => scene.steps)
            .filter(step => step.type === 'cross-window');

        expect(workspace.tourRunner.crossWindowExecutor).toBe(workspace);
        expect(steps).toEqual([{
            type             : 'cross-window',
            itemId           : 'workbench',
            sourceWorkspaceId: 'demo-b-main',
            targetWorkspaceId: 'demo-b-popup',
            targetNodeId     : 'popup-tabs',
            caption          : 'drag(workbench → popup): one real pointer gesture crosses two active OS windows. The worker instance and counter never reset.'
        }])
    });

    test('capture → load round-trip through the REAL store: one committed swap, honest names', () => {
        // capture the boot stage under a name
        const captured = workspace.capturePerspective('Focus');

        expect(captured.saved).toBe(true);
        expect(captured.errors).toEqual([]);

        // mutate the live document (a committed split)
        const result = workspace.applyDockZoneOperation({
            operation  : 'splitNode', itemId: 'timeline', targetNodeId: 'workbench-tabs',
            orientation: 'vertical', edge: 'bottom'
        });

        expect(result.errors).toEqual([]);
        workspace.dockModel = result.document;

        expect(workspace.getDockZoneDocument().nodes['split-workbench-tabs-0']).toBeTruthy();

        // loading the name restores the captured shape — the split is gone again
        const loaded = workspace.loadPerspectiveByName('Focus');

        expect(loaded.loaded).toBe(true);
        expect(workspace.getDockZoneDocument().nodes['split-workbench-tabs-0']).toBeUndefined();
        expect(workspace.getDockZoneDocument().nodes.root.zones.center).toBe('workbench-tabs')
    });

    test('loading an unknown perspective fails closed and mutates nothing', () => {
        const before = JSON.stringify(workspace.getDockZoneDocument());
        const loaded = workspace.loadPerspectiveByName('Nope');

        expect(loaded.loaded).toBe(false);
        expect(loaded.errors.join()).toContain('no perspective named');
        expect(JSON.stringify(workspace.getDockZoneDocument())).toBe(before)
    });

    test('pane instances are PERMANENT: the same objects survive a re-projection', async () => {
        const
            workbenchBefore = workspace.resolvePane('workbench', initialDocument.items.workbench),
            inspectorBefore = workspace.resolvePane('inspector', initialDocument.items.inspector),
            chromeBefore    = DockProjectionReconciler.collectProjectedTabs(
                workspace.getReference('dock-host-b').items[0]
            );

        await workspace.refreshDockWorkspace();

        const chromeAfter = DockProjectionReconciler.collectProjectedTabs(
            workspace.getReference('dock-host-b').items[0]
        );

        expect(workspace.resolvePane('workbench', initialDocument.items.workbench)).toBe(workbenchBefore);
        expect(workspace.resolvePane('inspector', initialDocument.items.inspector)).toBe(inspectorBefore);
        expect(workbenchBefore.isDestroyed).toBeFalsy();
        expect([...chromeAfter.keys()]).toEqual([...chromeBefore.keys()]);
        chromeBefore.forEach((tab, nodeId) => expect(chromeAfter.get(nodeId)).toBe(tab))
    });

    test('popOutPane guards: unknown, uncached, and double detach all fail closed', async () => {
        // unknown item: no cache entry, no home
        let result = await workspace.popOutPane('ghost');
        expect(result.detached).toBe(false);

        // materialize the pane cache, then detach legitimately would need window seams —
        // assert the DOUBLE-detach guard by staging the bookkeeping directly
        workspace.resolvePane('workbench', initialDocument.items.workbench);
        workspace.detachedPanes.workbench = {tabsNodeId: 'workbench-tabs', windowId: null};

        result = await workspace.popOutPane('workbench');
        expect(result.detached).toBe(false);
        expect(result.errors.join()).toContain('workbench')
    });

    test('a competing G1 child cannot steal a pane already owned by the workspace target', async () => {
        const harness = installWindowConnectHarness(workspace),
              pane    = workspace.resolvePane('workbench', initialDocument.items.workbench),
              moved   = Operations.transferItem(
                  workspace.dockModel,
                  DemoBWorkspace.createPopupDocument(),
                  {
                      itemId: 'workbench', sourceWorkspaceId: 'demo-b-main', targetWorkspaceId: 'demo-b-popup',
                      target: {operation: 'addTab', tabsNodeId: 'popup-tabs'}
                  }
              );

        workspace.dockModel     = moved.sourceDocument;
        workspace.popupDocument = moved.targetDocument;
        workspace.detachedPanes.workbench = {
            tabsNodeId: 'workbench-tabs',
            windowId  : 'workspace-target',
            windowName: 'demo-b-cross-window'
        };

        try {
            await harness.connect(
                'competing-g1',
                `https://example.test/?popout=workbench&hostId=${workspace.id}`
            );

            expect(harness.addedTo('competing-g1')).toEqual([]);
            expect(workspace.detachedPanes.workbench.windowId).toBe('workspace-target');
            expect(workspace.paneCache.workbench).toBe(pane)
        } finally {
            harness.restore()
        }
    });

    test('the workspace stage consumes one exact target grant instead of trusting its URL shape', async () => {
        const harness = installWindowConnectHarness(workspace),
              mounts  = [];
        let stageUrl;

        workspace.timeout = () => new Promise(() => {});
        workspace.mountCrossWindowTarget = async (app, windowId) => {
            mounts.push(windowId);
            workspace.crossWindowStageResolve?.({
                hostId: 'workspace-host', windowId, workspaceId: DemoBWorkspace.POPUP_WORKSPACE_ID
            })
        };
        Neo.Main.windowOpen = async data => {
            stageUrl = data.url;

            const wrongFlowUrl = new URL(stageUrl, 'https://example.test');

            wrongFlowUrl.searchParams.set('vesselFlow', 'click-popout');
            await harness.connect('wrong-flow-child', wrongFlowUrl);

            await harness.connect('workspace-child', stageUrl);
            return true
        };

        try {
            expect(await workspace.openCrossWindowStage()).toMatchObject({windowId: 'workspace-child'});

            const params = new URL(stageUrl, 'https://example.test').searchParams;

            expect(params.get('vesselFlow')).toBe('workspace-target');
            expect(params.get('vesselGrant')).toBeTruthy();
            expect(params.get('vesselGeneration')).toBeTruthy();
            expect(harness.addedTo('wrong-flow-child')).toEqual([]);
            expect(mounts).toEqual(['workspace-child']);

            await harness.connect('workspace-replay', stageUrl);
            expect(mounts).toEqual(['workspace-child'])
        } finally {
            harness.restore()
        }
    });

    test('click pop-out consumes its exact owner grant once even when connect beats open settlement', async () => {
        const harness = installWindowConnectHarness(workspace),
              pane    = workspace.resolvePane('workbench', initialDocument.items.workbench);
        let clickUrl;

        Neo.Main.windowOpen = async data => {
            clickUrl = data.url;
            await harness.connect('click-child', clickUrl);
            return true
        };

        try {
            expect(await workspace.popOutPane('workbench')).toEqual({detached: true, errors: []});

            const params = new URL(clickUrl, 'https://example.test').searchParams;

            expect(params.get('vesselFlow')).toBe('click-popout');
            expect(params.get('vesselGrant')).toBeTruthy();
            expect(params.get('vesselGeneration')).toBeTruthy();
            expect(harness.addedTo('click-child')).toEqual([pane]);
            expect(workspace.detachedPanes.workbench.windowId).toBe('click-child');

            await harness.connect('click-replay', clickUrl);

            expect(harness.addedTo('click-replay')).toEqual([]);
            expect(workspace.detachedPanes.workbench.windowId).toBe('click-child')
        } finally {
            harness.restore()
        }
    });

    test('tear-out connect-before-terminal consumes its grant and a replay stays inert', async () => {
        const harness      = installWindowConnectHarness(workspace),
              pane         = workspace.resolvePane('timeline', initialDocument.items.timeline),
              sourceParent = pane.parent,
              sourceIndex  = sourceParent.items.indexOf(pane),
              before       = JSON.stringify(workspace.getDockZoneDocument());
        let tearOutOpen;

        Neo.Main.windowOpen = async data => {
            tearOutOpen = data;
            return true
        };

        try {
            expect(await workspace.openTearOutVessel({
                itemId: 'timeline', proxyRect: {height: 320, width: 480, x: 40, y: 60}
            })).toMatchObject({windowName: 'tearout-timeline'});

            const tearOutUrl = tearOutOpen.url;
            const params     = new URL(tearOutUrl, 'https://example.test').searchParams;

            expect(tearOutOpen.nativeCapabilities).toEqual({close: true, position: true});
            expect(params.get('vesselFlow')).toBe('tear-out');
            expect(params.get('vesselGrant')).toBeTruthy();
            expect(params.get('vesselGeneration')).toBeTruthy();

            await harness.connect('tear-child', tearOutUrl);
            expect(workspace.tearOutConnects.timeline).toEqual({windowId: 'tear-child'});
            expect(harness.addedTo('tear-child'), 'the admitted moving vessel renders the live pane pre-terminal')
                .toEqual([pane]);
            expect(JSON.stringify(workspace.getDockZoneDocument()), 'render embodiment mutates no document truth')
                .toBe(before);
            expect(sourceParent.items, 'the hidden stand-in keeps card/header indices stable')
                .toHaveLength(3);
            expect(sourceParent.items[sourceIndex].cls).toContain('neo-dashboard-dock-vessel-placeholder');

            workspace.adoptTearOutPane('timeline');
            expect(harness.addedTo('tear-child'), 'terminal promotion never reparents twice').toEqual([pane]);
            expect(workspace.tearOutPanes.timeline.windowId).toBe('tear-child');
            expect(workspace.tearOutConnects.timeline, 'committed ownership has only one lifecycle map').toBeUndefined();

            await harness.connect('tear-replay', tearOutUrl);
            expect(harness.addedTo('tear-replay')).toEqual([]);
            expect(workspace.tearOutPanes.timeline.windowId).toBe('tear-child')
        } finally {
            harness.restore()
        }
    });

    test('a refused close during pane stage retains the exact route but never publishes the generation', async () => {
        let admitClose = false;

        const vessel   = installWindowVessel({nativeCloseResult: () => admitClose}),
              harness  = installWindowConnectHarness(workspace),
              stage    = workspace.tearOutEmbodiment.stage,
              restore  = workspace.tearOutEmbodiment.restore,
              restored = [];

        let resolveStage,
            stageEnteredResolve;

        const stageEntered = new Promise(resolve => stageEnteredResolve = resolve),
              stageResult  = new Promise(resolve => resolveStage = resolve),
              sortZone     = {endWindowDrag() {}, startWindowDrag() {}};

        workspace.tearOutEmbodiment.stage = data => {
            stageEnteredResolve(data);
            return stageResult
        };
        workspace.tearOutEmbodiment.restore = data => {
            restored.push(data);
            return true
        };

        try {
            await workspace.tearOutHandlers.onDockTearOutExit({
                itemId: 'timeline', proxyRect: {height: 320, width: 480, x: 40, y: 60}, sortZone
            });

            const open           = vessel.openCalls.at(-1),
                  params         = new URL(open.url, 'https://example.test').searchParams,
                  admissionToken = Number(params.get('vesselAdmission')),
                  generation     = Number(params.get('vesselGeneration')),
                  connecting     = harness.connect('tear-stage-race', open.url);

            await expect(stageEntered).resolves.toEqual({itemId: 'timeline', windowId: 'tear-stage-race'});
            expect(workspace.tearOutConnectAdmissions.get('timeline')).toEqual({
                admissionToken, generation, invalidated: false, windowId: 'tear-stage-race'
            });

            await expect(workspace.tearOutHandlers.onDockTearOutCancel({itemId: 'timeline', sortZone})).resolves.toBe(false);

            expect(workspace.tearOutConnectAdmissions.get('timeline')).toEqual({
                admissionToken, generation, invalidated: true, windowId: 'tear-stage-race'
            });
            expect(workspace.tearOutRetirements.has('timeline')).toBe(true);
            expect(workspace.tearOutHandlers.activeVessel).toEqual({
                itemId: 'timeline', windowName: 'tearout-timeline'
            });

            resolveStage(true);
            await connecting;

            expect(restored).toEqual([{itemId: 'timeline', windowId: 'tear-stage-race'}]);
            expect(workspace.tearOutConnects.timeline, 'the dead generation never becomes route authority').toBeUndefined();
            expect(workspace.tearOutPanes.timeline).toBeUndefined();

            admitClose = true;

            await expect(workspace.tearOutHandlers.onDockTearOutCancel({itemId: 'timeline', sortZone})).resolves.toBe(true);
            expect(workspace.tearOutConnectAdmissions.has('timeline')).toBe(false);
            expect(workspace.tearOutRetirements.has('timeline')).toBe(false);
            expect(workspace.tearOutHandlers.activeVessel).toBeNull();
            expect(vessel.nativeCloseCalls).toEqual([
                {nativeHandleKey: 'handle-tear-stage-race', targetWindowId: 'tear-stage-race', windowId: workspace.windowId},
                {nativeHandleKey: 'handle-tear-stage-race', targetWindowId: 'tear-stage-race', windowId: workspace.windowId}
            ])
        } finally {
            workspace.tearOutEmbodiment.stage   = stage;
            workspace.tearOutEmbodiment.restore = restore;
            harness.restore();
            vessel.restore()
        }
    });

    test('a disconnect during staged committed ownership reintegrates instead of taking the pre-terminal branch', async () => {
        const vessel   = installWindowVessel(),
              harness  = installWindowConnectHarness(workspace),
              stage    = workspace.tearOutEmbodiment.stage,
              isStaged = workspace.tearOutEmbodiment.isStaged,
              restore  = workspace.tearOutEmbodiment.restore,
              restored = [],
              sortZone = {endWindowDrag() {}, startWindowDrag() {}};

        let resolveStage,
            stageEnteredResolve,
            staged = false;

        const stageEntered = new Promise(resolve => stageEnteredResolve = resolve),
              stageResult  = new Promise(resolve => resolveStage = resolve);

        workspace.tearOutEmbodiment.stage = data => {
            staged = true;
            stageEnteredResolve(data);
            return stageResult
        };
        workspace.tearOutEmbodiment.isStaged = () => staged;
        workspace.tearOutEmbodiment.restore = data => {
            restored.push(data);
            staged = false;
            return true
        };

        try {
            await workspace.tearOutHandlers.onDockTearOutExit({
                itemId: 'timeline', proxyRect: {height: 320, width: 480, x: 40, y: 60}, sortZone
            });

            const connecting = harness.connect('tear-stage-committed', vessel.openCalls.at(-1).url);

            await expect(stageEntered).resolves.toEqual({itemId: 'timeline', windowId: 'tear-stage-committed'});
            expect(workspace.tearOutHandlers.onDockTearOutTerminal({itemId: 'timeline', sortZone})).toBe(true);
            expect(Document.findContainingTabsId(workspace.getDockZoneDocument(), 'timeline')).toBeNull();
            expect(workspace.tearOutPanes.timeline.windowId).toBeNull();

            workspace.onWindowDisconnect({windowId: 'tear-stage-committed'});

            expect(Document.findContainingTabsId(workspace.getDockZoneDocument(), 'timeline'))
                .toBe('side-tabs');
            expect(workspace.tearOutPanes.timeline).toBeUndefined();
            expect(workspace.tearOutConnectAdmissions.has('timeline')).toBe(false);
            expect(restored).toEqual([{itemId: 'timeline', windowId: 'tear-stage-committed'}]);

            resolveStage(false);
            await connecting;

            expect(workspace.tearOutConnects.timeline).toBeUndefined();
            expect(workspace.tearOutPanes.timeline).toBeUndefined()
        } finally {
            workspace.tearOutEmbodiment.stage     = stage;
            workspace.tearOutEmbodiment.isStaged = isStaged;
            workspace.tearOutEmbodiment.restore   = restore;
            harness.restore();
            vessel.restore()
        }
    });

    test('vessel conversion parks, restores, and retires only the exact manager-owned native route', async () => {
        let admitClose = false;

        const vessel       = installWindowVessel({nativeCloseResult: () => admitClose}),
              harness      = installWindowConnectHarness(workspace),
              pane         = workspace.resolvePane('timeline', initialDocument.items.timeline),
              sourceParent = pane.parent,
              sourceIndex  = sourceParent.items.indexOf(pane);

        try {
            await workspace.openTearOutVessel({
                itemId: 'timeline', proxyRect: {height: 320, width: 480, x: 40, y: 60}
            });
            await harness.connect('tear-child', vessel.openCalls.at(-1).url);
            harness.register('target-child');
            workspace.crossWindowTargetWindowId = 'target-child';

            expect(workspace.resolveVesselConversionSourceRect({itemId: 'timeline'})).toEqual({
                height: 320, width: 480, x: 40, y: 60
            });
            await expect(workspace.parkTearOutVessel({
                itemId: 'timeline', windowName: 'tearout-timeline'
            })).resolves.toBe(true);
            expect(vessel.events).toEqual(['focus', 'park', 'focus']);
            expect(vessel.focusCalls).toEqual([{
                nativeHandleKey: 'handle-target-child',
                targetWindowId : 'target-child',
                windowId       : workspace.windowId
            }, {
                nativeHandleKey: 'handle-target-child',
                targetWindowId : 'target-child',
                windowId       : workspace.windowId
            }]);
            expect(vessel.parkCalls).toEqual([{
                nativeHandleKey: 'handle-tear-child',
                targetWindowId : 'tear-child',
                windowId       : workspace.windowId,
                windowName     : 'tearout-timeline',
                x              : 874,
                y              : 55
            }]);

            const liveRect = {height: 320, width: 480, x: 420, y: 240};

            await expect(workspace.reshowTearOutVessel({
                itemId: 'timeline', rect: liveRect, terminal: false, windowName: 'tearout-timeline'
            })).resolves.toBe(true);
            expect(vessel.resumeCalls.at(-1)).toMatchObject({
                nativeHandleKey: 'handle-tear-child', targetWindowId: 'tear-child', x: 420, y: 240
            });

            await expect(workspace.reshowTearOutVessel({
                itemId: 'timeline', rect: liveRect, terminal: true, windowName: 'tearout-timeline'
            })).resolves.toBe(true);
            expect(vessel.nativeMoveCalls.at(-1)).toMatchObject({
                nativeHandleKey: 'handle-tear-child', targetWindowId: 'tear-child', x: 420, y: 240
            });

            const route = Neo.manager.Window.get('tear-child').nativeRoute;

            route.ownerWindowId = 'wrong-owner';
            await expect(workspace.parkTearOutVessel({
                itemId: 'timeline', windowName: 'tearout-timeline'
            })).resolves.toBe(false);
            await expect(workspace.closeTearOutVessel({
                itemId: 'timeline', windowName: 'tearout-timeline'
            })).resolves.toBe(false);
            expect(vessel.closeCalls, 'a stale exact route must never downgrade to same-name close').toEqual([]);
            expect(vessel.nativeCloseCalls).toEqual([]);

            route.ownerWindowId = workspace.windowId;
            route.capabilities.position = false;
            await expect(workspace.reshowTearOutVessel({
                itemId: 'timeline', rect: liveRect, terminal: true, windowName: 'tearout-timeline'
            })).resolves.toBe(false);
            route.capabilities.position = true;

            await expect(workspace.closeTearOutVessel({
                itemId: 'timeline', windowName: 'tearout-timeline'
            })).resolves.toBe(false);
            expect(workspace.tearOutConnects.timeline, 'strict close refusal retains recovery routing')
                .toEqual({windowId: 'tear-child'});
            expect(sourceParent.items[sourceIndex], 'refused close leaves content home, not in a doomed vessel')
                .toBe(pane);
            expect(workspace.tearOutEmbodiment.isStaged('timeline')).toBe(false);
            expect(workspace.tearOutRetirements.has('timeline'), 'late connects stay fenced during retry authority')
                .toBe(true);

            admitClose = true;

            await expect(workspace.closeTearOutVessel({
                itemId: 'timeline', windowName: 'tearout-timeline'
            })).resolves.toBe(true);
            expect(workspace.tearOutConnects.timeline).toBeUndefined();
            expect(workspace.tearOutRetirements.has('timeline')).toBe(false);
            expect(vessel.nativeCloseCalls).toEqual([
                {nativeHandleKey: 'handle-tear-child', targetWindowId: 'tear-child', windowId: workspace.windowId},
                {nativeHandleKey: 'handle-tear-child', targetWindowId: 'tear-child', windowId: workspace.windowId}
            ])
        } finally {
            harness.restore();
            vessel.restore()
        }
    });

    test('pre-terminal disconnect clears both retained lifecycle owners for a successor gesture', () => {
        const previousTearOut = workspace.tearOutHandlers,
              previousPark    = workspace.vesselParkHandlers,
              calls           = [];

        workspace.tearOutConnects.timeline = {windowId: 'tear-pending'};
        workspace.tearOutHandlers = {
            onVesselRetired: data => calls.push(['tear-out', data])
        };
        workspace.vesselParkHandlers = {
            onVesselRetired: data => calls.push(['park', data])
        };

        try {
            workspace.onWindowDisconnect({windowId: 'tear-pending'});

            expect(workspace.tearOutConnects.timeline).toBeUndefined();
            expect(calls).toEqual([
                ['tear-out', {itemId: 'timeline', windowName: 'tearout-timeline'}],
                ['park', {itemId: 'timeline', retirement: true}]
            ])
        } finally {
            workspace.tearOutHandlers       = previousTearOut;
            workspace.vesselParkHandlers    = previousPark;
            delete workspace.tearOutConnects.timeline
        }
    });

    test('a successor boundary exit retries retained retirement before opening a fresh vessel', async () => {
        const previousTearOut = workspace.tearOutHandlers,
              previousPark    = workspace.vesselParkHandlers,
              calls           = [],
              active          = {itemId: 'timeline', windowName: 'tearout-timeline'},
              data            = {sortZone: {endWindowDrag: () => calls.push('end')}};

        workspace.tearOutHandlers = {
            activeVessel      : active,
            onDockTearOutExit : async value => calls.push(['exit', value]),
            retireActiveVessel: async value => {
                calls.push(['retire', value]);
                return true
            }
        };
        workspace.vesselParkHandlers = {
            onVesselRetired: value => calls.push(['park-retired', value])
        };

        try {
            await expect(workspace.onDockTearOutExit(data)).resolves.toBe(true);
            expect(calls).toEqual([
                ['retire', active],
                ['park-retired', {itemId: 'timeline', retirement: true}],
                ['exit', data]
            ]);

            calls.length = 0;
            workspace.tearOutHandlers.retireActiveVessel = async value => {
                calls.push(['retire', value]);
                return false
            };

            await expect(workspace.onDockTearOutExit(data)).resolves.toBe(false);
            expect(calls).toEqual([['retire', active], 'end'])
        } finally {
            workspace.tearOutHandlers    = previousTearOut;
            workspace.vesselParkHandlers = previousPark
        }
    });

    test('a target-focus refusal leaves the source vessel moving and never dispatches a park effect', async () => {
        const vessel  = installWindowVessel({nativeFocusResult: false}),
              harness = installWindowConnectHarness(workspace);

        try {
            await workspace.openTearOutVessel({
                itemId: 'timeline', proxyRect: {height: 320, width: 480, x: 40, y: 60}
            });
            await harness.connect('tear-child', vessel.openCalls.at(-1).url);
            harness.register('target-child');
            workspace.crossWindowTargetWindowId = 'target-child';

            await expect(workspace.parkTearOutVessel({
                itemId: 'timeline', windowName: 'tearout-timeline'
            })).resolves.toBe(false);
            expect(vessel.events).toEqual(['focus']);
            expect(vessel.parkCalls).toEqual([])
        } finally {
            harness.restore();
            vessel.restore()
        }
    });

    test('a post-move cover-focus refusal restores the source rect before refusing park ownership', async () => {
        let focusCalls = 0;

        const vessel  = installWindowVessel({nativeFocusResult: () => ++focusCalls === 1}),
              harness = installWindowConnectHarness(workspace);

        try {
            await workspace.openTearOutVessel({
                itemId: 'timeline', proxyRect: {height: 320, width: 480, x: 40, y: 60}
            });
            await harness.connect('tear-child', vessel.openCalls.at(-1).url);
            harness.register('target-child');
            workspace.crossWindowTargetWindowId = 'target-child';

            await expect(workspace.parkTearOutVessel({
                itemId: 'timeline', windowName: 'tearout-timeline'
            })).resolves.toBe(false);
            expect(vessel.events).toEqual(['focus', 'park', 'focus']);
            expect(vessel.resumeCalls).toEqual([{
                nativeHandleKey: 'handle-tear-child',
                targetWindowId : 'tear-child',
                windowId       : workspace.windowId,
                windowName     : 'tearout-timeline',
                x              : 40,
                y              : 60
            }]);
            expect(workspace.lastVesselParkReceipt).toMatchObject({
                compensated: true,
                moved      : true,
                parked     : false,
                refocused  : false
            })
        } finally {
            harness.restore();
            vessel.restore()
        }
    });

    test('tear-out terminal-before-connect adopts only the granted child', async () => {
        const harness = installWindowConnectHarness(workspace),
              pane    = workspace.resolvePane('timeline', initialDocument.items.timeline);
        let tearOutUrl;

        Neo.Main.windowOpen = async data => {
            tearOutUrl = data.url;
            return true
        };

        try {
            await workspace.openTearOutVessel({
                itemId: 'timeline', proxyRect: {height: 320, width: 480, x: 40, y: 60}
            });

            const operation = {operation: 'detachItem', itemId: 'timeline'},
                  result    = workspace.applyTearOutOperation(operation);

            expect(result.errors).toEqual([]);
            workspace.onTearOutDocumentChange(result.document, operation);
            await workspace.refreshPromise;

            expect(pane.isDestroyed, 'terminal-first projection preserves the live pane for its late child')
                .toBeFalsy();

            await harness.connect('tear-after-terminal', tearOutUrl);

            expect(harness.addedTo('tear-after-terminal')).toEqual([pane]);
            expect(workspace.tearOutPanes.timeline.windowId).toBe('tear-after-terminal')
        } finally {
            harness.restore()
        }
    });

    test('reattachPane falls back to the first tabs node when the remembered home left the tree', async () => {
        // stage a REAL two-document transfer, then remember a home that no longer exists
        workspace.resolvePane('workbench', initialDocument.items.workbench);

        const detached = Operations.transferItem(
            workspace.dockModel,
            DemoBWorkspace.createPopupDocument(),
            {
                itemId: 'workbench', sourceWorkspaceId: 'main', targetWorkspaceId: 'popup',
                target: {operation: 'addTab', tabsNodeId: 'popup-tabs'}
            }
        );

        expect(detached.errors).toEqual([]);
        workspace.dockModel     = detached.sourceDocument;
        workspace.popupDocument = detached.targetDocument;

        workspace.detachedPanes.workbench = {tabsNodeId: 'vanished-tabs', windowId: null};

        const result = await workspace.reattachPane('workbench', {windowAlreadyClosed: true});

        expect(result.reattached).toBe(true);

        const doc  = workspace.getDockZoneDocument();
        const home = Object.keys(doc.nodes).find(id => doc.nodes[id].type === 'tabs' && doc.nodes[id].items.includes('workbench'));

        expect(home, 'the returning pane found a real tabs home').toBeTruthy()
    });

    test('reattachPane closes the stored cross-window vessel name', async () => {
        const vessel = installWindowVessel();

        try {
            workspace.resolvePane('workbench', initialDocument.items.workbench);

            const detached = Operations.transferItem(
                workspace.dockModel,
                DemoBWorkspace.createPopupDocument(),
                {
                    itemId: 'workbench', sourceWorkspaceId: 'main', targetWorkspaceId: 'popup',
                    target: {operation: 'addTab', tabsNodeId: 'popup-tabs'}
                }
            );

            workspace.dockModel     = detached.sourceDocument;
            workspace.popupDocument = detached.targetDocument;
            workspace.detachedPanes.workbench = {
                tabsNodeId: 'workbench-tabs',
                windowId  : 'window-popup',
                windowName: 'demo-b-cross-window'
            };

            expect(await workspace.reattachPane('workbench')).toEqual({errors: [], reattached: true});
            expect(vessel.closeCalls).toEqual([{
                names   : ['demo-b-cross-window'],
                windowId: workspace.windowId
            }])
        } finally {
            vessel.restore()
        }
    });

    test('a manual cross-window close after transfer returns the live item to main ownership', () => {
        const pane     = workspace.resolvePane('workbench', initialDocument.items.workbench),
              detached = Operations.transferItem(
                  workspace.dockModel,
                  DemoBWorkspace.createPopupDocument(),
                  {
                      itemId: 'workbench', sourceWorkspaceId: 'main', targetWorkspaceId: 'popup',
                      target: {operation: 'addTab', tabsNodeId: 'popup-tabs'}
                  }
              );

        workspace.dockModel               = detached.sourceDocument;
        workspace.popupDocument           = detached.targetDocument;
        workspace.crossWindowTargetWindowId = 'window-popup';
        workspace.detachedPanes.workbench = {
            tabsNodeId: 'workbench-tabs',
            windowId  : 'window-popup',
            windowName: 'demo-b-cross-window'
        };

        workspace.onWindowDisconnect({windowId: 'window-popup'});

        expect(workspace.dockModel.items.workbench).toEqual(initialDocument.items.workbench);
        expect(workspace.popupDocument.items.workbench).toBeUndefined();
        expect(workspace.paneCache.workbench).toBe(pane);
        expect(workspace.detachedPanes.workbench).toBeUndefined()
    });

    test('a popup close during projection settlement cannot strand committed popup ownership', async () => {
        const
            pane     = workspace.resolvePane('workbench', initialDocument.items.workbench),
            detached = Operations.transferItem(
                workspace.dockModel,
                DemoBWorkspace.createPopupDocument(),
                {
                    itemId: 'workbench', sourceWorkspaceId: 'demo-b-main', targetWorkspaceId: 'demo-b-popup',
                    target: {operation: 'addTab', tabsNodeId: 'popup-tabs'}
                }
            );

        let releaseTargetRefresh,
            targetRefreshEntered;

        const
            targetRefreshStarted = new Promise(resolve => targetRefreshEntered = resolve),
            refreshCalls         = [];

        workspace.crossWindowTargetWindowId = 'window-popup';
        workspace.crossWindowGestureContext = {
            frames      : pane.frames,
            mountCount  : pane.mountCount,
            pane,
            sourceNodeId: 'workbench-tabs'
        };
        workspace.crossWindowStats = {localDropFires: 0, remoteDropOutFires: 1, transferCommits: 0};
        workspace.timeout          = async () => {};
        workspace.refreshWorkspace = async (workspaceId, document) => {
            refreshCalls.push({document, workspaceId});

            if (refreshCalls.length === 1) {
                targetRefreshEntered();
                await new Promise(resolve => releaseTargetRefresh = resolve)
            }
        };

        const commit = workspace.commitCrossWindowTransfer({
            descriptor: {
                itemId: 'workbench',
                target: {operation: 'addTab', tabsNodeId: 'popup-tabs'}
            },
            sourceDocument   : detached.sourceDocument,
            sourceWorkspaceId: 'demo-b-main',
            targetDocument   : detached.targetDocument,
            targetWorkspaceId: 'demo-b-popup'
        });

        await targetRefreshStarted;

        expect(workspace.detachedPanes.workbench.windowId).toBe('window-popup');

        workspace.onWindowDisconnect({windowId: 'window-popup'});

        expect(workspace.dockModel.items.workbench).toEqual(initialDocument.items.workbench);
        expect(workspace.popupDocument.items.workbench).toBeUndefined();
        expect(workspace.detachedPanes.workbench).toBeUndefined();

        releaseTargetRefresh();
        await commit;
        await workspace.awaitProjectionIdle();

        expect(refreshCalls.map(call => call.workspaceId)).toEqual(['demo-b-popup', 'demo-b-main']);
        expect(workspace.dockModel.items.workbench).toEqual(initialDocument.items.workbench);
        expect(workspace.popupDocument.items.workbench).toBeUndefined()
    });

    test('whole-stack return commits synchronously, reconciles target-first, then unregisters the emptied popup', async () => {
        const detached = Operations.transferItem(
            workspace.dockModel,
            DemoBWorkspace.createPopupDocument(),
            {
                itemId           : 'workbench',
                sourceWorkspaceId: DemoBWorkspace.MAIN_WORKSPACE_ID,
                targetWorkspaceId: DemoBWorkspace.POPUP_WORKSPACE_ID,
                target           : {operation: 'addTab', tabsNodeId: 'popup-tabs'}
            }
        );

        expect(detached.errors).toEqual([]);

        workspace.dockModel     = detached.sourceDocument;
        workspace.popupDocument = detached.targetDocument;
        workspace.detachedPanes.workbench = {
            tabsNodeId: 'workbench-tabs', windowId: 'window-popup', windowName: 'demo-b-cross-window'
        };

        const descriptor = {
            operation        : 'transferNode',
            nodeId           : Document.resolveStackRoot(workspace.popupDocument),
            sourceWorkspaceId: DemoBWorkspace.POPUP_WORKSPACE_ID,
            targetWorkspaceId: DemoBWorkspace.MAIN_WORKSPACE_ID,
            target           : {targetNodeId: 'side-tabs', placement: {kind: 'tab-into'}}
        };
        const returned = Operations.transferNode(workspace.popupDocument, workspace.dockModel, descriptor);

        expect(returned.errors).toEqual([]);

        const refreshes = [],
            order       = [],
            vessel      = installWindowVessel({closeError: new Error('platform refused close')});

        try {
            const adoptCommittedTransferPair = workspace.adoptCommittedTransferPair.bind(workspace),
                retireReturnedPopupWorkspace = workspace.retireReturnedPopupWorkspace.bind(workspace),
                windowClose                  = Neo.Main.windowClose;

            workspace.adoptCommittedTransferPair = data => {
                order.push('adopt');
                return adoptCommittedTransferPair(data)
            };
            workspace.retireReturnedPopupWorkspace = () => {
                order.push('retire');
                return retireReturnedPopupWorkspace()
            };
            Neo.Main.windowClose = data => {
                order.push('close');
                return windowClose(data)
            };

            workspace.timeout = async () => {};
            workspace.refreshWorkspace = async (workspaceId, document) => {
                refreshes.push({document, workspaceId})
            };

            const commit = workspace.commitCrossWindowTransfer({
                descriptor,
                sourceDocument   : returned.sourceDocument,
                sourceWorkspaceId: DemoBWorkspace.POPUP_WORKSPACE_ID,
                targetDocument   : returned.targetDocument,
                targetWorkspaceId: DemoBWorkspace.MAIN_WORKSPACE_ID
            });

            // Synchronous admission is the coordinator gate: model truth + disconnect guard are
            // committed before the promise-owned projection work starts.
            expect(commit).toBeTruthy();
            expect(workspace.dockModel.items.workbench).toEqual(initialDocument.items.workbench);
            expect(workspace.popupDocument.items.workbench).toBeUndefined();
            expect(workspace.detachedPanes.workbench).toBeUndefined();

            const receipt = await commit;

            expect(refreshes.map(entry => entry.workspaceId)).toEqual([
                DemoBWorkspace.MAIN_WORKSPACE_ID,
                DemoBWorkspace.POPUP_WORKSPACE_ID
            ]);
            expect(receipt).toMatchObject({
                applied         : true,
                errors          : [],
                itemIds         : ['workbench'],
                workspaceRetired: true
            });
            expect(order).toEqual(['adopt', 'retire', 'close']);
            expect(vessel.closeCalls).toEqual([{
                names   : ['demo-b-cross-window'],
                windowId: workspace.windowId
            }]);
            expect(workspace.workspaceSet.ids()).toEqual([DemoBWorkspace.MAIN_WORKSPACE_ID, DemoBWorkspace.POPUP2_WORKSPACE_ID]);
            expect(workspace.getWorkspaceDocument(DemoBWorkspace.POPUP_WORKSPACE_ID)).toBeNull();

            // A later explicit stage is a new lifetime: registration is restored against the current
            // empty owner field, never kept alive as a ghost entry after the prior vessel retired.
            expect(workspace.ensurePopupWorkspaceRegistered()).toBe(true);
            expect(workspace.getWorkspaceDocument(DemoBWorkspace.POPUP_WORKSPACE_ID)).toBe(workspace.popupDocument)
        } finally {
            vessel.restore()
        }
    });

    test('the popup group identity reaches the existing preview/candidate pipeline unchanged', () => {
        const popup = DemoBWorkspace.createPopupDocument();

        popup.items.workbench = initialDocument.items.workbench;
        popup.nodes['popup-tabs'].items = ['workbench'];
        popup.nodes['popup-tabs'].activeItemId = 'workbench';
        workspace.popupDocument = popup;

        const renderer   = {dockPreview: null, applyTargetGeometry() {}};
        const indicators = {
            candidateSet: null,
            updatePointer() { return this.candidateSet?.cross?.find(candidate => candidate.position === 'center') ?? null }
        };
        const host = {
            down({ntype}) {
                return ntype === 'dock-preview' ? renderer : indicators
            }
        };
        const geometry = {
            hostRect: {x: 0, y: 0, width: 400, height: 300},
            root    : {nodeId: 'main-root', rect: {x: 0, y: 0, width: 400, height: 300}},
            zones   : [{nodeId: 'side-tabs', rect: {x: 0, y: 0, width: 400, height: 300}, orientation: 'vertical'}]
        };

        workspace.crossWindowHosts.set(DemoBWorkspace.MAIN_WORKSPACE_ID, host);
        workspace.crossWindowGeometry.set(DemoBWorkspace.MAIN_WORKSPACE_ID, geometry);

        const preview = workspace.renderWorkspacePreview(DemoBWorkspace.MAIN_WORKSPACE_ID, {
            draggedItem: {
                dockGroupNodeId      : 'popup-tabs',
                dockItemId           : 'workbench',
                dockSourceWorkspaceId: DemoBWorkspace.POPUP_WORKSPACE_ID
            },
            localX: 200,
            localY: 150
        });

        expect(preview.groupNodeId).toBe('popup-tabs');
        expect(preview.previewId).toContain('preview:group:popup-tabs:');
        expect(indicators.candidateSet.groupNodeId).toBe('popup-tabs');
        expect(renderer.dockPreview).toBe(preview)
    });

    test('main projection binds the conversion lifecycle to Park while popup projection stays source-disabled', () => {
        const calls    = [];
        const findTabs = (config, nodeId) => {
            if (config?.ntype === 'tab-container' && config.dockNodeId === nodeId) return config;

            for (const item of config?.items || []) {
                const found = findTabs(item, nodeId);

                if (found) return found
            }

            return null
        };

        workspace.tearOutConnects.timeline = {windowId: 'tear-child'};
        workspace.vesselParkHandlers = {
            onConversionIn(data) {
                calls.push(['in', data]);
                return true
            },
            onConversionOut(data) {
                calls.push(['out', data]);
                return true
            },
            onGestureTerminal(data) {
                calls.push(['terminal', data]);
                return Promise.resolve(true)
            },
            onVesselRetired(data) {
                calls.push(['retired', data]);
                return true
            }
        };

        const mainTabs  = findTabs(workspace.projectDockModel(), 'side-tabs'),
              popupTabs = findTabs(workspace.projectDockModel(
                  null,
                  DemoBWorkspace.POPUP_WORKSPACE_ID,
                  DemoBWorkspace.createPopupDocument()
              ), 'popup-tabs');

        expect(mainTabs.headerToolbar.sortZoneConfig.enableVesselConversion).toBe(true);
        expect(popupTabs.headerToolbar.sortZoneConfig.enableVesselConversion).toBe(false);

        const converted = {
                  admission: false,
                  itemId   : 'timeline',
                  record   : {sourceRect: {height: 320, width: 480, x: 40, y: 60}}
              },
              reverted = {
                  admission  : false,
                  itemId     : 'timeline',
                  logicalRect: {height: 320, width: 480, x: 420, y: 240}
              },
              terminal = {itemId: 'timeline', outcome: 'committed', settlement: false},
              retired  = {itemId: 'timeline', retirement: Promise.resolve(true), settlement: false};

        mainTabs.listeners.dockVesselConversionIn(converted);
        mainTabs.listeners.dockVesselConversionOut(reverted);
        mainTabs.listeners.dockVesselConversionTerminal(terminal);
        mainTabs.listeners.dockVesselConversionRetired(retired);

        expect(converted.admission).toBe(true);
        expect(reverted.admission).toBe(true);
        expect(terminal.settlement).toBeInstanceOf(Promise);
        expect(retired.settlement).toBe(true);
        expect(calls).toEqual([
            ['in', {
                itemId    : 'timeline',
                sourceRect: {height: 320, width: 480, x: 40, y: 60},
                windowName: 'tearout-timeline'
            }],
            ['out', {rect: {height: 320, width: 480, x: 420, y: 240}}],
            ['terminal', terminal],
            ['retired', retired]
        ])
    });

    test('popup projection alone owns the stack grip and routes one terminal to the optional park machine', () => {
        const popup     = DemoBWorkspace.createPopupDocument();
        const terminals = [];
        const findTabs  = (config, nodeId) => {
            if (config?.ntype === 'tab-container' && config.dockNodeId === nodeId) return config;

            for (const item of config?.items || []) {
                const found = findTabs(item, nodeId);

                if (found) return found
            }

            return null
        };

        popup.items.workbench = initialDocument.items.workbench;
        popup.nodes['popup-tabs'].items = ['workbench'];
        popup.nodes['popup-tabs'].activeItemId = 'workbench';
        workspace.popupDocument = popup;
        workspace.vesselParkHandlers = {onGestureTerminal: data => terminals.push(data)};

        const popupTabs = findTabs(workspace.projectDockModel(
            null,
            DemoBWorkspace.POPUP_WORKSPACE_ID,
            popup
        ), 'popup-tabs');

        expect(popupTabs.headerToolbar.sortZoneConfig.dockGroupNodeId).toBe('popup-tabs');
        expect(popupTabs.items[0].header.text[1].cls).toEqual(['neo-dock-stack-handle']);

        // The same live pane then projects home item-only: this second projection must restore
        // its source header before the popup config can leak an affordance into main.
        const mainTabs = findTabs(workspace.projectDockModel(), 'workbench-tabs');

        expect(mainTabs.headerToolbar.sortZoneConfig.dockGroupNodeId).toBeNull();
        expect(mainTabs.items[0].header).toBeUndefined();

        popupTabs.listeners.dockStackDragTerminal({
            itemId: 'workbench', outcome: 'committed', groupNodeId: 'popup-tabs'
        });
        expect(terminals).toEqual([{itemId: 'workbench', outcome: 'committed'}])
    });

    test('cross-window execution drains a cue projection before it opens the popup stage', async () => {
        workspace.resolvePane('workbench', initialDocument.items.workbench);

        let openCount = 0,
            releaseProjection;

        workspace.refreshPromise = new Promise(resolve => releaseProjection = resolve);
        workspace.openCrossWindowStage = async () => {
            openCount++;
            throw new Error('stop after projection readiness gate')
        };

        const running = workspace.executeCrossWindowStep({
            itemId           : 'workbench',
            sourceWorkspaceId: 'demo-b-main',
            targetWorkspaceId: 'demo-b-popup',
            targetNodeId     : 'popup-tabs'
        });

        await Promise.resolve();
        expect(openCount).toBe(0);

        releaseProjection();

        const result = await running;

        expect(openCount).toBe(1);
        expect(result.applied).toBe(false);
        expect(result.errors).toEqual(['stop after projection readiness gate'])
    });

    test('topology round-trip transfers ownership, reports the missing popup slot, never spawns on restore, and preserves the pane instance', async () => {
        const vessel = installWindowVessel();

        try {
            const pane = workspace.resolvePane('workbench', initialDocument.items.workbench);

            pane.frames = 41;
            expect(workspace.capturePerspective('Focus').saved).toBe(true);

            const popped = await workspace.popOutPane('workbench');

            expect(popped).toEqual({detached: true, errors: []});
            expect(vessel.openCount).toBe(1);
            expect(workspace.dockModel.items.workbench).toBeUndefined();
            expect(workspace.popupDocument.items.workbench).toEqual(initialDocument.items.workbench);
            expect(Document.validate(workspace.dockModel)).toEqual([]);
            expect(Document.validate(workspace.popupDocument)).toEqual([]);

            expect(workspace.capturePerspective('Detached', {scope: 'topology'}).saved).toBe(true);

            const detachedSummary = workspace.perspectiveStore.list().find(entry => entry.perspectiveName === 'Detached'),
                  detachedLayout  = workspace.perspectiveStore.collection.layouts[detachedSummary.layoutId];

            expect(detachedLayout.captureScope).toBe('topology');
            expect(detachedLayout.windowDocuments).toHaveLength(1);

            const reattached = await workspace.reattachPane('workbench', {windowAlreadyClosed: true});

            expect(reattached).toEqual({errors: [], reattached: true});
            expect(workspace.dockModel.items.workbench).toEqual(initialDocument.items.workbench);
            expect(workspace.popupDocument.items.workbench).toBeUndefined();
            expect(Document.validate(workspace.dockModel)).toEqual([]);
            expect(Document.validate(workspace.popupDocument)).toEqual([]);
            expect(workspace.resolvePane('workbench', initialDocument.items.workbench)).toBe(pane);

            const opensBeforeRestore = vessel.openCount,
                  loaded             = workspace.loadPerspectiveByName('Detached');

            expect(loaded.loaded).toBe(true);
            expect(loaded.errors).toEqual([]);
            expect(vessel.openCount).toBe(opensBeforeRestore);
            expect(loaded.report.noWindowSpawned).toBe(true);
            expect(loaded.report.unrestored).toEqual([
                {capturedIndex: 1, itemId: 'workbench', reason: 'no-live-window'}
            ]);
            expect(loaded.report.displaced).toEqual([{itemId: 'workbench', liveIndex: 0}]);
            expect(workspace.dockModel.items.workbench).toBeUndefined();

            // Let the changed-topology projection fully settle while Workbench has no live
            // render target. This is the exact interval where true-removal retirement used
            // to destroy the instance and the synchronous test immediately restored Focus.
            await workspace.refreshPromise;

            expect(pane.isDestroyed, 'the topology remainder keeps Workbench live').toBeFalsy();
            expect(Boolean(pane.parent?.items?.includes(pane)), 'the live pane is parked outside the old projection')
                .toBe(false);

            const report = workspace.getReference('restore-report-b');

            expect(report.hidden).toBe(false);
            expect(report.html).toContain('no window spawned');
            expect(report.html).toContain('workbench (no-live-window)');

            expect(workspace.loadPerspectiveByName('Focus').loaded).toBe(true);
            await workspace.refreshPromise;
            expect(workspace.resolvePane('workbench', initialDocument.items.workbench)).toBe(pane);
            expect(pane.frames).toBeGreaterThanOrEqual(41)
        } finally {
            vessel.restore()
        }
    });

    test('invalid topology restore leaves both live documents and active selection untouched', async () => {
        const vessel = installWindowVessel();

        try {
            workspace.resolvePane('workbench', initialDocument.items.workbench);
            expect(await workspace.popOutPane('workbench')).toEqual({detached: true, errors: []});
            expect(workspace.capturePerspective('Detached', {scope: 'topology'}).saved).toBe(true);

            const summary      = workspace.perspectiveStore.list().find(entry => entry.perspectiveName === 'Detached'),
                  layout       = Document.clone(workspace.perspectiveStore.collection.layouts[summary.layoutId]),
                  dockBefore   = workspace.dockModel,
                  popupBefore  = workspace.popupDocument,
                  dockSnapshot = JSON.stringify(dockBefore),
                  popSnapshot  = JSON.stringify(popupBefore),
                  activeBefore = workspace.perspectiveStore.collection.activeLayoutId;

            layout.windowDocuments[0].root = 'ghost-root';

            const restored = workspace.restoreTopologyPerspective(layout);

            expect(restored.loaded).toBe(false);
            expect(restored.errors.length).toBeGreaterThan(0);
            expect(workspace.dockModel).toBe(dockBefore);
            expect(workspace.popupDocument).toBe(popupBefore);
            expect(JSON.stringify(workspace.dockModel)).toBe(dockSnapshot);
            expect(JSON.stringify(workspace.popupDocument)).toBe(popSnapshot);
            expect(workspace.perspectiveStore.collection.activeLayoutId).toBe(activeBefore);
            expect(workspace.getReference('restore-report-b').html).toContain('live documents stayed untouched')
        } finally {
            vessel.restore()
        }
    });

    test('popup-open failure reverses the transfer instead of orphaning worker truth', async () => {
        const vessel = installWindowVessel({openError: new Error('popup denied')});

        try {
            workspace.resolvePane('workbench', initialDocument.items.workbench);

            const before = JSON.stringify(workspace.dockModel),
                  result = await workspace.popOutPane('workbench');

            expect(result.detached).toBe(false);
            expect(result.errors.join(' ')).toContain('popup denied');
            expect(JSON.stringify(workspace.dockModel)).toBe(before);
            expect(workspace.popupDocument.items.workbench).toBeUndefined();
            expect(workspace.detachedPanes.workbench).toBeUndefined()
        } finally {
            vessel.restore()
        }
    });

    test('the switcher is BORN from store lifecycle: buttons appear per capture', () => {
        const bar = workspace.getReference('switcher-bar');

        expect(bar.items.length).toBe(1); // the label only, pre-capture

        workspace.capturePerspective('Focus');
        workspace.capturePerspective('Review');

        const labels = bar.items.slice(1).map(item => item.text);

        expect(labels).toEqual(['Focus', 'Review'])
    });

    test('re-capturing a name is the update flow, never a collision dispute', () => {
        expect(workspace.capturePerspective('Focus').saved).toBe(true);

        // mutate + re-capture under the same name (the tour-rerun path)
        const result = workspace.applyDockZoneOperation({
            operation  : 'splitNode', itemId: 'console', targetNodeId: 'side-tabs',
            orientation: 'vertical', edge: 'bottom'
        });
        workspace.dockModel = result.document;

        const recaptured = workspace.capturePerspective('Focus');

        expect(recaptured.saved).toBe(true);
        expect(recaptured.errors).toEqual([]);

        // one button, not two — the store replaced, the switcher rebuilt
        const bar = workspace.getReference('switcher-bar');
        expect(bar.items.slice(1).map(item => item.text)).toEqual(['Focus'])
    });

    test('projection coalescing keeps the latest document and preservation policy atomic', async () => {
        const
            topologyDocument = Document.clone(initialDocument),
            focusDocument    = Document.clone(initialDocument),
            calls            = [];

        delete topologyDocument.items.workbench;
        topologyDocument.nodes['workbench-tabs'].items = [];
        topologyDocument.nodes['workbench-tabs'].activeItemId = null;

        workspace.refreshWorkspace = async (workspaceId, document, options) => {
            calls.push({document, options, workspaceId})
        };

        workspace.onWorkspaceDocumentChange(DemoBWorkspace.MAIN_WORKSPACE_ID, topologyDocument, {
            preserveItemIds: ['workbench']
        });
        workspace.onWorkspaceDocumentChange(DemoBWorkspace.MAIN_WORKSPACE_ID, focusDocument);

        await workspace.awaitProjectionIdle();

        expect(calls).toHaveLength(2);
        calls.forEach(call => {
            expect(call.workspaceId).toBe(DemoBWorkspace.MAIN_WORKSPACE_ID);
            expect(call.document).toBe(focusDocument);
            expect(call.options.preserveItemIds).toEqual([])
        })
    });

    test('a rerun drains the prior projection before resetting and starting replay', async () => {
        let releasePrior,
            order = [];

        const mutated = workspace.applyDockZoneOperation({
            operation  : 'splitNode', itemId: 'timeline', targetNodeId: 'workbench-tabs',
            orientation: 'vertical', edge: 'bottom'
        }).document;

        workspace.dockModel = mutated;
        workspace.tourRunner.log.push({type: 'prior-run'});
        workspace.refreshPromise = new Promise(resolve => {
            releasePrior = () => {
                order.push('prior-settled');
                resolve()
            }
        });
        workspace.refreshWorkspace = async (workspaceId, document) => {
            order.push(`refresh:${workspaceId}`);
            expect(document).toBe(workspace.dockModel)
        };
        workspace.tourRunner.start = async () => {
            order.push('runner-started');
            return {completed: true, errors: [], log: []}
        };

        const rerun = workspace.startTour();

        await Promise.resolve();

        expect(order).toEqual([]);
        expect(workspace.dockModel).toBe(mutated);

        releasePrior();
        await rerun;

        expect(order).toEqual([
            'prior-settled',
            `refresh:${DemoBWorkspace.MAIN_WORKSPACE_ID}`,
            'runner-started'
        ]);
        expect(workspace.dockModel).not.toBe(initialDocument);
        expect(workspace.dockModel).toEqual(initialDocument)
    });

    test('tear-out vessel death brings the item HOME at its EXACT stored position', () => {
        // 'timeline' sits at side-tabs index 1 of ['inspector', 'timeline', 'console'] — the
        // middle slot, so an append-shaped return would betray itself immediately.
        const before = workspace.getDockZoneDocument().nodes['side-tabs'].items;

        expect(before).toEqual(['inspector', 'timeline', 'console']);

        // the detach terminal commits through the seam the projection threads — capture rides it
        const result = workspace.applyTearOutOperation({operation: 'detachItem', itemId: 'timeline'});

        expect(result.errors).toEqual([]);
        expect(workspace.tearOutPlacements.timeline).toEqual({tabsNodeId: 'side-tabs', index: 1});

        workspace.onWorkspaceDocumentChange('demo-b-main', result.document);
        expect(workspace.getDockZoneDocument().nodes['side-tabs'].items).toEqual(['inspector', 'console']);

        // the vessel dies: the disconnect correlates by windowId and the item returns home
        workspace.tearOutPanes.timeline = {windowName: 'demo-b-tearout-timeline', windowId: 'tear-win-9'};
        workspace.onWindowDisconnect({windowId: 'tear-win-9'});

        expect(workspace.getDockZoneDocument().nodes['side-tabs'].items, 'identical order, not append order').toEqual(['inspector', 'timeline', 'console']);
        expect(workspace.tearOutPanes.timeline).toBeUndefined();
        expect(workspace.tearOutPlacements.timeline, 'the placement record is consumed exact-once').toBeUndefined();

        // idempotent: a duplicate disconnect for the same window finds nothing and mutates nothing
        const stable = JSON.stringify(workspace.getDockZoneDocument());

        workspace.onWindowDisconnect({windowId: 'tear-win-9'});
        expect(JSON.stringify(workspace.getDockZoneDocument())).toBe(stable)
    });

    test('a stored home that left the tree falls back SEMANTICALLY to a surviving tabs node', () => {
        const detach = workspace.applyTearOutOperation({operation: 'detachItem', itemId: 'timeline'});

        expect(detach.errors).toEqual([]);
        workspace.onWorkspaceDocumentChange('demo-b-main', detach.document);

        // the remembered home leaves the tree: move the two remaining side-tabs items into the
        // workbench node — the emptied side-tabs collapses out on normalize
        for (const itemId of ['inspector', 'console']) {
            const moved = workspace.applyDockZoneOperation({operation: 'addTab', itemId, tabsNodeId: 'workbench-tabs'});

            expect(moved.errors).toEqual([]);
            workspace.onWorkspaceDocumentChange('demo-b-main', moved.document)
        }

        expect(workspace.getDockZoneDocument().nodes['side-tabs']).toBeUndefined();

        workspace.tearOutPanes.timeline = {windowName: 'demo-b-tearout-timeline', windowId: 'tear-win-10'};
        workspace.onWindowDisconnect({windowId: 'tear-win-10'});

        // semantic recovery: the first surviving tabs node, append — never a resurrected node,
        // never geometry
        const home = workspace.getDockZoneDocument().nodes['workbench-tabs'].items;

        expect(home).toContain('timeline');
        expect(home[home.length - 1]).toBe('timeline')
    });

    test('a refused detach commit deletes its own capture — no stale placement survives', () => {
        const result = workspace.applyTearOutOperation({operation: 'detachItem', itemId: 'ghost-item'});

        expect(result.errors.length).toBeGreaterThan(0);
        expect(workspace.tearOutPlacements['ghost-item']).toBeUndefined()
    });

    test('reintegration is idempotent against an item some other flow already re-treed', () => {
        const detach = workspace.applyTearOutOperation({operation: 'detachItem', itemId: 'timeline'});

        workspace.onWorkspaceDocumentChange('demo-b-main', detach.document);

        // another flow re-trees the item mid-vessel (preset restore, NL addTab)
        const readd = workspace.applyDockZoneOperation({operation: 'addTab', itemId: 'timeline', tabsNodeId: 'workbench-tabs'});

        workspace.onWorkspaceDocumentChange('demo-b-main', readd.document);

        workspace.tearOutPanes.timeline = {windowName: 'demo-b-tearout-timeline', windowId: 'tear-win-11'};
        workspace.onWindowDisconnect({windowId: 'tear-win-11'});

        // the reintegration finds the item already placed and leaves it EXACTLY there — one
        // occurrence, in the node the other flow chose, placement record still consumed
        const doc = workspace.getDockZoneDocument();

        expect(Document.findContainingTabsId(doc, 'timeline')).toBe('workbench-tabs');
        expect(doc.nodes['workbench-tabs'].items.filter(id => id === 'timeline')).toHaveLength(1);
        expect(workspace.tearOutPlacements.timeline).toBeUndefined()
    });

    test('resolveDockWorkspaceId answers by host containment, in either window, and fails closed outside', () => {
        // MAIN: a really-projected dock child resolves through the main host's parent chain
        const sideTabs = workspace.getReference('dock-host-b').down({dockNodeId: 'side-tabs'});

        expect(sideTabs, 'the main projection renders the side-tabs container').toBeTruthy();
        expect(workspace.resolveDockWorkspaceId(sideTabs)).toBe(DemoBWorkspace.MAIN_WORKSPACE_ID);

        // POPUP: a child of a registered popup host resolves to the popup workspace
        const popupHost  = Neo.create(Container, {items: []}),
              popupChild = popupHost.add({module: Component});

        workspace.crossWindowHosts.set(DemoBWorkspace.POPUP_WORKSPACE_ID, popupHost);

        expect(workspace.resolveDockWorkspaceId(popupChild)).toBe(DemoBWorkspace.POPUP_WORKSPACE_ID);

        // outside every host: null, never a guess
        const stray = Neo.create(Component, {});

        expect(workspace.resolveDockWorkspaceId(stray)).toBe(null);
        expect(workspace.resolveDockWorkspaceId(null)).toBe(null);

        stray.destroy();
        popupHost.destroy()
    });

    test('resolveFocusedDockItem prefers the dockItemId STAMP and falls back for live panes (#15517)', () => {
        const sideTabs  = workspace.getReference('dock-host-b').down({dockNodeId: 'side-tabs'}),
              toolbar   = sideTabs.down({ntype: 'tab-header-toolbar'}),
              buttons   = toolbar.items,
              sideItems = workspace.getDockZoneDocument().nodes['side-tabs'].items;

        // DemoB's panes are LIVE instances — the adapter passes them through untouched by design,
        // so their buttons carry NO stamp and keep the positional fallback (the untouched discipline)
        expect(buttons.length).toBe(sideItems.length);
        buttons.forEach(button => expect(button.dockItemId).toBeUndefined());

        // non-1:1 order: move the second header to the front WITHOUT touching the document.
        // A stamped button resolves STRUCTURALLY — the positional slot would mis-map
        const moved = buttons[1];

        moved.dockItemId = 'timeline'; // the stamp, as written by the projection for plain configs
        toolbar.remove(moved, false);
        toolbar.insert(0, moved);

        expect(toolbar.items.indexOf(moved)).toBe(0);

        const focused = workspace.resolveFocusedDockItem({path: [{id: moved.id}]});

        expect(focused.itemId, 'the stamp branch wins over the reordered position').toBe('timeline');
        expect(sideItems[0], '…while the positional slot now names a different item').not.toBe('timeline');
        expect(focused.itemLabel).toBe('Timeline');
        expect(focused.workspaceId).toBe(DemoBWorkspace.MAIN_WORKSPACE_ID)
    });


    test('resolveFocusedDockItem answers popup-origin identity from the POPUP workspace document', () => {
        // stage a real transfer so the popup document owns the workbench item
        const detached = Operations.transferItem(
            workspace.dockModel,
            DemoBWorkspace.createPopupDocument(),
            {
                itemId: 'workbench', sourceWorkspaceId: 'demo-b-main', targetWorkspaceId: 'demo-b-popup',
                target: {operation: 'addTab', tabsNodeId: 'popup-tabs'}
            }
        );

        expect(detached.errors).toEqual([]);
        workspace.dockModel     = detached.sourceDocument;
        workspace.popupDocument = detached.targetDocument;

        // project the popup document into a registered popup host — real tab chrome, real chain
        const popupHost = Neo.create(Container, {items: []});

        workspace.crossWindowHosts.set(DemoBWorkspace.POPUP_WORKSPACE_ID, popupHost);
        popupHost.add(workspace.projectDockModel(null, DemoBWorkspace.POPUP_WORKSPACE_ID));

        const button = popupHost.down({ntype: 'tab-header-button'});

        expect(button, 'the popup projection renders a real tab header').toBeTruthy();

        const focused = workspace.resolveFocusedDockItem({path: [{id: button.id}]});

        expect(focused).toEqual({
            itemId     : 'workbench',
            itemLabel  : 'Workbench',
            workspaceId: DemoBWorkspace.POPUP_WORKSPACE_ID
        });

        popupHost.destroy()
    });

    test('the detach chord is gated to the MAIN workspace — popup-origin detach never opens a vessel', async () => {
        let openCount = 0;

        workspace.openTearOutVessel = async () => (openCount++, null);

        const popupFocus = {itemId: 'workbench', itemLabel: 'Workbench', workspaceId: DemoBWorkspace.POPUP_WORKSPACE_ID},
              mainFocus  = {itemId: 'timeline',  itemLabel: 'Timeline',  workspaceId: DemoBWorkspace.MAIN_WORKSPACE_ID},
              keyDown    = focused => {
                  workspace.resolveFocusedDockItem = () => focused;
                  return workspace.onDockHostKeyDown({
                      component: {windowId: 'win-popup'},
                      ctrlKey  : true, key: 'd', path: [], shiftKey: true
                  })
              };

        await keyDown(popupFocus);
        expect(openCount, 'popup-origin detach is not wired — parity with the pointer arming rule').toBe(0);
        expect(workspace.lastKeyboardOriginWindowId, 'the origin window is recorded from the routing host').toBe('win-popup');

        await keyDown(mainFocus);
        expect(openCount, 'main-origin detach reaches the admission seam').toBe(1)
    });

    test('focusDockWorkspaceWindow routes DIRECTIONALLY from the recorded command origin', async () => {
        const popupHost = Neo.create(Container, {items: []}),
              verbCalls = [],
              nameCalls = [],
              previous  = Neo.Main.windowFocus;

        popupHost.windowId = 'win-popup';
        workspace.crossWindowHosts.set(DemoBWorkspace.POPUP_WORKSPACE_ID, popupHost);
        workspace.focusNamedWindow = async name => (nameCalls.push(name), true);
        Neo.Main.windowFocus       = async data => (verbCalls.push(data), true);

        try {
            // target === origin window: focus is already there, no verb rides
            workspace.lastKeyboardOriginWindowId = 'win-popup';
            expect(await workspace.focusDockWorkspaceWindow(DemoBWorkspace.POPUP_WORKSPACE_ID)).toBe(true);
            expect(verbCalls).toEqual([]);
            expect(nameCalls).toEqual([]);

            // popup target from the main origin: the opener's named handle
            workspace.lastKeyboardOriginWindowId = workspace.windowId;
            expect(await workspace.focusDockWorkspaceWindow(DemoBWorkspace.POPUP_WORKSPACE_ID)).toBe(true);
            expect(nameCalls).toEqual(['demo-b-cross-window']);

            // MAIN target from a popup origin: the verb routes to the POPUP's main thread,
            // windowName omitted — the opener branch
            workspace.lastKeyboardOriginWindowId = 'win-popup';
            expect(await workspace.focusDockWorkspaceWindow(DemoBWorkspace.MAIN_WORKSPACE_ID)).toBe(true);
            expect(verbCalls).toEqual([{windowId: 'win-popup'}]);

            // unknown / dead target workspace: false, fail-closed
            expect(await workspace.focusDockWorkspaceWindow('demo-b-ghost')).toBe(false)
        } finally {
            Neo.Main.windowFocus = previous;
            popupHost.destroy()
        }
    });

    test('announceKeyboardOutcome carries the same terminal-derived truth into BOTH windows', () => {
        const popupLive = Neo.create(Component, {});

        workspace.kbdLivePopup = popupLive;
        workspace.announceKeyboardOutcome({message: 'Workbench moved to Main window. Focus moved with it.'});

        expect(workspace.getReference('kbd-live-b').text).toBe('Workbench moved to Main window. Focus moved with it.');
        expect(popupLive.text).toBe('Workbench moved to Main window. Focus moved with it.');

        // a destroyed popup region degrades silently — the main region still announces
        popupLive.destroy();
        workspace.announceKeyboardOutcome({message: 'Move cancelled. Workbench stays where it is.'});
        expect(workspace.getReference('kbd-live-b').text).toBe('Move cancelled. Workbench stays where it is.')
    });

    test('the keyboard highlight renders through the SHARED dock-preview consumer as a whole-zone tab-into affordance', async () => {
        const popupHost = Neo.create(Container, {items: [{module: DockPreview}]}),
              geometry  = {
                  hostRect: {x: 100, y: 50, width: 400, height: 300},
                  root    : {nodeId: 'popup-root', rect: {x: 100, y: 50, width: 400, height: 300}},
                  zones   : [{nodeId: 'popup-tabs', rect: {x: 120, y: 60, width: 300, height: 200}, orientation: null}]
              };

        workspace.crossWindowHosts.set(DemoBWorkspace.POPUP_WORKSPACE_ID, popupHost);
        workspace.crossWindowGeometry.set(DemoBWorkspace.POPUP_WORKSPACE_ID, geometry);

        await workspace.setKeyboardTargetHighlight({
            itemId: 'workbench', tabsId: 'popup-tabs', workspaceId: DemoBWorkspace.POPUP_WORKSPACE_ID
        });

        const renderer   = popupHost.down({ntype: 'dock-preview'}),
              affordance = renderer.vdom.cn[0];

        // the payload IS the shared contract — the fail-closed renderer accepted it
        expect(renderer.dockPreview).toMatchObject({
            itemId   : 'workbench',
            placement: {kind: 'tab-into'},
            schema   : 'neo.dock.preview.v1',
            target   : {nodeId: 'popup-tabs'}
        });
        expect(DockPreview.isValidPreview(renderer.dockPreview)).toBe(true);

        // rendered as the whole-zone band, positioned host-locally (viewport → host conversion)
        expect(affordance.cls).toEqual(expect.arrayContaining([
            'neo-dock-preview-affordance', 'neo-dock-preview-tab', 'neo-dock-preview-tab-into', 'neo-dock-preview-accepted'
        ]));
        expect(affordance.style).toMatchObject({height: '200px', left: '20px', top: '10px', width: '300px'});

        // clear reaches the other window's renderer too
        await workspace.setKeyboardTargetHighlight(null);
        expect(renderer.dockPreview).toBe(null);

        // supersession: a SLOW geometry measure must never paint a stale candidate over a clear
        let releaseMeasure;

        workspace.crossWindowGeometry.delete(DemoBWorkspace.POPUP_WORKSPACE_ID);
        workspace.measureWorkspaceGeometry = () => new Promise(resolve => {
            releaseMeasure = () => resolve(geometry)
        });

        const stalePaint = workspace.setKeyboardTargetHighlight({
            itemId: 'workbench', tabsId: 'popup-tabs', workspaceId: DemoBWorkspace.POPUP_WORKSPACE_ID
        });

        await workspace.setKeyboardTargetHighlight(null);
        releaseMeasure();
        await stalePaint;

        expect(renderer.dockPreview, 'the superseded paint lost against the newer clear').toBe(null);

        popupHost.destroy()
    });

    test('keyboard-transfer candidates carry the item identity the shared preview contract requires', () => {
        const candidates = workspace.enumerateKeyboardTargets({itemId: 'workbench'});

        // main host only: the item sits in workbench-tabs, so side-tabs is the one legal target
        expect(candidates).toEqual([{
            itemId     : 'workbench',
            label      : 'Main window',
            tabsId     : 'side-tabs',
            workspaceId: DemoBWorkspace.MAIN_WORKSPACE_ID
        }])
    });

    test('construct registers three claim targets through the same workspace-set semantics', () => {
        expect(workspace.workspaceSet.ids()).toEqual([
            DemoBWorkspace.MAIN_WORKSPACE_ID,
            DemoBWorkspace.POPUP_WORKSPACE_ID,
            DemoBWorkspace.POPUP2_WORKSPACE_ID
        ]);
        expect(workspace.workspaceSet.getDocument(DemoBWorkspace.POPUP2_WORKSPACE_ID)).toBe(workspace.popup2Document);

        // fail-closed re-registration mirrors popup-1's discipline
        expect(workspace.ensurePopupWorkspaceRegistered(DemoBWorkspace.POPUP2_WORKSPACE_ID)).toBe(true);
        expect(workspace.workspaceSet.getDocument(DemoBWorkspace.POPUP2_WORKSPACE_ID)).toBe(workspace.popup2Document)
    });

    test('the second popup stages through the same seams with its own continuation and window name', async () => {
        const harness = installWindowConnectHarness(workspace);
        let stageUrl, stageWindowName;

        workspace.timeout = () => new Promise(() => {});
        workspace.mountCrossWindowTarget = async (app, windowId, workspaceId) => {
            const resolve = workspaceId === DemoBWorkspace.POPUP2_WORKSPACE_ID
                ? workspace.crossWindowStage2Resolve
                : workspace.crossWindowStageResolve;

            resolve?.({hostId: 'workspace-host', windowId, workspaceId})
        };
        Neo.Main.windowOpen = async data => {
            stageUrl        = data.url;
            stageWindowName = data.windowName;
            await harness.connect('workspace-2-child', stageUrl);
            return true
        };

        try {
            const receipt = await workspace.openCrossWindowStage(DemoBWorkspace.POPUP2_WORKSPACE_ID);

            expect(receipt).toMatchObject({windowId: 'workspace-2-child', workspaceId: DemoBWorkspace.POPUP2_WORKSPACE_ID});
            expect(stageWindowName).toBe('demo-b-cross-window-2');

            const params = new URL(stageUrl, 'https://example.test').searchParams;

            expect(params.get('workspaceId')).toBe('demo-b-popup-2');
            expect(params.get('vesselFlow')).toBe('workspace-target');
            expect(params.get('vesselGrant')).toBeTruthy();

            // popup-1's stage continuation is untouched by the popup-2 stage
            expect(workspace.crossWindowStagePromise).toBe(null);
            expect(workspace.crossWindowStageResolve).toBe(null)
        } finally {
            harness.restore()
        }
    });

    test('a second-popup disconnect retires only its own stage; the last popup retires the main participation', () => {
        const participationOf = () => ({destroyed: false, destroy() { this.destroyed = true }}),
              main            = participationOf(),
              popup           = participationOf(),
              popup2          = participationOf();

        workspace.crossWindowTargetWindowId  = 'win-popup-1';
        workspace.crossWindowTarget2WindowId = 'win-popup-2';
        workspace.crossWindowHosts.set(DemoBWorkspace.POPUP_WORKSPACE_ID, {isDestroyed: false});
        workspace.crossWindowHosts.set(DemoBWorkspace.POPUP2_WORKSPACE_ID, {isDestroyed: false});
        workspace.crossWindowParticipations.set(DemoBWorkspace.MAIN_WORKSPACE_ID, main);
        workspace.crossWindowParticipations.set(DemoBWorkspace.POPUP_WORKSPACE_ID, popup);
        workspace.crossWindowParticipations.set(DemoBWorkspace.POPUP2_WORKSPACE_ID, popup2);
        workspace.crossWindowGeometry.set(DemoBWorkspace.MAIN_WORKSPACE_ID, {});
        workspace.crossWindowGeometry.set(DemoBWorkspace.POPUP_WORKSPACE_ID, {});
        workspace.crossWindowGeometry.set(DemoBWorkspace.POPUP2_WORKSPACE_ID, {});
        workspace.kbdLivePopup2 = Neo.create(Component, {});

        // popup-2 leaves: its own stage retires; the staged sibling pair (main + popup-1) survives
        workspace.onWindowDisconnect({windowId: 'win-popup-2'});

        expect(popup2.destroyed).toBe(true);
        expect(popup.destroyed).toBe(false);
        expect(main.destroyed).toBe(false);
        expect(workspace.crossWindowParticipations.has(DemoBWorkspace.POPUP2_WORKSPACE_ID)).toBe(false);
        expect(workspace.crossWindowParticipations.has(DemoBWorkspace.MAIN_WORKSPACE_ID)).toBe(true);
        expect(workspace.crossWindowTarget2WindowId).toBe(null);
        expect(workspace.crossWindowTargetWindowId).toBe('win-popup-1');
        expect(workspace.kbdLivePopup2).toBe(null);

        // popup-1 leaves: no popup target remains, so the main participation retires with it
        workspace.onWindowDisconnect({windowId: 'win-popup-1'});

        expect(popup.destroyed).toBe(true);
        expect(main.destroyed).toBe(true);
        expect(workspace.crossWindowParticipations.has(DemoBWorkspace.MAIN_WORKSPACE_ID)).toBe(false);
        expect(workspace.crossWindowTargetWindowId).toBe(null)
    });

    test('announceKeyboardOutcome carries the same terminal-derived truth into ALL staged windows', () => {
        const popupLive  = Neo.create(Component, {}),
              popup2Live = Neo.create(Component, {});

        workspace.kbdLivePopup  = popupLive;
        workspace.kbdLivePopup2 = popup2Live;
        workspace.announceKeyboardOutcome({message: 'Workbench moved to Main window. Focus moved with it.'});

        expect(workspace.getReference('kbd-live-b').text).toBe('Workbench moved to Main window. Focus moved with it.');
        expect(popupLive.text).toBe('Workbench moved to Main window. Focus moved with it.');
        expect(popup2Live.text).toBe('Workbench moved to Main window. Focus moved with it.');

        // a destroyed popup-2 region degrades silently — the other regions still announce
        popup2Live.destroy();
        workspace.announceKeyboardOutcome({message: 'Move cancelled. Workbench stays where it is.'});

        expect(workspace.getReference('kbd-live-b').text).toBe('Move cancelled. Workbench stays where it is.');
        expect(popupLive.text).toBe('Move cancelled. Workbench stays where it is.')
    });

    test('destroy tears down the runner, seam, store, and every cached pane', () => {
        const pane                                        = workspace.resolvePane('workbench', initialDocument.items.workbench);
        const {dockService, perspectiveStore, tourRunner} = workspace;

        workspace.destroy();

        expect(tourRunner.isDestroyed).toBeTruthy();
        expect(dockService.isDestroyed).toBeTruthy();
        expect(perspectiveStore.isDestroyed).toBeTruthy();
        expect(pane.isDestroyed).toBeTruthy();

        workspace = null
    })
});
