import {setup} from '../../setup.mjs';

const appName = 'DashboardDockStableSplitCommitTest';

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
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs'; // installs the in-process renderer the real flights run through
import VdomHelper         from '../../../../src/vdom/Helper.mjs';                  // registers Neo.vdom.Helper for those flights
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';

/**
 * Admits `transferNode` to the in-place path, as a host that adopts whole stacks does
 * (`Workstation.view.VesselWorkspace#getRefreshOptions`).
 */
class TransferWorkspace extends DockWorkspace {
    static config = {
        className: 'Test.DockStableSplitCommit.TransferWorkspace'
    }

    getRefreshOptions(descriptor, source) {
        return {...super.getRefreshOptions(descriptor, source), retainTopology: descriptor?.operation === 'transferNode'}
    }
}

TransferWorkspace = Neo.setupClass(TransferWorkspace);

const createDocument = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'root-split',
    items : {
        editor : {reference: 'Editor',  title: 'Editor'},
        preview: {reference: 'Preview', title: 'Preview'}
    },
    nodes: {
        'editor-tabs': {activeItemId: 'editor',  items: ['editor'],  type: 'tabs'},
        'side-tabs'  : {activeItemId: 'preview', items: ['preview'], type: 'tabs'},
        'root-split' : {
            children   : ['editor-tabs', 'side-tabs'],
            orientation: 'horizontal',
            sizes      : [0.65, 0.35],
            type       : 'split'
        }
    }
});

/** A stack arriving from another workspace: one new item in a tabs node inside the split, and new sizes. */
const adoptTerminal = document => {
    const next = structuredClone(document);

    next.items.terminal = {reference: 'Terminal', title: 'Terminal'};
    next.nodes['editor-tabs'].items = ['editor', 'terminal'];
    next.nodes['root-split'].sizes  = [0.5, 0.5];

    return next
};

/**
 * Waits until the Workspace's mutable refresh pointer is the promise which just settled.
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
 * Settles with `promise`, or fails the test with a named error after `ms`.
 * @param {Promise} promise
 * @param {Number} ms
 * @returns {Promise}
 */
const settleWithin = (promise, ms) => new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`the projection did not settle within ${ms} ms`)), ms);

    promise.then(
        value => {clearTimeout(deadline); resolve(value)},
        error => {clearTimeout(deadline); reject(error)}
    )
});

/**
 * Binds a headless Workspace through the real container adoption path, then mounts it.
 * @param {Neo.dashboard.dock.Workspace} workspace
 * @returns {Promise<Neo.container.Base>}
 */
const bindAndMount = async workspace => {
    const parent = Neo.create(Container, {
        appName,
        items   : [workspace],
        windowId: 'stable-split-window'
    });

    await parent.initVnode();
    parent.mounted = true;

    return parent
};

/**
 * @summary A transfer into a tabs node inside a split lands in place and settles.
 *
 * The in-place path commits the arriving header's bar before the host. No geometry may be pending on
 * the retained split children at that point: the bar's update would merge into its tab container's
 * pending update, which only the host commit starts, and the projection would wait on itself.
 */
test.describe('Neo.dashboard.dock.Workspace in-place commit into a split', () => {
    let parent, workspace;

    test.afterEach(() => {
        parent?.destroy?.();
        parent    = null;
        workspace = null
    });

    test('an adopted stack lands in a split-held tabs node, renders its header and applies the new sizes', async () => {
        workspace = Neo.create(TransferWorkspace, {dockModel: createDocument()});
        parent    = await bindAndMount(workspace);

        await settleRefreshTail(workspace);

        const shell = workspace.items[0];

        workspace.onDockZoneDocumentChange(adoptTerminal(createDocument()), {operation: 'transferNode'});

        await settleWithin(settleRefreshTail(workspace), 5000);

        expect(workspace.items[0], 'the commit landed on the in-place path').toBe(shell);

        const
            tabs    = DockReconciler.collectProjectedTabs(shell),
            editor  = tabs.get('editor-tabs'),
            buttons = editor.getTabBar().getTabButtons();

        expect(buttons.map(button => button.text), 'the arriving header joined the bar').toEqual(['Editor', 'Terminal']);
        expect(buttons[1].vnode, 'the arriving header rendered').toBeTruthy();
        expect(editor.flex, 'the new size landed on the retained node').toBe(tabs.get('side-tabs').flex);
        expect(editor.wrapperStyle.flex, 'and in its rendered style').toBe(editor.flex)
    })
});
