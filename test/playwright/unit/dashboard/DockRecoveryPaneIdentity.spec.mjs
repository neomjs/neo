import {setup} from '../../setup.mjs';

const appName = 'DashboardDockRecoveryPaneIdentityTest';

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

/**
 * The second commit: `terminal` crosses to the other tabs node. Every item is RETAINED — this is a
 * restructure, not a retirement — so the transaction stages a second shell and `reconcileTabChrome`
 * moves the live pane/button pair into it. That is the state the recovery has to survive.
 * @param {Object} document
 * @returns {Object}
 */
const moveTerminalAcross = document => {
    const next = structuredClone(document);

    next.nodes['side-tabs'].items   = ['preview'];
    next.nodes['editor-tabs'].items = ['editor', 'terminal'];

    return next
};

/**
 * Waits until the Workspace's mutable refresh pointer is the promise which just settled — a typed
 * projection failure replaces `refreshPromise` with its one repair from inside the refresh.
 * @param {Neo.dashboard.dock.Workspace} workspace
 * @returns {Promise<void>}
 */
const settleRefreshTail = async workspace => {
    let tail, guard = 0;

    do {
        tail = workspace.refreshPromise;
        await tail;

        // Bounded on purpose: the recovery replaces `refreshPromise` from inside the refresh, so an
        // unbounded follow can only end by converging or by spinning microtasks until the worker
        // dies — and a dead worker reports nothing about the property under test.
        if (++guard > 20) throw new Error('refresh tail did not converge within 20 hand-offs')
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
        windowId: 'recovery-pane-identity-window'
    });

    await parent.initVnode();
    parent.mounted = true;

    return parent
};

/**
 * Reads the live pane an item currently renders as, through the SAME walk the reconciler seeds
 * `liveItems` with (`Reconciler#reconcileTabChrome`: the bar's `dockItemIds` index into the card
 * container's items). Reading it any other way would answer a question the engine does not ask.
 * @param {Neo.dashboard.dock.Workspace} workspace
 * @param {String} nodeId
 * @param {String} itemId
 * @returns {Neo.component.Base|null}
 */
const paneFor = (workspace, nodeId, itemId) => {
    const tab = DockReconciler.collectProjectedTabs(workspace.items[0]).get(nodeId);

    if (!tab) return null;

    const index = (tab.getTabBar().sortZoneConfig?.dockItemIds || []).indexOf(itemId);

    return index > -1 ? tab.getCardContainer().items[index] || null : null
};

/**
 * @summary A projection that fails before its swap keeps the staged shell's panes alive on purpose —
 * and the repair must resolve those same instances, not build replacements.
 *
 * `Reconciler#settleFailedProjection` removes the retired staged shell with `destroyItem: false`,
 * deliberately: by the time most rejections land, `reconcileTabChrome` has already moved live
 * pane/button pairs into that shell, and destroying it would take the consumer's panes with it. Its
 * JSDoc states the other half of that bargain — *"the repair re-projection re-parents those panes by
 * identity"*.
 *
 * Nothing makes that true. `reconcileTabChrome` seeds `liveItems` only from `currentTabs`, which the
 * caller computes as `collectProjectedTabs(oldShell)` — the SURVIVING shell. A detached shell is not
 * in the host, so its panes never enter the map, resolution falls through to `resolveItem`, and the
 * engine's own default `resolvePane` returns a fresh config literal. The pane the recovery preserved
 * is orphaned and the repair constructs a replacement.
 *
 * **Why the failure is injected positionally rather than by ordinal.** An earlier witness for this
 * rejected the Nth `promiseUpdate` flight of the projection and measured 1/12 red in one sample and
 * 9/12 in another on unchanged code: which ordinal lands on the swap commit is not a property of the
 * defect. The hook below throws from inside `moveRetainedTabChrome`, whose only successor in the
 * transaction IS the swap flight — deterministic by position in the call graph, no scheduling.
 *
 * The recovery verdict is asserted first and on purpose: without it a green could mean the injected
 * failure never fired, and the identity assertion would be witnessing nothing. `paneShellIndexAtFailure`
 * is the second control and it was NOT optional — an earlier revision threw before this call, retired
 * an EMPTY staged shell, and passed every identity assertion for free.
 *
 * ## SKIPPED — it does not witness its stated property yet, and unskipping it kills the worker
 *
 * At the point the controls are satisfied — panes inside the staged shell, `retired-staged` verdict —
 * the run never reaches an assertion: the engine allocates until the 4 GB heap is exhausted (~6 s,
 * unbounded microtask loop) and the worker dies on SIGABRT.
 *
 * That is a REAL and separate observation, and its attribution is bounded:
 * - throwing BEFORE `moveRetainedTabChrome` (staged shell retired empty) completes cleanly, and the
 *   identity assertions PASS — so the hang is not the injection mechanism as such;
 * - two independent mechanisms (a rejected `promiseUpdate` stub, and this synchronous throw) both
 *   hang once the retired shell holds live panes;
 * - what separates hang from no-hang is therefore whether the retired shell holds live panes, not how
 *   the failure was produced.
 *
 * What is NOT established: that a REAL rejected swap flight leaves the same state as either injection.
 * Both injections are mine. Until that is separated, this spec must not be unskipped — a suite that
 * OOMs reports nothing about anything — and the on-demand-reproduction criterion this arm was written
 * for stays unmet rather than being marked met by an arm that dies before it asserts.
 */
test.describe.skip('Neo.dashboard.dock.Workspace failed-projection recovery', () => {
    let parent, workspace;

    const
        originalMoveRetainedTabChrome = DockReconciler.moveRetainedTabChrome,
        originalWarn                  = console.warn,
        originalError                 = console.error;

    test.afterEach(() => {
        DockReconciler.moveRetainedTabChrome = originalMoveRetainedTabChrome;
        console.warn  = originalWarn;
        console.error = originalError;

        parent?.destroy?.();
        parent    = null;
        workspace = null
    });

    test('the repair resolves the retired shell\'s pane by identity instead of rebuilding it', async () => {
        const recoveries = [], logs = [];

        // Captured, not silenced, and truncated to the first line. The engine warns on this path with
        // the offending COMPONENT as an argument; letting that reach the reporter serializes an entire
        // component tree per occurrence and kills the worker before any assertion runs. The text is
        // the diagnostic, the object is the payload that makes it unreadable.
        const capture = (...args) => {
            logs.push(String(args[0]).split('\n')[0].slice(0, 160))
        };

        console.warn = capture;
        console.error = capture;

        workspace = Neo.create(DockWorkspace, {dockModel: createDocument()});
        parent    = await bindAndMount(workspace);

        await settleRefreshTail(workspace);

        const projectedPane = paneFor(workspace, 'side-tabs', 'terminal');

        expect(projectedPane, 'the first projection built a pane for the item').toBeTruthy();

        const projectedPaneId = projectedPane.id;

        workspace.on('dockProjectionFailed', data => recoveries.push(data.recovery));

        // The injection point, chosen for what has already happened when it fires rather than for a
        // flight ordinal. `moveRetainedTabChrome` runs inside the transaction's try block AFTER
        // `reconcileTabChrome` has moved the live pane/button pairs into the staged shell and its
        // descendant commit has landed, but BEFORE the swap flight — so `swapped` is still false and
        // the catch routes the STAGED shell into `settleFailedProjection` as the casualty. That is
        // the one branch which detaches a shell holding live panes.
        //
        // It throws synchronously rather than rejecting a flight: stubbing `host.promiseUpdate`
        // returns a rejected promise without the update lifecycle's own bookkeeping, which leaves the
        // component permanently mid-flight and spins the engine until the worker dies. A synchronous
        // throw inside the try block reaches the same catch and touches no promise machinery.
        let injected = false, paneShellIndexAtFailure = null;

        DockReconciler.moveRetainedTabChrome = function(...args) {
            const result = originalMoveRetainedTabChrome.apply(this, args);

            if (!injected) {
                injected = true; // one-shot: the repair's own pass must be allowed to complete

                // The discriminator this arm cannot do without. `retired-staged` only says a shell was
                // retired; it does not say the shell HELD the pane, and a recovery that retires an
                // empty shell preserves identity for free. Throwing BEFORE this call produced exactly
                // that false green: the retained tabs — and the panes inside them — had not moved yet.
                // Walked by parentId with a hard bound rather than `down()`: a component search over a
                // half-committed two-shell host is exactly the state under test, and an unbounded
                // traversal there would make the probe a suspect in any hang it reports on.
                let node = projectedPane, hops = 0;

                while (node && hops++ < 12) {
                    const index = workspace.items.indexOf(node);

                    if (index > -1) { paneShellIndexAtFailure = index; break }

                    node = Neo.getComponent(node.parentId)
                }

                throw new Error('injected: the staged commit fails at its swap')
            }

            return result
        };

        workspace.onDockZoneDocumentChange(moveTerminalAcross(createDocument()));

        await settleRefreshTail(workspace);

        // Two controls, both asserted before the property. A green identity assertion means nothing
        // unless the recovery took the retired-staged branch AND the shell it retired was the one
        // holding the pane.
        expect(recoveries, 'the injected failure routed through the staged-shell recovery').toEqual(['retired-staged']);
        expect(paneShellIndexAtFailure, 'the pane was inside the STAGED shell when the commit failed').toBe(1);

        expect(workspace.items, 'the host settled back to exactly one shell').toHaveLength(1);

        const repairedPane = paneFor(workspace, 'editor-tabs', 'terminal');

        expect(repairedPane, 'the repair projected the item').toBeTruthy();

        expect(repairedPane.id, 'the repair resolved the SAME pane the recovery kept alive').toBe(projectedPaneId);
        expect(repairedPane,    'and it is that instance, not a rebuild wearing its id').toBe(projectedPane);
        expect(projectedPane.isDestroyed, 'the preserved pane was never destroyed').not.toBe(true)
    })
});

/**
 * @summary The same state, reached by the failure production actually suffers.
 *
 * The parked arm above reaches the retired-staged state by throwing inside the transaction, and the
 * engine then never returns. That observation cannot be attributed while the only two ways of
 * producing it are a synchronous throw and a stubbed rejection — neither is a rejected vdom flight,
 * and both are mine.
 *
 * This one fails the way the reported occurrences do. `util.VDom.getVdom` throws
 * `Component not found for id: …` when a vdom tree still names a component the registry has lost, so
 * unregistering a mounted child of the staged shell right before the swap makes the REAL flight
 * reject — same branch, same `swapped === false`, same casualty, no injected control flow.
 *
 * Its only job is to decide between two readings of the hang:
 *   (1) the recovery path does not terminate when the retired shell holds live panes; or
 *   (2) a throw and a stub corrupt state a real rejection would not.
 *
 * ## Result: it answered the hang and FAILED its own control
 *
 * It does not hang — it runs to the assertions. So the OOM belongs to the injected control flow, not
 * to the engine: reading (2).
 *
 * But its control `recoveries === ['retired-staged']` came back EMPTY. Unregistering the staged
 * shell's bar/card ancestor did not make the swap flight reject, so no projection failure occurred and
 * the recovery never ran. The probe never reached the state it exists to reach, and therefore says
 * nothing about identity — the poison target is wrong, not the theory.
 *
 * Skipped for that reason, and left in place because the next attempt should start from a measurement
 * of which nodes the host vdom actually carries as `componentId` references, not from another guess.
 */
test.describe.skip('Neo.dashboard.dock.Workspace failed-projection recovery — faithful failure', () => {
    let parent, workspace;

    const
        originalMoveRetainedTabChrome = DockReconciler.moveRetainedTabChrome,
        originalWarn                  = console.warn,
        originalError                 = console.error;

    test.afterEach(() => {
        DockReconciler.moveRetainedTabChrome = originalMoveRetainedTabChrome;
        console.warn  = originalWarn;
        console.error = originalError;

        parent?.destroy?.();
        parent    = null;
        workspace = null
    });

    test('a REAL rejected swap flight reaches the recovery and the repair settles', async () => {
        const recoveries = [], logs = [];
        const capture    = (...args) => { logs.push(String(args[0]).split('\n')[0].slice(0, 160)) };

        console.warn  = capture;
        console.error = capture;

        workspace = Neo.create(DockWorkspace, {dockModel: createDocument()});
        parent    = await bindAndMount(workspace);

        await settleRefreshTail(workspace);

        const projectedPane = paneFor(workspace, 'side-tabs', 'terminal');

        expect(projectedPane, 'the first projection built a pane for the item').toBeTruthy();

        const projectedPaneId = projectedPane.id;

        workspace.on('dockProjectionFailed', data => recoveries.push(data.recovery));

        let injected = false, poisonedId = null, paneShellIndexAtFailure = null;

        DockReconciler.moveRetainedTabChrome = function(...args) {
            const result = originalMoveRetainedTabChrome.apply(this, args);

            if (!injected) {
                injected = true;

                let node = projectedPane, hops = 0;

                while (node && hops++ < 12) {
                    const index = workspace.items.indexOf(node);

                    if (index > -1) { paneShellIndexAtFailure = index; break }

                    node = Neo.getComponent(node.parentId)
                }

                // The poison: a component the staged shell's vdom still names, removed from the
                // registry but NOT destroyed. The swap flight's `getVdom` walk then throws exactly
                // the error the reported occurrences carry, from inside the awaited flight.
                const staged = workspace.items[1],
                      victim = staged?.getTabBar?.() || Neo.getComponent(projectedPane.parentId);

                if (victim) {
                    poisonedId = victim.id;
                    Neo.manager.Instance.unregister(victim)
                }
            }

            return result
        };

        workspace.onDockZoneDocumentChange(moveTerminalAcross(createDocument()));

        await settleRefreshTail(workspace);

        expect(poisonedId,              'a component was actually unregistered').toBeTruthy();
        expect(paneShellIndexAtFailure, 'the pane was inside the STAGED shell at poisoning time').toBe(1);
        expect(recoveries,              'a REAL flight rejection routed through the staged-shell recovery').toEqual(['retired-staged']);

        const repairedPane = paneFor(workspace, 'editor-tabs', 'terminal');

        expect(repairedPane, 'the repair projected the item').toBeTruthy();
        expect(repairedPane.id, 'the repair resolved the SAME pane the recovery kept alive').toBe(projectedPaneId)
    })
});
