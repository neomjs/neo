import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'DockDemoWorkspaceBTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import '../../../../../../../src/manager/Instance.mjs'; // defines Neo.get — the container child-add path resolves parents through it
import DemoBWorkspace           from '../../../../../../../apps/agentos/childapps/dockdemo/view/DemoBWorkspace.mjs';
import DockProjectionReconciler from '../../../../../../../src/dashboard/DockProjectionReconciler.mjs';
import DockZoneModel            from '../../../../../../../src/dashboard/DockZoneModel.mjs';

import {demoBTourScript, initialDocument} from '../../../../../../../apps/agentos/tour/demoBPerspectives.mjs';

/**
 * @summary Installs deterministic popup-vessel seams for the worker-side workspace specs.
 * The real OS-window round-trip is owned by the E2E witness; these seams isolate document
 * ownership, rollback, and no-spawn behavior without weakening their call contract.
 * @param {Object} [options={}]
 * @param {Error|null} [options.openError=null]
 * @param {Error|null} [options.closeError=null]
 * @returns {{openCount: Number, closeCount: Number, closeCalls: Object[], restore: Function}}
 */
function installWindowVessel({openError = null, closeError = null} = {}) {
    let previous = {
            getWindowData: Neo.Main.getWindowData,
            windowClose  : Neo.Main.windowClose,
            windowOpen   : Neo.Main.windowOpen
        },
        state = {closeCalls: [], closeCount: 0, openCount: 0};

    Neo.Main.getWindowData = async () => ({screenLeft: 10, screenTop: 20});
    Neo.Main.windowOpen    = async () => {
        state.openCount++;
        if (openError) throw openError
    };
    Neo.Main.windowClose   = async data => {
        state.closeCalls.push(data);
        state.closeCount++;
        if (closeError) throw closeError
    };

    return {
        get closeCount() { return state.closeCount },
        get closeCalls() { return state.closeCalls },
        get openCount()  { return state.openCount },
        restore() {
            Object.assign(Neo.Main, previous)
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
test.describe.serial('AgentOS.childapps.dockdemo.view.DemoBWorkspace', () => {
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

    test('reattachPane falls back to the first tabs node when the remembered home left the tree', async () => {
        // stage a REAL two-document transfer, then remember a home that no longer exists
        workspace.resolvePane('workbench', initialDocument.items.workbench);

        const detached = DockZoneModel.transferItem(
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

            const detached = DockZoneModel.transferItem(
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
              detached = DockZoneModel.transferItem(
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
            detached = DockZoneModel.transferItem(
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
            expect(DockZoneModel.validate(workspace.dockModel)).toEqual([]);
            expect(DockZoneModel.validate(workspace.popupDocument)).toEqual([]);

            expect(workspace.capturePerspective('Detached', {scope: 'topology'}).saved).toBe(true);

            const detachedSummary = workspace.perspectiveStore.list().find(entry => entry.perspectiveName === 'Detached'),
                  detachedLayout  = workspace.perspectiveStore.collection.layouts[detachedSummary.layoutId];

            expect(detachedLayout.captureScope).toBe('topology');
            expect(detachedLayout.windowDocuments).toHaveLength(1);

            const reattached = await workspace.reattachPane('workbench', {windowAlreadyClosed: true});

            expect(reattached).toEqual({errors: [], reattached: true});
            expect(workspace.dockModel.items.workbench).toEqual(initialDocument.items.workbench);
            expect(workspace.popupDocument.items.workbench).toBeUndefined();
            expect(DockZoneModel.validate(workspace.dockModel)).toEqual([]);
            expect(DockZoneModel.validate(workspace.popupDocument)).toEqual([]);
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
                  layout       = DockZoneModel.clone(workspace.perspectiveStore.collection.layouts[summary.layoutId]),
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
            topologyDocument = DockZoneModel.clone(initialDocument),
            focusDocument    = DockZoneModel.clone(initialDocument),
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
