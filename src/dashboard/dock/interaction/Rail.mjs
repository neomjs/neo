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
         * Workspace-owned lock presentation callback for the materialized reveal pane:
         * `(pane, itemId) => void`. Reveal remains policy-free; this callback only derives inert
         * presentation from committed item truth.
         * @member {Function|null} syncDockLockPane=null
         */
        syncDockLockPane: null,
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
        revealDwellMs_: null,
        /**
         * Tooltip text handed to the reveal overlay's pin control at construction, from the
         * workspace's `dockActionTooltips.revealPin`. `null` leaves the control without a tooltip.
         * @member {String|null} revealPinTooltip=null
         */
        revealPinTooltip: null
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
     * In-flight lazy pane loads, keyed by dock item id: the promise {@link #loadRevealPane} returns
     * for a resolved config whose `module` is a loader function. The entry is the load's lease: it
     * clears when the load settles (resolved or rejected) and when the item is released, and a
     * destroyed rail has no map at all (`Neo.core.Base#destroy` deletes every own property) — a load
     * whose lease is gone adds nothing. A release followed by a re-reveal can briefly overlap two
     * loads; only the first to settle holds the lease, so only one pane lands.
     * @member {Object} revealPaneLoads={}
     * @protected
     */
    revealPaneLoads = {}
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
     * One retained `mousedown` config on the app main view while a reveal is open — the outside
     * pointer reading (`Neo.form.field.Picker`'s idiom). A pointer landing anywhere the reveal does
     * not own is leaving it, whether or not that target can take focus.
     * @member {Object|null} outsidePointerListener=null
     * @protected
     */
    outsidePointerListener = null
    /**
     * The main view currently carrying {@link #outsidePointerListener}.
     * @member {Neo.component.Base|null} outsidePointerListenerOwner=null
     * @protected
     */
    outsidePointerListenerOwner = null

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
                    module    : RevealOverlay,
                    edge      : this.getValidatedEdge(config.edge),
                    pinTooltip: config.revealPinTooltip ?? null
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
            revealEscape       : me.onOverlayEscape,
            revealFocusEnter   : me.onOverlayFocusEnter,
            revealFocusLeave   : me.onOverlayFocusLeave,
            revealLeaveComplete: me.onOverlayLeaveComplete,
            revealPinRequested : me.onRevealPinRequested,
            revealPointerEnter : me.onOverlayPointerEnter,
            revealPointerLeave : me.onOverlayPointerLeave,
            scope              : me
        });

        me.syncRevealOverlay();

        return overlay
    }

    /**
     * Commits a dock-zone operation descriptor through the owning reducer callback, falling back to
     * a local `Operations.applyOperation()` — identical commit contract to
     * `DockSplitter.commitResizeOperation()` so dashboard reducers handle every affordance with one
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
     * Releases the blueprint- or placeholder-created reveal pane of an item that LEFT auto-hidden
     * state (pin, transfer, a restored perspective). The cache parks panes across dismissals so a
     * re-reveal keeps its instance, but an item returning to the tab flow gets its flow pane from
     * the projection — and a consumer resolving both from one config mints the same id twice. A
     * cached reveal pane that outlives the flow pane's creation unregisters that id when the rail
     * tears down, leaving a live pane nobody can address and a refresh that throws mid-teardown.
     * Destroying it here, while it is still the id's only holder, keeps the registry honest.
     *
     * Live instances are never cached (parked, never owned — see {@link #syncRevealPane}), so a
     * consumer's own pane cannot be destroyed through this path.
     *
     * The rail releases on its own leave paths (the pin escape, a reconciled leaver) BEFORE the
     * dismissal parks the pane, so a revealed pane leaves through its slot in the one update the
     * dismissal would otherwise spend on parking it — its DOM node and its registration retire
     * together, ahead of the refresh that mints the flow pane. The workspace's pre-projection sweep
     * ({@link Neo.dashboard.dock.Workspace#releaseStaleRevealPanes}) covers the leave paths that
     * never pass through this rail (a restored perspective, a transfer) and AWAITS the result: the
     * slot's removal has to land before a staged projection inserts a node under the same id, and a
     * destroy must never race an in-flight update that still diffs the pane's vnode — either one
     * wedges the refresh (measured: a reconcile whose `promiseUpdate` never settles).
     * @param {String} itemId
     * @returns {Promise<void>} Settles once the pane is gone from the DOM and the registry.
     * @protected
     */
    async releaseRevealPane(itemId) {
        let me   = this,
            pane = me.revealPaneCache[itemId];

        // an import still in flight for a released item must not land a pane afterwards
        delete me.revealPaneLoads[itemId];

        if (!pane) {
            return
        }

        delete me.revealPaneCache[itemId];

        if (pane.isDestroyed) {
            return
        }

        const parent = pane.parent;

        // A parked pane keeps its `parentId` after `removeAt(index, false)`, so `parent` can
        // resolve a slot that no longer lists it — go through the parent only while it does.
        if (parent?.items?.includes(pane)) {
            // `removeAt` splices the vdom BEFORE the payload is built and destroys the pane, so the
            // removal it publishes never references the instance; hand its landing back.
            parent.remove(pane, true);
            await parent.promiseUpdate()
        } else {
            // Parked: the dismissal already spliced it out, but that update may still be in flight
            // with the pane's vnode in its diff — let it land before the instance goes.
            await parent?.promiseUpdate?.();
            pane.isDestroyed || pane.destroy()
        }
    }

    /**
     * Tears down the reveal machinery before container destruction — pending dwell/grace timers
     * must never outlive the rail.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.syncOutsidePointerListener(false);
        me.revealMachine?.destroy();
        me.revealMachine = null;
        me.revealOverlay = null;

        Object.values(me.revealPaneCache).forEach(pane => {
            pane?.isDestroyed || pane?.destroy?.()
        });
        me.revealPaneCache = {};
        me.revealPaneLoads = {};

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
     * Adds or removes the one retained `mousedown` config on the owning app main view. Attached for
     * as long as a reveal is open (any machine state but `idle`), detached on dismissal and destroy.
     * @param {Boolean} attach
     * @protected
     */
    syncOutsidePointerListener(attach) {
        let me    = this,
            owner = me.outsidePointerListenerOwner;

        if (attach && !owner) {
            owner = me.app?.mainView;

            if (owner) {
                me.outsidePointerListener ||= {mousedown: me.onAppMouseDown, scope: me};
                owner.addDomListeners(me.outsidePointerListener);
                me.outsidePointerListenerOwner = owner
            }
        } else if (!attach && owner) {
            owner.removeDomListeners(me.outsidePointerListener);
            me.outsidePointerListenerOwner = null
        }
    }

    /**
     * A `mousedown` on the app main view while a reveal is open. Anything outside this rail's own
     * subtree — the overlay is a child of the rail — is leaving the reveal, so the machine gets the
     * explicit dismissal input the maximize path already uses. The reveal's own tabs and its
     * overlay stay with their own handlers: a tab click is a retarget or a toggle, an inside click
     * refocuses the root.
     *
     * This is what a nested document needs. Nothing inside an iframe reaches the parent, and a frame
     * whose document cancels the `mousedown` default takes no focus either — so the stylesheet
     * withdraws pointer events from every frame outside an open reveal, the click lands on the
     * parent element beneath the frame, and it arrives here.
     * @param {Object} data
     * @param {Object[]} [data.path]
     * @protected
     */
    onAppMouseDown(data) {
        let me = this;

        if (!me.revealMachine || me.revealMachine.state === 'idle') {
            return
        }

        if (!(data.path || []).some(item => item.id === me.id)) {
            me.revealMachine.outsideClick()
        }
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
     * @summary The exit has finished: detach the pane the leave was carrying.
     *
     * {@link #syncRevealPane} skips the detach while a leave is in flight, so the keyframes run over
     * the real pane instead of an empty slot. This is the other half — without it the pane would
     * stay parked in a hidden overlay. Re-running the sync rather than removing directly keeps ONE
     * detach path: by the time this fires the machine has settled, so the sync sees the same rail
     * item it would have seen on the dismissal frame and does exactly what it would have done then.
     * A retarget mid-exit never reaches here — it cancels the leave and detaches on arrival.
     * @protected
     */
    onOverlayLeaveComplete() {
        this.syncRevealPane(this.currentRevealRailItem())
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
            // The item leaves the rail: its reveal pane goes first, through the slot, so the flow
            // pane the scheduled refresh mints never meets it (id, DOM node, registration).
            me.releaseRevealPane(itemId);
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
        me.syncOutsidePointerListener(next.state !== 'idle');

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
                me.releaseRevealPane(existing[index].dockItemId);
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
     * Resolves the overlay's free-dimension extent from the owning edge descriptor, else `null` —
     * the overlay then falls back to its workspace-configurable pre-commit fraction.
     * @param {String} itemId
     * @returns {Number|null}
     * @protected
     */
    resolveRevealExtent(itemId) {
        let document = this.dockZoneDocument;

        // Runtime namespace lookup avoids an import cycle (the adapter imports this class);
        // fail-soft to null — the overlay then uses its default fraction.
        return document
            ? (Neo.dashboard?.dock?.projection?.LayoutAdapter?.resolveRevealExtent(document, itemId) ?? null)
            : null
    }

    /**
     * @summary The rail item the machine currently reveals, or `null` once dismissed.
     *
     * One source for the lookup, because two readers now need the same answer at two different
     * moments: {@link #syncRevealOverlay} on the transition frame, and
     * {@link #onOverlayLeaveComplete} once the exit has finished. Deriving it twice would let the
     * deferred detach act on a different item than the one the dismissal decided on.
     * @returns {Object|null}
     * @protected
     */
    currentRevealRailItem() {
        const me = this;

        return (me.railItems || []).find(item => item.dockItemId === me.revealMachine?.revealedItemId) || null
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

        railItem = me.currentRevealRailItem();

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
     * The recoverable placeholder for an item whose pane cannot be materialized — the adapter's own
     * policy, so a reveal never shows a silently empty overlay.
     * @param {String} itemId
     * @returns {Object} A component config
     * @protected
     */
    createRevealPlaceholder(itemId) {
        const item = this.dockZoneDocument?.items?.[itemId];

        return Neo.dashboard?.dock?.projection?.LayoutAdapter?.createPlaceholder?.(itemId, item)
            ?? {cls: ['neo-dashboard-dock-placeholder'], dockItemId: itemId, ntype: 'component'}
    }

    /**
     * Loads the module of a lazy pane config — `module: () => import('...')`, the shape a tab
     * container's card layout loads when the tab activates (`Neo.layout.Card#loadModule`) — and
     * materializes the pane into the overlay's slot once the import settles. Reveal is the rail's
     * activation: a lazy item has no instance before its first reveal, and creating it there is
     * first materialization, not recreation — the never-recreate rule governs instances that exist.
     *
     * The item's `revealPaneLoads` entry is the load's lease. It clears however the load ends: a
     * resolved import lands the pane if the reveal still names the item; a dismissed reveal lands
     * nothing and the next reveal resolves again, immediately, from the module registry; a REJECTED
     * import (a chunk that fails to fetch, a pane module that throws while evaluating) clears the
     * lease so the next reveal retries, and the reveal that is still open gets the recoverable
     * placeholder instead of an empty overlay — uncached and transient, so a retry is a real import;
     * a released item or a destroyed rail leaves no lease to honour, and the guard reads the map
     * optionally because destroy removes it.
     * @param {String} itemId
     * @param {Object} config The resolved pane config; `config.module` is the loader function
     * @returns {Promise<Neo.component.Base|null>} The materialized pane, or `null` when the reveal left or the import failed
     * @protected
     */
    async loadRevealPane(itemId, config) {
        let me = this,
            module, pane;

        try {
            module = (await config.module()).default
        } catch (error) {
            console.error(`Rail: the lazy pane module of item '${itemId}' failed to load`, error);

            me.revealPaneLoads && delete me.revealPaneLoads[itemId];

            if (me.revealOverlay?.revealPaneItemId === itemId) {
                pane = me.revealOverlay.paneSlot.add(me.createRevealPlaceholder(itemId));
                // transient: dismissal destroys it rather than parking it, so the next reveal retries
                pane.revealLoadFailed = true
            }

            return null
        }

        // released, or the rail was destroyed (its maps are gone) while the import was in flight
        if (!me.revealPaneLoads?.[itemId]) {
            return null
        }

        delete me.revealPaneLoads[itemId];

        // dismissed before the import settled
        if (me.revealOverlay?.revealPaneItemId !== itemId) {
            return null
        }

        pane = me.revealPaneCache[itemId] = me.revealOverlay.paneSlot.add({...config, module});

        me.syncDockLockPane?.(pane, itemId);

        return pane
    }

    /**
     * Materializes the revealed item's pane into the overlay's slot through the adapter's durable
     * reveal resolver, with the `componentRef` read from the committed document (the rail's copy
     * re-projects on every change). This resolver must outlive any transaction-only in-flow staging
     * resolver because the user can reveal the rail long after projection reconciliation settles.
     *
     * A resolved config whose `module` is a loader function takes the one asynchronous branch:
     * {@link #loadRevealPane} awaits the import and adds the instance once it settles, exactly as a
     * tab container's card layout loads a lazy card on activation — a plain slot add would park the
     * loader as an unrendered object (`Neo.container.Base#createItem`), which nothing on the reveal
     * path ever resolves.
     *
     * Live-instance contract: a resolver-returned Neo INSTANCE is added as-is and PARKED on
     * dismissal (removed without destroy — moved/re-parented, never destroyed), so its identity
     * and transient state survive reveal/dismiss cycles and the pin transition back into the
     * flow. The resolution CASCADE mirrors the adapter's in-flow `projectItem()` exactly:
     * live resolution → `item.blueprint` instantiation → recoverable placeholder (never a silent
     * empty overlay). Blueprint- and placeholder-created panes are cached per item and parked
     * the same way: mounted children are never destroyed mid-session (`revealPaneCache` tears
     * down with the rail).
     *
     * The optional Workspace lock callback runs after first materialization and again when the
     * same revealed identity is synchronized, so reveal stays available while its pane derives
     * inert presentation directly from current committed item truth.
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
        child     = slot.items?.[0];

        // A dismissal used to detach the pane on the transition frame, while the overlay's two-phase
        // hide was still animating its root out — so the exit keyframes played over an EMPTY slot
        // and the panel read as an instant hide. Defer to the overlay's own terminal instead: it
        // fires `revealLeaveComplete` once the hidden class lands, and this sync runs again then.
        //
        // Only a DISMISSAL defers. A retarget carries a `nextId` and must swap immediately, so the
        // incoming pane arrives with its own entry rather than after the outgoing one has finished
        // leaving — and a cancelled leave never reaches the terminal, so a re-entry keeps its pane
        // without a second guard here.
        if (!nextId && me.revealOverlay.revealLeaving) {
            return
        }

        if (currentId === nextId) {
            child && nextId && me.syncDockLockPane?.(child, nextId);
            return
        }

        if (child) {
            // park everything a reveal may show again; a failed-load placeholder is transient
            slot.remove(child, child.revealLoadFailed === true)
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
                    if (Neo.typeOf(resolved.module) === 'Function') {
                        // the lazy shape (a loader, never a class — typeOf reads a class as 'NeoClass'):
                        // loaded on activation, and reveal is the rail's activation
                        me.revealPaneLoads[nextId] ??= me.loadRevealPane(nextId, resolved)
                    } else {
                        me.revealPaneCache[nextId] = slot.add({...resolved})
                    }
                } else if (item) {
                    // Neither live instance nor blueprint resolves: recoverable placeholder,
                    // never a silently empty overlay — the adapter's own policy.
                    me.revealPaneCache[nextId] = slot.add(me.createRevealPlaceholder(nextId))
                }
            }
        }

        me.revealOverlay.revealPaneItemId = nextId

        child = slot.items?.[0];
        child && nextId && me.syncDockLockPane?.(child, nextId)
    }
}

export default Neo.setupClass(Rail);
