import {setup} from '../../setup.mjs';

const appName = 'DashboardDockWorkspaceFirstProjectionTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DockReconciler     from '../../../../src/dashboard/dock/projection/Reconciler.mjs';
import DockWorkspace      from '../../../../src/dashboard/dock/Workspace.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VDomUpdate         from '../../../../src/manager/VDomUpdate.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import MainContainer      from '../../../../examples/dashboard/dock/MainContainer.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';

const createDocument = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'root-split',
    items : {
        editor  : {reference: 'Editor',   title: 'Editor'},
        preview : {reference: 'Preview',  title: 'Preview'},
        terminal: {reference: 'Terminal', title: 'Terminal'}
    },
    nodes: {
        'editor-tabs': {activeItemId: 'editor', items: ['editor'], type: 'tabs'},
        'side-tabs'  : {activeItemId: 'preview', items: ['preview', 'terminal'], type: 'tabs'},
        'root-split' : {
            children   : ['editor-tabs', 'side-tabs'],
            orientation: 'horizontal',
            sizes      : [0.65, 0.35],
            type       : 'split'
        }
    }
});

/**
 * @summary Waits until the Workspace's mutable refresh pointer is the promise which just settled.
 *
 * A typed projection failure replaces `refreshPromise` with its one repair from inside the first
 * refresh. Awaiting one captured promise would therefore observe the failed cycle, not the repair.
 * @param {Neo.dashboard.dock.Workspace} workspace
 * @returns {Promise<void>}
 */
const settleRefreshTail = async workspace => {
    let tail;

    do {
        tail = workspace.refreshPromise;
        await tail
    } while (tail !== workspace.refreshPromise)
};

/**
 * @summary Binds a headless Workspace through the real container adoption path, then mounts it.
 * @param {Neo.dashboard.dock.Workspace} workspace
 * @param {String} windowId
 * @returns {Promise<Neo.container.Base>}
 */
const bindAndMount = async (workspace, windowId='first-projection-window') => {
    const parent = Neo.create(Container, {
        appName,
        items: [workspace],
        windowId
    });

    await parent.initVnode();
    parent.mounted = true;

    return parent
};

/**
 * @summary Pins the headless-to-bound first-projection lifecycle owned by DockWorkspace.
 */
test.describe('Neo.dashboard.dock.Workspace first projection', () => {
    let parent, workspace;

    test.afterEach(() => {
        parent?.destroy?.();
        !parent && workspace?.destroy?.();
        parent    = null;
        workspace = null
    });

    test('a headless Workspace arms no geometry until its first real window binding', async () => {
        const
            originalGetAddon = Neo.currentWorker.getAddon,
            {isSharedWorker} = Neo.currentWorker,
            calls            = [],
            loads            = [],
            windowPosition   = {
                setConfigs(data) {
                    calls.push(data);
                    return Promise.resolve()
                }
            };

        // A SharedWorker app spans windows, and the engine loads the addon into the window it binds.
        // A load is recorded synchronously, so a repeated binding that armed again would show at once.
        Neo.currentWorker.isSharedWorker = true;
        Neo.currentWorker.getAddon       = async (name, windowId) => {
            if (name !== 'WindowPosition') {
                return originalGetAddon(name, windowId)
            }

            loads.push(windowId);
            return windowPosition
        };

        try {
            workspace = Neo.create(DockWorkspace, {dockModel: createDocument()});

            expect(calls, 'construction without a render target arms nothing').toEqual([]);

            parent = Neo.create(Container, {
                appName,
                items   : [workspace],
                windowId: 'bound-window'
            });

            await expect.poll(() => calls, 'the real container binding arms both geometry streams exactly once').toEqual([{
                observeMovement: true,
                observeResize  : true,
                windowId       : 'bound-window'
            }]);

            workspace.windowId = 'bound-window';

            expect(loads, 'setting the same binding again is idempotent').toEqual(['bound-window'])
        } finally {
            Neo.currentWorker.getAddon       = originalGetAddon;
            Neo.currentWorker.isSharedWorker = isSharedWorker
        }
    });

    test('binding and mounting projects the committed document without consumer shell seeding', async () => {
        let outcome;

        workspace = Neo.create(DockWorkspace, {dockModel: createDocument()});
        workspace.afterRefreshDockWorkspace = ({result}) => outcome = result;
        parent    = await bindAndMount(workspace);

        await settleRefreshTail(workspace);

        expect(workspace.items, 'the engine owns exactly one first shell').toHaveLength(1);

        const tabs = DockReconciler.collectProjectedTabs(workspace.items[0]);

        expect([...tabs.keys()]).toEqual(['editor-tabs', 'side-tabs']);
        expect(tabs.get('editor-tabs').getTabBar().sortZoneConfig.dockItemIds).toEqual(['editor']);
        expect(tabs.get('side-tabs').getTabBar().sortZoneConfig.dockItemIds).toEqual(['preview', 'terminal']);
        expect(outcome.landedInPlace, 'a first projection is a normal staged result, never a fast path').toBe(false)
    });

    test('adoption settles when the document is in the host, before a post-projection hook that trails motion', async () => {
        const order = [];
        let adoptedAt, settledAt;

        workspace = Neo.create(DockWorkspace, {dockModel: createDocument()});
        // A host that sequences chrome behind the motion window (apps/workstation does) delays the
        // settled surface, never the adoption.
        workspace.afterRefreshDockWorkspace = () => new Promise(resolve => setTimeout(resolve, 150));
        parent    = await bindAndMount(workspace);

        const cycle = workspace.projectionCycle, refresh = workspace.refreshPromise;

        expect(cycle?.adoption, 'the scheduling commit exposes the cycle\'s adoption').toBeInstanceOf(Promise);

        cycle.adoption.then(() => {adoptedAt = Date.now(); order.push('adopted')});
        refresh.then(() => {settledAt = Date.now(); order.push('settled')});

        await settleRefreshTail(workspace);
        await cycle.adoption;

        expect(order).toEqual(['adopted', 'settled']);
        expect(settledAt - adoptedAt, 'the hook\'s wait sits between adoption and the settled surface').toBeGreaterThanOrEqual(100);
        expect((await cycle.adoption).landedInPlace, 'adoption resolves with the reconciler\'s outcome').toBe(false);

        const {timing} = cycle;

        expect(Object.keys(timing)).toEqual(expect.arrayContaining(['queuedAt', 'startedAt', 'captured', 'released', 'reconciled', 'settledAt', 'landedInPlace', 'waitedForTail']));
        expect(timing.hostMounted, 'a host that is already mounted skips its mount wait').toBeUndefined();
        expect([timing.startedAt, timing.captured, timing.released, timing.reconciled], 'each step before the reconcile stamps in order')
            .toEqual([...[timing.startedAt, timing.captured, timing.released, timing.reconciled]].sort((a, b) => a - b));
        expect(timing.reconciled, 'the receipt orders the reconcile before the settle').toBeLessThanOrEqual(timing.settledAt);
        expect(timing.settledAt - timing.reconciled).toBeGreaterThanOrEqual(100);

        // A cycle that never runs — the workspace is gone before its tick — settles the adoption with
        // null rather than leaving a consumer hanging on it.
        const lone       = Neo.create(DockWorkspace, {dockModel: createDocument()}),
              skipped    = lone.projectDockZoneDocument(createDocument()),
              {adoption} = lone.projectionCycle;

        lone.destroy();
        await skipped.catch(() => {});

        expect(await adoption).toBeNull()
    });

    test('the standalone dock example keeps only its toolbar static and receives its shell from the engine', async () => {
        workspace = Neo.create(MainContainer, {});

        await workspace.layoutCollectionLoadPromise;

        expect(workspace.items, 'the example constructor no longer seeds engine projection chrome').toHaveLength(1);
        expect(workspace.items[0].dockNodeType).toBe('perspective-toolbar');

        parent = await bindAndMount(workspace, 'example-window');

        await settleRefreshTail(workspace);

        expect(workspace.items, 'mount adds exactly one engine-owned shell after the toolbar').toHaveLength(2);
        expect(DockReconciler.collectProjectedTabs(workspace.items[1]).size).toBe(4)
    });

    test('the example captures its effective perspective declarations without seeding saved records', async () => {
        workspace = Neo.create(MainContainer, {
            perspectives: {
                'operator-default': {
                    center: {
                        id      : 'root-split', orientation: 'horizontal', sizes: [0.25, 0.75],
                        children: [
                            {id: 'main-tabs', items: ['swarm', 'strategy']},
                            {id: 'side-split', orientation: 'vertical', children: ['terminal', 'logs']}
                        ]
                    },
                    right: {items: ['inspector'], extent: 0.2}
                },
                'review-focus': MainContainer.config.perspectives['review-focus']
            }
        });

        await workspace.layoutCollectionLoadPromise;

        const {dockModel, layoutCollection} = workspace;

        expect(dockModel.nodes['root-split'].sizes).toEqual([0.25, 0.75]);
        expect(dockModel.nodes['main-tabs'].activeItemId).toBe('swarm');
        expect(layoutCollection.layouts).toEqual({});
        expect(workspace.perspectiveSelection.document('operator-default')).toEqual(dockModel);
        expect(workspace.perspectiveSelection.document('review-focus').nodes['root-split'].sizes).toEqual([0.48, 0.52]);
        expect(workspace.items[0].dockNodeType).toBe('perspective-toolbar')
    });

    test('an explicitly supplied document survives example initialization', async () => {
        const document = createDocument();

        workspace = Neo.create(MainContainer, {dockModel: document, zones: 'not-a-declared-pane'});
        await workspace.layoutCollectionLoadPromise;

        expect(workspace.dockModel).toEqual(document);
        expect(workspace.layoutCollection.layouts).toEqual({});
        expect(workspace.getState('dock.perspective')).toEqual({active: 'operator-default', modified: true, pending: null});
        expect(workspace.items[0].dockNodeType).toBe('perspective-toolbar')
    });

    test('a rejected initial mount retires its shell and spends exactly one clean retry', async () => {
        workspace = Neo.create(DockWorkspace, {dockModel: createDocument()});

        const
            events                = [],
            originalPromiseUpdate = workspace.promiseUpdate.bind(workspace),
            originalRefresh       = workspace.refreshDockWorkspace.bind(workspace);

        let failedShell,
            hostFlights = 0,
            refreshes   = 0;

        workspace.promiseUpdate = () => {
            hostFlights++;

            if (hostFlights === 1) {
                failedShell = workspace.items[0];
                return Promise.reject(new Error('forced initial shell mount rejection'))
            }

            return originalPromiseUpdate()
        };
        workspace.refreshDockWorkspace = (...args) => {
            refreshes++;
            return originalRefresh(...args)
        };
        workspace.on('dockProjectionFailed', event => {
            events.push({event, shellCount: workspace.items.length})
        });

        parent = await bindAndMount(workspace);

        await settleRefreshTail(workspace);

        expect(events, 'the failed initial projection is observable once').toHaveLength(1);
        expect(events[0].event).toMatchObject({
            isRetry : false,
            recovery: 'retired-initial'
        });
        expect(events[0].event.error.message).toBe('forced initial shell mount rejection');
        expect(events[0].shellCount, 'recovery returns the host to zero shells before retry').toBe(0);
        expect(failedShell.isDestroyed, 'an unpopulated rejected shell leaves no detached component tree').toBe(true);
        expect(refreshes, 'the initial attempt plus exactly one repair').toBe(2);
        expect(workspace.items, 'the repair lands one visible shell').toHaveLength(1);
        expect(workspace.items[0].hidden).not.toBe(true)
    });

    test('headless commits park in departedProjection, settle refreshPromise and adoption without VDomUpdate callbacks, and coalesce on mount', async () => {
        workspace = Neo.create(DockWorkspace, {dockModel: createDocument()});

        const
            doc1 = structuredClone(createDocument()),
            doc2 = structuredClone(createDocument());

        doc1.items.console = {reference: 'Console', title: 'Console'};
        doc1.nodes['side-tabs'].items.push('console');

        doc2.items.console   = {reference: 'Console',   title: 'Console'};
        doc2.items.inspector = {reference: 'Inspector', title: 'Inspector'};
        doc2.nodes['side-tabs'].items.push('console', 'inspector');
        doc2.nodes['side-tabs'].activeItemId = 'inspector';

        workspace.setSilent({dockModel: doc1});
        const
            first         = workspace.projectDockZoneDocument(doc1),
            firstAdoption = workspace.projectionCycle.adoption;

        workspace.setSilent({dockModel: doc2});
        const
            second         = workspace.projectDockZoneDocument(doc2),
            secondAdoption = workspace.projectionCycle.adoption,
            settled        = await Promise.race([
                Promise.all([first, second]).then(() => 'settled'),
                workspace.timeout(100).then(() => 'hung')
            ]);

        expect(settled, 'headless commits settle without hanging in promiseUpdate').toBe('settled');
        expect(await firstAdoption).toBeNull();
        expect(await secondAdoption).toBeNull();
        expect(VDomUpdate.promiseCallbackMap.has(workspace.id), 'no callback leaks into VDomUpdate while headless').toBe(false);
        expect(workspace.items, 'no premature shell constructs before binding').toHaveLength(0);
        expect(workspace.departedProjection?.document).toEqual(doc2);

        const originalRefresh  = workspace.refreshDockWorkspace.bind(workspace);
        let   mountedRefreshes = 0;

        workspace.refreshDockWorkspace = (...args) => {
            mountedRefreshes++;
            return originalRefresh(...args)
        };

        parent = await bindAndMount(workspace, 'coalesced-popup');
        await settleRefreshTail(workspace);

        expect(mountedRefreshes, 'coalesced headless commits replay as one projection on mount').toBe(1);
        expect(workspace.departedProjection).toBeNull();

        const sideTabs = DockReconciler.collectProjectedTabs(workspace.items[0]).get('side-tabs');

        expect(sideTabs.getTabBar().sortZoneConfig.dockItemIds).toEqual(['preview', 'terminal', 'console', 'inspector'])
    });

    test('detaching a mounted Workspace to windowId null parks detached commits until a successor container mounts it', async () => {
        workspace = Neo.create(DockWorkspace, {dockModel: createDocument()});
        parent    = await bindAndMount(workspace, 'initial-popup');

        await settleRefreshTail(workspace);

        parent.remove(workspace, false, true);
        workspace.windowId = null;

        expect(workspace.mounted).toBe(false);
        expect(workspace.parentId).toBeNull();
        expect(workspace.windowId).toBeNull();

        const detachedDoc = structuredClone(createDocument());

        detachedDoc.items.logs = {reference: 'Logs', title: 'Logs'};
        detachedDoc.nodes['editor-tabs'].items.push('logs');
        workspace.setSilent({dockModel: detachedDoc});

        const
            detachedCommit   = workspace.projectDockZoneDocument(detachedDoc),
            detachedAdoption = workspace.projectionCycle.adoption,
            settled          = await Promise.race([
                detachedCommit.then(() => 'settled'),
                workspace.timeout(100).then(() => 'hung')
            ]);

        expect(settled, 'commits while detached at windowId null settle immediately').toBe('settled');
        expect(await detachedAdoption).toBeNull();
        expect(VDomUpdate.promiseCallbackMap.has(workspace.id)).toBe(false);

        parent.destroy();
        parent = await bindAndMount(workspace, 'successor-popup');

        await settleRefreshTail(workspace);

        const editorTabs = DockReconciler.collectProjectedTabs(workspace.items[0]).get('editor-tabs');

        expect(editorTabs.getTabBar().sortZoneConfig.dockItemIds).toEqual(['editor', 'logs'])
    })
});
