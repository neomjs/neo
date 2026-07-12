import Button from '../../button/Base.mjs';
import Plugin from '../../plugin/Base.mjs';

/**
 * @summary The runtime half of the dock tab-overflow affordance for projected dock tab headers.
 *
 * The pure decision lives in {@link Neo.dashboard.DockLayoutAdapter.computeTabOverflow} — a projection
 * concern, nothing persists. This plugin is the RUNTIME complement: it measures the live header extents
 * the pure core can only be handed, applies its verdict to the header buttons, and surfaces the hidden
 * remainder through a single overflow control whose selection routes back through the tab.Container's
 * EXISTING `activeIndex` path — zero new operations, zero new persisted state (the binding projection
 * constraint). `items` order and `activeItemId` already capture the state; overflow is projection only.
 *
 * It attaches to the projected tab header toolbar (`Neo.tab.header.Toolbar`) — it is NOT a dock-specific
 * `tab.Container` fork (the model contract's Split/Tab Adapter Boundary). The overflow control is kept
 * OUT of the toolbar's item collection on purpose: `tab.Container` uses `getTabBar().items.length` as its
 * tab-insertion index (Container.mjs), so a control living among the tab buttons would corrupt insertion.
 *
 * Natural-width discipline: overflowing buttons hide via a `display:none` cls, so re-measuring them would
 * collapse their width to 0 and corrupt the next split. The plugin therefore measures NATURAL widths once
 * while every button is visible (on mount, and whenever the tab set changes) and caches them; a plain
 * resize only re-reads the always-visible strip extent and recomputes against that cache.
 *
 * @class Neo.dashboard.plugin.TabOverflow
 * @extends Neo.plugin.Base
 */
class TabOverflow extends Plugin {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.plugin.TabOverflow'
         * @protected
         */
        className: 'Neo.dashboard.plugin.TabOverflow',
        /**
         * @member {String} ntype='plugin-dock-tab-overflow'
         * @protected
         */
        ntype: 'plugin-dock-tab-overflow',
        /**
         * Width (px) the overflow control reserves from the header extent — handed to the pure core as
         * `controlWidth`, which reserves it ONLY when something overflows (a control that exists only when
         * needed must not consume width while everything fits).
         * @member {Number} controlWidth=40
         */
        controlWidth: 40
    }

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
     * Natural (un-hidden) header widths keyed by tab-button id — see the class note on natural-width
     * discipline. `null` until the first capture.
     * @member {Object|null} naturalWidths=null
     */
    naturalWidths = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.onResize = this.onResize.bind(this)
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
     * The header buttons that participate in overflow: the toolbar's items (the control is never among
     * them — see the class note).
     * @returns {Neo.tab.header.Button[]}
     */
    getTabButtons() {
        return this.owner.items || []
    }

    /**
     * Owner-mounted lifecycle hook: wire the resize listener and run the first (width-capturing) pass.
     * @override
     */
    onOwnerMounted() {
        let me      = this,
            {owner} = me;

        owner.addDomListeners([{resize: me.onResize, scope: me}]);
        me.project(true)
    }

    /**
     * Resize handler — an extent-only change, so recompute against the cached natural widths.
     * @param {Object} data
     */
    onResize(data) {
        this.project(false)
    }

    /**
     * Measures (natural widths as needed, strip extent always) and applies the visible/hidden split.
     * @param {Boolean} recapture  Re-read natural widths (mount, or the tab set changed).
     */
    async project(recapture) {
        let me      = this,
            {owner} = me,
            buttons = me.getTabButtons();

        if (me.measuring || !owner.mounted || buttons.length < 1) {
            return
        }

        me.measuring = true;

        // 1. Natural widths — measured once while every button is visible, then cached.
        if (recapture || !me.naturalWidths) {
            let rects = await owner.getDomRect(buttons.map(button => button.id));

            me.naturalWidths = {};
            buttons.forEach((button, index) => {
                me.naturalWidths[button.id] = Math.ceil(rects[index]?.width || 0)
            })
        }

        // 2. The strip extent — the toolbar itself never hides, so it is always measurable.
        let extentRect   = await owner.getDomRect(),
            extent       = Math.floor(extentRect?.width || 0),
            tabContainer = me.getTabContainer(),
            activeButton = buttons[tabContainer?.activeIndex] || null,
            items        = buttons.map(button => ({id: button.id, headerWidth: me.naturalWidths[button.id]})),

            // 3. The pure decision: active-never-hidden packing, overflow-only control reservation.
            //    Referenced via the Neo namespace (not imported) to keep the adapter→plugin dependency
            //    one-directional — the adapter imports this plugin for the projection, so importing the
            //    adapter back would be a cycle.
            {hidden} = Neo.dashboard.DockLayoutAdapter.computeTabOverflow({
                activeItemId: activeButton?.id,
                controlWidth: me.controlWidth,
                extent,
                items
            });

        me.applySplit(hidden, buttons, tabContainer);
        me.measuring = false
    }

    /**
     * Applies the computed hidden set: hides the overflowing header buttons and reflects the remainder
     * through the overflow control.
     * @param {String[]} hidden  Overflowing button ids, in header order.
     * @param {Neo.tab.header.Button[]} buttons
     * @param {Neo.tab.Container} tabContainer
     */
    applySplit(hidden, buttons, tabContainer) {
        let me         = this,
            hiddenSet  = new Set(hidden),
            hiddenMeta = [];

        buttons.forEach((button, index) => {
            let isHidden = hiddenSet.has(button.id);

            // Neo's built-in `hidden` (removeDom) rather than a cls needing an external stylesheet rule —
            // the natural-width cache (captured while every button was visible) survives the DOM removal,
            // so a later widen re-measures nothing and simply flips `hidden` back.
            button.hidden = isHidden;

            if (isHidden) {
                hiddenMeta.push({iconCls: button.iconCls, index, text: button.text})
            }
        });

        me.syncControl(hiddenMeta, tabContainer)
    }

    /**
     * Creates / updates / tears down the single overflow control. A menu selection sets the
     * tab.Container's `activeIndex` (the ordinary activation path); the follow-up measure pass then
     * surfaces the now-active tab by construction (active-never-hidden), so the selected tab is never
     * left in the menu.
     *
     * The control is a `button.Base` with a `menu` config — button.Base builds the dropdown `menu.List`
     * itself, so no menu is hand-assembled here. It mounts as a `floating` component self-positioned via
     * `align` against the header toolbar (the same mechanism `button.Base#afterSetMenu` uses for its own
     * menu), which keeps it out of the toolbar's item collection so tab insertion stays correct.
     * @param {Object[]} hiddenMeta  `{text, iconCls, index}` per hidden tab, in header order.
     * @param {Neo.tab.Container} tabContainer
     */
    syncControl(hiddenMeta, tabContainer) {
        let me = this;

        if (hiddenMeta.length < 1) {
            me.control?.destroy(true);
            me.control = null;
            return
        }

        let menuItems = hiddenMeta.map(meta => ({
            handler: () => {tabContainer.activeIndex = meta.index},
            iconCls: meta.iconCls,
            text   : meta.text
        }));

        if (me.control) {
            me.control.menu = menuItems
        } else {
            me.control = Neo.create({
                // Floating component (per button.Base#afterSetMenu): mounts and self-positions via `align`
                // against a target — a plain `parentId` never renders. Anchored to the header toolbar's
                // trailing top-right, in the `controlWidth` gap the pure core reserves; stays out of the
                // toolbar's item collection (tab-insertion safe). Created `hidden`, then revealed below —
                // Neo mounts a floating component on the hidden→false transition (the menu's show path,
                // button.Base#toggleMenu), so one created already-visible never triggers the mount.
                module         : Button,
                align          : {edgeAlign: 'tr-tr', target: me.owner.id},
                appName        : me.owner.appName,
                cls            : ['neo-dock-tab-overflow-control'],
                floating       : true,
                hidden         : true,
                iconCls        : 'fa fa-ellipsis',
                menu           : menuItems,
                parentComponent: me.owner,
                windowId       : me.owner.windowId
            });

            me.control.hidden = false
        }
    }

    /**
     * @param {...*} args
     * @override
     */
    destroy(...args) {
        this.control?.destroy(true);
        this.control = null;
        super.destroy(...args)
    }
}

export default Neo.setupClass(TabOverflow);
