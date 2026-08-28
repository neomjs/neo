import Button             from '../../../button/Base.mjs';
import Container          from '../../../container/Base.mjs';
import RevealOverlay      from './RevealOverlay.mjs';
import RevealStateMachine from './RevealStateMachine.mjs';
import Operations         from '../model/Operations.mjs';
import NeoArray           from '../../../util/Array.mjs';

/**
 * @summary Runtime edge-rail affordance rendering committed auto-hidden items as real button
 * children, with the full reveal/dismiss/pin interaction contract riding the dock-zone reducer.
 *
 * The rail is pure render projection (per-window, derived, never persisted): WHICH items rail — and
 * on which edge — is committed `dockZone.v1` truth the adapter derives
 * (`LayoutAdapter.collectAutoHiddenItems()`). Tabs are `Neo.button.Base` child components built
 * from plain `railItems` metadata rather than from the pane components themselves, so the pane never
 * learns it is railed (pane-blindness) and a destroyed or unresolvable pane cannot break its recall
 * affordance. Composition over synthesis: clicks ride the button `handler` contract, hover intents
 * ride per-button `domListeners`, and each button carries its `dockItemId` — no hand-rolled DOM
 * synthesis, no tab-id bookkeeping.
 *
 * Model flips reconcile the button set IN PLACE (`reconcileTabs()`): surviving items keep their live
 * component instance — object permanence at the affordance level — while leavers fail-close any
 * reveal of them and remove; newcomers insert at their document-order position.
 *
 * Interaction contract: a tab click opens a TRANSIENT reveal (focus moves into the overlay);
 * re-click, `Escape`, outside-click, or focus/pointer leaving dismiss it — reveal state is
 * runtime-only and no operation descriptor exists for dismissal. Hover-reveal is a workspace opt-in
 * (`autoHideRevealOnHover`; dwell-gated, never steals focus — hover reveals are an accessibility
 * hazard by default). The PERSIST path is the overlay's pin control: `setItemPinned(true)` committed
 * through the owning reducer callback (`applyDockZoneOperation`) or a local
 * `Operations.applyOperation()` — never a parallel mutation path; the model clears `autoHidden`
 * itself.
 *
 * Reveal is policy-free: even a `pinnable: false` item (whose PIN the model would reject) must stay
 * reachable through reveal — anything else is item loss. The policy projection (`restorable`)
 * therefore gates the overlay's pin control, never the tab.
 *
 * The reveal/dismiss timing brain lives in {@link RevealStateMachine} (documented state table);
 * this component owns composition, overlay binding and the executor commit path.
 *
 * @class Neo.dashboard.dock.interaction.Rail
 * @extends Neo.container.Base
 * @see Neo.dashboard.dock.projection.LayoutAdapter
 * @see Neo.dashboard.dock.interaction.RevealOverlay
 * @see Neo.dashboard.dock.interaction.DockSplitter
 * @see Neo.dashboard.dock.model.Document
 * @see learn/agentos/DockZoneModel.md
 */
class Rail extends Container {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.interaction.Rail'
         * @protected
         */
        className: 'Neo.dashboard.dock.interaction.Rail',
        /**
         * @member {String} ntype='dashboard-dock-rail'
         * @protected
         */
        ntype: 'dashboard-dock-rail',
        /**
         * @member {String[]} baseCls=['neo-dashboard-dock-edge-rail']
         */
        baseCls: ['neo-dashboard-dock-edge-rail'],
        /**
         * Callback for an owning dashboard reducer. Receives `(descriptor, rail)`.
         * When absent, the component falls back to committing against its own `dockZoneDocument`.
         * @member {Function|null} applyDockZoneOperation=null
         */
        applyDockZoneOperation: null,
        /**
         * Workspace-level opt-in for hover-born reveals (dwell-gated, never steals focus).
         * Default off — hover reveals are an accessibility hazard; click-reveal is the contract
         * default. Not persisted per item: this is per-workspace interaction preference.
         * @member {Boolean} autoHideRevealOnHover_=false
         * @reactive
         */
        autoHideRevealOnHover_: false,
        /**
         * Workspace-level default for the overlay's free-dimension fraction when the document
         * carries no committed extent (`null` keeps the overlay's own default). Threaded from
         * projection options exactly like the hover opt-in.
         * @member {Number|null} defaultRevealFraction_=null
         * @reactive
         */
        defaultRevealFraction_: null,
        /**
         * Current committed dock-zone document. Used when no reducer callback is supplied.
         * @member {Object|null} dockZoneDocument_=null
         * @reactive
         */
        dockZoneDocument_: null,
        /**
         * Owning workspace edge (`top`, `right`, `bottom`, `left`). Drives the per-edge cls hook
         * and the tab-flow layout direction; the tab writing-mode is a CSS concern keyed off the
         * cls hook.
         * @member {String} edge_='left'
         * @reactive
         */
        edge_: 'left',
        /**
         * Notified after a successful local document commit.
         * @member {Function|null} onDockZoneDocumentChange=null
         */
        onDockZoneDocumentChange: null,
        /**
         * Rail tab metadata, in document order: `[{dockEdge, dockItemId, restorable, title}]`.
         * Projection input from `LayoutAdapter.createRailTab()` — model-derived, never persisted.
         * @member {Object[]|null} railItems_=null
         * @reactive
         */
        railItems_: null,
        /**
         * Resolves a model `componentRef` to the component config the reveal overlay's pane slot
         * materializes — the same resolution seam the adapter uses for in-flow panes, threaded from
         * projection context. Without it, reveals render header-only.
         * @member {Function|null} resolveComponentRef=null
         */
        resolveComponentRef: null,
        /**
         * Dismiss-grace override in ms; `null` keeps the machine's named design constant.
         * @member {Number|null} revealDismissGraceMs_=null
         * @reactive
         */
        revealDismissGraceMs_: null,
        /**
         * Hover-dwell override in ms; `null` keeps the machine's named design constant.
         * @member {Number|null} revealDwellMs_=null
         * @reactive
         */
        revealDwellMs_: null
    }

    /**
     * Blueprint-created reveal panes, cached per dock item id. Parked (removed without destroy)
     * on dismissal and re-parented on the next reveal — mounted children are never destroyed
     * mid-session; the cache tears down with the rail.
     * @member {Object} revealPaneCache={}
     * @protected
     */
    revealPaneCache = {}
    /**
     * The reveal/dismiss timing brain. Runtime-only; created per instance, torn down in `destroy()`.
     * @member {RevealStateMachine|null} revealMachine=null
     * @protected
     */
    revealMachine = null
    /**
     * The overlay bound via {@link Neo.dashboard.dock.interaction.Rail#bindRevealOverlay}, when one exists.
     * @member {Neo.dashboard.dock.interaction.RevealOverlay|null} revealOverlay=null
     * @protected
     */
    revealOverlay = null

    /**
     * Seeds the initial button set from `railItems` before the container creates its items —
     * later flips go through `reconcileTabs()` instead — and boots the reveal machine.
     * @param {Object} config
     */
    construct(config={}) {
        if (!config.items) {
            // The overlay is part of the INITIAL composition (hidden while idle): the rail's
            // subtree never changes shape post-mount for the reveal path — structural self-
            // mutation after mount is what a wholesale workspace re-render cannot reconcile.
            config.items = [
                ...(config.railItems || []).map(railItem => this.createTabConfig(railItem, config.edge)),
                {
                    module: RevealOverlay,
                    edge  : this.getValidatedEdge(config.edge)
                }
            ]
        }

        super.construct(config);

        let me = this;

        me.revealMachine = new RevealStateMachine({
            dwellMs      : Number.isFinite(me.revealDwellMs)        ? me.revealDwellMs        : undefined,
            graceMs      : Number.isFinite(me.revealDismissGraceMs) ? me.revealDismissGraceMs : undefined,
            onChange     : me.onRevealStateChange.bind(me),
            revealOnHover: me.autoHideRevealOnHover
        })
    }

    /**
     * Live-updates the machine when the workspace flips the hover opt-in.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetAutoHideRevealOnHover(value, oldValue) {
        if (this.revealMachine) {
            this.revealMachine.revealOnHover = value === true
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetEdge(value, oldValue) {
        let me         = this,
            edge       = me.getValidatedEdge(value),
            isVertical = edge === 'left' || edge === 'right',
            cls        = me.cls || [];

        if (oldValue) {
            NeoArray.remove(cls, `neo-dashboard-dock-edge-rail-${me.getValidatedEdge(oldValue)}`)
        }

        NeoArray.add(cls, `neo-dashboard-dock-edge-rail-${edge}`);

        me.set({
            cls,
            layout: {ntype: isVertical ? 'vbox' : 'hbox', align: 'stretch'}
        })
    }

    /**
     * Construction seeds the button set directly (see `construct()`); only live model flips
     * reconcile — the initial pass would race the container's own item creation.
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetRailItems(value, oldValue) {
        let me = this;

        if (oldValue !== undefined) {
            me.reconcileTabs(value || []);
            me.syncRevealOverlay()
        }
    }

    /**
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetRevealDismissGraceMs(value, oldValue) {
        if (this.revealMachine && Number.isFinite(value)) {
            this.revealMachine.graceMs = value
        }
    }

    /**
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetRevealDwellMs(value, oldValue) {
        if (this.revealMachine && Number.isFinite(value)) {
            this.revealMachine.dwellMs = value
        }
    }

    /**
     * Binds a reveal overlay to this rail: overlay intents (pointer, focus, escape, pin) feed the
     * state machine, and machine state pushes back into the overlay — the full focus-hold loop
     * becomes testable without a live workspace.
     * @param {Neo.dashboard.dock.interaction.RevealOverlay} overlay
     * @returns {Neo.dashboard.dock.interaction.RevealOverlay}
     */
    bindRevealOverlay(overlay) {
        let me = this;

        me.revealOverlay = overlay;

        overlay.on({
            revealEscape      : me.onOverlayEscape,
            revealFocusEnter  : me.onOverlayFocusEnter,
            revealFocusLeave  : me.onOverlayFocusLeave,
            revealPinRequested: me.onRevealPinRequested,
            revealPointerEnter: me.onOverlayPointerEnter,
            revealPointerLeave: me.onOverlayPointerLeave,
            scope             : me
        });

        me.syncRevealOverlay();

        return overlay
    }

    /**
     * Commits a dock-zone operation descriptor through the owning reducer callback, falling back to
     * a local `Operations.applyOperation()` — identical commit contract to
     * `DockSplitter.commitResizeSplit()` so dashboard reducers handle every affordance with one
     * code path. The rail commits `setItemPinned` (the overlay pin escape); reveal/dismiss never
     * commit anything.
     * @param {Object} descriptor
     * @returns {{document:(Object|null), errors:String[]}}
     * @protected
     */
    commitOperation(descriptor) {
        let me     = this,
            result = null;

        if (typeof me.applyDockZoneOperation === 'function') {
            result = me.applyDockZoneOperation(descriptor, me) || null
        } else if (me.dockZoneDocument) {
            result = Operations.applyOperation(me.dockZoneDocument, descriptor)
        }

        if (!result) {
            result = {
                document: me.dockZoneDocument,
                errors  : ['DockRail requires `dockZoneDocument` or `applyDockZoneOperation` to commit dock-zone operations.']
            }
        }

        if (!result.errors?.length && result.document) {
            me.dockZoneDocument = result.document;

            if (typeof me.onDockZoneDocumentChange === 'function') {
                me.onDockZoneDocumentChange(result.document, descriptor, me)
            }
        }

        return result
    }

    /**
     * Builds one rail-tab button config from rail-item metadata. The button carries its
     * `dockItemId` (instance-based click/hover resolution — no id bookkeeping) and stays enabled
     * regardless of policy: reveal is policy-free, the overlay pin is the gated affordance.
     *
     * Tabs are intrinsic on the rail's main axis. The rail keeps `align: 'stretch'` for the cross
     * axis, but that generic Flexbox policy otherwise supplies `flex: 1` to children without an
     * explicit value, making every tab divide the full edge extent equally. This value must be in
     * the creation config so the parent layout consumes it during its child-attribute pass.
     * @param {Object} railItem {dockEdge, dockItemId, restorable, title}
     * @param {String} edge
     * @returns {Object}
     * @protected
     */
    createTabConfig(railItem, edge) {
        let me = this;

        return {
            module      : Button,
            cls         : ['neo-dashboard-dock-rail-tab'],
            dockItemId  : railItem.dockItemId,
            domListeners: [
                {mouseenter: me.onTabHoverIn,  scope: me},
                {mouseleave: me.onTabHoverOut, scope: me}
            ],
            flex           : 'none',
            // Explicitly bound: the button invokes function-type handlers as plain calls — the
            // rail, not the button, must be `this` inside the handler.
            handler        : me.onTabClick.bind(me),
            text           : railItem.title || railItem.dockItemId,
            useRippleEffect: false
        }
    }

    /**
     * Tears down the reveal machinery before container destruction — pending dwell/grace timers
     * must never outlive the rail.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.revealMachine?.destroy();
        me.revealMachine = null;
        me.revealOverlay = null;

        Object.values(me.revealPaneCache).forEach(pane => {
            pane?.isDestroyed || pane?.destroy?.()
        });
        me.revealPaneCache = {};

        super.destroy(...args)
    }

    /**
     * @param {String} edge
     * @returns {String}
     * @protected
     */
    getValidatedEdge(edge) {
        return ['top', 'right', 'bottom', 'left'].includes(edge) ? edge : 'left'
    }

    /**
     * @protected
     */
    onOverlayEscape() {
        this.revealMachine?.escape()
    }

    /**
     * @protected
     */
    onOverlayFocusEnter() {
        this.revealMachine?.overlayFocusEnter()
    }

    /**
     * @protected
     */
    onOverlayFocusLeave() {
        this.revealMachine?.overlayFocusLeave()
    }

    /**
     * @protected
     */
    onOverlayPointerEnter() {
        this.revealMachine?.overlayPointerEnter()
    }

    /**
     * @protected
     */
    onOverlayPointerLeave() {
        this.revealMachine?.overlayPointerLeave()
    }

    /**
     * The pin escape: honours the pin policy, commits `setItemPinned(true)` through the reducer
     * path — the model clears `autoHidden` itself (landed guard) — and fail-closes the reveal.
     * Fires `dockRailOperation` on commit, `dockRailOperationRejected` on policy block or executor
     * error.
     * @param {Object} data
     * @param {String} [data.itemId] Defaults to the currently revealed item.
     * @returns {{document:(Object|null), errors:String[]}|null}
     */
    onRevealPinRequested(data={}) {
        let me     = this,
            itemId = data.itemId || me.revealMachine?.revealedItemId,
            descriptor, railItem, result;

        if (!itemId) {
            return null
        }

        railItem = (me.railItems || []).find(item => item.dockItemId === itemId);

        if (railItem?.restorable === false) {
            result = {
                document: me.dockZoneDocument,
                errors  : [`item "${itemId}" pin blocked by policy (pinnable: false)`]
            };

            me.fire('dockRailOperationRejected', {descriptor: null, itemId, rail: me, result});

            return result
        }

        descriptor = {itemId, operation: 'setItemPinned', pinned: true};
        result     = me.commitOperation(descriptor);

        if (!result.errors?.length) {
            me.revealMachine?.itemCleared(itemId)
        }

        me.fire(result.errors?.length ? 'dockRailOperationRejected' : 'dockRailOperation', {
            descriptor,
            itemId,
            rail: me,
            result
        });

        return result
    }

    /**
     * Binds the composed overlay child once the container created its items — an externally
     * bound overlay (`bindRevealOverlay()`) simply replaces the binding; the composed child then
     * stays idle-hidden.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        if (!me.revealOverlay) {
            let overlay = (me.items || []).find(item => item.ntype === 'dashboard-dock-reveal-overlay');

            overlay && me.bindRevealOverlay(overlay)
        }
    }

    /**
     * Machine change hook: fires `dockRailRevealChange` and pushes the snapshot into the bound
     * overlay. Reveal state is runtime-only — nothing here touches a document.
     * @param {Object} next {revealedItemId, state}
     * @param {Object} previous {revealedItemId, state}
     * @protected
     */
    onRevealStateChange(next, previous) {
        let me = this;

        me.fire('dockRailRevealChange', {
            next,
            previous,
            rail    : me,
            railItem: (me.railItems || []).find(item => item.dockItemId === next.revealedItemId) || null
        });

        me.syncRevealOverlay();
        me.syncRevealedTabState(next.revealedItemId);

        // Embodied focus-hold: a click-born reveal moves REAL browser focus into the overlay.
        // Focus-rescue transitions (revealed / dismiss-pending -> focused) already hold focus
        // inside the subtree by definition — re-focusing would fight the user's caret.
        if (next.state === 'revealed-focused' && previous.state !== 'revealed' && previous.state !== 'dismiss-pending') {
            me.revealOverlay?.focusReveal?.()
        }
    }

    /**
     * @summary Projects the reveal machine's current target back onto the rail's own tabs, so the
     * tab that opened a reveal reads as the active one.
     *
     * Without this the rail is a set of buttons with no memory of which one is showing: the overlay
     * knows what it hosts and the tab that summoned it looks identical to the four that did not.
     * The state travels through the button's own `pressed` config rather than a bespoke class, so a
     * consumer skins it with the same idiom it already uses for every other pressed button, and the
     * engine supplies only a neutral affordance floor.
     *
     * Runtime-only, exactly like the reveal machine that drives it — a revealed tab is a view state,
     * never a document mutation, so nothing here touches `dockZoneDocument`. Tabs are matched by
     * `dockItemId`, which also excludes the bound overlay: it is a sibling item and carries none.
     *
     * @param {String|null} revealedItemId The machine's current target, or `null` once dismissed.
     * @protected
     */
    syncRevealedTabState(revealedItemId) {
        this.items?.forEach(item => {
            if (item.dockItemId) {
                item.pressed = item.dockItemId === revealedItemId
            }
        })
    }

    /**
     * Button handler for rail tabs: feeds the reveal machine — click opens a focused transient
     * reveal, re-click dismisses. No operation is committed here; the persist path is the overlay
     * pin ({@link Neo.dashboard.dock.interaction.Rail#onRevealPinRequested}).
     * @param {Object} data The button click event data; `data.component` is the tab button.
     * @returns {{revealedItemId:(String|null), state:String}|null} Machine snapshot after the input.
     */
    onTabClick(data={}) {
        let me     = this,
            itemId = data.component?.dockItemId;

        if (!itemId) {
            return null
        }

        me.revealMachine.tabClick(itemId);

        return {revealedItemId: me.revealMachine.revealedItemId, state: me.revealMachine.state}
    }

    /**
     * @param {Object} data
     * @protected
     */
    onTabHoverIn(data={}) {
        let itemId = data.component?.dockItemId;

        if (itemId) {
            this.revealMachine.tabHoverIn(itemId)
        }
    }

    /**
     * @param {Object} data
     * @protected
     */
    onTabHoverOut(data={}) {
        this.revealMachine.tabHoverOut()
    }

    /**
     * Reconciles the live button set against fresh rail-item metadata: surviving items keep their
     * component instance and receive in-place `set()` updates (object permanence at the affordance
     * level), leavers fail-close any reveal of them and are removed, newcomers insert at their
     * document-order position.
     * @param {Object[]} target Fresh rail-item metadata.
     * @protected
     */
    reconcileTabs(target) {
        let me       = this,
            existing = [...(me.items || [])],
            index;

        for (index = existing.length - 1; index >= 0; index--) {
            // Only rail-tab buttons carry a dockItemId — the self-hosted overlay child is not a tab.
            if (existing[index].dockItemId == null) {
                continue
            }

            if (!target.some(railItem => railItem.dockItemId === existing[index].dockItemId)) {
                me.revealMachine?.itemCleared(existing[index].dockItemId);
                me.removeAt(index)
            }
        }

        target.forEach((railItem, targetIndex) => {
            let button       = (me.items || []).find(item => item.dockItemId === railItem.dockItemId),
                currentIndex = button ? me.items.indexOf(button) : -1;

            if (button) {
                button.set({
                    text: railItem.title || railItem.dockItemId
                });

                if (currentIndex !== targetIndex) {
                    me.remove(button, false, true);
                    me.insert(targetIndex, button)
                }
            } else {
                me.insert(targetIndex, me.createTabConfig(railItem, me.edge))
            }
        })
    }

    /**
     * Resolves the overlay's free-dimension extent for an item: the share its owning split last
     * committed (still in the document), else `null` — the overlay then falls back to its
     * workspace-configurable default fraction.
     * @param {String} itemId
     * @returns {Number|null}
     * @protected
     */
    resolveRevealExtent(itemId) {
        let document = this.dockZoneDocument;

        // Runtime namespace lookup avoids an import cycle (the adapter imports this class);
        // fail-soft to null — the overlay then uses its default fraction.
        return document ? (Neo.dashboard?.DockLayoutAdapter?.resolveRevealExtent(document, itemId) ?? null) : null
    }

    /**
     * Pushes the current reveal snapshot into the bound overlay, when one exists, and keeps the
     * overlay's pane slot in sync.
     * @protected
     */
    syncRevealOverlay() {
        let me      = this,
            machine = me.revealMachine,
            overlay = me.revealOverlay,
            railItem;

        if (!overlay || !machine) {
            return
        }

        railItem = (me.railItems || []).find(item => item.dockItemId === machine.revealedItemId) || null;

        overlay.set({
            edge        : me.getValidatedEdge(me.edge),
            revealExtent: railItem ? me.resolveRevealExtent(railItem.dockItemId) : null,
            revealState : machine.state,
            revealedItem: railItem,
            ...(Number.isFinite(me.defaultRevealFraction) ? {defaultRevealFraction: me.defaultRevealFraction} : {})
        });

        me.syncRevealPane(railItem)
    }

    /**
     * Materializes the revealed item's pane into the overlay's slot through the adapter's durable
     * reveal resolver, with the `componentRef` read from the committed document (the rail's copy
     * re-projects on every change). This resolver must outlive any transaction-only in-flow staging
     * resolver because the user can reveal the rail long after projection reconciliation settles.
     *
     * Live-instance contract: a resolver-returned Neo INSTANCE is added as-is and PARKED on
     * dismissal (removed without destroy — moved/re-parented, never destroyed), so its identity
     * and transient state survive reveal/dismiss cycles and the pin transition back into the
     * flow. The resolution CASCADE mirrors the adapter's in-flow `projectItem()` exactly:
     * live resolution → `item.blueprint` instantiation → recoverable placeholder (never a silent
     * empty overlay). Blueprint- and placeholder-created panes are cached per item and parked
     * the same way: mounted children are never destroyed mid-session (`revealPaneCache` tears
     * down with the rail).
     * @param {Object|null} railItem
     * @protected
     */
    syncRevealPane(railItem) {
        let me   = this,
            slot = me.revealOverlay?.paneSlot,
            child, currentId, item, nextId, resolved;

        // Stub/external overlays without a pane slot render header-only — valid by contract.
        if (!slot?.add) {
            return
        }

        currentId = me.revealOverlay.revealPaneItemId ?? null;
        nextId    = railItem?.dockItemId ?? null;

        if (currentId === nextId) {
            return
        }

        child = slot.items?.[0];

        if (child) {
            slot.remove(child, false)
        }

        if (nextId && typeof me.resolveComponentRef === 'function') {
            if (me.revealPaneCache[nextId] && !me.revealPaneCache[nextId].isDestroyed) {
                slot.add(me.revealPaneCache[nextId])
            } else {
                item     = me.dockZoneDocument?.items?.[nextId];
                resolved = item?.componentRef != null ? me.resolveComponentRef(item.componentRef, item, nextId) : null;

                if (!resolved && item?.blueprint) {
                    resolved = Neo.clone(item.blueprint, true)
                }

                if (Neo.typeOf(resolved) === 'NeoInstance') {
                    slot.add(resolved)
                } else if (resolved) {
                    me.revealPaneCache[nextId] = slot.add({...resolved})
                } else if (item) {
                    // Neither live instance nor blueprint resolves: recoverable placeholder,
                    // never a silently empty overlay — the adapter's own policy.
                    me.revealPaneCache[nextId] = slot.add(
                        Neo.dashboard?.DockLayoutAdapter?.createPlaceholder?.(nextId, item) ??
                        {cls: ['neo-dashboard-dock-placeholder'], dockItemId: nextId, ntype: 'component'}
                    )
                }
            }
        }

        me.revealOverlay.revealPaneItemId = nextId
    }
}

export default Neo.setupClass(Rail);
