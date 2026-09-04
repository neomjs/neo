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
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import MainContainer      from '../../../../examples/dashboard/dock/MainContainer.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';

const createDocument = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'root-split',
    items : {
        editor  : {componentRef: 'Editor',   kind: 'panel',    title: 'Editor'},
        preview : {componentRef: 'Preview',  kind: 'panel',    title: 'Preview'},
        terminal: {componentRef: 'Terminal', kind: 'terminal', title: 'Terminal'}
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

    test('a headless Workspace arms no geometry until its first real window binding', () => {
        const
            originalWindowPosition = Neo.main.addon.WindowPosition,
            calls                  = [];

        Neo.main.addon.WindowPosition = {
            setConfigs(data) {
                calls.push(data);
                return Promise.resolve()
            }
        };

        try {
            workspace = Neo.create(DockWorkspace, {dockModel: createDocument()});

            expect(calls, 'construction without a render target arms nothing').toEqual([]);

            parent = Neo.create(Container, {
                appName,
                items   : [workspace],
                windowId: 'bound-window'
            });

            expect(calls, 'the real container binding arms both geometry streams exactly once').toEqual([{
                observeMovement: true,
                observeResize  : true,
                windowId       : 'bound-window'
            }]);

            workspace.windowId = 'bound-window';

            expect(calls, 'setting the same binding again is idempotent').toHaveLength(1)
        } finally {
            originalWindowPosition
                ? Neo.main.addon.WindowPosition = originalWindowPosition
                : delete Neo.main.addon.WindowPosition
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
    })
});
