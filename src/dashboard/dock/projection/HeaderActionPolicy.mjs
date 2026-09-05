import Base              from '../../../core/Base.mjs';
import NeoArray          from '../../../util/Array.mjs';
import Reconciler        from './Reconciler.mjs';
import WorkspaceDocument from '../model/WorkspaceDocument.mjs';

/**
 * @summary The header-action presentation policy of a dock workspace: which engine action is
 * shown, enabled or pressed for which pane in which committed state, re-derived onto the retained
 * action instances after every commit and every active-item change.
 *
 * Membership is owned elsewhere — `toolbar.Base#getActionItems` and `tab.header.Toolbar#isTabButton`
 * decide which actions exist, and the projection emits them once as a constant row. This class owns
 * the second layer: reading committed truth and runtime state and writing `hidden` / `disabled` /
 * `pressed` onto the instance that survives re-projection, so the Overflow plugin receives its
 * existing `actionVisibilityChange` signal instead of an action-group replacement. Every write is
 * change-guarded, so re-walking retained nodes is idempotent. Command execution stays with the
 * workspace: its `onDockHeaderAction` router and `handleDock*Action` handlers are the mutation
 * boundary this policy reads the results of.
 *
 * The state this class owns is the lock presentation's exact-restore memory — which panes it made
 * inert and what they owned before, which tab buttons it disarmed — so an unlock reverses along the
 * path that locked and never hands a pane an unlock it never received a lock for.
 *
 * The workspace surface it reads, and nothing more: `dockModel`, the `enableDock*Action` opt-ins,
 * `getActiveDockItemId()`, `dockPopOutActionActive`, `dockReloadInFlight`, `dockRecreateInFlight`,
 * `hasDockRecreateFallback()`, `forEachDockRail()`, `getDockHost()` and `dockShellIndex`. The
 * workspace resolves one instance through its `dockHeaderActionPolicy` config, so a consumer
 * replaces the policy with one config rather than overriding workspace methods.
 *
 * @class Neo.dashboard.dock.projection.HeaderActionPolicy
 * @extends Neo.core.Base
 */
class HeaderActionPolicy extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.projection.HeaderActionPolicy'
         * @protected
         */
        className: 'Neo.dashboard.dock.projection.HeaderActionPolicy',
        /**
         * The workspace whose header actions this policy presents.
         * @member {Neo.dashboard.dock.Workspace|null} workspace=null
         */
        workspace: null
    }

    /**
     * Exact pre-lock root-inert snapshots keyed by the live pane instance:
     * `{owned:Boolean, value:*}`. A WeakMap cannot prolong a retired pane's lifetime.
     * @member {WeakMap<Neo.component.Base,Object>} lockPaneState=new WeakMap()
     * @protected
     */
    lockPaneState = new WeakMap()

    /**
     * Whether each live tab button owned the SortZone's `neo-draggable` token before lock
     * suppressed it. Unlock restores that exact ownership instead of globally arming drag.
     * @member {WeakMap<Neo.component.Base,Boolean>} lockDragState=new WeakMap()
     * @protected
     */
    lockDragState = new WeakMap()

    /**
     * Releases the workspace reference; the WeakMaps retire with the instance.
     * @param {...*} args
     */
    destroy(...args) {
        this.workspace = null;
        super.destroy(...args)
    }

    /**
     * Synchronizes every projected engine header action after reconciliation, including retained tabs
     * whose action instance outlived a model-policy or active-item change.
     *
     * Walks the SETTLED shell, never a map handed in from the reconciler: that map is the OLD shell's
     * tabs (`Reconciler.collectProjectedTabs(oldShell)`), so a node the projection just CREATED — a
     * railed item pinned back into flow, a fresh boot's placeholders — is not in it, and `reload`'s
     * availability, projected as a constant `hidden: true` by the stable-instance rule, is revealed
     * by nothing else. Every write below is change-guarded, so re-walking retained nodes is idempotent.
     *
     * Each action's own sync guards on its own opt-in and is a no-op when the action was never
     * projected — the opt-in guard is load-bearing, not redundant: a host may legally own an
     * engine action NAME while that engine flag is off (the reserved-name guard fires only for
     * enabled actions), and `getActionItem` finds the host's action by name. Without the guard,
     * this sweep would rewrite consumer-owned action state.
     */
    syncAll() {
        let me          = this,
            {workspace} = me,
            shell       = workspace?.getDockHost()?.items?.[workspace.dockShellIndex];

        shell && Reconciler.collectProjectedTabs(shell).forEach(tab => {
            me.syncCloseAction(tab);
            me.syncLockAction(tab);
            me.syncPinAction(tab);
            me.syncPopOutAction(tab);
            me.syncReloadAction(tab)
        });

        workspace?.enableDockLockAction && me.syncLockRails()
    }

    /**
     * Synchronizes the actions whose answer depends on which item is active: close, lock and pin.
     * The reload action is synced separately by the caller, because on the commit path the
     * post-reconcile sweep is its writer.
     * @param {Neo.tab.Container|null} tabContainer
     */
    syncActiveItem(tabContainer) {
        this.syncCloseAction(tabContainer);
        this.syncLockAction(tabContainer);
        this.syncPinAction(tabContainer)
    }

    /**
     * Synchronizes one retained close action against the live active item and committed policy.
     * Hidden-state changes stay on the stable action instance so Overflow receives its existing
     * `actionVisibilityChange` signal instead of an action-group replacement.
     *
     * Gated on the workspace's `enableDockCloseAction` for the reason given on {@link #syncPinAction}:
     * the name is only the engine's while its own opt-in is on.
     * @param {Neo.tab.Container|null} tabContainer
     */
    syncCloseAction(tabContainer) {
        let {workspace} = this;

        if (!workspace?.enableDockCloseAction) return;

        let action = tabContainer?.getActionItem?.('close'),
            itemId = workspace.getActiveDockItemId(tabContainer),
            item   = workspace.dockModel?.items?.[itemId],
            hidden = !itemId || item?.closable === false || item?.locked === true;

        action && (action.hidden = hidden)
    }

    /**
     * @summary Re-evaluates the retained pop-out action against current truth after every commit.
     *
     * Pop-out was the one engine action with no sync. Its `hidden` is projected once as
     * `!activeItemId || !dockPopOutActionAvailable` and then lives on a RETAINED action instance
     * that survives re-projection, so nothing ever recomputed it: the control was correct at boot
     * and silently gone after the first layout commit. For a consumer whose reason to be here is
     * multi-window, the feature disappeared until reload.
     *
     * Mirrors the projected expression from the same reader (`dockPopOutActionActive`), so the
     * projected and the synced answer cannot drift. Change-guarded like its siblings, so re-walking
     * retained nodes stays idempotent.
     * @param {Neo.tab.Container} tabContainer
     */
    syncPopOutAction(tabContainer) {
        let {workspace} = this;

        if (!workspace?.enableDockPopOutAction) return;

        let action = tabContainer?.getActionItem?.('pop-out'),
            itemId = workspace.getActiveDockItemId(tabContainer),
            hidden = !itemId || !workspace.dockPopOutActionActive;

        action && (action.hidden = hidden)
    }

    /**
     * Synchronizes the retained lock action and every projected pane/button against committed
     * item truth. The action stays one stable instance; per-item hidden/icon state moves on it.
     *
     * Presentation is deliberately a second layer beneath the model guards. Lock stamps
     * `vdom.inert` plus `neo-dock-pane-locked` in one pane update and removes only the tab
     * button's `neo-draggable` source token. Unlock restores the exact prior inert ownership/value
     * and exact prior drag-token ownership. Locked headers remain legal drop targets. The ordinary
     * lock gesture is focus-gated; once the protective state persists, its unlock reversal becomes
     * persistent too, so discoverability never depends on re-entering a transient focus context.
     * @param {Neo.tab.Container|null} tabContainer
     */
    syncLockAction(tabContainer) {
        let me          = this,
            {workspace} = me;

        if (!workspace?.enableDockLockAction || !tabContainer) return;

        let {items} = workspace.dockModel || {},
            bar     = tabContainer.getTabBar(),
            action  = tabContainer.getActionItem('lock'),
            itemId  = workspace.getActiveDockItemId(tabContainer),
            item    = items?.[itemId],
            locked  = item?.locked === true;

        // ONE write of WHAT is true. The action owns the icon / accessible name / tooltip mapping
        // (`toolbar.ActionButton#afterSetPressed`) and the toolbar derives the focus gate from
        // `pressed`, so nothing here states how the control should look.
        action?.set({
            hidden : !itemId || item?.lockable === false,
            pressed: locked
        });

        // Buttons are addressed by identity, never by position: `tab.plugin.Overflow` removes
        // overflowing buttons from this collection by design, so `buttons[index]` can name a
        // different item than `dockItemIds[index]` does.
        let buttons = tabContainer.getTabButtons(),
            panes   = tabContainer.getCardContainer().items;

        bar.sortZoneConfig?.dockItemIds?.forEach((id, index) => {
            me.syncLockItemPresentation({
                button: buttons.find(button => button.dockItemId === id) || null,
                locked: items?.[id]?.locked === true,
                pane  : panes[index]
            })
        })
    }

    /**
     * Applies or restores one item's lock presentation without changing model state.
     *
     * The content half is delegable, the reload precedent: a pane implementing
     * `dockLock(locked)` owns what locked means for its content — a form disables its fields, a
     * grid turns cell editing off, a stream keeps scrolling — and the engine writes no `inert` for
     * it. The probe is a pure `typeof` on the live card, never a resolver call. The hook fires
     * once per transition, recorded in the same per-pane state as the inert snapshot, so a sweep
     * that runs on every active-item change never re-locks a pane its author already locked.
     * Without the hook the engine's inert default stands, byte-identical, with its exact-restore
     * clause.
     * @param {Object} data
     * @param {Neo.tab.header.Button|null} data.button
     * @param {Boolean} data.locked
     * @param {Neo.component.Base|null} data.pane
     */
    syncLockItemPresentation({button, locked, pane}={}) {
        let me = this;

        if (pane && !pane.isDestroyed) {
            let {vdom}  = pane,
                held    = me.lockPaneState.get(pane),
                changed = false,
                prior;

            if (locked && !held) {
                if (typeof pane.dockLock === 'function') {
                    me.lockPaneState.set(pane, {delegated: true});
                    pane.dockLock(true)
                } else {
                    me.lockPaneState.set(pane, {owned: Object.hasOwn(vdom, 'inert'), value: vdom.inert});
                    changed    = vdom.inert !== true;
                    vdom.inert = true
                }
            } else if (!locked && held) {
                prior = held;
                me.lockPaneState.delete(pane);

                // Reverse along the path that locked: the record decides, never the current probe,
                // so a pane cannot be handed an unlock it never received a lock for.
                if (prior.delegated) {
                    pane.dockLock(false)
                } else {
                    prior.owned ? (vdom.inert = prior.value) : delete vdom.inert;
                    changed = true
                }
            }

            if (pane.cls?.includes('neo-dock-pane-locked') !== locked) {
                let cls = [...pane.cls || []];

                NeoArray.toggle(cls, 'neo-dock-pane-locked', locked);
                pane.setSilent({cls});
                changed = true
            }

            changed && pane.update()
        }

        if (button && !button.isDestroyed) {
            let was = button.wrapperCls?.includes('neo-draggable'),
                next;

            if (locked) {
                !me.lockDragState.has(button) && me.lockDragState.set(button, was);
                next = false
            } else if (me.lockDragState.has(button)) {
                next = me.lockDragState.get(button);
                me.lockDragState.delete(button)
            } else {
                return
            }

            if (was !== next) {
                let cls = [...button.wrapperCls];

                NeoArray.toggle(cls, 'neo-draggable', next);
                button.wrapperCls = cls
            }
        }
    }

    /**
     * Synchronizes the currently materialized rail-reveal panes against committed lock truth.
     *
     * Rails are synthetic affordances retained across stable-topology reconciliation, so their
     * projection config is not a state-update channel. The materialization callback covers first
     * reveal; this sweep covers a lock transition while the same overlay remains open. Dismissed
     * cached panes restore on their next materialization callback.
     */
    syncLockRails() {
        let me          = this,
            {workspace} = me;

        if (!workspace?.enableDockLockAction) return;

        let {items} = workspace.dockModel || {};

        workspace.forEachDockRail(({revealOverlay}) => {
            let pane = revealOverlay?.paneSlot.items[0];

            pane && me.syncLockItemPresentation({
                locked: items?.[revealOverlay.revealPaneItemId]?.locked === true,
                pane
            })
        })
    }

    /**
     * Synchronizes one retained pin action against the live active item and committed policy.
     *
     * Hidden wherever the collapse could not complete, so the header never offers a gesture the model
     * or the projection would refuse: no active item, `pinnable: false` (which
     * {@link Neo.dashboard.dock.model.Operations#setItemAutoHidden} rejects), or an item no edge owns
     * (§2.7 — center never rails). The edge answer comes from
     * {@link Neo.dashboard.dock.model.WorkspaceDocument#findOwningEdge}, the same derivation the projection
     * rails by, so the action cannot disagree with the rail it would collapse into.
     *
     * Like {@link #syncCloseAction}, hidden-state changes stay on the stable action instance so
     * Overflow receives its existing `actionVisibilityChange` signal instead of an action-group
     * replacement.
     *
     * **The opt-in gates policy synchronization, not only projection and dispatch.** `pin` is a
     * reserved engine name exactly while the workspace's `enableDockPinAction` is on — that is the
     * contract `Workspace#getDockProjectionOptions` states and the throw it enforces. While the flag
     * is off the name belongs to whoever projected it through `resolveDockHeaderActions`, so
     * resolving it here would let a disabled engine action move a host's `hidden` on every
     * active-item change and reconciliation sweep. Default-off has to mean behaviorally inert, not
     * merely unprojected.
     * @param {Neo.tab.Container|null} tabContainer
     */
    syncPinAction(tabContainer) {
        let {workspace} = this;

        if (!workspace?.enableDockPinAction) return;

        let action = tabContainer?.getActionItem?.('pin'),
            itemId = workspace.getActiveDockItemId(tabContainer),
            model  = workspace.dockModel,
            hidden = !itemId
                || model?.items?.[itemId]?.pinnable === false
                || !model
                || !WorkspaceDocument.findOwningEdge(model, itemId);

        action && (action.hidden = hidden)
    }

    /**
     * Synchronizes one retained reload action against the live active pane, owning BOTH state
     * axes: `hidden` while no active item resolves, or while neither path can serve it — no
     * `dockReload()` contract on the active card AND the host declared no recreate through
     * `Workspace#hasDockRecreateFallback`; `disabled` while the ACTIVE item — not whichever item
     * started a flight — has a reload or recreate in flight. Deriving both here (called at the
     * flight edges and on every active-item change) is what keeps per-item single-flight and the one
     * node-level action instance consistent when the active item changes mid-flight. The contract
     * probe is pure — a `typeof` on the card instance, or on its config's `module` prototype while
     * the card container has not instantiated the slot yet (the post-reconcile sync runs before
     * card children materialize) — never a resolver call, which may be side-effectful.
     * @param {Neo.tab.Container|null} tabContainer
     */
    syncReloadAction(tabContainer) {
        let {workspace} = this;

        // Opt-in guard first (the pin precedent): while the engine flag is off, a host may own
        // the semantic name `reload` — getActionItem() would find THAT action, and writing to it
        // here would overwrite consumer-owned state. Default-off means behaviorally inert.
        if (!workspace?.enableDockReloadAction) return;

        let action   = tabContainer?.getActionItem?.('reload'),
            itemId   = workspace.getActiveDockItemId(tabContainer),
            disabled = false,
            hidden   = true;

        if (action && itemId) {
            let itemIds = tabContainer.getTabBar()?.sortZoneConfig?.dockItemIds || [],
                index   = itemIds.indexOf(itemId),
                pane    = index > -1 ? tabContainer.getCard(index) : null,
                carrier = pane?.isDestroyed ? null : (pane?.dockReload ?? pane?.module?.prototype?.dockReload);

            disabled = workspace.dockReloadInFlight.has(itemId) || workspace.dockRecreateInFlight.has(itemId);

            // An absent delegation hook no longer hides the action on its own: the recreate
            // fallback serves exactly those panes, so hiding them would hide the only recovery
            // they have. Hidden only when NEITHER path can serve the item.
            hidden = typeof carrier !== 'function' && !workspace.hasDockRecreateFallback()
        }

        // ONE batched update for both axes (`set()`), never two sequential writes: each write
        // opens its own vdom round trip on the tab bar, and stacked in-flight bar updates racing
        // a following reconcile is exactly the collision that duplicated retained chrome on slow
        // rigs.
        action?.set({disabled, hidden})
    }
}

export default Neo.setupClass(HeaderActionPolicy);
