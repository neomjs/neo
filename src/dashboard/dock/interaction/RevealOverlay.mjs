import Container        from '../../../container/Base.mjs';
import TabHeaderButton  from '../../../tab/header/Button.mjs';
import TabHeaderToolbar from '../../../tab/header/Toolbar.mjs';
import NeoArray         from '../../../util/Array.mjs';
import MotionSignal     from '../projection/MotionSignal.mjs';

/**
 * @summary Presentation host for the transient reveal of an auto-hidden dock item — an
 * edge-anchored overlay that renders OVER the committed projection, never re-layouts it.
 *
 * The overlay is pure per-window runtime state: it renders whatever reveal snapshot its owning
 * rail pushes (via `Rail.bindRevealOverlay()`) and translates DOM reality back into semantic
 * INTENTS the rail's state machine consumes — `revealPointerEnter/Leave`, `revealFocusEnter/Leave`,
 * `revealEscape`, `revealPinRequested`. It decides nothing itself: timing, focus-hold and policy
 * all live upstream. It has no write path to any document.
 *
 * Composition: a real `Neo.tab.header.Toolbar` header row (one pressed
 * `Neo.tab.header.Button` title + persistent `pin` action) above a pane-slot
 * `Neo.container.Base`. Reusing both tab-header primitives keeps reveal chrome identical to the
 * in-flow tab rail without pretending the runtime-only preview is itself a committed tabs node.
 * The consuming workspace mounts the revealed pane INTO the slot container
 * (`overlay.paneSlot.add(...)` / `removeAll()`) — pane resolution stays the workspace's concern
 * (same seam as the adapter's `resolveComponentRef`), keeping this overlay pane-blind.
 * Root-level `domListeners` (focus, key, pointer) are the container-level interaction surface;
 * every interactive CHILD is a real component.
 *
 * Sizing follows the auto-hide contract: the free dimension (width for left/right rails, height
 * for top/bottom) uses the extent the item's owning split last committed when one exists
 * (`revealExtent`, resolved by the rail), with the workspace-configurable `defaultRevealFraction`
 * as both fallback and usability floor.
 * Left/right reveals span full height; top/bottom span full width. The overlay stays visible
 * through the dismiss grace window (`dismiss-pending`) — pointer wobble must not flicker it.
 *
 * The pin control persists the reveal: it requests `setItemPinned(true)` from the rail (executor
 * path — no parallel mutation grammar) and renders disabled when the item's policy forbids pinning
 * (`restorable: false`) — the one honest non-pinnable affordance state, while reveal itself stays
 * policy-free.
 *
 * @class Neo.dashboard.dock.interaction.RevealOverlay
 * @extends Neo.container.Base
 * @see Neo.dashboard.dock.interaction.Rail
 * @see Neo.dashboard.dock.interaction.RevealStateMachine
 * @see learn/agentos/DockZoneModel.md
 */
class RevealOverlay extends Container {
    /**
     * Reveal states in which the overlay renders visibly — `dismiss-pending` included: the grace
     * window is part of the shown lifecycle.
     * @member {Set<String>} VISIBLE_STATES
     * @static
     */
    static VISIBLE_STATES = new Set(['dismiss-pending', 'revealed', 'revealed-focused'])

    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.interaction.RevealOverlay'
         * @protected
         */
        className: 'Neo.dashboard.dock.interaction.RevealOverlay',
        /**
         * @member {String} ntype='dashboard-dock-reveal-overlay'
         * @protected
         */
        ntype: 'dashboard-dock-reveal-overlay',
        /**
         * @member {String[]} baseCls=['neo-dashboard-dock-reveal-overlay']
         */
        baseCls: ['neo-dashboard-dock-reveal-overlay'],
        /**
         * Workspace-configurable fallback and minimum for the free dimension (fraction of the
         * workspace extent). A smaller committed band must not turn a transient preview into an
         * unusable sliver; larger committed extents remain authoritative.
         * @member {Number} defaultRevealFraction_=0.25
         * @reactive
         */
        defaultRevealFraction_: 0.25,
        /**
         * Owning workspace edge (`top`, `right`, `bottom`, `left`).
         * @member {String} edge_='left'
         * @reactive
         */
        edge_: 'left',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * Tooltip text of the overlay's pin control, threaded by the rail from the workspace's
         * `dockActionTooltips.revealPin`. `null` leaves the control without a tooltip.
         * @member {String|null} pinTooltip=null
         */
        pinTooltip: null,
        /**
         * Committed extent fraction for the free dimension, or `null` for the default fraction.
         * Resolved by the rail from the live document — never computed from DOM geometry.
         * @member {Number|null} revealExtent_=null
         * @reactive
         */
        revealExtent_: null,
        /**
         * Current machine state snapshot (`idle`, `dwell-pending`, `revealed`, `revealed-focused`,
         * `dismiss-pending`).
         * @member {String} revealState_='idle'
         * @reactive
         */
        revealState_: 'idle',
        /**
         * Rail-item metadata of the revealed item (`{dockEdge, dockItemId, restorable, title}`),
         * or `null` when nothing reveals.
         * @member {Object|null} revealedItem_=null
         * @reactive
         */
        revealedItem_: null,
        /**
         * Programmatic focus carrier for pointer interactions on non-focusable pane content. It
         * stays outside sequential keyboard navigation while preserving the overlay subtree as the
         * focus-containment authority.
         * @member {Object} _vdom={tabIndex:-1}
         * @protected
         */
        _vdom:
        {tabIndex: -1}
    }

    /**
     * The dock item id whose pane currently occupies the slot — maintained by the owning rail's
     * pane sync. Runtime-only bookkeeping, never persisted.
     * @member {String|null} revealPaneItemId=null
     * @protected
     */
    revealPaneItemId = null
    /**
     * Whether this overlay currently owns one reveal-animation entry in `MotionSignal`.
     * Keeps matching end events, early dismissal, rapid re-entry and teardown idempotent.
     * @member {Boolean} revealMotionActive=false
     * @protected
     */
    revealMotionActive = false
    /**
     * Last computed `visible` value used to detect the actual hidden/visible boundary even when
     * `revealedItem`, rather than `revealState`, causes the transition.
     * @member {Boolean} revealWasVisible=false
     * @protected
     */
    revealWasVisible = false
    /**
     * Whether the overlay is between its dismissal and the hidden class: the DOM stays while the
     * exit keyframes run, and the root's `animationend` (or the fail-safe) ends the leave.
     * @member {Boolean} revealLeaving=false
     * @protected
     */
    revealLeaving = false
    /**
     * The fail-safe timer of an in-flight leave — the wedge backstop for an exit whose end event
     * never comes, never the exit's duration (the CSS token owns that).
     * @member {Number|null} revealLeaveTimer=null
     * @protected
     */
    revealLeaveTimer = null
    /**
     * The retarget swap generation while the overlay shows: `0` for an entry, then `1` and `2`
     * alternating on every retarget so the content's entry keyframes restart (see `beginRevealSwap`).
     * @member {Number} revealSwapGeneration=0
     * @protected
     */
    revealSwapGeneration = 0
    /**
     * The dock item id last shown while visible. A re-entry after a leave compares against it: a
     * different item is a retarget that happened to pass through hidden (a rail's pressed-button
     * group releases the old tab before it presses the new one), the same item is a plain return.
     * @member {String|null} revealShownItemId=null
     * @protected
     */
    revealShownItemId = null

    /**
     * Assembles the fixed child skeleton (tab-header toolbar: active title tab + pin action; pane slot)
     * with instance-bound handlers, wires the container-level interaction listeners, then applies
     * the initial snapshot.
     * @param {Object} config
     */
    construct(config={}) {
        let me = this;

        config.items = [{
            module: TabHeaderToolbar,
            actions: [{
                action: 'pin',
                cls   : ['neo-dashboard-dock-reveal-pin'],
                // Explicitly bound: function-type button handlers run as plain calls.
                handler    : me.onPinClick.bind(me),
                iconCls    : 'fa fa-thumbtack',
                showOnFocus: false,
                text       : null,
                vdom       : {'aria-label': 'Pin'},
                ...(config.pinTooltip != null && {tooltip: config.pinTooltip})
            }],
            // The self-scoped variant class lets every theme resolve the same compact tokens as
            // an inline TabContainer, even though this runtime-only toolbar has no container owner.
            cls : ['neo-dashboard-dock-reveal-header', 'neo-tab-container-inline'],
            flex: 'none',
            items: [{
                module : TabHeaderButton,
                cls    : ['neo-dashboard-dock-reveal-title', 'neo-tab-overflow-capped'],
                pressed: true,
                text   : '',
                // A preview title is a visual active-tab identity, not another navigation stop.
                vdom   : {tabIndex: -1}
            }]
        }, {
            module: Container,
            cls   : ['neo-dashboard-dock-reveal-pane-slot'],
            flex  : 1,
            items : []
        }];

        super.construct(config);

        me.addDomListeners([
            // `mousedown` is a GLOBAL DomEvents surface: unlike a local `pointerdown` listener, it
            // does not preventDefault(), so native text selection inside the hosted pane survives.
            {mousedown : me.onMouseDown,    scope: me},
            {keydown   : me.onKeyDown,      scope: me},
            {mouseenter: me.onPointerEnter, scope: me},
            {mouseleave: me.onPointerLeave, scope: me},
            // not a global-registry event → mounts LOCALLY on this node; the reveal-slide
            // keyframes bubble their end here (the motion-signal leave seam)
            {animationend: me.onMotionAnimationEnd, scope: me}
        ])
    }

    /**
     * Opens this reveal producer's counted motion window once.
     * @protected
     */
    beginRevealMotion() {
        if (!this.revealMotionActive) {
            this.revealMotionActive = true;
            MotionSignal.enter(this)
        }
    }

    /**
     * Settles this reveal producer's counted motion window once.
     * @protected
     */
    finishRevealMotion() {
        if (this.revealMotionActive) {
            this.revealMotionActive = false;
            MotionSignal.leave(this)
        }
    }

    /**
     * @summary Starts the two-phase hide: the DOM stays, the exit keyframes run, and the hidden
     * class lands on the root's `animationend`.
     *
     * The exit is motion too: the leave opens the producer's motion window (a no-op while the
     * entry's is still open), and the same end event that settles an entry settles it. A stuck
     * exit (a consumer sheet that sets `animation: none` never fires an end event) hides after
     * the motion signal's fail-safe horizon instead of never; that timer is the wedge backstop,
     * not a duration.
     * @protected
     */
    beginRevealLeave() {
        let me = this;

        me.revealLeaving = true;
        me.beginRevealMotion();

        me.revealLeaveTimer = setTimeout(() => {
            me.revealLeaveTimer = null;
            me.completeRevealLeave()
        }, MotionSignal.FAIL_SAFE_MS)
    }

    /**
     * @summary Ends the leave: the hidden class lands, the leaving class goes, the motion window
     * settles. A no-op unless a leave is in flight.
     * @protected
     */
    completeRevealLeave() {
        let me = this;

        if (me.revealLeaving) {
            me.cancelRevealLeave();
            me.revealSwapGeneration = 0;
            !me.isDestroyed && me.syncSnapshot();
            me.finishRevealMotion();

            // The terminal is announced, because the overlay is not the only owner of what the exit
            // shows. It controls when its own DOM goes; the rail controls when the revealed PANE
            // goes, and until this event existed the rail had no way to learn an exit was running —
            // so it detached the pane on the dismissal frame and the keyframes played over an empty
            // slot. A cancelled leave never reaches here (`cancelRevealLeave` clears the flag
            // first), so a re-entry mid-exit keeps its pane by construction, not by a second guard.
            !me.isDestroyed && me.fire('revealLeaveComplete', {overlay: me})
        }
    }

    /**
     * @summary Drops an in-flight leave without settling the motion window — the caller decides
     * whether the overlay re-enters (the window stays open for the entry's end event) or is torn
     * down (the window settles).
     * @protected
     */
    cancelRevealLeave() {
        let me = this;

        me.revealLeaving = false;

        if (me.revealLeaveTimer) {
            clearTimeout(me.revealLeaveTimer);
            me.revealLeaveTimer = null
        }
    }

    /**
     * Reconciles the reveal producer with the overlay's computed visibility. Both state and item
     * changes can cross this boundary because `visible` requires a visible state AND an item.
     *
     * A visible→hidden flip on a mounted overlay does not hide: it leaves (see
     * {@link #beginRevealLeave}), so the exit keyframes get a DOM to run on. Without a DOM there
     * is nothing to animate and the producer settles at once. A hidden→visible flip during a leave
     * cancels it — dropping the leaving class restarts the entry keyframes, whose end event then
     * settles the still-open window.
     * @protected
     */
    syncRevealMotion() {
        let me      = this,
            visible = me.visible;

        if (visible !== me.revealWasVisible) {
            me.revealWasVisible = visible;

            if (visible) {
                // A re-entry cancels an in-flight leave. When it brings a DIFFERENT item than the
                // one that was leaving, it is a retarget that passed through hidden — the incoming
                // content gets its entry, exactly as a retarget that never hid.
                let leaving  = me.revealLeaving,
                    retarget = leaving && me.revealShownItemId && me.revealedItem?.dockItemId !== me.revealShownItemId;

                me.cancelRevealLeave();
                retarget ? me.beginRevealSwap() : me.beginRevealMotion()
            } else if (me.mounted) {
                me.beginRevealLeave()
            } else {
                // No DOM to animate: hidden at once, and the next entry runs the entry rules.
                me.revealSwapGeneration = 0;
                me.finishRevealMotion()
            }
        }
    }

    /**
     * Teardown may interrupt the CSS animation without an `animationend`; settle the producer's
     * entry — or its leave — before the component lifecycle removes its remaining runtime state.
     */
    destroy() {
        this.cancelRevealLeave();
        this.finishRevealMotion();
        super.destroy()
    }

    /**
     * The reveal-slide settle: closes the motion-signal window a visible-state flip opened — or,
     * during a leave, lands the hidden class first and then closes it.
     * Local DOM-event serialization preserves the config-aware browser target id but omits
     * `AnimationEvent.animationName`. Root-target identity therefore owns settlement: an
     * overlay animation matches, while a hosted pane's bubbled animation keeps its child id and
     * cannot leave a signal it did not enter.
     * @param {Object} data
     */
    onMotionAnimationEnd(data) {
        let me = this;

        if (data?.target?.id === (me.vdom?.id || me.id)) {
            me.revealLeaving ? me.completeRevealLeave() : me.finishRevealMotion()
        }
    }

    /**
     * Moves REAL browser focus into the overlay (first focusable descendant — the pin control at
     * minimum, the hosted pane's focusables once mounted). The owning rail calls this when a
     * click-born reveal opens: focus-hold must be embodied, not a state label. Awaiting the
     * component update is required because a genuinely hidden overlay cannot accept focus until
     * the main thread has applied the visibility-class removal.
     * @returns {Promise<void>}
     */
    async focusReveal() {
        await this.promiseUpdate();

        if (this.visible && !this.isDestroyed) {
            this.focus(this.id, true)
        }
    }

    /**
     * Child instances exist only after the container created its items — the initial snapshot
     * application waits for that.
     */
    onConstructed() {
        super.onConstructed();
        this.syncSnapshot()
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetEdge(value, oldValue) {
        let me  = this,
            cls = me.cls || [];

        if (oldValue) {
            NeoArray.remove(cls, `neo-dashboard-dock-reveal-overlay-${oldValue}`)
        }

        NeoArray.add(cls, `neo-dashboard-dock-reveal-overlay-${value}`);

        me.cls = cls;
        me.isConstructed && me.syncSnapshot()
    }

    /**
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetRevealExtent(value, oldValue) {
        this.isConstructed && this.syncSnapshot()
    }

    /**
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetRevealState(value, oldValue) {
        let me = this;

        // A hidden→visible flip re-runs the reveal-slide keyframes; a visible→hidden cut cancels
        // CSS `animationend`. Reconcile synchronously so rapid re-entry starts from count zero.
        me.syncRevealMotion();

        me.isConstructed && me.syncSnapshot()
    }

    /**
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetRevealedItem(value, oldValue) {
        let me = this,
            // A retarget: the reveal follows a click on another item of the same rail while it is
            // open — visible before and after, a different item. Read before the motion sync moves
            // the visibility bookkeeping on.
            retarget = me.revealWasVisible && me.visible && value?.dockItemId !== oldValue?.dockItemId && !!oldValue;

        // `visible` requires an item, so item-only removal/re-addition crosses the same CSS
        // display boundary even when the machine state remains `revealed`.
        me.syncRevealMotion();
        retarget && me.beginRevealSwap();
        me.isConstructed && me.syncSnapshot()
    }

    /**
     * @summary A retarget re-runs the content's entry: the incoming header and pane emerge from
     * under the strip over the old ones while the root stays where it is.
     *
     * A CSS animation restarts only when its name changes, so two swap generations alternate —
     * one names a duplicate set of the entry keyframes, the other the entry's own — and the root
     * runs a held keyframe of the same duration so its own `animationend` settles the motion
     * window exactly as an entry's does. The generation clears when the overlay hides, so the next
     * entry runs the entry rules.
     * @protected
     */
    beginRevealSwap() {
        let me = this;

        me.revealSwapGeneration = me.revealSwapGeneration === 1 ? 2 : 1;
        me.beginRevealMotion()
    }

    /**
     * The pane-slot container the consuming workspace mounts the revealed pane into.
     * @returns {Neo.container.Base}
     */
    get paneSlot() {
        return this.items[1]
    }

    /**
     * @returns {Neo.button.Base}
     */
    get pinButton() {
        return this.items[0].getAction('pin')
    }

    /**
     * @returns {Neo.tab.header.Button}
     */
    get titleTab() {
        return this.items[0].items[0]
    }

    /**
     * Whether the current snapshot renders visibly.
     * @returns {Boolean}
     */
    get visible() {
        return RevealOverlay.VISIBLE_STATES.has(this.revealState) && !!this.revealedItem
    }

    /**
     * Keeps an inside pointer interaction inside the existing focus-hold contract even when its
     * target (prose, whitespace, a plain container) cannot receive focus. The root is tabindex -1,
     * so this programmatic pointer focus creates no sequential tab stop; `preventScroll` preserves
     * the reading position. This handler rides the global mousedown path, which leaves native text
     * selection untouched.
     * @param {Object} data
     * @protected
     */
    onMouseDown(data) {
        this.focus(this.id, false, true, 'pointer')
    }

    /**
     * `manager.Focus` containment hook: fires only when focus genuinely ENTERS this component's
     * subtree — internal focus movement never re-triggers it, which is exactly the containment
     * guard the dismiss contract needs.
     * @param {Object} data
     * @protected
     */
    onFocusEnter(data) {
        super.onFocusEnter(data);
        this.fire('revealFocusEnter', {overlay: this})
    }

    /**
     * `manager.Focus` containment hook: fires only when focus genuinely LEAVES the subtree —
     * moving focus between the programmatically focusable root, pin control, and hosted pane stays
     * silent. Inside mousedown refocuses the root before the focus manager's leave window settles;
     * outside click and keyboard tab-out do not, so their genuine subtree leave still dismisses.
     * @param {Object} data
     * @protected
     */
    onFocusLeave(data) {
        super.onFocusLeave(data);
        this.fire('revealFocusLeave', {overlay: this})
    }

    /**
     * @param {Object} data
     * @protected
     */
    onKeyDown(data={}) {
        if (data.key === 'Escape') {
            this.fire('revealEscape', {overlay: this})
        }
    }

    /**
     * Requests the pin escape from the owning rail. Policy is honoured upstream; the disabled
     * rendering here is the honest affordance mirror, not the enforcement point.
     * @param {Object} data The pin button click event data.
     * @protected
     */
    onPinClick(data) {
        let item = this.revealedItem;

        if (item) {
            this.fire('revealPinRequested', {itemId: item.dockItemId, overlay: this})
        }
    }

    /**
     * @param {Object} data
     * @protected
     */
    onPointerEnter(data) {
        this.fire('revealPointerEnter', {overlay: this})
    }

    /**
     * @param {Object} data
     * @protected
     */
    onPointerLeave(data) {
        this.fire('revealPointerLeave', {overlay: this})
    }

    /**
     * Applies the current snapshot to the composed children in place: visibility cls,
     * free-dimension style, title text and pin policy — the child instances persist across
     * snapshots (object permanence at the overlay level too).
     * @protected
     */
    syncSnapshot() {
        let me         = this,
            edge       = me.edge,
            isVertical = edge === 'left' || edge === 'right',
            fraction   = Number.isFinite(me.revealExtent)
                ? Math.max(me.revealExtent, me.defaultRevealFraction)
                : me.defaultRevealFraction,
            item       = me.revealedItem,
            pct        = `${Math.round(fraction * 10000) / 100}%`,
            cls        = me.cls || [],
            leaving    = me.revealLeaving;

        // A leaving overlay is not hidden yet: the exit keyframes need its DOM until the root's
        // `animationend` lands the hidden class (see `beginRevealLeave`).
        NeoArray[me.visible || leaving ? 'remove' : 'add'](cls, 'neo-dashboard-dock-reveal-overlay-hidden');
        NeoArray[leaving ? 'add' : 'remove'](cls, 'neo-dashboard-dock-reveal-overlay-leaving');

        // The swap generation is stamped from the count alone. It survives a leave — a leave may be
        // cancelled by a retarget, and the next swap has to alternate against the class that is
        // still on the node — and resets only when a hide completes (see `completeRevealLeave` and
        // the no-DOM hide in `syncRevealMotion`), so the next entry runs the entry rules.
        if (me.visible) {
            me.revealShownItemId = item?.dockItemId ?? null
        }

        NeoArray[me.revealSwapGeneration === 1 ? 'add' : 'remove'](cls, 'neo-dashboard-dock-reveal-overlay-swap-1');
        NeoArray[me.revealSwapGeneration === 2 ? 'add' : 'remove'](cls, 'neo-dashboard-dock-reveal-overlay-swap-2');

        me.set({
            cls,
            style: {
                ...(me.style || {}),
                height: isVertical ? null : pct,
                width : isVertical ? pct  : null
            }
        });

        me.titleTab.text = item ? (item.title || item.dockItemId) : '';

        me.pinButton.set({
            disabled: item ? item.restorable === false : true
        })
    }
}

export default Neo.setupClass(RevealOverlay);
