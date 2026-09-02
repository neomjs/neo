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
     * Reconciles the reveal producer with the overlay's computed visibility. Both state and item
     * changes can cross this boundary because `visible` requires a visible state AND an item.
     * @protected
     */
    syncRevealMotion() {
        let me      = this,
            visible = me.visible;

        if (visible !== me.revealWasVisible) {
            me.revealWasVisible = visible;
            me[visible ? 'beginRevealMotion' : 'finishRevealMotion']()
        }
    }

    /**
     * Teardown may interrupt the CSS animation without an `animationend`; settle the producer's
     * entry before the component lifecycle removes its remaining runtime state.
     */
    destroy() {
        this.finishRevealMotion();
        super.destroy()
    }

    /**
     * The reveal-slide settle: closes the motion-signal window a visible-state flip opened.
     * Local DOM-event serialization preserves the config-aware browser target id but omits
     * `AnimationEvent.animationName`. Root-target identity therefore owns settlement: an
     * overlay animation matches, while a hosted pane's bubbled animation keeps its child id and
     * cannot leave a signal it did not enter.
     * @param {Object} data
     */
    onMotionAnimationEnd(data) {
        if (data?.target?.id === (this.vdom?.id || this.id)) {
            this.finishRevealMotion()
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
        let me = this;

        // `visible` requires an item, so item-only removal/re-addition crosses the same CSS
        // display boundary even when the machine state remains `revealed`.
        me.syncRevealMotion();
        me.isConstructed && me.syncSnapshot()
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
        return this.items[0].getActionItem('pin')
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
            cls        = me.cls || [];

        NeoArray[me.visible ? 'remove' : 'add'](cls, 'neo-dashboard-dock-reveal-overlay-hidden');

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
