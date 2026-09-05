import BaseTabContainer from '../../../tab/Container.mjs';

const split = value => (value || '').split(',').filter(Boolean);

/**
 * @summary The tab container a dock tabs node projects into: a generic {@link Neo.tab.Container} that
 * additionally binds the committed lock state of its items and presents it on its own chrome.
 * @description The workspace publishes header truth on its state provider; the projection ties this
 * container's {@link #dockLockedItemIds} to that truth through `bind`, so the provider's own binding
 * machinery re-evaluates it exactly when one of this node's items changes its lock or the node's items
 * change. Presentation — the pane's `inert` and lock class, the tab button's drag token, a pane's
 * `dockLock()` delegation, each with exact-restore memory — stays with the workspace's
 * {@link Neo.dashboard.dock.projection.HeaderActionPolicy}, which this container calls for exactly the
 * items whose lock changed. The generic tab container stays unaware of dock documents.
 * @class Neo.dashboard.dock.interaction.TabContainer
 * @extends Neo.tab.Container
 */
class TabContainer extends BaseTabContainer {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.interaction.TabContainer'
         * @protected
         */
        className: 'Neo.dashboard.dock.interaction.TabContainer',
        // No own `ntype`: the inherited `tab-container` keeps the ui class family
        // (`neo-tab-container-inline`) the dock's stylesheets address, and registers nothing new.
        /**
         * The ids of this node's items that are committed locked, comma-joined — bound by the
         * projection to the workspace's published header truth.
         * @member {String} dockLockedItemIds_=''
         * @reactive
         */
        dockLockedItemIds_: '',
        /**
         * The id of the workspace whose header-action policy presents a lock on this node's chrome.
         * @member {String|null} dockWorkspaceId=null
         */
        dockWorkspaceId: null
    }

    /**
     * Presents the items whose lock changed, and only those. An item that left this node keeps its
     * presentation: its lock did not change, another node now presents it.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDockLockedItemIds(value, oldValue) {
        let me = this;

        // Buttons and cards exist only once construction completed; onConstructed presents then.
        if (!me.isConstructed) return;

        const next     = new Set(split(value)),
              prev     = new Set(split(oldValue)),
              provider = me.getStateProvider();

        next.forEach(itemId => !prev.has(itemId) && me.presentDockLock(itemId, true));
        prev.forEach(itemId => {
            if (!next.has(itemId) && provider?.getData(`dock.items.${itemId}.locked`) !== true) {
                me.presentDockLock(itemId, false)
            }
        })
    }

    /**
     * The chrome exists now: present the locks this node was born with.
     */
    onConstructed() {
        super.onConstructed();
        split(this.dockLockedItemIds).forEach(itemId => this.presentDockLock(itemId, true))
    }

    /**
     * Presents one item's lock on its tab button and its pane through the workspace's policy. The
     * reconciler calls it after it places a pane into this node, so a pane that arrives later than
     * its header carries the presentation its item already had.
     * @param {String} itemId
     * @param {Boolean} [locked] Defaults to this node's bound truth for the item
     */
    presentDockLock(itemId, locked=split(this.dockLockedItemIds).includes(itemId)) {
        let me     = this,
            policy = Neo.get(me.dockWorkspaceId)?.dockHeaderActionPolicy;

        if (!policy) return;

        const index = (me.getTabBar()?.sortZoneConfig?.dockItemIds || []).indexOf(itemId);

        policy.syncLockItemPresentation({
            button: me.getTabButtons().find(button => button.dockItemId === itemId) || null,
            locked,
            pane  : index > -1 ? me.getCard(index) : null
        })
    }
}

export default Neo.setupClass(TabContainer);
