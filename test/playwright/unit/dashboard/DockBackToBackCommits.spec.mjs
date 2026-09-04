import {setup} from '../../setup.mjs';

const appName = 'DashboardDockBackToBackCommitsTest';

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

/** The second commit: `terminal` leaves the document, so its header button is a retirement. */
const retireTerminal = document => {
    const next = structuredClone(document);

    delete next.items.terminal;
    next.nodes['side-tabs'].items = ['preview'];

    return next
};

/**
 * Waits until the Workspace's mutable refresh pointer is the promise which just settled — a typed
 * projection failure replaces `refreshPromise` with its one repair from inside the refresh.
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
 * Binds a headless Workspace through the real container adoption path, then mounts it.
 * @param {Neo.dashboard.dock.Workspace} workspace
 * @returns {Promise<Neo.container.Base>}
 */
const bindAndMount = async workspace => {
    const parent = Neo.create(Container, {
        appName,
        items   : [workspace],
        windowId: 'back-to-back-window'
    });

    await parent.initVnode();
    parent.mounted = true;

    return parent
};

/**
 * @summary Two topology commits back to back: the second retires a header button the first projected,
 * while an ancestor flight is in the air — the committed document must land as exactly one shell.
 *
 * Phase 2 of the projection transaction retires a leaver's tab button with a silent destroy. In the
 * cockpit receipt an ancestor flight collected before that retirement landed after it, still naming
 * the button by reference, and the transaction awaiting a flight behind it never settled. The lifecycle
 * half of that race is witnessed red-first where it lives (`unit/vdom/RaceCondition` and
 * `unit/vdom/UpdateWedge`): the in-process helper answers in microtasks and ancestor/descendant
 * flights serialize, so this tier cannot open the receipt's window and this arm was never red.
 *
 * What it pins instead is the commit's end state under the same gesture: an ancestor update issued
 * at the default depth right after the silent retirement (the FLIP tail's place in the receipt),
 * real flights through the in-process helper, and a workspace that reports no projection failure and
 * holds one shell with the retired button gone.
 */
test.describe('Neo.dashboard.dock.Workspace back-to-back commits', () => {
    let parent, workspace;

    const
        originalReconcileTabChrome = DockReconciler.reconcileTabChrome,
        originalWarn               = console.warn,
        originalError              = console.error;

    test.afterEach(() => {
        DockReconciler.reconcileTabChrome = originalReconcileTabChrome;
        console.warn  = originalWarn;
        console.error = originalError;

        parent?.destroy?.();
        parent    = null;
        workspace = null
    });

    test('a commit that retires a header button under an in-flight ancestor update still lands as one shell', async () => {
        const failures = [], warnings = [], errors = [];

        console.warn  = (...args) => { warnings.push(args.join(' ')) };
        console.error = (...args) => { errors.push(args.join(' ')) };

        workspace = Neo.create(DockWorkspace, {dockModel: createDocument()});
        parent    = await bindAndMount(workspace);

        await settleRefreshTail(workspace);

        const firstBar = DockReconciler.collectProjectedTabs(workspace.items[0]).get('side-tabs').getTabBar();

        expect(firstBar.getTabButtons(), 'the first commit projected both header buttons').toHaveLength(2);

        const retiringButtonId = firstBar.getTabButtons()[1].id;

        workspace.on('dockProjectionFailed', data => failures.push(`${data.recovery}: ${data.error?.message}`));

        // The ancestor flight: a fire-and-forget update of the bound parent at the default depth, so
        // the returned vnode names the workspace by reference and the landing walk descends through
        // the stored vnodes of workspace, shell and bar. (The host itself is no use here: the phase
        // sets its depth to -1 right after this hook, and a flight reads the depth when it collects.)
        DockReconciler.reconcileTabChrome = function(...args) {
            const result = originalReconcileTabChrome.apply(this, args);

            parent.updateDepth = 1;
            parent.update();

            return result
        };

        workspace.onDockZoneDocumentChange(retireTerminal(createDocument()));

        await settleRefreshTail(workspace);

        // Pre-fix: the ancestor flight fails on the retired button's reference, the phase rejects into
        // the recovery, and the workspace reports the failed projection before repairing it.
        expect(failures,                                                 'no projection failure').toEqual([]);
        expect(warnings.filter(text => text.includes('Dock projection failed')), 'no recovery warning').toEqual([]);
        expect(errors.filter(text => text.includes('vdom update failed')),   'no failed flight').toEqual([]);

        expect(workspace.items, 'exactly one shell').toHaveLength(1);

        const bar = DockReconciler.collectProjectedTabs(workspace.items[0]).get('side-tabs').getTabBar();

        expect(bar.getTabButtons(), 'the retired button is gone from the bar').toHaveLength(1);
        expect(Neo.getComponent(retiringButtonId), 'the retired button left the registry').toBeFalsy()
    });
});
