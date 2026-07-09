import Component              from '../component/Base.mjs';
import DockRevealStateMachine from './DockRevealStateMachine.mjs';
import DockZoneModel          from './DockZoneModel.mjs';
import NeoArray               from '../util/Array.mjs';

/**
 * @summary Runtime edge-rail affordance rendering committed auto-hidden items as labeled rail tabs,
 * converting a tab click into a `setItemAutoHidden(false)` operation through the dock-zone reducer.
 *
 * The rail is pure render projection (per-window, derived, never persisted): WHICH items rail — and on
 * which edge — is committed `dockZone.v1` truth the adapter derives
 * (`DockLayoutAdapter.collectAutoHiddenItems()`). Tabs render from plain `railItems` metadata rather
 * than from the pane components themselves, so the pane never learns it is railed (pane-blindness) and
 * a destroyed or unresolvable pane cannot break its recall affordance.
 *
 * Interaction contract: a tab click opens a TRANSIENT reveal (focus moves into the overlay); re-click,
 * `Escape`, outside-click, or focus/pointer leaving dismiss it — reveal state is runtime-only and no
 * operation descriptor exists for dismissal. Hover-reveal is a workspace opt-in (`autoHideRevealOnHover`;
 * dwell-gated, never steals focus — hover reveals are an accessibility hazard by default). The PERSIST
 * path is the overlay's pin control: `setItemPinned(true)` committed through the owning reducer callback
 * (`applyDockZoneOperation`) or a local `DockZoneModel.applyOperation()` — never a parallel mutation
 * path; the model clears `autoHidden` itself.
 *
 * Reveal is policy-free: even a `pinnable: false` item (whose PIN the model would reject) must stay
 * reachable through reveal — anything else is item loss. The policy projection (`restorable`) therefore
 * gates the overlay's pin control, not the tab.
 *
 * The reveal/dismiss timing brain lives in {@link DockRevealStateMachine} (documented state table);
 * this component owns DOM wiring, overlay binding and the executor commit path.
 *
 * @class Neo.dashboard.DockRail
 * @extends Neo.component.Base
 * @see Neo.dashboard.DockLayoutAdapter
 * @see Neo.dashboard.DockSplitter
 * @see Neo.dashboard.DockZoneModel
 * @see learn/agentos/HarnessDockZoneModel.md
 */
class DockRail extends Component {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockRail'
         * @protected
         */
        className: 'Neo.dashboard.DockRail',
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
         * Callback for an owning Harness/dashboard reducer. Receives `(descriptor, rail)`.
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
         * Current committed dock-zone document. Used when no reducer callback is supplied.
         * @member {Object|null} dockZoneDocument_=null
         * @reactive
         */
        dockZoneDocument_: null,
        /**
         * Owning workspace edge (`top`, `right`, `bottom`, `left`). Drives the per-edge cls hook;
         * tab flow direction and writing-mode are CSS concerns keyed off that hook.
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
         * Rail tab metadata, in document order: `[{dockEdge, dockItemId, restorable, title}]`.
         * Projection input from `DockLayoutAdapter.createRailTab()` — model-derived, never persisted.
         * @member {Object[]|null} railItems_=null
         * @reactive
         */
        railItems_: null
    }

    /**
     * The reveal/dismiss timing brain. Runtime-only; created per instance, torn down in `destroy()`.
     * @member {DockRevealStateMachine|null} revealMachine=null
     * @protected
     */
    revealMachine = null
    /**
     * The overlay bound via {@link Neo.dashboard.DockRail#bindRevealOverlay}, when one exists.
     * @member {Neo.dashboard.DockRevealOverlay|null} revealOverlay=null
     * @protected
     */
    revealOverlay = null
    /**
     * Maps projected tab node ids to dock item ids for delegate-click resolution.
     * Runtime-only lookup state, rebuilt on every `railItems` pass — id-based resolution avoids
     * parsing dataset payloads out of serialized event paths.
     * @member {Object} tabIdToItemId={}
     * @protected
     */
    tabIdToItemId = {}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click     : me.onRailClick,   delegate: '.neo-dashboard-dock-rail-tab', scope: me},
            {mouseenter: me.onTabHoverIn,  delegate: '.neo-dashboard-dock-rail-tab', scope: me},
            {mouseleave: me.onTabHoverOut, delegate: '.neo-dashboard-dock-rail-tab', scope: me}
        ]);

        me.revealMachine = new DockRevealStateMachine({
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
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetEdge(value, oldValue) {
        let me   = this,
            edge = me.getValidatedEdge(value),
            cls  = me.cls || [];

        if (oldValue) {
            NeoArray.remove(cls, `neo-dashboard-dock-edge-rail-${me.getValidatedEdge(oldValue)}`)
        }

        NeoArray.add(cls, `neo-dashboard-dock-edge-rail-${edge}`);

        me.cls = cls;

        me.data = {
            ...(me.data || {}),
            dockEdge: edge
        }
    }

    /**
     * Rebuilds the tab vdom in place — the component instance and its root node stay stable across
     * model flips (object permanence at the affordance level); only the tab children re-render.
     *
     * Tabs are never disabled: reveal is policy-free (a `pinnable: false` item must stay reachable),
     * so the `restorable` projection gates the overlay's pin control instead. Items that left the
     * rail fail-close any reveal of them (`itemCleared`).
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetRailItems(value, oldValue) {
        let me   = this,
            edge = me.getValidatedEdge(me.edge),
            vdom = me.vdom;

        me.tabIdToItemId = {};

        vdom.cn = (value || []).map((railItem, index) => {
            let tabId = `${me.id}__tab-${index}`;

            me.tabIdToItemId[tabId] = railItem.dockItemId;

            return {
                tag : 'button',
                cls : ['neo-dashboard-dock-rail-tab'],
                data: {dockEdge: railItem.dockEdge || edge, dockItemId: railItem.dockItemId, dockRailTab: true},
                id  : tabId,
                text: railItem.title || railItem.dockItemId
            }
        });

        (oldValue || []).forEach(railItem => {
            if (!(value || []).some(item => item.dockItemId === railItem.dockItemId)) {
                me.revealMachine?.itemCleared(railItem.dockItemId)
            }
        });

        me.update();
        me.syncRevealOverlay()
    }

    /**
     * Binds a reveal overlay to this rail: overlay intents (pointer, focus, escape, pin) feed the
     * state machine, and machine state pushes back into the overlay — the full focus-hold loop
     * becomes testable without a live workspace.
     * @param {Neo.dashboard.DockRevealOverlay} overlay
     * @returns {Neo.dashboard.DockRevealOverlay}
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
     * a local `DockZoneModel.applyOperation()` — identical commit contract to
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
            result = DockZoneModel.applyOperation(me.dockZoneDocument, descriptor)
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
     * Tears down the reveal machinery before component destruction — pending dwell/grace timers
     * must never outlive the rail.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.revealMachine?.destroy();
        me.revealMachine = null;
        me.revealOverlay = null;

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
     * Delegate click handler for rail tabs: resolves the clicked tab to its dock item and feeds the
     * reveal machine — click opens a focused transient reveal, re-click dismisses. No operation is
     * committed here; the persist path is the overlay pin
     * ({@link Neo.dashboard.DockRail#onRevealPinRequested}).
     * @param {Object} data
     * @returns {{revealedItemId:(String|null), state:String}|null} Machine snapshot after the input.
     */
    onRailClick(data={}) {
        let me     = this,
            itemId = me.tabIdToItemId[data.currentTarget];

        if (!itemId) {
            return null
        }

        me.revealMachine.tabClick(itemId);

        return {revealedItemId: me.revealMachine.revealedItemId, state: me.revealMachine.state}
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
     * Machine change hook: fires `dockRailRevealChange` and pushes the snapshot into a bound
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

        me.syncRevealOverlay()
    }

    /**
     * @param {Object} data
     * @protected
     */
    onTabHoverIn(data={}) {
        let itemId = this.tabIdToItemId[data.currentTarget];

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
     * Resolves the overlay's free-dimension extent for an item: the share its owning split last
     * committed (still in the document), else `null` — the overlay then falls back to its
     * workspace-configurable default fraction.
     * @param {String} itemId
     * @returns {Number|null}
     * @protected
     */
    resolveRevealExtent(itemId) {
        let document = this.dockZoneDocument;

        return document ? Neo.dashboard.DockLayoutAdapter.resolveRevealExtent(document, itemId) : null
    }

    /**
     * Pushes the current reveal snapshot into the bound overlay, when one exists.
     * @protected
     */
    syncRevealOverlay() {
        let me      = this,
            overlay = me.revealOverlay,
            machine = me.revealMachine,
            railItem;

        if (!overlay || !machine) {
            return
        }

        railItem = (me.railItems || []).find(item => item.dockItemId === machine.revealedItemId) || null;

        overlay.set({
            edge        : me.getValidatedEdge(me.edge),
            revealExtent: railItem ? me.resolveRevealExtent(railItem.dockItemId) : null,
            revealState : machine.state,
            revealedItem: railItem
        })
    }
}

export default Neo.setupClass(DockRail);
