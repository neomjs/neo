import Component from '../component/Base.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * @summary Presentation host for the transient reveal of an auto-hidden dock item — an
 * edge-anchored overlay that renders OVER the committed projection, never re-layouts it.
 *
 * The overlay is pure per-window runtime state: it renders whatever reveal snapshot its owning
 * rail pushes (via `DockRail.bindRevealOverlay()`) and translates DOM reality back into semantic
 * INTENTS the rail's state machine consumes — `revealPointerEnter/Leave`, `revealFocusEnter/Leave`,
 * `revealEscape`, `revealPinRequested`. It decides nothing itself: timing, focus-hold and policy
 * all live upstream. It has no write path to any document.
 *
 * Sizing follows the auto-hide contract: the free dimension (width for left/right rails, height
 * for top/bottom) uses the extent the item's owning split last committed when one exists
 * (`revealExtent`, resolved by the rail), else the workspace-configurable `defaultRevealFraction`.
 * Left/right reveals span full height; top/bottom span full width. The overlay stays visible
 * through the dismiss grace window (`dismiss-pending`) — pointer wobble must not flicker it.
 *
 * Pane hosting contract: the consuming workspace mounts the revealed pane into the slot node
 * (`<overlay id>__pane-slot`) and clears it on dismissal — pane resolution stays the workspace's
 * concern (same seam as the adapter's `resolveComponentRef`), keeping this overlay pane-blind.
 *
 * The pin control persists the reveal: it requests `setItemPinned(true)` from the rail (executor
 * path — no parallel mutation grammar) and renders disabled when the item's policy forbids
 * pinning (`restorable: false`) — the one honest non-pinnable affordance state.
 *
 * @class Neo.dashboard.DockRevealOverlay
 * @extends Neo.component.Base
 * @see Neo.dashboard.DockRail
 * @see Neo.dashboard.DockRevealStateMachine
 * @see learn/agentos/HarnessDockZoneModel.md
 */
class DockRevealOverlay extends Component {
    /**
     * Reveal states in which the overlay renders visibly — `dismiss-pending` included: the grace
     * window is part of the shown lifecycle.
     * @member {Set<String>} VISIBLE_STATES
     * @static
     */
    static VISIBLE_STATES = new Set(['dismiss-pending', 'revealed', 'revealed-focused'])

    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockRevealOverlay'
         * @protected
         */
        className: 'Neo.dashboard.DockRevealOverlay',
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
         * Workspace-configurable fallback for the free dimension when the document carries no
         * committed extent for the item (fraction of the workspace extent).
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
        revealedItem_: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click     : me.onPinClick, delegate: '.neo-dashboard-dock-reveal-pin', scope: me},
            {focusin   : me.onFocusIn,                                              scope: me},
            {focusout  : me.onFocusOut,                                             scope: me},
            {keydown   : me.onKeyDown,                                              scope: me},
            {mouseenter: me.onPointerEnter,                                         scope: me},
            {mouseleave: me.onPointerLeave,                                         scope: me}
        ])
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
        me.syncVdom()
    }

    /**
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetRevealExtent(value, oldValue) {
        this.syncVdom()
    }

    /**
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetRevealState(value, oldValue) {
        this.syncVdom()
    }

    /**
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetRevealedItem(value, oldValue) {
        this.syncVdom()
    }

    /**
     * Whether the current snapshot renders visibly.
     * @returns {Boolean}
     */
    get visible() {
        return DockRevealOverlay.VISIBLE_STATES.has(this.revealState) && !!this.revealedItem
    }

    /**
     * @param {Object} data
     * @protected
     */
    onFocusIn(data) {
        this.fire('revealFocusEnter', {overlay: this})
    }

    /**
     * @param {Object} data
     * @protected
     */
    onFocusOut(data) {
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
     * @param {Object} data
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
     * Rebuilds the overlay vdom from the current snapshot: visibility cls, free-dimension style,
     * header (title + pin) and the pane slot the consuming workspace mounts into.
     * @protected
     */
    syncVdom() {
        let me         = this,
            edge       = me.edge,
            isVertical = edge === 'left' || edge === 'right',
            item       = me.revealedItem,
            fraction   = Number.isFinite(me.revealExtent) ? me.revealExtent : me.defaultRevealFraction,
            pct        = `${Math.round(fraction * 10000) / 100}%`,
            pinnable   = item?.restorable !== false,
            vdom       = me.vdom,
            cls        = me.cls || [];

        NeoArray[me.visible ? 'remove' : 'add'](cls, 'neo-dashboard-dock-reveal-overlay-hidden');
        me.cls = cls;

        me.style = {
            ...(me.style || {}),
            height: isVertical ? null : pct,
            width : isVertical ? pct  : null
        };

        vdom.cn = !item ? [] : [
            {
                cls: ['neo-dashboard-dock-reveal-header'],
                cn : [
                    {tag: 'span', cls: ['neo-dashboard-dock-reveal-title'], text: item.title || item.dockItemId},
                    {
                        tag     : 'button',
                        cls     : ['neo-dashboard-dock-reveal-pin', !pinnable && 'neo-dashboard-dock-reveal-pin-disabled'].filter(Boolean),
                        data    : {dockItemId: item.dockItemId},
                        disabled: pinnable ? null : true,
                        text    : 'Pin'
                    }
                ]
            },
            {
                cls: ['neo-dashboard-dock-reveal-pane-slot'],
                id : `${me.id}__pane-slot`
            }
        ];

        me.update()
    }
}

export default Neo.setupClass(DockRevealOverlay);
