import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockRecreateCandidateTest'
    }
});

import {test, expect} from '@playwright/test';
// `Neo` and the core exports must be evaluated FIRST: `Neo.gatekeep` is called at module scope by
// everything below, so an alphabetical import order fails at load with "gatekeep is not a function".
import Neo                      from '../../../../src/Neo.mjs';
import * as core                from '../../../../src/core/_export.mjs';
import Component                from '../../../../src/component/Base.mjs';
import Container                from '../../../../src/container/Base.mjs';
import DockLayoutAdapter        from '../../../../src/dashboard/dock/projection/LayoutAdapter.mjs';
import DockProjectionReconciler from '../../../../src/dashboard/dock/projection/Reconciler.mjs';
import DockWorkspace            from '../../../../src/dashboard/dock/Workspace.mjs';
import TabContainer             from '../../../../src/tab/Container.mjs';
// Side-effect imports: the projection instantiates by ntype, so the tab/toolbar/button classes must
// be registered or `DockLayoutAdapter.project` throws `ntype tab-container does not exist`.
import '../../../../src/manager/Instance.mjs';
import '../../../../src/button/Base.mjs';
import '../../../../src/tab/Container.mjs';
import '../../../../src/toolbar/Base.mjs';

/**
 * Phase 1 of the two-phase recreate transaction: obtain and validate a fresh candidate **without
 * touching the live pane**.
 *
 * The docking record guarantees a resolved pane is moved or re-parented, never destroyed. The
 * user-triggered recreate exception is conditioned on this phase: **without a validated candidate
 * the exception does not apply**, and the guarantee stands unmodified.
 *
 * So every refusal below is load-bearing: each one is a case where the recovery click must leave
 * the workspace untouched rather than destroy the only copy of a pane.
 *
 * The three refusals are not hypothetical shapes. They are what a cache-backed resolver actually
 * produces, and the `live-instance` one is why a factory seam alone is insufficient: a resolver
 * reading its own cache answers with the currently mounted instance, which *looks* like a
 * successful candidate.
 *
 * @see learn/agentos/decisions/0029-docking-design.md §2.6 — the record is what these arms
 *      enforce; naming it is the difference between a test and a rule with a source.
 */
const buildWorkspace = (config = {}) => Neo.create(DockWorkspace, {
    appName  : 'DashboardDockRecreateCandidateTest',
    dockModel: {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {editor: {componentRef: 'editor', title: 'Editor'}},
        nodes : {root: {type: 'tabs', items: ['editor'], activeItemId: 'editor'}}
    },
    ...config
});

test.describe('dock recreate — Phase 1 validates a candidate before anything is destroyed', () => {
    let workspace, livePane;

    test.beforeEach(() => {
        workspace = buildWorkspace();
        livePane  = Neo.create(Component, {appName: 'DashboardDockRecreateCandidateTest'})
    });

    test.afterEach(() => {
        workspace?.destroy?.();
        livePane?.destroy?.();
        workspace = livePane = null
    });

    test('the default hook delegates, and for a placeholder host that is not a downgrade', () => {
        // This arm used to assert `null` — "recreate is opt-in rather than assumed" — on the
        // reasoning that a consumer which implemented no factory must not silently get a
        // DESTRUCTIVE capability. That fear was right and the mechanism was inverted: because the
        // capability was derived from whether the hook was overridden, the engine could never be
        // its own fallback, and the reload action was hidden for exactly the panes whose only
        // recovery is a recreate.
        //
        // The default now delegates to `resolvePane`, which is what keeps it non-destructive.
        // Minting the engine placeholder UNCONDITIONALLY would have been destructive — a host
        // resolving a real pane would have had it replaced by a labelled box. Delegation instead
        // returns whatever that host already resolves: here the engine placeholder, which is the
        // pane this workspace is already showing, so the recreate swaps a placeholder for an
        // equivalent placeholder and downgrades nothing.
        const candidate = workspace.resolveFreshPane('editor', null);

        expect(candidate, 'the default answers with a config').toBeTruthy();
        expect(candidate.cls, 'and it is the engine placeholder this host already resolves')
            .toContain('neo-dock-workspace-placeholder');

        // Not the live pane, so the identity guard passes and phase 1 admits it.
        const result = workspace.prepareRecreateCandidate('editor', livePane);

        expect(result.ok).toBe(true);
        expect(result.reason).toBeNull();
        expect(result.candidate, 'the candidate is a config, never the mounted instance')
            .not.toBe(livePane)
    });

    test('hasDockRecreateFallback constructs nothing, however often it is consulted', () => {
        // AC-3, and the reason the old implementation compared prototypes rather than calling the
        // factory: `syncDockReloadAction` consults this on every active-item change, so a
        // visibility sync that invoked a resolver would mint panes nobody asked for. Delegation
        // changed what `resolveFreshPane` returns; it must not have changed WHEN it runs.
        let resolverCalls = 0;

        workspace.resolvePane = (itemId, item) => {
            resolverCalls++;
            return {ntype: 'component'}
        };

        for (let i = 0; i < 5; i++) {
            expect(workspace.hasDockRecreateFallback(), 'a path is wired').toBe(true)
        }

        expect(resolverCalls, 'consulting the predicate never reached the resolver').toBe(0);

        // Non-vacuity: the counter can move, so zero above is a measurement rather than a
        // resolver that was never wired up.
        workspace.resolveFreshPane('editor', null);
        expect(resolverCalls, 'and the resolver is genuinely reachable').toBe(1)
    });

    test('a host that declines for an item still declines, with the live pane untouched', () => {
        // Delegation does not remove the refusal path, it just stops it being the default. A host
        // whose resolver answers `null` for a particular item is the case AC-6 names, and the
        // action stays visible so the refusal can be reported rather than hidden.
        workspace.resolveFreshPane = () => null;

        const result = workspace.prepareRecreateCandidate('editor', livePane);

        expect(result.ok).toBe(false);
        expect(result.reason).toBe('declined');
        expect(result.candidate).toBeNull();
        expect(livePane.isDestroyed, 'the live pane is untouched by a refusal').toBeFalsy()
    });

    test('a factory that throws refuses with the error carried, never swallowed', () => {
        const boom = new Error('resolver exploded');

        workspace.resolveFreshPane = () => { throw boom };

        const result = workspace.prepareRecreateCandidate('editor', livePane);

        expect(result.ok).toBe(false);
        expect(result.reason).toBe('threw');
        expect(result.error, 'the original error must survive, not a rewritten one').toBe(boom)
    });

    test('a factory returning THE LIVE INSTANCE is refused — the shape that causes silent pane loss', () => {
        // The whole reason this phase exists. A cache-backed resolver answers with the instance that
        // is already mounted; committing that "candidate" would destroy the only copy.
        workspace.resolveFreshPane = () => livePane;

        const result = workspace.prepareRecreateCandidate('editor', livePane);

        expect(result.ok).toBe(false);
        expect(result.reason).toBe('live-instance');
        expect(result.candidate).toBeNull()
    });

    test('a distinct candidate is accepted — identity, not equality', () => {
        // A config object describing the same pane IS a valid candidate; only the mounted instance
        // itself is refused. An equality-based check would reject this and make recreate impossible
        // for every config-returning consumer.
        const candidate = {ntype: 'component', text: 'fresh'};

        workspace.resolveFreshPane = () => candidate;

        const result = workspace.prepareRecreateCandidate('editor', livePane);

        expect(result.ok).toBe(true);
        expect(result.candidate).toBe(candidate);
        expect(result.reason).toBeNull()
    });

    test('the live pane is untouched by every refusal — rollback by construction', () => {
        // Not "rollback works" — there is nothing to roll back, which is the design claim. If any
        // refusal path ever destroys or re-parents the live pane, this arm is what notices.
        const factories = [
            () => { throw new Error('boom') },
            () => null,
            () => livePane
        ];

        for (const factory of factories) {
            workspace.resolveFreshPane = factory;
            workspace.prepareRecreateCandidate('editor', livePane);

            expect(livePane.isDestroyed, `factory ${factory} destroyed the live pane`).toBeFalsy()
        }
    });

    test('the item record comes from the committed document, and an unknown id still refuses safely', () => {
        let seenItem = 'unset';

        workspace.resolveFreshPane = (itemId, item) => { seenItem = item; return null };

        workspace.prepareRecreateCandidate('editor', livePane);
        expect(seenItem, 'a known id resolves its catalog record').toMatchObject({componentRef: 'editor'});

        workspace.prepareRecreateCandidate('no-such-item', livePane);
        expect(seenItem, 'an unknown id resolves null rather than throwing').toBeNull()
    })
});

/**
 * Phase 2: replace the card-body slot, then — and only then — destroy what was there.
 *
 * The ordering is the contract. `removeAt`'s `destroyItem` argument defaults to `true`, so taking
 * the default would destroy the old pane *during* its own removal and a failure to insert the
 * candidate afterwards would leave an empty slot with nothing to restore. The first arm below is
 * what notices if anyone ever takes that default back.
 */
test.describe('dock recreate — Phase 2 replaces the slot before releasing the predecessor', () => {
    let workspace, container, livePane, sibling;

    test.beforeEach(() => {
        workspace = buildWorkspace();
        container = Neo.create(Container, {
            appName: 'DashboardDockRecreateCandidateTest',
            items  : [
                {module: Component, id: 'recreate-sibling'},
                {module: Component, id: 'recreate-live'}
            ]
        });
        [sibling, livePane] = container.items
    });

    test.afterEach(() => {
        container?.destroy?.();
        workspace?.destroy?.();
        workspace = container = livePane = sibling = null
    });

    test('the predecessor is still alive at the moment the candidate enters the slot', () => {
        // The ordering witness. Sampled INSIDE insert rather than after the call, because after the
        // call both orderings look identical — which is exactly how a `destroyItem` regression would
        // pass a naive assertion.
        let aliveAtInsert = null;

        const realInsert = container.insert.bind(container);

        container.insert = (index, item, ...rest) => {
            aliveAtInsert = livePane.isDestroyed !== true;
            return realInsert(index, item, ...rest)
        };

        workspace.commitRecreateCandidate(livePane, {module: Component, id: 'recreate-fresh'});

        expect(aliveAtInsert, 'the old pane must outlive its own removal').toBe(true);
        expect(livePane.isDestroyed, 'and be released once the candidate is live').toBe(true)
    });

    test('the candidate lands in the SAME slot, leaving siblings in place', () => {
        const result = workspace.commitRecreateCandidate(livePane, {module: Component, id: 'recreate-fresh'});

        expect(result.ok).toBe(true);
        expect(result.index, 'the replaced slot, not appended at the end').toBe(1);

        expect(container.items.length).toBe(2);
        expect(container.items[0], 'the sibling is untouched').toBe(sibling);
        expect(container.items[1].id).toBe('recreate-fresh');
        expect(result.pane, 'the result exposes the exact component instantiated into the slot')
            .toBe(container.items[1])
    });

    /**
     * Teardown between the two phases — the AC that exists because the phases are separate calls.
     *
     * A caller holding a validated candidate is exactly the caller most likely to commit it into a
     * corpse: Phase 1 said yes, so the natural next line is Phase 2. If a pane closed, a vessel tore
     * down or a window disconnected in that gap, this must **refuse**, not throw and not half-mutate.
     */
    test('a teardown between the phases settles as a refusal, mutating nothing', () => {
        const container = livePane.parent;

        // Validated candidate in hand — the state a caller is in when teardown lands.
        workspace.resolveFreshPane = () => ({module: Component, id: 'recreate-fresh'});

        const prepared = workspace.prepareRecreateCandidate('editor', livePane);

        expect(prepared.ok, 'the transaction must be mid-flight for this arm to mean anything').toBe(true);

        const before = container.items.length;

        livePane.destroy();

        const result = workspace.commitRecreateCandidate(livePane, prepared.candidate);

        expect(result.ok).toBe(false);
        expect(result.reason).toBe('torn-down');
        expect(result.pane).toBeNull();

        // The container is not mutated on the way out — no half-replaced slot, no orphan insert.
        expect(container.items.length, 'a torn-down commit inserts nothing').toBe(before);
        expect(container.items.some(item => item.id === 'recreate-fresh'), 'the candidate never landed').toBe(false)
    });

    test('a destroyed workspace refuses too — the transaction owner can vanish as well as the pane', () => {
        workspace.destroy();

        const result = workspace.commitRecreateCandidate(livePane, {module: Component, id: 'recreate-fresh'});

        expect(result.ok).toBe(false);
        expect(result.reason).toBe('torn-down');
        expect(livePane.isDestroyed, 'a refusal never destroys the pane it declined to replace').toBeFalsy();

        workspace = null
    });

    test('a pane with no container, or one its container does not list, refuses without mutating', () => {
        const orphan = Neo.create(Component, {appName: 'DashboardDockRecreateCandidateTest'});

        expect(workspace.commitRecreateCandidate(orphan, {module: Component}).reason).toBe('no-container');
        expect(orphan.isDestroyed, 'a refusal never destroys').toBeFalsy();

        orphan.destroy()
    })
});

/**
 * Settlement semantics: one named result event per invocation, single-flight per item.
 *
 * Mirrors the reload leaf's `dockReloadSettled` / `dockReloadInFlight` contract on purpose. **Every
 * completion settles, including each refusal** — the action wire discards listener returns, so an
 * unsettled early return is an invocation the event contract never saw. Absorption by the
 * single-flight guard is the only silent path.
 */
test.describe('dock recreate — settles exactly once, one flight per item', () => {
    let workspace, container, livePane, settlements;

    test.beforeEach(() => {
        workspace = buildWorkspace();
        container = Neo.create(Container, {
            appName: 'DashboardDockRecreateCandidateTest',
            items  : [{module: Component, id: 'settle-live'}]
        });
        [livePane]  = container.items;
        settlements = [];

        workspace.on('dockRecreateSettled', data => settlements.push(data))
    });

    test.afterEach(() => {
        container?.destroy?.();
        workspace?.destroy?.();
        workspace = container = livePane = settlements = null
    });

    test('a successful transaction settles once, with no errors', () => {
        workspace.resolveFreshPane = () => ({module: Component, id: 'settle-fresh'});

        const result = workspace.recreateDockPane('editor', livePane, {dockNodeId: 'node-1'});

        expect(result.errors).toEqual([]);
        expect(result.pane, 'the transaction carries the exact committed instance').toBe(container.items[0]);
        expect(settlements.length, 'exactly one settlement').toBe(1);
        expect(settlements[0]).toMatchObject({dockNodeId: 'node-1', itemId: 'editor'});
        expect(container.items[0].id).toBe('settle-fresh')
    });

    test('every refusal settles too, and names WHICH refusal it was', () => {
        // A caller that only learns "it failed" cannot tell a consumer that declined the capability
        // from one whose factory returned the live instance — those need different fixes.
        workspace.resolveFreshPane = () => null;
        workspace.recreateDockPane('editor', livePane);

        workspace.resolveFreshPane = () => livePane;
        workspace.recreateDockPane('editor', livePane);

        expect(settlements.length, 'a refusal is a completion, not a silent return').toBe(2);
        expect(settlements[0].errors[0]).toContain('declined');
        expect(settlements[1].errors[0]).toContain('live-instance');

        expect(livePane.isDestroyed, 'and neither refusal destroyed anything').toBeFalsy()
    });

    test('a re-entrant invocation is absorbed — it neither runs nor settles', () => {
        // Not hypothetical: `resolveFreshPane` is consumer code, and a consumer recreating from
        // inside its own factory would recurse without the guard.
        let reentrantResult = 'unset';

        workspace.resolveFreshPane = () => {
            reentrantResult = workspace.recreateDockPane('editor', livePane);
            return {module: Component, id: 'settle-fresh'}
        };

        const result = workspace.recreateDockPane('editor', livePane);

        expect(reentrantResult, 'the inner call is absorbed').toBeNull();
        expect(result.errors).toEqual([]);
        expect(settlements.length, 'absorption is the only silent path — one settlement, not two').toBe(1)
    });

    test('an insertion that THROWS leaves the live pane in its slot and settles once', () => {
        // The atomicity hole this ordering exists to close. An invalid candidate config is ordinary
        // consumer input, and `insert` throwing after `removeAt` would leave the slot EMPTY with the
        // predecessor orphaned — silent pane loss, inside the transaction built to prevent it.
        // Inserting first means a throw removes nothing.
        const realInsert = container.insert.bind(container);

        container.insert = () => { throw new Error('candidate could not be instantiated') };

        workspace.resolveFreshPane = () => ({module: Component, id: 'settle-fresh'});

        const result = workspace.recreateDockPane('editor', livePane);

        container.insert = realInsert;

        // Settles rather than throws...
        expect(result, 'a throwing insert must settle, not propagate').not.toBeNull();
        expect(result.pane, 'a refusal must never publish a candidate').toBeNull();
        expect(settlements.length, 'exactly one settlement').toBe(1);
        expect(settlements[0].errors[0]).toContain('insert-failed');
        expect(settlements[0].errors[1]).toContain('could not be instantiated');

        // ...and the slot is untouched: same instance, same index, still alive.
        expect(container.items.length, 'nothing was removed').toBe(1);
        expect(container.items[0], 'the SAME live instance is still in the slot').toBe(livePane);
        expect(livePane.isDestroyed, 'and it was never destroyed').toBeFalsy();

        expect(workspace.dockRecreateInFlight.has('editor'), 'the flight is released').toBe(false)
    });

    test('the in-flight set is released even when a phase throws', () => {
        workspace.resolveFreshPane = () => { throw new Error('resolver exploded') };

        workspace.recreateDockPane('editor', livePane);

        // A leaked entry would silently absorb every future recreate for this item — a wedge that
        // presents as "the button does nothing" with no error anywhere.
        expect(workspace.dockRecreateInFlight.has('editor'), 'the flight must be released').toBe(false);

        workspace.resolveFreshPane = () => ({module: Component, id: 'settle-fresh'});
        workspace.recreateDockPane('editor', livePane);

        expect(settlements.length, 'a later invocation still runs and settles').toBe(2)
    })
});

/**
 * The production action path — the thing the ticket actually exists to provide.
 *
 * A recreate transaction nobody can reach is not a "default reload fallback". These arms drive
 * `handleDockReloadAction` and `syncDockReloadAction`, the real dispatch and the real visibility
 * derivation, against a real `tab.Container`.
 *
 * **Delegation first, recreate only in its absence.** A pane that implements `dockReload()` decides
 * what reload means; replacing it would discard both that authority and its identity. The fallback
 * serves only panes that never implemented it — the ones with no other recovery.
 */
test.describe('dock reload — the fallback the ticket exists to provide', () => {
    let workspace, tabContainer, settlements;

    const buildTabs = paneConfig => {
        const tabs = Neo.create(TabContainer, {
            appName    : 'DashboardDockRecreateCandidateTest',
            activeIndex: 0,
            items      : [paneConfig]
        });

        // The handler resolves the active card through the bar's dock id list — the same lookup
        // production uses, populated here rather than faked.
        tabs.getTabBar().sortZoneConfig = {dockItemIds: ['editor']};

        return tabs
    };

    test.beforeEach(() => {
        workspace   = buildWorkspace({enableDockReloadAction: true});
        settlements = [];

        workspace.on('dockReloadSettled', data => settlements.push(data))
    });

    test.afterEach(() => {
        tabContainer?.destroy?.();
        workspace?.destroy?.();
        workspace = tabContainer = settlements = null
    });

    test('a contract-less pane is RECREATED, and settles through the reload channel', async () => {
        tabContainer = buildTabs({module: Component, id: 'fallback-live'});

        const livePane = tabContainer.getCard(0);

        workspace.getActiveDockItemId = () => 'editor';
        workspace.resolveFreshPane    = () => ({module: Component, id: 'fallback-fresh'});

        await workspace.handleDockReloadAction({dockNodeId: 'node-1', tabContainer});

        // One activation, one settlement — through the RELOAD channel, whichever path served it.
        expect(settlements.length, 'the activation settles exactly once').toBe(1);
        expect(settlements[0].errors, 'and it succeeded').toEqual([]);

        expect(tabContainer.getCard(0).id, 'the pane was replaced').toBe('fallback-fresh');
        expect(livePane.isDestroyed, 'and the predecessor released').toBe(true)
    });

    test('ONE activation emits exactly ONE terminal event — both channels counted', async () => {
        // The both-channel negative witness. The action path routes through the recreate
        // transaction, which owns its own `dockRecreateSettled` channel — so without suppression a
        // single click emits TWO terminal events and a consumer counting completions sees the action
        // fire twice. Counting only the reload channel would never have caught it, which is why this
        // arm subscribes to BOTH.
        const recreateSettlements = [];

        workspace.on('dockRecreateSettled', data => recreateSettlements.push(data));

        tabContainer = buildTabs({module: Component, id: 'fallback-live'});

        workspace.getActiveDockItemId = () => 'editor';
        workspace.resolveFreshPane    = () => ({module: Component, id: 'fallback-fresh'});

        await workspace.handleDockReloadAction({dockNodeId: 'node-1', tabContainer});

        expect(settlements.length,         'dockReloadSettled fires once').toBe(1);
        expect(recreateSettlements.length, 'and the nested transaction does NOT settle again').toBe(0);
        expect(settlements.length + recreateSettlements.length, 'one activation, one terminal event').toBe(1)
    });

    test('a DIRECT caller still gets the recreate channel — suppression is per-call, not global', () => {
        // `settle: false` must not disable the transaction's own channel for everyone else.
        const recreateSettlements = [];

        workspace.on('dockRecreateSettled', data => recreateSettlements.push(data));

        const container = Neo.create(Container, {
            appName: 'DashboardDockRecreateCandidateTest',
            items  : [{module: Component, id: 'direct-live'}]
        });

        workspace.resolveFreshPane = () => ({module: Component, id: 'direct-fresh'});
        workspace.recreateDockPane('editor', container.items[0]);

        expect(recreateSettlements.length, 'a direct call settles on its own channel').toBe(1);
        expect(settlements.length,         'and never on the reload channel').toBe(0);

        container.destroy()
    });

    test('a consumer that DECLINES fresh resolution settles with a named refusal, pane intact', async () => {
        tabContainer = buildTabs({module: Component, id: 'fallback-live'});

        const livePane = tabContainer.getCard(0);

        workspace.getActiveDockItemId = () => 'editor';
        // Overridden — so the action is visible — but declining this item.
        workspace.resolveFreshPane = () => null;

        await workspace.handleDockReloadAction({dockNodeId: 'node-1', tabContainer});

        expect(settlements.length).toBe(1);
        expect(settlements[0].errors[0], 'the refusal reason travels').toContain('declined');
        expect(tabContainer.getCard(0), 'the live pane is untouched').toBe(livePane);
        expect(livePane.isDestroyed).toBeFalsy()
    });

    test('delegation still wins when the pane implements dockReload()', async () => {
        let delegated = 0;

        class ReloadablePane extends Component {
            static config = {className: 'Test.DockRecreate.ReloadablePane', ntype: 'test-reloadable-pane'}
            dockReload() { delegated++ }
        }

        Neo.setupClass(ReloadablePane);

        tabContainer = buildTabs({module: ReloadablePane, id: 'fallback-live'});

        const livePane = tabContainer.getCard(0);

        workspace.getActiveDockItemId = () => 'editor';

        // A fallback IS available — and must not be used. Replacing a pane that owns dockReload()
        // would discard both its authority over what reload means and its identity.
        workspace.resolveFreshPane = () => ({module: Component, id: 'fallback-fresh'});

        await workspace.handleDockReloadAction({dockNodeId: 'node-1', tabContainer});

        expect(delegated, 'the pane\'s own contract ran').toBe(1);
        expect(tabContainer.getCard(0), 'and it was NOT replaced').toBe(livePane);
        expect(livePane.isDestroyed).toBeFalsy()
    });

    test('an absent dockReload() no longer hides the action when a fallback exists', () => {
        tabContainer = buildTabs({module: Component, id: 'fallback-live'});

        const action = Neo.create(Component, {appName: 'DashboardDockRecreateCandidateTest'});

        action.set = function(values) { Object.assign(this, values) };

        tabContainer.getAction  = () => action;
        workspace.getActiveDockItemId = () => 'editor';

        // "No fallback" is no longer a state a workspace reaches by writing nothing — the default
        // delegates, so a path is always wired. It is now reached only by a host declaring it
        // outright, which is the remaining purpose of overriding this predicate. Stated explicitly
        // rather than relying on the base default, which is what this half used to lean on.
        workspace.hasDockRecreateFallback = () => false;
        workspace.dockHeaderActionPolicy.syncReloadAction(tabContainer);
        expect(action.hidden, 'no delegation, and recreate declared unavailable → hidden').toBe(true);

        // The engine's own default is enough on its own: no host factory, no declared refusal.
        delete workspace.hasDockRecreateFallback;
        workspace.dockHeaderActionPolicy.syncReloadAction(tabContainer);
        expect(action.hidden, 'the engine default alone un-hides it').toBe(false);

        // And a host factory on top is still honoured — the original half of this arm, now the
        // third state rather than the second.
        workspace.resolveFreshPane = () => ({module: Component});
        workspace.dockHeaderActionPolicy.syncReloadAction(tabContainer);
        expect(action.hidden, 'no delegation but a host fallback → visible').toBe(false)
    })
});

/**
 * The reconciler interaction, driven through the **production** entry point.
 *
 * This is the ticket's second finding turned into a witness. `core.Base#destroy` unregisters an instance
 * without removing it from `parent.items`, and `reconcileTabChrome` fills its live map **positionally**
 * from `body.items` and prefers that entry over the app resolver — verified by the sibling spec's
 * `resolverCalls === 0` arm. A bare destroy would therefore leave the erased object sitting in the
 * slot, and the very next refresh would hand it back as the live answer.
 *
 * Everything above this block argues that `removeAt` + `insert` avoids that. Until this arm existed
 * the argument was a **source reading, not a test** — which is why the AC is written against the real
 * `reconcileProjection` rather than a reimplementation of its lookup.
 *
 * **The resolver here deliberately returns the DESTROYED pane.** If the reconciler ever fell back to
 * it, or ever resolved the stale positional entry, the assertions below would surface a destroyed
 * instance instead of the candidate. A resolver returning `null` would have made this arm pass for
 * the wrong reason.
 */
test.describe('dock recreate — a refresh after recreate resolves the candidate, never the corpse', () => {
    test('the reconciler finds the replacement positionally and never consults the resolver', async () => {
        const
            workspace = buildWorkspace(),
            model     = {
                schema: 'neo.dock.zone.v1',
                root  : 'root-tabs',
                items : {alpha: {componentRef: 'alpha', kind: 'panel', title: 'Alpha'}},
                nodes : {'root-tabs': {activeItemId: 'alpha', items: ['alpha'], type: 'tabs'}}
            },
            pane = Neo.create(Component, {header: {text: 'Alpha'}}),
            host = Neo.create(Container, {
                items: [DockLayoutAdapter.project(model, {resolveComponentRef: () => pane})]
            });

        let resolverCalls = 0;

        try {
            const tab = host.items[0];

            // Guard: without a live pane in the slot the recreate below is a no-op and every
            // assertion afterwards would be vacuous.
            expect(tab.getCardContainer().items[0], 'the harness must project the live pane').toBe(pane);

            const commit = workspace.commitRecreateCandidate(pane, {
                module: Component,
                header: {text: 'Alpha (fresh)'},
                id    : 'recreate-reconciled-fresh'
            });

            expect(commit.ok).toBe(true);
            expect(pane.isDestroyed, 'the predecessor is released once the candidate is live').toBe(true);

            const placeholders = new Map(),
                  nextConfig   = DockLayoutAdapter.project(model, {
                      resolveComponentRef(componentRef, item, itemId) {
                          const placeholder = Neo.create(Component, {header: {text: item.title}, hidden: true});

                          placeholders.set(itemId, placeholder);

                          return placeholder
                      }
                  });

            await DockProjectionReconciler.reconcileProjection({
                host,
                nextConfig,
                placeholders,
                resolveItem() {
                    resolverCalls++;
                    return pane   // the DESTROYED instance — a fallback here must be visible
                }
            });

            const resolved = host.items[0].getCardContainer().items[0];

            expect(resolved.id, 'the slot holds the candidate').toBe('recreate-reconciled-fresh');
            expect(resolved, 'and never the destroyed predecessor').not.toBe(pane);
            expect(resolved.isDestroyed).toBeFalsy();

            // Positional discovery, not resolution: the live map found the candidate in `body.items`
            // and the app resolver was never asked. Had `removeAt` left the corpse listed, this is
            // where it would have been handed back.
            expect(resolverCalls, 'the live item is discovered before the resolver is consulted').toBe(0)
        } finally {
            host.destroy();
            workspace.destroy()
        }
    })
});

test.describe('Workstation cache adoption', () => {
    test('header pop-out enters Workstation custom exit policy, not the raw handler bundle', async () => {
        const {default: WorkstationWorkspace} = await import('../../../../apps/workstation/view/Workspace.mjs'),
              workspace                       = Object.create(WorkstationWorkspace.prototype),
              data                            = {itemId: 'security', proxyRect: {height: 20, width: 30, x: 1, y: 2}};
        let received = null;

        workspace.onDockTearOutExit = async value => {
            received = value;
            return true
        };

        await expect(workspace.admitDockPopOut(data)).resolves.toBe(true);
        expect(received).toBe(data)
    });

    test('fresh resolution stays private until the exact committed pane replaces the cache entry', async () => {
        // Dynamic after setup(): Workstation's dependency graph reaches manager.Window, whose
        // singleton requires the test worker installed above before module evaluation.
        const {default: WorkstationWorkspace} = await import('../../../../apps/workstation/view/Workspace.mjs');

        const
            itemId    = 'security',
            item      = {componentRef: itemId, title: 'Security'},
            container = Neo.create(Container, {
                appName: 'DashboardDockRecreateCandidateTest',
                items  : [{module: Component, id: 'workstation-recreate-live'}]
            }),
            livePane  = container.items[0],
            workspace = Object.create(WorkstationWorkspace.prototype);

        workspace.dockModel             = {items: {[itemId]: item}};
        workspace.dockRecreateInFlight  = new Set();
        workspace.fire                  = () => {};
        workspace.isDestroyed           = false;
        workspace.paneCache             = {[itemId]: livePane};

        try {
            const
                freshA = workspace.resolveFreshPane(itemId, item),
                freshB = workspace.resolveFreshPane(itemId, item);

            expect(freshA).not.toBe(freshB);
            expect(freshA).not.toBe(livePane);
            expect(workspace.paneCache[itemId], 'prepare-time creation must not publish').toBe(livePane);

            freshA.destroy();
            freshB.destroy();

            workspace.resolveFreshPane = () => null;

            const refused = workspace.recreateDockPane(itemId, livePane, {settle: false});

            expect(refused.pane).toBeNull();
            expect(workspace.paneCache[itemId], 'a refusal preserves cache truth').toBe(livePane);
            expect(container.items[0], 'a refusal preserves slot truth').toBe(livePane);

            delete workspace.resolveFreshPane;

            const committed = workspace.recreateDockPane(itemId, livePane, {settle: false});

            expect(committed.errors).toEqual([]);
            expect(committed.pane).toBe(container.items[0]);
            expect(workspace.paneCache[itemId]).toBe(committed.pane);
            expect(committed.pane).not.toBe(livePane);
            expect(livePane.isDestroyed).toBe(true)
        } finally {
            container.destroy()
        }
    })
});
