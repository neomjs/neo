import Plugin            from '../../../plugin/Base.mjs';
import WorkspaceDocument from '../model/WorkspaceDocument.mjs';

/**
 * @summary The engine-owned header actions as a declinable owner: close, lock, pin, pop-out and
 * reload, with the reload's two-phase recreate transaction — the behaviour behind the five actions
 * the façade's header policy projects.
 *
 * Behaviour only: which actions a header projects and in what state stays with
 * {@link Neo.dashboard.dock.projection.HeaderActionPolicy}, and the five `enableDock*Action` configs
 * stay the façade's public contract — this plugin reads them from `owner`. The owner is a
 * `Neo.dashboard.dock.Workspace`; it reaches the plugin through one seam, its own
 * {@link Neo.dashboard.dock.Workspace#onDockHeaderAction} dispatch, which hands every action this
 * plugin owns to {@link #onDockHeaderAction} and re-emits the rest as the `dockHeaderAction` event.
 * Everything the handlers need is the owner's public surface — the committed `dockModel`, the
 * reducer seam `applyDockZoneOperation`, the publish seam `onDockZoneDocumentChange`, the tear-out
 * bundle, the flight sets and the `resolveFreshPane` hook — so a consumer that overrides one of those
 * on the façade keeps its override, and a consumer that declines this plugin
 * (`enableDockHeaderActionsPlugin: false`) answers the actions itself through the re-emitted event.
 *
 * The recreate transaction's public entry stays on the owner as the thin
 * {@link Neo.dashboard.dock.Workspace#recreateDockPane} seam, because consumers decorate it; the two
 * phases and the transaction body live here.
 *
 * @class Neo.dashboard.dock.plugin.HeaderActions
 * @extends Neo.plugin.Base
 */
class HeaderActions extends Plugin {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.plugin.HeaderActions'
         * @protected
         */
        className: 'Neo.dashboard.dock.plugin.HeaderActions',
        /**
         * @member {String} ntype='plugin-dock-header-actions'
         * @protected
         */
        ntype: 'plugin-dock-header-actions'
    }

    /**
     * Routes one header action to its handler, gated on the owner's per-action config, and answers
     * `undefined` for an action this plugin does not own — the owner then re-emits it.
     *
     * **`pop-out` and `pin` are the asynchronous rows.** `pop-out` because vessel admission is;
     * `pin` because its collapse sequence awaits each step's commit before reducing the next. Both
     * return the settlement as a Promise of the same `{document, errors}` envelope the synchronous
     * rows return, never a bare Boolean, and neither rejects.
     *
     * `pop-out` is gated on the owner's `dockPopOutActionActive`, not on `enableDockPopOutAction`:
     * ownership of the NAME and interception of the INTENT must use one predicate. With the action
     * opted in and the lifecycle off, the adapter frees `pop-out` for a host to own, and this row
     * must then leave the intent to the owner's re-emit rather than swallow it.
     * @param {Object} data
     * @param {String} data.action
     * @param {String} data.dockNodeId
     * @param {Neo.tab.Container} data.tabContainer
     * @returns {{document:Object,errors:String[]}|Promise<{document:Object,errors:String[]}>|Promise<{errors:String[]}|null>|undefined}
     */
    onDockHeaderAction({action, dockNodeId, tabContainer}={}) {
        let me      = this,
            {owner} = me;

        if (action === 'close' && owner.enableDockCloseAction) {
            return me.handleDockCloseAction({dockNodeId, tabContainer})
        }

        if (action === 'lock' && owner.enableDockLockAction) {
            return me.handleDockLockAction({dockNodeId, tabContainer})
        }

        if (action === 'pin' && owner.enableDockPinAction) {
            return me.handleDockPinAction({dockNodeId, tabContainer})
        }

        if (action === 'pop-out' && owner.dockPopOutActionActive) {
            return me.handleDockPopOutAction({dockNodeId, tabContainer})
        }

        if (action === 'reload' && owner.enableDockReloadAction) {
            return me.handleDockReloadAction({dockNodeId, tabContainer})
        }

        return undefined
    }

    /**
     * Commits the engine-owned close action.
     *
     * Live reconciled order owns the close target at dispatch time. The current model locates that
     * item's semantic tabs node, and the committed result owns its focus successor. Successful focus
     * is chained onto the refresh THIS close scheduled, so it cannot reach chrome the reconciler
     * retires — which is not always the `refreshPromise` standing at dispatch. The direct branch
     * publishes its refresh inside the call and is chained immediately; the Group branch publishes
     * from the commit's own microtask, so the follow-up waits for the returned promise first.
     * @param {Object} data
     * @param {String} data.dockNodeId
     * @param {Neo.tab.Container} data.tabContainer
     * @returns {{document:Object,errors:String[]}|null}
     * @protected
     */
    handleDockCloseAction({dockNodeId, tabContainer}={}) {
        let me     = this.owner,
            itemId = me.getActiveDockItemId(tabContainer);

        if (!itemId) {
            return {document: me.dockModel, errors: ['Dock close action requires an active item']}
        }

        if (!me.dockModel) {
            return {document: me.dockModel, errors: ['Dock close action requires a committed document']}
        }

        let modelNodeId = WorkspaceDocument.findContainingTabsId(me.dockModel, itemId) || dockNodeId,
            descriptor  = {operation: 'closeItem', itemId},
            result      = me.applyDockZoneOperation(descriptor);

        if (result && !result.errors?.length && result.document) {
            let focusId = result.document.nodes?.[modelNodeId]?.activeItemId ?? null;

            // Which refresh this close must wait for is decided by an observable test, not by
            // which branch ran: did the call publish a new refresh? (Timing: see `refreshPromise`.)
            const published = me.refreshPromise,
                  pending   = me.onDockZoneDocumentChange(result.document, descriptor, tabContainer),
                  focus     = () => this.focusDockCloseTarget({dockNodeId: modelNodeId, itemId: focusId});

            if (me.refreshPromise && me.refreshPromise !== published) {
                // Chaining now also keeps the follow-up observable to a caller that awaits
                // `refreshPromise` immediately, which the close specs do.
                me.refreshPromise = me.refreshPromise.then(focus)
            } else {
                // Two invariants. The assignment stays INSIDE the continuation, or
                // `projectDockZoneDocument` — which takes `refreshPromise` as its tail — waits on
                // itself. And the assigned chain is RETURNED, or a rejected projection escapes the
                // trailing catch and the follow-up adds a second, unhandled receipt.
                Promise.resolve(pending)
                    .then(() => me.refreshPromise = (me.refreshPromise ?? Promise.resolve()).then(focus))
                    .catch(() => {})
            }
        }

        return result
    }

    /**
     * @summary Toggles the active item's committed lock state through the reducer.
     *
     * On success the committed document advances through the ordinary holder seam, then current
     * chrome receives the derived presentation immediately; reconciliation repeats the same sync
     * on retained/new instances. The reducer owns every refusal, including `lockable:false`.
     * @param {Object} data
     * @param {String} data.dockNodeId
     * @param {Neo.tab.Container|null} data.tabContainer
     * @returns {{document:Object,errors:String[]}|null}
     * @protected
     */
    handleDockLockAction({tabContainer}={}) {
        let me          = this.owner,
            {dockModel} = me,
            itemId      = me.getActiveDockItemId(tabContainer),
            missing     = !itemId ? 'an active item' : !dockModel ? 'a committed document' : null;

        if (missing) {
            return {document: dockModel, errors: [`Dock lock action requires ${missing}`]}
        }

        let descriptor = {operation: 'setItemLocked', itemId, locked: dockModel.items[itemId]?.locked !== true},
            result     = me.applyDockZoneOperation(descriptor);

        if (result && !result.errors?.length && result.document) {
            me.onDockZoneDocumentChange(result.document, descriptor, tabContainer)
        }

        return result
    }

    /**
     * @summary Detaches the active pane into its own vessel window, through the drag tear-out's
     * own commit path.
     *
     * **One vessel pipeline, one detach commit — provably, not by inspection.** This dispatches
     * `onDockTearOutExit` then `onDockTearOutTerminal`, which is literally what the pointer
     * gesture's terminal calls. It is not a second sequence that resembles the drag path; it is
     * that path, entered from a click. So admission, the exactly-once `detachItem` commit, the
     * throwing-reducer refusal route and vessel retirement are all inherited rather than restated,
     * and none of them can drift out of agreement with the gesture.
     *
     * The only delta from the drag entry is **geometry**: the gesture supplies a live proxy rect,
     * a click has none, so the pane's current box is measured first and the vessel opens over it —
     * the pane appears to lift in place rather than materialising at a default position.
     *
     * `onDockTearOutExit` is admission-first and fail-closed: a falsy resolution means the host
     * refused the window, and the pane stays exactly where it is with nothing committed. Terminal
     * is only reached on an admitted vessel.
     *
     * Focus and announcement are **not** performed here — see the owner's `enableDockPopOutAction`
     * for why that bound is deliberate and whose job they are.
     *
     * Settles as the same `{document, errors}` envelope every other engine action returns. The
     * terminal itself answers with a bare Boolean — that is the drag path's internal grammar, and
     * translating it here rather than leaking it keeps one shape across the router's rows.
     *
     * @param {Object}                  data
     * @param {String}                  data.dockNodeId
     * @param {Neo.tab.Container|null}  data.tabContainer
     * @returns {Promise<{document:Object,errors:String[]}>}
     * @protected
     */
    async handleDockPopOutAction({dockNodeId, tabContainer}={}) {
        let me     = this.owner,
            itemId = me.getActiveDockItemId(tabContainer);

        if (!itemId) {
            return {document: me.dockModel, errors: ['Dock pop-out action requires an active item']}
        }

        if (!me.tearOutHandlers) {
            // Unreachable while the availability contract holds. Kept because the router is
            // directly callable, and a missing effective host pipeline must refuse rather than throw.
            return {document: me.dockModel, errors: ['Dock pop-out action requires a tear-out handler bundle']}
        }

        const proxyRect = await this.measureDockPaneRect(tabContainer);

        // A click is asynchronous across two awaits and `destroy()` nulls `tearOutHandlers`, so the
        // pipeline is re-checked after EVERY await rather than captured once. Nothing here may
        // commit into a workspace that is already gone.
        if (me.isDestroyed || !me.tearOutHandlers) {
            return {document: me.dockModel, errors: ['Dock pop-out abandoned: the workspace was destroyed before admission']}
        }

        // Admission-first. A refused vessel leaves the pane untouched and uncommitted.
        const admitted = await me.admitDockPopOut({itemId, proxyRect, sortZone: null});

        if (admitted === false) {
            return {document: me.dockModel, errors: ['Dock pop-out was refused by the host vessel seam']}
        }

        if (me.isDestroyed || !me.tearOutHandlers) {
            // Admitted, then the workspace went away before the commit. The vessel is real and open,
            // so abandoning it silently would orphan a window; retire it through the machine that
            // opened it rather than leaving the caller to guess.
            me.tearOutHandlers?.retireActiveVessel?.();

            return {document: me.dockModel, errors: ['Dock pop-out abandoned: the workspace was destroyed after admission']}
        }

        // Captured BEFORE the terminal so the check below needs positive evidence of a transition.
        // Reading only the "after" state would let an absent or empty document read as a detach —
        // `findContainingTabsId` returns null for "not in the tree" AND for "no tree at all", so a
        // success would be reported from the absence of any evidence.
        const wasInTree = !!WorkspaceDocument.findContainingTabsId(me.dockModel, itemId);

        await me.tearOutHandlers.onDockTearOutTerminal({itemId});

        // **The terminal's return value cannot separate commit from refusal.** It resolves `true` on
        // a committed detach, and on refusal it resolves `retireVessel(vessel)` — which is ALSO true
        // when the retirement succeeds. So a reducer refusal whose cleanup worked is indistinguishable
        // from a commit by that Boolean, and reading it as success would report a detach that never
        // happened.
        //
        // The committed document is the honest witness: a detached item is no longer in any tabs
        // node. Read AFTER the terminal, so a success reports the advanced document rather than the
        // one this method started with.
        const detached = wasInTree && !WorkspaceDocument.findContainingTabsId(me.dockModel, itemId);

        return detached
            ? {document: me.dockModel, errors: []}
            : {document: me.dockModel, errors: ['Dock pop-out was refused by the detach commit']}
    }

    /**
     * @summary The active pane's current global box, used as the vessel's opening geometry.
     *
     * Measures the tabs node rather than the workspace: the vessel should lift the **pane** the
     * button sits on, not the whole dock. A failed or degenerate measurement resolves `null`, which
     * the tear-out seam accepts — the vessel then opens at the host's default geometry instead of
     * at a wrong one, which is the safer of the two failures.
     *
     * @param {Neo.tab.Container|null} tabContainer
     * @returns {Promise<Object|null>}
     * @protected
     */
    async measureDockPaneRect(tabContainer) {
        let id   = tabContainer?.id,
            rect = null;

        if (!id) {
            return null
        }

        try {
            rect = await Neo.main.DomAccess.getBoundingClientRect({id, windowId: this.owner.windowId})
        } catch (error) {
            rect = null
        }

        Array.isArray(rect) && (rect = rect[0]);

        return (rect?.width > 0 && rect?.height > 0) ? rect : null
    }

    /**
     * Focuses the committed close successor after reconciliation. The exact item id is resolved
     * back through the reconciled `dockItemIds`; an empty tabs node focuses its own root.
     * @param {Object} data
     * @param {String} data.dockNodeId
     * @param {String|null} data.itemId
     * @protected
     */
    focusDockCloseTarget({dockNodeId, itemId}={}) {
        let {owner}      = this,
            tabContainer = owner.getDockHost()?.down?.({dockNodeId});

        if (!tabContainer) {
            owner.focus();
            return
        }

        if (itemId) {
            let itemIds = tabContainer.getTabBar()?.sortZoneConfig?.dockItemIds || [],
                index   = itemIds.indexOf(itemId);

            if (index > -1) {
                tabContainer.getTabButtons()[index]?.focus();
                return
            }
        }

        tabContainer.focus()
    }

    /**
     * Commits the engine-owned pin action — docking design record §2.7's collapse-to-rail sequence.
     *
     * §2.7 specifies a two-step sequence and forbids a composite operation: `setItemPinned(false)`
     * when the item is pinned (the model rejects `autoHidden` on a pinned item), then
     * `setItemAutoHidden(true)`. Each step is an INDEPENDENT commit — reduced through the owner's
     * `applyDockZoneOperation` and published through its `onDockZoneDocumentChange` on its own — so
     * both steps stay visible at the façade's own write seam, the one `DockService` and
     * `DockSplitter` already reach a holder through. Folding them into a single published change
     * would make step 2 bypass that seam, since the seam reduces against the committed `dockModel`
     * and step 2 needs step 1's result.
     *
     * **Step 1's publish is therefore awaited, which is why this method is async.** The direct path
     * assigns `dockModel` synchronously, but a topology Group returns a pending transaction and
     * advances the field later inside adopt; an unawaited step 2 then reduces against a document
     * step 1 never reached and is refused. Awaiting preserves both properties the row requires —
     * the steps stay independently committed, and they land in the specified order.
     *
     * A step-2 rejection therefore leaves the item unpinned and still visible. That is §2.7's own
     * intermediate state, which it calls benign, and it is the price of the independence the row
     * requires; the alternative buys atomicity by making half the gesture unobservable.
     *
     * An UNPINNED item — the ordinary case — is a single step and a single refresh; only collapsing a
     * pinned pane commits twice.
     *
     * **Eligibility is re-derived here, from the current document, and not inherited from the chrome
     * that emitted the intent.** The pin action's binding ({@link Neo.dashboard.dock.projection.HeaderActionPolicy#createActionBindings}) hides it wherever no edge owns the
     * item, but that visibility is a projection of the document as it stood at the last publish, and the
     * sweep is deferred behind reconciliation. Between a commit that moves an item to the root center
     * and the refresh that re-hides its action, a retained-but-stale action is still visible and still
     * dispatchable — and collapsing a center item is precisely what §2.7 forbids. Deciding from
     * `dockModel` at dispatch closes that window: the same predicate, evaluated against the document
     * the commit will actually reduce against.
     * @param {Object} data
     * @param {String} data.dockNodeId
     * @param {Neo.tab.Container} data.tabContainer
     * @returns {Promise<{document:Object,errors:String[]}|null>} Resolves; never rejects — a failed
     *     commit is returned as `errors`, because the caller is a listener slot with no rejection seam.
     * @protected
     */
    async handleDockPinAction({dockNodeId, tabContainer}={}) {
        let me     = this.owner,
            itemId = me.getActiveDockItemId(tabContainer);

        if (!itemId) {
            return {document: me.dockModel, errors: ['Dock pin action requires an active item']}
        }

        if (!me.dockModel) {
            return {document: me.dockModel, errors: ['Dock pin action requires a committed document']}
        }

        if (!WorkspaceDocument.findOwningEdge(me.dockModel, itemId)) {
            return {document: me.dockModel, errors: ['Dock pin action requires an item owned by an edge zone']}
        }

        let descriptors = [],
            result      = null;

        me.dockModel.items?.[itemId]?.pinned === true &&
            descriptors.push({operation: 'setItemPinned', itemId, pinned: false});

        descriptors.push({operation: 'setItemAutoHidden', itemId, autoHidden: true});

        // The catch converts a failure into this method's own `{document, errors}` contract rather
        // than propagating it. Awaiting introduces that obligation: the only caller is a component
        // listener slot — `LayoutAdapter` wires `headerAction` straight to it — so there is nowhere
        // above to attach a rejection handler, and an escaping rejection would be unhandled. It is
        // deliberately not re-logged; the Group branch already routes to `Neo.logError`, so what
        // changes here is the shape of the failure, never whether it is reported.
        try {
            for (const descriptor of descriptors) {
                result = me.applyDockZoneOperation(descriptor);

                if (!result || result.errors?.length || !result.document) {
                    return result
                }

                // Awaited: the seam reads the committed `dockModel`, and only the direct path assigns
                // it synchronously. Under a Group the publish is a pending transaction, so an
                // unawaited step 2 reduces against a document step 1 has not reached.
                await me.onDockZoneDocumentChange(result.document, descriptor, tabContainer)
            }
        } catch (error) {
            // `error?.message ?? String(error)` rather than `error.message`: a rejection value is not
            // required to be an Error. `Promise.reject(null)` would make the property read throw
            // INSIDE this catch, and that throw escapes the method — reintroducing the exact
            // unhandled rejection this block exists to prevent, in the one path nothing else covers.
            return {document: me.dockModel, errors: [error?.message ?? String(error)]}
        }

        return result
    }

    /**
     * Runs the engine-owned reload for the active pane: `dockReload()` when the pane implements
     * the contract — the author owns what reload means, and the method is explicitly
     * promise-aware (`void | Promise<*>`) — and the engine's recreate ({@link #recreateDockPane})
     * when it does not. Runtime-only by contract: no operation is
     * committed and the document never changes. Every completion — sync throw, async rejection,
     * async success — settles exactly once through the owner's `dockReloadSettled` event
     * (`{dockNodeId, itemId, errors}`), because the action wire has no result channel
     * (`Observable.fire` discards listener returns). A failing `dockReload()` keeps the pane,
     * always. One invocation per item may be in flight; the action's `disabled` state derives
     * from the ACTIVE item's in-flight membership through its binding
     * ({@link Neo.dashboard.dock.projection.HeaderActionPolicy#createActionBindings}) on the published `flights` — written at
     * the flight edges here, re-read on every active-item change — so switching panes mid-flight
     * never inherits another item's window. Teardown mid-flight settles terminally through
     * `core.Base#trap`: destroy rejects the trapped delegation even when the pane's producer
     * never settles, and the post-destroy continuation returns without touching erased state.
     * The no-active race (teardown, active-item flip mid-dispatch) settles through the channel
     * too, carrying `itemId: null` — one settlement per activation, with the single-flight
     * absorption as the only silent path.
     * @param {Object} data
     * @param {String} data.dockNodeId
     * @param {Neo.tab.Container} data.tabContainer
     * @returns {Promise<{errors: String[]}|null>} `null` when an in-flight invocation absorbed
     *     the activation.
     * @protected
     */
    async handleDockReloadAction({dockNodeId, tabContainer}={}) {
        let me     = this.owner,
            itemId = me.getActiveDockItemId(tabContainer),
            errors = [];

        if (!itemId) {
            // The no-active race (teardown, active-item flip mid-dispatch) settles through the
            // SAME channel as every other completion — the action wire discards returns, so an
            // unsettled early return here would be an activation the event contract never saw.
            errors.push('Dock reload action requires an active item');
            !me.isDestroyed && me.fire('dockReloadSettled', {dockNodeId, errors, itemId: null});
            return {errors}
        }

        // Single-flight: a second activation during the window neither invokes nor settles —
        // one settlement per invocation is the channel's contract.
        if (me.dockReloadInFlight.has(itemId)) {
            return null
        }

        let itemIds = tabContainer.getTabBar()?.sortZoneConfig?.dockItemIds || [],
            index   = itemIds.indexOf(itemId),
            pane    = index > -1 ? tabContainer.getCard(index) : null;

        if (!pane || pane.isDestroyed) {
            // No live card at all: a race (teardown, active-item flip mid-dispatch). There is
            // nothing to delegate to and nothing to replace — settle it honestly.
            errors.push(`Dock reload has no live pane for item "${itemId}"`)
        } else if (typeof pane.dockReload !== 'function') {
            // THE FALLBACK. A pane that never implemented the delegation contract has no other
            // recovery once its own state is wedged, which is the entire reason the recreate
            // transaction exists. Delegation first, recreate only when it is absent — a pane that
            // owns `dockReload()` decides what reload means, and replacing it instead would
            // discard that authority AND its identity.
            //
            // `settle: false` because THIS method settles the activation. Without it one click
            // emits two terminal events — `dockRecreateSettled` from the transaction and
            // `dockReloadSettled` from here — and a consumer counting completions would see the
            // action fire twice. The transaction's own channel stays for direct callers.
            //
            // Through the OWNER's seam, never this plugin's transaction directly: a consumer that
            // decorates `recreateDockPane` on the façade (the Workstation adopts the committed pane
            // into its cache there) must see the reload's recreate as well as a direct call.
            const recreated = me.recreateDockPane(itemId, pane, {dockNodeId, settle: false});

            recreated?.errors?.length && errors.push(...recreated.errors)
        } else {
            me.dockReloadInFlight.add(itemId);
            me.stateProvider?.setData(`dock.flights.${itemId}`, 'reload');

            try {
                // trap() is the engine-native teardown race: destroy rejects every registered
                // async, so this await settles even when the pane's producer never does — and a
                // producer settling later lands in the trap's already-settled no-op handlers,
                // never as an unhandled rejection.
                await me.trap(Promise.resolve().then(() => pane.dockReload()))
            } catch (error) {
                error !== Neo.isDestroyed && errors.push(`dockReload() failed for item "${itemId}": ${error?.message || error}`)
            }

            // Teardown rejected the trap: settle terminally — destroy erased the instance
            // fields this continuation would otherwise mutate.
            if (me.isDestroyed) {
                return {errors}
            }

            me.dockReloadInFlight.delete(itemId);

            // Re-derive both action axes from current truth: the active item may have changed
            // mid-flight, so assigning `disabled = false` here would leak across items. The
            // settle edge queues BEHIND any in-flight refresh (settled tail, never a raw write
            // beside a reconcile) — a settlement is not latency-sensitive, and the post-reconcile
            // sweep re-derives the same truth anyway when a commit is what changed the item.
            (me.refreshPromise?.catch(() => {}) || Promise.resolve()).then(() => {
                !me.isDestroyed && me.stateProvider?.setData(`dock.flights.${itemId}`, null)
            })
        }

        !me.isDestroyed && me.fire('dockReloadSettled', {dockNodeId, errors, itemId});

        return {errors}
    }

    /**
     * Phase 1 of the two-phase recreate transaction: obtain and validate a fresh candidate **without
     * touching the live pane**.
     *
     * Rollback is by construction rather than by repair — nothing is destroyed here, so every
     * refusal below leaves the workspace exactly as it was. The docking record's user-triggered
     * recreate exception is conditioned on this phase — without a validated candidate the exception
     * does not apply and the never-destroyed guarantee stands unmodified.
     * @see learn/agentos/decisions/0029-docking-design.md §2.6 — the docking record is this method's
     *      authority, not a tracking reference; the contract is unreadable without it.
     *
     * The three refusals are the ones a cache-backed resolver actually produces:
     *
     * | refusal | why it is not a candidate |
     * |---|---|
     * | `threw` | the factory raised; the error is carried, never swallowed |
     * | `declined` | returned `null` — including the default, i.e. recreate unsupported |
     * | `live-instance` | returned the pane that is already mounted, so "replacing" it is a no-op that would destroy the only copy |
     *
     * The `live-instance` check is the load-bearing one and the reason a factory seam alone is not
     * enough: a resolver reading its own cache answers with the current instance, which looks like a
     * successful candidate and is the exact shape that turns a recovery click into silent pane loss.
     * @param {String} itemId The stable workspace identity from the item catalog.
     * @param {Neo.component.Base} livePane The currently mounted pane for that item.
     * @returns {{ok: Boolean, candidate: ?Object, reason: ?String, error: ?Error}}
     */
    prepareRecreateCandidate(itemId, livePane) {
        const
            {owner} = this,
            // The same read the rest of the façade uses for a catalog record; an item the committed
            // document does not carry resolves to null and the factory decides what that means.
            item    = owner.dockModel?.items?.[itemId] || null;

        let candidate;

        try {
            // Decorating what the HOOK RETURNS, rather than fixing the base `resolveFreshPane` to
            // delegate to the decorated resolver, is deliberate: `resolveFreshPane` is the documented
            // extension point for a cache-backed factory, and a consumer that overrides it would
            // otherwise still answer with an undecorated candidate and re-open this gap. An instance
            // candidate passes through untouched, so the `live-instance` refusal below still compares
            // identities.
            candidate = owner.decorateFlipMarker(owner.resolveFreshPane(itemId, item), itemId)
        } catch (error) {
            return {ok: false, candidate: null, reason: 'threw', error}
        }

        if (!candidate) {
            return {ok: false, candidate: null, reason: 'declined', error: null}
        }

        // Identity, not equality: a config object that merely describes the same pane is a valid
        // candidate; the mounted instance itself is not.
        if (livePane && candidate === livePane) {
            return {ok: false, candidate: null, reason: 'live-instance', error: null}
        }

        return {ok: true, candidate, reason: null, error: null}
    }

    /**
     * Phase 2 of the two-phase recreate transaction: replace exactly the card-body slot, then — and
     * only then — destroy the instance that was there.
     *
     * **Never a bare destroy.** `core.Base#destroy` unregisters an instance without removing it from
     * `parent.items`, and the reconciler fills its live map positionally from `body.items` and
     * prefers that entry over the resolver. A destroyed-but-still-listed pane is therefore handed
     * back as the live answer on the very next refresh. Structural removal belongs to the container,
     * so this goes through `removeAt` + `insert`.
     *
     * `removeAt`'s `destroyItem` argument **defaults to true** and is passed `false` here. That
     * default is the whole ordering hazard: taking it would destroy the old pane during removal, so
     * a failure to insert the candidate afterwards would leave the slot empty with nothing to
     * restore — the silent pane loss this transaction exists to prevent.
     *
     * Only the card body is touched, so tab, header-action and overflow identities are preserved by
     * construction rather than by repair: the tab bar is never in the mutation path.
     * @param {Neo.component.Base} livePane The mounted pane to replace.
     * @param {Object|Neo.component.Base} candidate A candidate validated by
     *     {@link #prepareRecreateCandidate} — never call this with an unvalidated one.
     * @returns {{ok: Boolean, index: Number, pane: ?Neo.component.Base, reason: ?String}}
     */
    commitRecreateCandidate(livePane, candidate) {
        // Teardown mid-transaction. Phase 1 and Phase 2 are separate calls, so a workspace or tab
        // container can be destroyed in the gap between validating a candidate and committing it —
        // a pane closed, a vessel torn down, a window disconnected. Every one of those must settle
        // as a **refusal**, not as a throw and not as a partial mutation: by this point the caller
        // holds a validated candidate and would otherwise commit it into a corpse.
        //
        // Checked before the container is touched, so a torn-down transaction mutates nothing at all
        // rather than mutating and then failing.
        // `!this.owner` is the owner destroyed first: its teardown releases the plugin's owner
        // reference, and a caller still holding this plugin must get the same refusal.
        if (!livePane || livePane.isDestroyed || !this.owner || this.owner.isDestroyed) {
            return {ok: false, index: -1, pane: null, reason: 'torn-down'}
        }

        const container = livePane.parent;

        if (!container || container.isDestroyed) {
            return {ok: false, index: -1, pane: null, reason: 'no-container'}
        }

        const index = container.indexOf(livePane.id);

        if (index < 0) {
            return {ok: false, index, pane: null, reason: 'not-in-container'}
        }

        // INSERT FIRST, then remove. The reverse order — remove, then insert — has a window between
        // the two calls where the slot is empty and the predecessor is orphaned, and an `insert`
        // that throws (an invalid candidate config is ordinary consumer input) leaves it that way
        // permanently. That is the silent pane loss this whole transaction exists to prevent, so the
        // failure mode cannot live inside the commit either.
        //
        // Inserting at `index` shifts the predecessor to `index + 1`; nothing is removed until the
        // candidate is demonstrably in the container.
        let pane;

        try {
            // `candidate` may be a config; the container owns instantiation and returns the exact
            // component that entered the live slot. Returning that identity is what lets a
            // cache-backed consumer adopt the commit rather than the unmaterialized input.
            pane = container.insert(index, candidate)
        } catch (error) {
            // Nothing was removed, so there is nothing to restore — rollback by construction here
            // too, not by repair.
            return {ok: false, index, pane: null, reason: 'insert-failed', error}
        }

        // `false`: the predecessor must outlive its own removal, so a failure here still leaves a
        // live pane in the container rather than a destroyed one.
        container.removeAt(index + 1, false);

        // The candidate is in the slot; the predecessor is now safe to release. The ordering is the
        // contract, not an implementation detail.
        livePane.destroy();

        return {ok: true, index, pane, reason: null, error: null}
    }

    /**
     * The two phases run as one transaction, settling exactly once through a named channel.
     *
     * Mirrors the reload leaf's contract deliberately — `dockReloadSettled` / `dockReloadInFlight` —
     * because a second settlement channel with different semantics on the same header would be a
     * worse cost than the duplication. **Every completion settles**, including each refusal: the
     * action wire has no result channel (`Observable.fire` discards listener returns), so an
     * unsettled early return is an invocation the event contract never saw.
     *
     * Unlike reload this is **synchronous** — both phases are — so there is no producer to trap and
     * no async teardown race. Teardown is still handled, by
     * {@link #commitRecreateCandidate}'s `torn-down` refusal, and it settles through this channel
     * like everything else.
     *
     * **Single-flight per item, and absorption is the only silent path** — a re-entrant invocation
     * during the window neither runs nor settles, exactly as reload's does. Re-entrancy is not
     * hypothetical here: `resolveFreshPane` is consumer code, and a consumer that recreates from
     * inside its own factory would otherwise recurse.
     *
     * Entered through the owner's {@link Neo.dashboard.dock.Workspace#recreateDockPane} seam, which
     * consumers decorate; this is the transaction that seam delegates to.
     * @param {String} itemId The stable workspace identity from the item catalog.
     * @param {Neo.component.Base} livePane The mounted pane to replace.
     * **`settle: false` is for callers that own the settlement themselves.** The reload action is
     * the one in tree: it serves a contract-less pane through this transaction and then settles on
     * `dockReloadSettled`, so firing here too would emit **two terminal events for one activation**.
     * The single-flight guard still applies — only the event is suppressed, never the transaction.
     * @param {Object} [options]
     * @param {String|null} [options.dockNodeId=null] Carried through to the settlement payload.
     * @param {Boolean} [options.settle=true] `false` when an outer channel settles this invocation.
     * @returns {{errors: String[],pane: ?Neo.component.Base}|null} `pane` is the exact committed
     *     component; `null` when the transaction refused or an in-flight invocation absorbed it.
     */
    recreateDockPane(itemId, livePane, {dockNodeId=null, settle=true}={}) {
        const me     = this.owner,
              errors = [];
        let pane = null;

        // Absorption: neither runs nor settles. The only silent path, by design.
        if (me.dockRecreateInFlight.has(itemId)) {
            return null
        }

        me.dockRecreateInFlight.add(itemId);
        me.stateProvider?.setData(`dock.flights.${itemId}`, 'recreate');

        try {
            const prepared = this.prepareRecreateCandidate(itemId, livePane);

            if (!prepared.ok) {
                // The refusal reason IS the error. A caller that only learns "it failed" cannot tell
                // a consumer that declined the capability from one whose factory handed back the
                // live instance — and those need different fixes.
                errors.push(`Dock recreate refused for item "${itemId}": ${prepared.reason}`);

                prepared.error && errors.push(prepared.error.message)
            } else {
                const committed = this.commitRecreateCandidate(livePane, prepared.candidate);

                if (!committed.ok) {
                    errors.push(`Dock recreate could not commit item "${itemId}": ${committed.reason}`);

                    committed.error && errors.push(committed.error.message)
                } else {
                    pane = committed.pane;
                    const declaration = me.paneDeclarations && me.getPaneDeclaration(itemId);
                    if (declaration) declaration.id = pane.id
                }
            }
        } finally {
            me.dockRecreateInFlight.delete(itemId);
            !me.isDestroyed && me.stateProvider?.setData(`dock.flights.${itemId}`, null)
        }

        settle && !me.isDestroyed && me.fire('dockRecreateSettled', {dockNodeId, errors, itemId});

        return {errors, pane}
    }
}

export default Neo.setupClass(HeaderActions);
