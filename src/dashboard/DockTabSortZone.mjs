import TabHeaderSortZone from '../draggable/tab/header/toolbar/SortZone.mjs';

/**
 * @class Neo.dashboard.DockTabSortZone
 * @extends Neo.draggable.tab.header.toolbar.SortZone
 *
 * @summary Dock-aware tab-header SortZone — routes a cross-zone tab drop to a semantic `moveItem`.
 *
 * The base tab-header SortZone reorders tab buttons WITHIN their own toolbar (the within-container
 * gesture). This subclass adds the *cross-zone* half without a parallel drag system: on every drop it
 * reports the release point + the dragged item's dock id to the owner-provided {@link #onDockCrossZoneDrop}
 * handler. The handler hit-tests which dock zone is under the pointer — the SAME zone is a no-op (the
 * within-toolbar reorder already committed), a DIFFERENT zone commits a `moveItem` through the dock model.
 *
 * It reuses the existing drag lifecycle end-to-end: the base SortZone owns the proxy, the sort math, and
 * the drag data ({@link Neo.draggable.container.SortZone#onDragMove} threads `clientX`/`clientY`); this
 * class only reads the outcome and forwards it. No popup / window-detach path is involved
 * (`enableProxyToPopup` stays at its `false` default).
 */
class DockTabSortZone extends TabHeaderSortZone {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockTabSortZone'
         * @protected
         */
        className: 'Neo.dashboard.DockTabSortZone',
        /**
         * @member {String} ntype='dock-tab-sortzone'
         * @protected
         */
        ntype: 'dock-tab-sortzone',
        /**
         * The dock item ids this toolbar projects, in tab-button order. `startIndex` indexes into this.
         * @member {String[]|null} dockItemIds=null
         */
        dockItemIds: null,
        /**
         * The dock-zone (tabs node) id this toolbar renders — the source of a cross-zone move.
         * @member {String|null} dockSourceNodeId=null
         */
        dockSourceNodeId: null
    }

    /**
     * Extends the base drag-end: fires a `dockCrossZoneDrop` event on the owner tab.Container (`owner.up()`)
     * carrying the release point + dragged item id. The adapter wires the listener for it — the same
     * tab.Container node whose `moveTo` listener handles the within-container reorder — and its closure holds
     * the dock reducer (the reliable seam: a closure captured at projection time, not a cloned config nor a
     * component-tree walk). Fires BEFORE `super`: the base drag-end resets `startIndex` and its within-reorder
     * commit can trigger a deferred re-projection that destroys this tab container, so firing after would
     * land on a dead component.
     * @param {Object} data
     */
    async processDragEnd(data) {
        let me     = this,
            itemId = me.dockItemIds?.[me.startIndex],
            // Resolve the tab.Container + fire BEFORE super: the base drag-end tears down the owner linkage
            // AND its within-reorder commit can trigger a deferred re-projection that destroys this tab
            // container — firing after super would land on a dead component. Same node whose `moveTo`
            // listener the adapter wires.
            tabContainer = me.owner?.up?.(),
            {clientX, clientY} = data || {};

        if (itemId && tabContainer && Neo.isNumber(clientX) && Neo.isNumber(clientY)) {
            tabContainer.fire('dockCrossZoneDrop', {clientX, clientY, itemId, sourceNodeId: me.dockSourceNodeId})
        }

        await super.processDragEnd(data)
    }
}

export default Neo.setupClass(DockTabSortZone);
