import Button from '../../button/Base.mjs';
import Plugin from '../../plugin/Base.mjs';

/**
 * @summary The tab-overflow affordance for a projected tab header toolbar: when headers exceed the
 * available main-axis extent, overflowing tabs collapse behind one control whose menu reaches them.
 *
 * The pure decision is this plugin's own static {@link Neo.tab.plugin.Overflow.computeOverflow} — a
 * projection concern, nothing persists. This plugin is the RUNTIME complement: it measures the live header extents
 * the pure core can only be handed, applies its verdict to the header buttons, and surfaces the hidden
 * remainder through a single overflow control whose selection routes back through the tab.Container's
 * EXISTING `activeIndex` path — zero new operations, zero new persisted state (the binding projection
 * constraint). `items` order and `activeItemId` already capture the state; overflow is projection only.
 *
 * It attaches to the projected tab header toolbar (`Neo.tab.header.Toolbar`) — it is NOT a dock-specific
 * `tab.Container` fork (the model contract's Split/Tab Adapter Boundary). The default embodiment is the
 * historic OUT-OF-COLLECTION floating button rooted at `document.body`, with independent mount/alignment/menu
 * lifecycle. {@link #projectAsAction} instead contributes one stable, focus-independent toolbar action for
 * composed headers that already own an action rail. The toolbar preserves that contribution across consumer
 * `actions` replacements; the plugin hides it (removeDom) while everything fits and self-excludes it from
 * partition geometry and visibility feedback. Neither embodiment is a tab: both bypass `getTabButtonConfig`,
 * so clicking opens the menu rather than activating a phantom card.
 *
 * Natural-width discipline: overflowing buttons are removed from the DOM (Neo's built-in `hidden` /
 * removeDom), so re-measuring them would collapse their width to 0 and corrupt the next split. The plugin
 * therefore measures NATURAL widths once while every button is visible (on mount, and whenever the tab set
 * changes) and caches them; a plain resize only re-reads the always-visible strip extent and recomputes
 * against that cache.
 *
 * @class Neo.tab.plugin.Overflow
 * @extends Neo.plugin.Base
 */
class Overflow extends Plugin {
    static config = {
        /**
         * @member {String} className='Neo.tab.plugin.Overflow'
         * @protected
         */
        className: 'Neo.tab.plugin.Overflow',
        /**
         * @member {String} ntype='plugin-tab-overflow'
         * @protected
         */
        ntype: 'plugin-tab-overflow',
        /**
         * Main-axis size (px) the floating control reserves from the header extent — handed to the pure core as
         * `controlWidth`, which reserves it ONLY when something overflows. Action projection instead converges
         * from zero to the contributed button's rendered extent; this historic estimate remains floating-only.
         * @member {Number} controlWidth=40
         */
        controlWidth: 40,
        /**
         * Projects the overflow control through the toolbar's stable contribution seam instead of as a
         * floating `document.body` child. Disabled by default for byte-identical generic behavior.
         * @member {Boolean} projectAsAction=false
         */
        projectAsAction: false
    }

    /**
     * The pure overflow decision — active-never-hidden packing with overflow-only control-width reservation.
     * Headless + deterministic (unit-covered): given header widths, the strip extent, the active id and the
     * reserved control width, it returns the visible/hidden id partition. It lives here as the plugin's own
     * static so the runtime half owns its decision — no adapter namespace-reach, no adapter chain in the test
     * path (the smell that marked the old dashboard home).
     * @param {Object}   config
     * @param {Object[]} config.items            `{id, headerWidth}` per tab, in header order.
     * @param {Number}   config.extent           The always-measurable strip extent.
     * @param {String}   [config.activeItemId]   The active tab id — never hidden.
     * @param {Number}   [config.controlWidth=0] Width reserved for the overflow control (only when overflowing).
     * @returns {{visible: String[], hidden: String[]}}
     */
    static computeOverflow({items, extent, activeItemId, controlWidth = 0}) {
        const list  = Array.isArray(items) ? items : [],
              width = entry => {
                  const value = Number(entry?.headerWidth);
                  return Number.isFinite(value) && value > 0 ? value : 0
              },
              total = list.reduce((sum, entry) => sum + width(entry), 0);

        if (!(total > extent)) {
            return {hidden: [], visible: list.map(entry => entry.id)}
        }

        const usable  = Math.max(0, extent - Math.max(0, Number(controlWidth) || 0)),
              visible = [],
              hidden  = [];
        let used = 0;

        for (const entry of list) {
            if (used + width(entry) <= usable && hidden.length === 0) {
                visible.push(entry.id);
                used += width(entry)
            } else {
                hidden.push(entry.id)
            }
        }

        // the active item never hides: swap it in, overflow the last-fitting non-active item
        const activeIndex = hidden.indexOf(activeItemId);

        if (activeIndex !== -1) {
            hidden.splice(activeIndex, 1);

            const activeWidth = width(list.find(entry => entry.id === activeItemId)),
                  order       = list.map(entry => entry.id),
                  displaced   = [];

            // Displace as many TRAILING visible items as it takes to fit the (possibly wider) active item.
            // Popping exactly one under-displaces when the active tab is wider than that single displaced tab
            // — the visible strip would then still exceed `usable` and the active spills. Loop until it fits,
            // or until nothing is left (the degenerate "active alone is wider than the strip" case, where it
            // stays visible regardless). Popping none is also correct when the active already fits (it was
            // hidden only because an earlier item overflowed the `hidden.length === 0` gate above).
            while (visible.length > 0 && used + activeWidth > usable) {
                const displacedId = visible.pop();
                used -= width(list.find(entry => entry.id === displacedId));
                displaced.push(displacedId)
            }

            visible.push(activeItemId);

            if (displaced.length > 0) {
                // re-insert the displaced items in list order so the overflow menu stays predictable
                hidden.push(...displaced);
                hidden.sort((a, b) => order.indexOf(a) - order.indexOf(b))
            }
        }

        return {hidden, visible}
    }

    /**
     * Plugin-owned active-button caps: button id → `{maxSize, value}` for the caller's own main-axis
     * max-size config at cap time. Property presence on the button is NOT provenance, so this ledger is the one
     * source of truth for "the plugin installed this cap", and clearing always restores the exact
     * recorded caller value through the same public config channel.
     * @member {Map|null} appliedCaps=null
     */
    appliedCaps = null
    /**
     * The overflow control (a menu button), created on first overflow and torn down when everything fits.
     * @member {Neo.button.Base|null} control=null
     */
    control = null
    /**
     * Re-entrancy guard: `getDomRect` is an async main-thread round-trip, so a resize storm could overlap
     * measure passes and apply a stale split last.
     * @member {Boolean} measuring=false
     */
    measuring = false
    /**
     * The control's rendered main-axis extent, measured while it is mounted.
     * The `controlWidth` config is only the pre-creation estimate — the first overflow decision runs
     * before any control exists to measure. Once render truth is available, the reservation uses
     * `max(config, measured)`, so a skin that renders the control wider than the estimate can never
     * let packed buttons underlap it. `null` until the control has been measured; cleared with the control.
     * @member {Number|null} measuredControlWidth=null
     */
    measuredControlWidth = null
    /**
     * Natural (un-hidden) header main-axis extents keyed by tab-button id — see the class note on natural-width
     * discipline. `null` until the first capture.
     * @member {Object|null} naturalWidths=null
     */
    naturalWidths = null
    /**
     * Signature of the hidden set the control currently reflects (`index:text:iconCls` per entry).
     * Projections fire on many no-op events (resize, activation, the render-truth edges), and
     * rewriting identical menu items is not free: it rebuilds the dropdown list and closes an OPEN
     * menu mid-interaction. The signature makes syncControl's menu mutation idempotent — only a
     * changed partition touches the menu; re-arm and re-align stay unconditional.
     * @member {String|null} hiddenSignature=null
     */
    hiddenSignature = null
    /**
     * Header ids in the last committed visible/hidden split. Recapture may temporarily restore
     * them; an opening menu reasserts this partition before parking the in-flight projection.
     * @member {String[]|null} appliedHiddenIds=null
     */
    appliedHiddenIds = null
    /**
     * The floating menu list whose mounted edge drains a deferred partition update.
     * @member {Neo.menu.List|null} observedMenuList=null
     */
    observedMenuList = null
    /**
     * A projection requested while the Overflow menu owns a clickable rendered partition.
     * @member {Boolean} menuProjectionQueued=false
     */
    menuProjectionQueued = false
    /**
     * Sticky recapture intent for the projection queued behind an open menu.
     * @member {Boolean} menuRecaptureQueued=false
     */
    menuRecaptureQueued = false
    /**
     * A project() call arrived while a measure pass was in flight; drained once the pass releases the
     * latch, so a coalesced resize / activation / tab-set change still applies against current extents.
     * @member {Boolean} projectQueued=false
     */
    projectQueued = false
    /**
     * Whether the coalesced re-run must re-read natural widths — sticky-true so a queued width-capturing
     * `project(true)` (the mount pass) is never downgraded to an extent-only pass by a later queued
     * `project(false)` (resize / activation) that overlapped it.
     * @member {Boolean} queuedRecapture=false
     */
    queuedRecapture = false
    /**
     * A re-mount attempt for a transiently unmounted control is in flight — see `syncControl`.
     * Prevents overlapping re-arms when syncs land faster than the mount round-trip settles.
     * @member {Boolean} remountArming=false
     */
    remountArming = false
    /**
     * A projection requested while the tab SortZone owned a gesture.
     * @member {Boolean} sortDragProjectionQueued=false
     */
    sortDragProjectionQueued = false
    /**
     * Sticky recapture intent for the post-drag projection.
     * @member {Boolean} sortDragRecaptureQueued=false
     */
    sortDragRecaptureQueued = false
    /**
     * SortZone whose drag terminal releases queued projections.
     * @member {Neo.draggable.container.SortZone|null} sortDragZone=null
     */
    sortDragZone = null
    /**
     * A post-terminal drain task is already scheduled.
     * @member {Boolean} sortDragDrainScheduled=false
     */
    sortDragDrainScheduled = false
    /**
     * Drag-start callers waiting for the complete projection transaction to settle.
     * @member {Function[]|null} projectionIdleWaiters=null
     */
    projectionIdleWaiters = null
    /**
     * A dock-axis change needs its next rendered owner resize to recapture tab main-axis extents.
     * @member {Boolean} dockRecapturePending=false
     */
    dockRecapturePending = false

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.onResize = me.onResize.bind(me);

        // The default floating control is outside the owner's component collection and DOM subtree, so
        // container theme propagation cannot reach it. Keep that embodiment subscribed to every component in
        // the source toolbar's theme chain; action mode inherits the same theme natively, and these idempotent
        // updates keep both embodiments on one menu-theme path.
        //
        // Config subscribers run before the publisher's afterSetTheme() updates its cls carrier. Re-resolve in
        // the next microtask so getTheme() sees the completed ancestor change rather than the prior theme.
        if (Neo.typeOf(me.owner) === 'NeoInstance') {
            [me.owner, ...me.owner.getParents()].forEach(component => {
                me.observeConfig(component, 'theme', () => {
                    queueMicrotask(() => !me.isDestroyed && me.onOwnerThemeChange())
                })
            });
            if (me.owner.getConfig?.('dock')) {
                me.observeConfig(me.owner, 'dock', () => {
                    me.dockRecapturePending = true;
                    me.measuredControlWidth = null
                })
            }
        }
    }

    /**
     * The tab.Container whose `activeIndex` an overflow-menu selection drives (the ordinary activation
     * path — no new operation). The header toolbar (`owner`) is its primary child.
     * @returns {Neo.tab.Container}
     */
    getTabContainer() {
        return this.owner.parent
    }

    /**
     * The semantic header buttons that participate in overflow. Actions, their spacer, and the floating
     * control remain outside this view.
     * @returns {Neo.tab.header.Button[]}
     */
    getTabButtons() {
        return this.owner.getTabButtons?.() || []
    }

    /**
     * Actions which actually reduce the tab strip's main-axis extent.
     *
     * A contextually inactive action has no DOM node (`toolbar.Base#applyContextualActionState`
     * withholds it), so it must be excluded here rather than measured: this measurement reads each
     * rect's POSITION as well as its size, and a missing or all-zero rect would place the action
     * cluster at offset 0 and consume the entire strip, collapsing every tab into the overflow menu.
     * @returns {Neo.component.Base[]}
     */
    getActionItems() {
        return (this.owner.getActionItems?.() || [])
            .filter(item => item !== this.control)
            .filter(item => !item.hidden || item.hideMode === 'visibility')
            .filter(item => !(item.cls || []).includes('neo-toolbar-action-context-inactive'))
    }

    /**
     * Returns the orientation-dependent geometry contract used by measurement, capping, and
     * floating-control alignment.
     * @returns {{actionAlign: String, dimension: String, maxSize: String, ownerAlign: String}}
     */
    getMainAxisConfig() {
        return this.owner.dock === 'left' || this.owner.dock === 'right'
            ? {actionAlign: 'b0-t0', dimension: 'height', maxSize: 'maxHeight', ownerAlign: 'b0-b0'}
            : {actionAlign: 'r0-l0', dimension: 'width',  maxSize: 'maxWidth',  ownerAlign: 'r0-r0'}
    }

    /**
     * Aligns the floating overflow control immediately before the action group, or to the owner's
     * trailing edge when no action currently consumes space.
     * @returns {Object}
     */
    getControlAlign() {
        let me          = this,
            firstAction = me.getActionItems()[0],
            geometry    = me.getMainAxisConfig();

        return {
            edgeAlign: firstAction ? geometry.actionAlign : geometry.ownerAlign,
            target   : firstAction?.id || me.owner.id
        }
    }

    /**
     * Owner-mounted lifecycle hook: wire the resize + activation + tab-set-mutation listeners and run the
     * first (width-capturing) pass.
     *
     * Tab-set-change recapture wires the available header-mutation events: the owner toolbar fires `insert`
     * and `remove` on a tab add/remove, and the tab.Container fires `moveTo` on a reorder — each re-runs
     * `project(true)` so the cached natural widths, the split, and the overflow menu's indices follow the
     * mutated set even when neither a resize nor an `activeIndexChange` fires (a mid-menu insert / remove /
     * reorder into the hidden range would otherwise strand a pre-mutation projection and activate — or list —
     * the wrong record). This holds whether or not the dock rebuilds the header on a model change: if an
     * in-place update keeps this plugin instance, these listeners are what invalidate its cache; if a fresh
     * instance mounts instead, they are a harmless no-op it re-measures past. The sticky `queuedRecapture`
     * coalesces a mutation `project(true)` overlapping an in-flight resize/activation pass.
     * @override
     */
    onOwnerMounted() {
        let me      = this,
            {owner} = me;

        me.projectAsAction && me.createActionControl();
        owner.addDomListeners([{resize: me.onResize, scope: me}]);
        // Re-run on activation too: selecting a hidden tab flips activeIndex, and active-never-hidden must
        // then surface the newly-active tab into the header (swapping a fitting one into the overflow menu).
        me.getTabContainer()?.on('activeIndexChange', me.onActiveIndexChange, me);
        // Re-run on a tab-set mutation: an add / remove (owner `insert` / `remove`) or a reorder
        // (tab.Container `moveTo`) changes the cached widths / menu indices without a resize or activation,
        // so recapture to keep the split live.
        owner.on('insert', me.onTabSetChange, me);
        owner.on('remove', me.onTabSetChange, me);
        owner.on('actionsChange', me.onActionSetChange, me);
        owner.on('actionGeometryChange', me.onActionGeometryChange, me);
        owner.on('actionVisibilityChange', me.onActionVisibilityChange, me);
        me.getTabContainer()?.on('moveTo', me.onTabSetChange, me);
        me.project(true)
    }

    /**
     * Action membership/availability changes alter the tab-exclusive extent, not tab natural widths.
     */
    onActionSetChange() {
        this.project(false)
    }

    /**
     * Action geometry changes alter the tab-exclusive extent. The contributed control's own resize
     * is intentionally included: it is how action mode replaces its first zero-width estimate with
     * rendered truth.
     * @protected
     */
    onActionGeometryChange() {
        this.project(false)
    }

    /**
     * Ignores the contributed control's own show/hide signal so its partition verdict cannot re-enter
     * itself. Availability changes from every other action still re-project the tab extent.
     * @param {Object} data
     * @protected
     */
    onActionVisibilityChange({component}={}) {
        component !== this.control && this.project(false)
    }

    /**
     * Reprojects when the floating control's rendered main-axis size changes.
     * @protected
     */
    onControlResize() {
        this.project(false)
    }

    /**
     * Drains one sticky projection after the SortZone has restored its snapshotted tab geometry.
     * @protected
     */
    onSortDragEnd() {
        this.scheduleSortDragProjection()
    }

    /**
     * Releases work queued only by the snapshot-pending handshake when no drag started.
     * @protected
     */
    onSortSnapshotReady() {
        let sortZone = this.owner?.sortZone;

        if (!(sortZone?.sortSnapshotPending || sortZone?.startIndex > -1 || sortZone?.dragEndActive)) {
            this.scheduleSortDragProjection()
        }
    }

    /**
     * Defers a projection while the tab SortZone owns a stable gesture snapshot.
     * @param {Boolean} recapture
     * @param {Boolean} [includeSnapshotPending=true] New work waits behind snapshot preparation;
     *        an already-running transaction may finish its restoring split before releasing that waiter.
     * @returns {Boolean} True when the caller must stop its current projection.
     * @protected
     */
    queueSortDragProjection(recapture, includeSnapshotPending=true) {
        let me       = this,
            sortZone = me.owner.sortZone;

        if (!((includeSnapshotPending && sortZone?.sortSnapshotPending)
            || sortZone?.startIndex > -1
            || sortZone?.dragEndActive)) {
            return false
        }

        if (me.sortDragZone !== sortZone) {
            me.sortDragZone?.un('dragEnd', me.onSortDragEnd, me);
            me.sortDragZone = sortZone;
            me.sortDragZone.on('dragEnd', me.onSortDragEnd, me)
        }

        me.sortDragProjectionQueued = true;
        me.sortDragRecaptureQueued  = me.sortDragRecaptureQueued || recapture;

        return true
    }

    /**
     * Schedules the latest sticky projection after every SortZone terminal latch has released.
     * Dock terminals can outlive the first task, so retry at a bounded cadence while the exact latch
     * remains owned. Destroy rejects registered timeouts; the catch keeps teardown silent.
     * @protected
     */
    scheduleSortDragProjection() {
        let me = this;

        if (!me.sortDragProjectionQueued || me.sortDragDrainScheduled) {
            return
        }

        me.sortDragDrainScheduled = true;

        me.timeout(10)
            .catch(() => null)
            .then(() => {
                me.sortDragDrainScheduled = false;

                if (me.isDestroyed) {
                    return
                }

                let sortZone = me.owner.sortZone;

                if (sortZone?.sortSnapshotPending || sortZone?.startIndex > -1 || sortZone?.dragEndActive) {
                    me.scheduleSortDragProjection();
                    return
                }

                let recapture = me.sortDragRecaptureQueued;

                me.sortDragProjectionQueued = false;
                me.sortDragRecaptureQueued  = false;
                me.project(recapture)
            })
    }

    /**
     * Resolves drag-start callers after the projection and any coalesced rerun are idle.
     * @protected
     */
    resolveProjectionIdle() {
        let waiters = this.projectionIdleWaiters || [];

        this.projectionIdleWaiters = null;
        waiters.forEach(resolve => resolve())
    }

    /**
     * Waits until an in-flight projection and its coalesced rerun have both settled.
     * @returns {Promise<void>}
     */
    whenProjectionIdle() {
        if (!this.measuring && !this.projectQueued && !this.menuProjectionQueued) {
            return Promise.resolve()
        }

        return new Promise(resolve => (this.projectionIdleWaiters ??= []).push(resolve))
    }

    /**
     * Resize handler — an extent-only change, so recompute against the cached natural widths.
     * @param {Object} data
     */
    onResize(data) {
        let me        = this,
            recapture = me.dockRecapturePending;

        me.dockRecapturePending = false;
        me.project(recapture)
    }

    /**
     * Activation handler — a selection (including from the overflow menu) flipped `activeIndex`; recompute
     * so active-never-hidden surfaces the newly-active tab.
     */
    onActiveIndexChange() {
        this.project(false)
    }

    /**
     * Tab-set-mutation handler — a header add (`insert`) or reorder (`moveTo`) changed the button set, so
     * recapture natural widths (an added button has none cached) and re-partition against the mutated set.
     */
    onTabSetChange({item}={}) {
        // The owner's `insert` / `remove` also fire for its ACTION group — a consumer `actions`
        // replacement, the action spacer, and this plugin's own contribution all move through the same
        // container methods. None of those is a tab-set mutation: they change the tab-EXCLUSIVE extent,
        // which `actionsChange` already re-projects through onActionSetChange WITHOUT a recapture.
        //
        // Recapturing on them is not merely redundant, it is wrong. A recapture restores every hidden
        // header to the DOM for its measure window (project() step 1), and `insert` fires only AFTER
        // its own promiseUpdate round-trip — so an action replacement queues a recapture that lands
        // late and re-applies an all-fit split over the split a newer resize had already applied. The
        // header then flaps for one pass: the overflowing tabs return and the overflow control leaves,
        // in a state that reads as coherent because it IS one — the all-fit verdict for the old extent.
        // `Container#insert` fires ONCE for a batch, with `item` carrying the whole array (its per-item
        // recursion is silent), so the membership test has to cover both shapes.
        let members = Array.isArray(item) ? item : item ? [item] : [];

        if (members.length > 0 && members.every(member =>
            member?.isToolbarAction === true || member?.isToolbarActionSpacer === true
        )) {
            return
        }

        this.project(true)
    }

    /**
     * Re-resolves the source toolbar's nearest active theme onto the out-of-tree overflow embodiment.
     * A theme flip can change the control's rendered width (fonts, paddings), so the reservation
     * re-projects through the ordinary measure pass — the getDomRect round-trip queues behind the
     * theme update on the same channel, so it observes the re-skinned control.
     */
    onOwnerThemeChange() {
        let me        = this,
            {control} = me,
            value     = me.owner.getTheme();

        if (control && control.theme !== value) {
            control.theme = value;
            me.project(false)
        }
    }

    /**
     * Measures (natural widths as needed, strip extent always) and applies the visible/hidden split.
     * @param {Boolean} recapture  Re-read natural widths (mount, or the tab set changed).
     */
    async project(recapture) {
        let me       = this,
            {owner}  = me,
            buttons  = me.getTabButtons(),
            geometry = me.getMainAxisConfig();

        // Retiring an action contribution emits actionsChange synchronously. The destroy interceptor has
        // already raised isDestroying at that point, but super.destroy() has not yet removed this listener's
        // identity. Do not start one final DOM round-trip against the retiring control / owner boundary.
        if (me.isDestroying || me.isDestroyed) {
            me.resolveProjectionIdle?.();
            return
        }

        // The tab SortZone deliberately freezes item rectangles for the gesture. A resize/action
        // projection can otherwise hide or show members underneath that snapshot. Queue one sticky
        // pass and drain only after dragEnd restores natural layout.
        if (me.queueSortDragProjection(recapture)) {
            !me.measuring && me.resolveProjectionIdle();
            return
        }

        // An open menu and its rendered tab split are one addressable partition. A projection may
        // neither clear the menu's record store nor change header visibility underneath it.
        if (me.queueOpenMenuProjection(recapture)) return;

        if (!owner.mounted || buttons.length < 1) {
            me.resolveProjectionIdle();
            return
        }

        // Re-entrancy: getDomRect is an async main-thread round-trip, so a resize / activation / tab-set
        // storm can overlap passes. Coalesce instead of dropping — remember a re-run is owed (recapture is
        // sticky) and apply it ONCE after the in-flight pass, so the last state wins over a stale split.
        if (me.measuring) {
            me.projectQueued   = true;
            me.queuedRecapture = me.queuedRecapture || recapture;
            return
        }

        me.measuring = true;

        try {
            let controlIconCls = geometry.dimension === 'height'
                ? 'fa fa-ellipsis-vertical'
                : 'fa fa-ellipsis';

            if (me.control && me.control.iconCls !== controlIconCls) {
                me.control.iconCls       = controlIconCls;
                me.measuredControlWidth = null;
                me.control.mounted && await me.control.promiseUpdate?.()
            }

            // 1. Natural widths — measured once while every button is visible, then cached.
            if (recapture || !me.naturalWidths) {
                const removedButtons = buttons.filter(button => button.hidden),
                      cappedButtons  = buttons.filter(button => me.appliedCaps?.has(button.id));

                // A plugin-installed cap (applySplit) bounds the live rect below the natural width, so
                // measuring through it would poison the cache with the capped value. Restore the CALLER's
                // recorded maxWidth (reactively — the config's afterSet owns the vdom key; a silent write
                // would leave the capped vdom in place and measure the cap anyway) under the same latch
                // that restores hidden buttons. Ledger entries stay: the split right after re-caps against
                // fresh numbers (the recorded caller value stays authoritative) or clears via its ordinary
                // restore branch. Only ledger members are touched — a consumer-configured maxWidth is not
                // plugin residue and measures as part of the button's real constraint set.
                cappedButtons.forEach(button => {
                    let cap = me.appliedCaps.get(button.id);

                    button[cap.maxSize] = cap.value
                });

                // A prior split removes overflowing buttons from DOM. Restore them under this method's
                // measuring latch, then reconcile their closest common parent once so getDomRect observes
                // natural geometry. Any resize raised by that update queues behind the latch and drains as
                // an extent-only pass after this authoritative capture.
                if (removedButtons.length > 0 || cappedButtons.length > 0) {
                    removedButtons.forEach(button => {
                        button.setSilent({hidden: false});
                        // setSilent intentionally bypasses Component#show(). Keep the config and VDOM
                        // surfaces atomic or a later `button.hidden = false` becomes a no-op while the
                        // stale removeDom marker keeps the supposedly visible header physically absent.
                        delete button.vdom.removeDom
                    });
                    owner.updateDepth = -1;
                    await owner.promiseUpdate()
                }

                let previousWidths = me.naturalWidths || {},
                    rects          = await owner.getDomRect(buttons.map(button => button.id));

                me.naturalWidths = {};
                buttons.forEach((button, index) => {
                    // A recapture can run after the previous split removed overflowing headers from DOM.
                    // Their live rect is then zero by construction, not because their natural width changed.
                    // Keep the last positive measurement for those stable button identities; newly inserted
                    // buttons are visible on their first mutation pass and therefore still enter the cache.
                    me.naturalWidths[button.id] = Math.ceil(
                        rects[index]?.[geometry.dimension] || previousWidths[button.id] || 0
                    )
                })
            }

            // 2. The strip extent — actions consume the same main axis but stay outside tab packing.
            // A contextually inactive action is collapsed out of the layout, so it contributes a
            // zero rect here and the extent tracks what is actually offered. A focus change can
            // therefore repartition the tabs; that is intended, not a regression.
            let actionItems   = me.getActionItems(),
                controlId     = me.control?.mounted ? me.control.id : null,
                ids           = [owner.id, ...actionItems.map(item => item.id), ...(controlId ? [controlId] : [])],
                rects         = await owner.getDomRect(ids),
                ownerRect     = rects.shift(),
                actionRects   = rects.splice(0, actionItems.length),
                controlRect   = controlId ? rects.shift() : null,
                startKey      = geometry.dimension === 'width' ? 'left' : 'top',
                coordinateKey = geometry.dimension === 'width' ? 'x' : 'y',
                ownerStart    = Number(ownerRect?.[startKey] ?? ownerRect?.[coordinateKey]),
                actionStart   = Number(actionRects[0]?.[startKey] ?? actionRects[0]?.[coordinateKey]),
                ownerSize     = Number(ownerRect?.[geometry.dimension]),
                actionSize    = actionRects.reduce((sum, rect) => {
                    let size = Number(rect?.[geometry.dimension]);

                    return sum + (Number.isFinite(size) ? Math.max(0, size) : 0)
                }, 0),
                coordinateExtent = Number.isFinite(ownerStart) && Number.isFinite(actionStart)
                    ? Math.max(0, Math.floor(actionStart - ownerStart))
                    : null,
                sizeExtent = Number.isFinite(ownerSize)
                    ? Math.max(0, Math.floor(ownerSize - actionSize))
                    : null,
                // Visible tabs can briefly push the action rail beyond the owner after a wide→narrow resize.
                // Its coordinate then overstates available space and self-sustains an all-visible split. The
                // rendered action widths provide the owner-bounded ceiling; the coordinate remains authoritative
                // whenever gaps, margins, or another stricter boundary make it smaller.
                extent = coordinateExtent === null
                    ? sizeExtent || 0
                    : sizeExtent === null ? coordinateExtent : Math.min(coordinateExtent, sizeExtent),
                tabContainer  = me.getTabContainer(),
                activeButton  = buttons[tabContainer?.activeIndex] || null,
                items         = buttons.map(button => ({id: button.id, headerWidth: me.naturalWidths[button.id]}));

            if (controlRect?.[geometry.dimension] > 0) {
                me.measuredControlWidth = Math.ceil(controlRect[geometry.dimension])
            }

            // 3. The pure decision: active-never-hidden packing, overflow-only control reservation.
            //    The pure core is this plugin's own static (below) — no adapter namespace-reach, no cycle.
            let controlWidth = me.projectAsAction
                    ? me.measuredControlWidth || 0
                    : Math.max(me.controlWidth, me.measuredControlWidth || 0),
                {hidden}     = Overflow.computeOverflow({
                    activeItemId: activeButton?.id,
                    controlWidth,
                    extent,
                    items
                });

            // A drag can begin while either DOM round-trip above is in flight. Recheck at the
            // mutation boundary so a pre-gesture measurement cannot hide/show members beneath the
            // SortZone snapshot captured in the meantime.
            if (!me.queueSortDragProjection(recapture, false) && !me.queueOpenMenuProjection(recapture)) {
                me.applySplit(hidden, buttons, tabContainer, {
                    activeButton,
                    maxSize: geometry.maxSize,
                    // The degenerate branch keeps an over-wide active visible past `usable` — cap its box so
                    // every geometry derived from the button (the persistent per-button indicator, the strip's
                    // crossfade indicator, the label itself) ends where the control begins.
                    usable: hidden.length > 0
                        ? Math.max(0, extent - controlWidth)
                        : activeButton && me.naturalWidths[activeButton.id] > extent ? extent : null
                })
            }
        } catch (error) {
            // getDomRect losing a race with teardown (owner unmounting mid-measure) is the ONE expected
            // failure: it must neither reject a fire-and-forget handler nor skip the drain below, and the
            // finally-released latch lets the NEXT event re-project (rejected→success self-heal). But a throw
            // against a LIVE owner is a programming defect — surface it rather than swallow it silently (a
            // blanket catch would hide real bugs behind a "just a teardown race" assumption).
            if (owner.mounted) {
                console.error('Neo.tab.plugin.Overflow: project() threw against a live owner', error)
            }
        } finally {
            // ALWAYS release the latch: a thrown getDomRect / applySplit must not strand `measuring` at
            // true, which would silently freeze every future projection (the header stops responding).
            me.measuring = false
        }

        // Drain a coalesced re-run: an event that arrived mid-pass is applied once here, against the
        // now-current extents, so the split never lags the last resize / activation / tab-set change.
        if (me.projectQueued) {
            let queuedRecapture = me.queuedRecapture;

            me.projectQueued   = false;
            me.queuedRecapture = false;
            me.project(queuedRecapture)
        } else if (!me.menuProjectionQueued) {
            me.resolveProjectionIdle()
        }
    }

    /**
     * Applies the computed hidden set: hides the overflowing header buttons, bounds the degenerate
     * over-wide active button to the usable extent, and reflects the remainder through the overflow
     * control.
     *
     * Packing and active-button capping follow the toolbar's main axis: width for top/bottom and
     * height for left/right.
     * @param {String[]} hidden  Overflowing button ids, in header order.
     * @param {Neo.tab.header.Button[]} buttons
     * @param {Neo.tab.Container} tabContainer
     * @param {Object}  activeCap
     * @param {Neo.tab.header.Button|null} activeCap.activeButton
     * @param {String} [activeCap.maxSize='maxWidth'] Main-axis max-size config.
     * @param {Number|null} activeCap.usable  Cap for the active button while overflowing; `null` clears.
     */
    applySplit(hidden, buttons, tabContainer, {activeButton, maxSize='maxWidth', usable} = {}) {
        let me         = this,
            hiddenSet  = new Set(hidden),
            hiddenMeta = [];

        buttons.forEach((button, index) => {
            let isHidden = hiddenSet.has(button.id),
                needsCap = button === activeButton && usable !== null && usable !== undefined
                    && me.naturalWidths?.[button.id] > usable;

            // Dock orientation can change while an active tab is capped. Retire ownership on the
            // old axis before deciding the new one, or a maxWidth ledger entry would authorize a
            // maxHeight write that destroy/clear can never restore.
            if (me.appliedCaps?.has(button.id) && me.appliedCaps.get(button.id).maxSize !== maxSize) {
                let priorCap = me.appliedCaps.get(button.id);

                button[priorCap.maxSize] = priorCap.value;
                button.removeCls('neo-tab-overflow-capped');
                me.appliedCaps.delete(button.id)
            }

            // Neo's built-in `hidden` (removeDom) rather than a cls needing an external stylesheet rule —
            // the natural-width cache (captured while every button was visible) survives the DOM removal,
            // so a later widen re-measures nothing and simply flips `hidden` back.
            if (isHidden) {
                button.hidden = true
            } else if (button.hidden || button.vdom?.removeDom) {
                // Repair both surfaces. A prior silent batch can already report hidden=false while
                // removeDom still exists; assigning false again is then a reactive no-op, whereas
                // show() clears the marker and schedules the toolbar update which remounts the header.
                button.show()
            }

            // Degenerate-branch bound: `computeOverflow` keeps an active wider than `usable` visible
            // (active-never-hidden), so its box would run beneath the floating control — and with it every
            // geometry derived from the box: the persistent `.neo-tab-button-indicator` child, the strip's
            // crossfade indicator (sized from this rect), and the label glyphs the opaque control would
            // otherwise cover instead of an honest ellipsis. The cap rides the PUBLIC `maxWidth` config
            // (one channel, one vdom owner — the consumer's `style.maxWidth` is never touched), and the
            // `appliedCaps` ledger carries provenance: only a plugin-installed cap is ever cleared, and
            // clearing restores the exact caller value recorded at cap time.
            if (needsCap) {
                if (!me.appliedCaps?.has(button.id)) {
                    (me.appliedCaps ??= new Map()).set(button.id, {
                        maxSize,
                        value: button[maxSize] ?? null
                    });
                    button.addCls('neo-tab-overflow-capped')
                }

                button[maxSize] = usable
            } else if (me.appliedCaps?.has(button.id)) {
                let cap = me.appliedCaps.get(button.id);

                button.removeCls('neo-tab-overflow-capped');
                button[cap.maxSize] = cap.value;
                me.appliedCaps.delete(button.id)
            }

            if (isHidden) {
                hiddenMeta.push({iconCls: button.iconCls, index, text: button.text})
            }
        });

        me.appliedHiddenIds = [...hidden];
        me.syncControl(hiddenMeta, tabContainer)
    }

    /**
     * Restores the last committed header partition when the menu opens during a recapture pass.
     * The recapture path may already have made every header measurable; parking its new decision
     * without this rollback would leave those temporary headers visible beside stale menu records.
     * @protected
     */
    restoreOpenMenuPartition() {
        let me = this;

        if (!me.appliedHiddenIds) return;

        let hidden = new Set(me.appliedHiddenIds);

        me.getTabButtons().forEach(button => {
            let isHidden = hidden.has(button.id);

            button.setSilent({hidden: isHidden});

            if (isHidden) {
                button.vdom.removeDom = true
            } else {
                delete button.vdom.removeDom
            }
        });

        me.owner.updateDepth = -1;
        me.owner.update()
    }

    /**
     * Observes one generated menu list so its unmount edge can drain a queued projection. A
     * replacement list supersedes the old observer.
     * @param {Neo.menu.List|null} menuList
     * @protected
     */
    observeMenuListLifecycle(menuList) {
        let me = this;

        if (!menuList || me.observedMenuList === menuList) return;

        me.observedMenuList = menuList;

        if (Neo.typeOf(menuList) === 'NeoInstance') {
            me.observeConfig(menuList, 'mounted', value => {
                if (me.observedMenuList === menuList) {
                    value ? me.restoreOpenMenuPartition() : me.drainOpenMenuProjection()
                }
            })
        }
    }

    /**
     * Queues a projection while the generated menu owns a clickable visible/hidden partition.
     * @param {Boolean} recapture
     * @returns {Boolean} True when the current projection must stop.
     * @protected
     */
    queueOpenMenuProjection(recapture) {
        let me       = this,
            menuList = me.control?.menuList;

        me.observeMenuListLifecycle(menuList);

        if (!menuList?.mounted) return false;

        me.menuProjectionQueued = true;
        me.menuRecaptureQueued  = me.menuRecaptureQueued || recapture;

        return true
    }

    /**
     * Drains the latest sticky projection after the menu unmounts and releases its record store.
     * @protected
     */
    drainOpenMenuProjection() {
        let me = this;

        if (!me.menuProjectionQueued || me.observedMenuList?.mounted) return;

        let recapture = me.menuRecaptureQueued;

        me.menuProjectionQueued = false;
        me.menuRecaptureQueued  = false;
        me.project(recapture)
    }

    /**
     * Creates the hidden, stable toolbar contribution used by {@link #projectAsAction}. It exists before
     * the first overflow so a consumer `actions` replacement while everything fits cannot erase the future
     * affordance. The menu is supplied by the first real partition; no empty-menu async work is started.
     * @returns {Neo.button.Base}
     * @protected
     */
    createActionControl() {
        let me = this;

        if (me.control) {
            return me.control
        }

        if (!Neo.isFunction(me.owner.addActionContribution)) {
            throw new Error('Neo.tab.plugin.Overflow: projectAsAction requires a toolbar action-contribution owner')
        }

        me.control = me.owner.addActionContribution({
            module : Button,
            cls    : ['neo-tab-overflow-control'],
            handler: Neo.emptyFn,
            hidden : true,
            iconCls: me.getMainAxisConfig().dimension === 'height'
                ? 'fa fa-ellipsis-vertical'
                : 'fa fa-ellipsis',
            role       : 'button',
            showOnFocus: false,
            vdom       : {'aria-label': 'More tabs'}
        });

        return me.control
    }

    /**
     * Creates / updates / hides or tears down the single overflow control. A menu selection sets the
     * tab.Container's `activeIndex` (the ordinary activation path); the follow-up measure pass then
     * surfaces the now-active tab by construction (active-never-hidden), so the selected tab is never
     * left in the menu.
     *
     * The control is a `button.Base` with a `menu` config — button.Base builds the dropdown `menu.List`
     * itself, so no menu is hand-assembled here. Floating mode destroys its body-rooted embodiment when
     * everything fits; action mode keeps one toolbar contribution and toggles its `hidden` state.
     * @param {Object[]} hiddenMeta  `{text, iconCls, index}` per hidden tab, in header order.
     * @param {Neo.tab.Container} tabContainer
     */
    syncControl(hiddenMeta, tabContainer) {
        let me = this;

        if (hiddenMeta.length < 1) {
            if (me.projectAsAction) {
                me.appliedHiddenIds     = null;
                me.hiddenSignature      = null;
                me.menuProjectionQueued = false;
                me.menuRecaptureQueued  = false;
                me.observedMenuList     = null;
                if (me.control) {
                    if (!me.control.hidden) {
                        me.control.hidden = true
                    } else if (!me.control.vdom?.removeDom) {
                        me.control.hide()
                    }
                }
                return
            }

            if (me.control) {
                let control = me.control;

                me.control                = null;
                me.appliedHiddenIds       = null;
                me.hiddenSignature        = null;
                me.measuredControlWidth   = null;
                me.menuProjectionQueued   = false;
                me.menuRecaptureQueued    = false;
                me.observedMenuList       = null;
                // The measurement belongs to the torn-down embodiment; the next control re-measures.
                control.destroy(true)
            }
            return
        }

        let signature = hiddenMeta.map(meta => `${meta.index}:${meta.text}:${meta.iconCls}`).join('|'),
            menuItems = hiddenMeta.map(meta => ({
                handler: () => {tabContainer.activeIndex = meta.index},
                iconCls: meta.iconCls,
                text   : meta.text
            })),
            menuConfig = {
                // App-neutral identity for product skins. Theme ownership remains the control's live contract;
                // consumers can project their own token family without hand-building or subclassing this menu.
                cls  : ['neo-tab-overflow-menu'],
                items: menuItems
            };

        me.projectAsAction && !me.control && me.createActionControl();

        if (me.control) {
            let {menuList} = me.control;

            me.observeMenuListLifecycle(menuList);

            // Idempotence gate: a projection that did not change the partition must not touch the
            // menu — rewriting identical items rebuilds the dropdown and closes it mid-interaction
            // (the render-truth edges made no-op projections routine, so this is load-bearing).
            if (signature !== me.hiddenSignature) {
                if (menuList) {
                    menuList.items = menuItems
                } else {
                    me.control.menu = menuConfig
                }
            }

            // Re-arm a transiently unmounted control. A floating instance mounts once at
            // create; any later unmount (a re-projection wave, a tour reset) previously
            // ratcheted into a permanent wedge — every following sync only mutated menu
            // items on the unmounted instance, and the overflow surface was gone for the
            // document's lifetime. The mount path itself is starvation-proof (message-driven
            // vnode create + insert; verified live in a fully hidden document), so
            // re-attempting here makes the surface self-healing against any transient
            // un-mounter. The latch bounds it to one in-flight attempt — which relies on
            // initVnode's lifecycle contract: its promise settles only when the REAL attempt
            // settles (a theme-file deferral chains through the re-entered attempt), and a
            // rejection releases isVnodeInitializing before rethrowing, so the guard above
            // re-opens and a later sync retries. The align follows only a successful mount
            // (mirroring the sync-time re-align below).
            if (me.projectAsAction) {
                if (me.control.hidden) {
                    me.control.hidden = false
                } else if (me.control.vdom?.removeDom) {
                    me.control.show()
                }
            } else if (!me.control.mounted && !me.control.isVnodeInitializing && !me.remountArming) {
                me.remountArming = true;

                me.control.initVnode(true)
                    .then(() => {
                        const {control} = me;
                        control && !control.isDestroyed && control.mounted && control.alignTo()
                    })
                    .catch(() => {})
                    .finally(() => {
                        me.remountArming = false
                    })
            }
        } else {
            // OUT-OF-COLLECTION mount: a floating button rooted directly at document.body, NOT a trailing
            // toolbar item. Ordinary toolbar actions are members of `owner.items` but excluded through the
            // tab toolbar's semantic subset; the independently mounted overflow embodiment stays outside
            // both collections.
            //
            // `Neo.create` with `floating:true` + `parentId:'document.body'` roots at document.body directly
            // (verified: `Container.createItem` is the only path that injects `parentId=owner.id`, and we
            // bypass it). `parentComponent` restores logical TabContainer focus ancestry while the physical
            // root stays on document.body. The `initVnode(true)` autoMount reaches the DOM via the merged
            // hidden-document render-queue drain — before it, the insertNode reply parked behind a
            // suspended requestAnimationFrame in an offscreen / hidden document.
            me.control = Neo.create({
                module         : Button,
                // Align to the main-axis slot immediately before actions (or the owner edge without actions).
                // Without an align target a floating component stays at its off-screen default.
                align        : me.getControlAlign(),
                appName      : me.owner.appName,
                autoInitVnode: true,
                autoMount    : true,
                cls          : ['neo-tab-overflow-control'],
                floating     : true,
                iconCls      : me.getMainAxisConfig().dimension === 'height'
                    ? 'fa fa-ellipsis-vertical'
                    : 'fa fa-ellipsis',
                menu           : menuConfig,
                parentComponent: me.owner,
                parentId       : 'document.body',
                role           : 'button',
                theme          : me.owner.getTheme(),
                vdom           : {'aria-label': 'More tabs'},
                windowId       : me.owner.windowId
            });
            me.control.addDomListeners?.({resize: me.onControlResize, scope: me});
            // The reservation's render-truth EDGE: the pass that creates the control computed its split
            // with the pre-creation estimate — the rendered width does not exist yet, and no external
            // event is owed. Re-project when the mount lands (and on any later re-mount — idempotent, and
            // a fresh embodiment deserves a fresh measurement), so the estimate→rendered convergence is
            // this plugin's own lifecycle, never a wait for an unrelated resize/activation/mutation.
            if (Neo.typeOf(me.control) === 'NeoInstance') {
                me.observeConfig(me.control, 'mounted', value => {
                    value && !me.isDestroyed && me.project(false)
                })
            }
        }

        me.hiddenSignature = signature;

        // RA-13: re-align against the CURRENT owner rect. A floating component aligns once at mount and does
        // NOT re-align when its target moves. Re-aligning on each sync re-pins it to the current action or
        // owner edge — cheap + idempotent. The e2e owner-exact geometry assertion falsifies its absence.
        if (me.control) {
            me.control.iconCls = me.getMainAxisConfig().dimension === 'height'
                ? 'fa fa-ellipsis-vertical'
                : 'fa fa-ellipsis';

            if (!me.projectAsAction && me.control.mounted) {
                me.control.align = me.getControlAlign();
                me.control.alignTo()
            }
        }
    }

    /**
     * @param {...*} args
     * @override
     */
    destroy(...args) {
        let me = this;

        // A dying plugin must not strand its caps (a dock rebuild replaces the plugin, not the
        // buttons): restore each recorded caller value through the same channel the cap used.
        me.appliedCaps?.forEach((cap, buttonId) => {
            const button = me.getTabButtons().find(item => item.id === buttonId);

            if (button && !button.isDestroyed) {
                button.removeCls?.('neo-tab-overflow-capped');
                button[cap.maxSize] = cap.value
            }
        });

        me.appliedCaps = null;
        me.appliedHiddenIds = null;
        me.resolveProjectionIdle();
        me.sortDragZone?.un('dragEnd', me.onSortDragEnd, me);
        me.sortDragZone           = null;
        me.menuProjectionQueued   = false;
        me.menuRecaptureQueued    = false;
        me.observedMenuList       = null;
        if (me.control && !me.control.isDestroyed) {
            if (me.control.isToolbarActionContribution === true) {
                me.owner.removeActionContribution(me.control)
            } else {
                me.control.destroy(true)
            }
        }
        me.control = null;
        super.destroy(...args)
    }
}

export default Neo.setupClass(Overflow);
