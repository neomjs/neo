import {setup} from '../../setup.mjs';

const appName = 'DashboardDockProjectionDestroySentinelTest';

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

/** A restructure, not a retirement: every item is retained, so the transaction stages a second shell. */
const moveTerminalAcross = document => {
    const next = structuredClone(document);

    next.nodes['side-tabs'].items   = ['preview'];
    next.nodes['editor-tabs'].items = ['editor', 'terminal'];

    return next
};

/**
 * A workspace whose FIRST projection fails inside the staging try block, through the public
 * `onProjectionStaged` seam — no static override, and the throw is synchronous, so the update
 * lifecycle is never left mid-flight.
 * @param {*} thrown The value to throw: an Error, or the destroy sentinel.
 * @returns {Neo.dashboard.dock.Workspace}
 */
const createFailingFirstProjection = thrown => {
    class FailingFirstProjectionWorkspace extends DockWorkspace {
        static config = {
            className: 'Neo.dashboard.dock.SentinelSpec.FailingFirstProjectionWorkspace'
        }

        firstProjectionFailed = false

        getReconcileOptions(document, refreshOptions) {
            const me = this;

            return {
                ...super.getReconcileOptions(document, refreshOptions),
                onProjectionStaged() {
                    if (!me.firstProjectionFailed) {
                        me.firstProjectionFailed = true;
                        throw thrown
                    }
                }
            }
        }
    }

    FailingFirstProjectionWorkspace = Neo.setupClass(FailingFirstProjectionWorkspace);

    return Neo.create(FailingFirstProjectionWorkspace, {dockModel: createDocument()})
};

/**
 * Binds a headless Workspace through the real container adoption path, then mounts it. The first
 * projection is issued during this call, so a first-projection failure surfaces here.
 * @param {Neo.dashboard.dock.Workspace} workspace
 * @returns {Promise<Neo.container.Base>}
 */
const bindAndMount = async workspace => {
    const parent = Neo.create(Container, {
        appName,
        items   : [workspace],
        windowId: 'destroy-sentinel-window'
    });

    await parent.initVnode();
    parent.mounted = true;

    return parent
};

/**
 * Follows the workspace's mutable refresh pointer and reports how it ended, without letting a
 * rejection escape as an unhandled one.
 * @param {Neo.dashboard.dock.Workspace} workspace
 * @returns {Promise<{rejectedWith: *}>}
 */
const settleRefresh = async workspace => {
    let tail, guard = 0, rejectedWith;

    do {
        tail = workspace.refreshPromise;

        try {
            await tail
        } catch (error) {
            rejectedWith = error
        }

        if (++guard > 20) throw new Error('refresh tail did not converge within 20 hand-offs')
    } while (tail !== workspace.refreshPromise);

    return {rejectedWith}
};

/**
 * @summary A rejection carrying the destroy sentinel must not be annotated, and must not be recovered.
 *
 * `Reconciler.reconcileProjection` marks a failed projection with `error.isDockProjectionFailure = true`
 * so the workspace can recognise it and spend its one repair. `error` is not always an object:
 * `Neo.isDestroyed` is `Symbol.for('Neo.isDestroyed')`, and the engine rejects pending awaits with it
 * when an instance is destroyed (`core/Base.mjs`, `component/Base.mjs`) — including the
 * `host.promiseUpdate()` awaited inside that try block.
 *
 * Assigning a property to a primitive throws in strict mode, so before the fix the annotation itself
 * raises a `TypeError`, the recovery never runs, and the sentinel is replaced by an error naming none
 * of the cause. A destroyed host has nothing to recover and nothing to repair into, so the correct
 * behaviour is to rethrow the sentinel untouched and let the layers above it — which already
 * recognise it in ten places — behave as they do everywhere else.
 *
 * Both catch sites are covered on purpose: they carry the identical annotation line, so a fix applied
 * to one reads as complete.
 *
 * The ordinary-`Error` arms are not decoration. Without them a green could mean "the sentinel is
 * guarded" or "the recovery stopped running at all", and those are different states with the same
 * symptom on the sentinel path alone.
 */
test.describe('Neo.dashboard.dock.projection.Reconciler destroy-sentinel rejections', () => {
    let parent, workspace;

    const
        originalMoveRetainedTabChrome  = DockReconciler.moveRetainedTabChrome,
        originalSettleFailedProjection = DockReconciler.settleFailedProjection,
        originalSettleFailedInitial    = DockReconciler.settleFailedInitialProjection,
        originalWarn                   = console.warn,
        originalError                  = console.error;

    let settleFailedCalls, settleFailedInitialCalls;

    test.beforeEach(() => {
        settleFailedCalls        = 0;
        settleFailedInitialCalls = 0;

        DockReconciler.settleFailedProjection = function(...args) {
            settleFailedCalls++;
            return originalSettleFailedProjection.apply(this, args)
        };

        DockReconciler.settleFailedInitialProjection = function(...args) {
            settleFailedInitialCalls++;
            return originalSettleFailedInitial.apply(this, args)
        };

        // Captured rather than silenced: the recovery warns by contract, and the engine passes whole
        // components as arguments on this path — serialising those kills the worker before any
        // assertion runs.
        const capture = () => {};

        console.warn  = capture;
        console.error = capture
    });

    test.afterEach(() => {
        DockReconciler.moveRetainedTabChrome         = originalMoveRetainedTabChrome;
        DockReconciler.settleFailedProjection        = originalSettleFailedProjection;
        DockReconciler.settleFailedInitialProjection = originalSettleFailedInitial;
        console.warn  = originalWarn;
        console.error = originalError;

        parent?.destroy?.();
        parent    = null;
        workspace = null
    });

    test('the FIRST projection rethrows the destroy sentinel untouched and skips its recovery', async () => {
        workspace = createFailingFirstProjection(Neo.isDestroyed);
        parent    = await bindAndMount(workspace);

        const {rejectedWith} = await settleRefresh(workspace);

        expect(rejectedWith, 'the sentinel itself reaches the caller').toBe(Neo.isDestroyed);
        expect(settleFailedInitialCalls, 'a destroyed host is not recovered into').toBe(0)
    });

    test('the FIRST projection still annotates and recovers an ordinary Error', async () => {
        const thrown = new Error('spec: the staged first projection fails');

        workspace = createFailingFirstProjection(thrown);
        parent    = await bindAndMount(workspace);

        await settleRefresh(workspace);

        // The control for the arm above: the same seam, the same fixture, a different thrown VALUE.
        // Without this a zero recovery count would be satisfied by a recovery that never runs at all.
        expect(settleFailedInitialCalls, 'an ordinary failure still reaches the recovery').toBe(1);
        expect(thrown.isDockProjectionFailure, 'and is still annotated for the workspace').toBe(true)
    });

    test('a staged projection rethrows the destroy sentinel untouched and skips its recovery', async () => {
        workspace = Neo.create(DockWorkspace, {dockModel: createDocument()});
        parent    = await bindAndMount(workspace);

        await settleRefresh(workspace);

        let injected = false;

        // Thrown BEFORE the original runs: the retained chrome has not moved into the staged shell
        // yet, so the recovery has nothing live to settle and the arm stays about the catch block.
        DockReconciler.moveRetainedTabChrome = function(...args) {
            if (!injected) {
                injected = true;
                throw Neo.isDestroyed
            }

            return originalMoveRetainedTabChrome.apply(this, args)
        };

        workspace.onDockZoneDocumentChange(moveTerminalAcross(createDocument()));

        const {rejectedWith} = await settleRefresh(workspace);

        expect(injected,        'the injection actually fired').toBe(true);
        expect(rejectedWith,    'the sentinel itself reaches the caller').toBe(Neo.isDestroyed);
        expect(settleFailedCalls, 'a destroyed host is not recovered into').toBe(0)
    });

    test('a staged projection still annotates and recovers an ordinary Error', async () => {
        workspace = Neo.create(DockWorkspace, {dockModel: createDocument()});
        parent    = await bindAndMount(workspace);

        await settleRefresh(workspace);

        const recoveries = [],
              thrown     = new Error('spec: the staged commit fails');

        workspace.on('dockProjectionFailed', data => recoveries.push(data.recovery));

        let injected = false;

        DockReconciler.moveRetainedTabChrome = function(...args) {
            if (!injected) {
                injected = true;
                throw thrown
            }

            return originalMoveRetainedTabChrome.apply(this, args)
        };

        workspace.onDockZoneDocumentChange(moveTerminalAcross(createDocument()));

        await settleRefresh(workspace);

        expect(settleFailedCalls, 'an ordinary failure still reaches the recovery').toBe(1);
        expect(thrown.isDockProjectionFailure, 'and is still annotated for the workspace').toBe(true);

        // The verdict strings are a published contract several callers compare as strings.
        expect(['retained-root', 'retired-staged', 'completed-swap', 'unrecoverable'])
            .toContain(thrown.projectionRecovery);
        expect(recoveries, 'the workspace still hears the failure').toEqual([thrown.projectionRecovery])
    })
});
