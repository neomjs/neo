import SortZone from '../container/SortZone.mjs';

/**
 * @class Neo.draggable.dashboard.SortZone
 * @extends Neo.draggable.container.SortZone
 */
class DashboardSortZone extends SortZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.dashboard.SortZone'
         * @protected
         */
        className: 'Neo.draggable.dashboard.SortZone',
        /**
         * @member {String} ntype='dashboard-sortzone'
         * @protected
         */
        ntype: 'dashboard-sortzone',
        /**
         * The CSS selector for the drag handle.
         * @member {String} dragHandleSelector='.neo-draggable'
         */
        dragHandleSelector: '.neo-draggable'
    }

    /**
     * @returns {Object}
     */
    getDragProxyConfig() {
        const config = super.getDragProxyConfig();

        config.cls = config.cls.filter(cls => !cls.includes('viewport'));

        return config
    }

    /**
     * The base class moveTo() calls owner.moveTo(). While the owner (Viewport)
     * has this method, it expects indices based on its full items array.
     * The SortZone provides indices based on the filtered sortableItems.
     * This override translates the sortable-space indices to the owner-space
     * indices before moving the item.
     * @param {Number} fromIndex The start index within the sortable items
     * @param {Number} toIndex The end index within the sortable items
     */
    moveTo(fromIndex, toIndex) {
        const ownerFromIndex = this.owner.items.indexOf(this.sortableItems[fromIndex]);
        const ownerToIndex   = this.owner.items.indexOf(this.sortableItems[toIndex]);

        this.owner.moveTo(ownerFromIndex, ownerToIndex);
    }
}

export default Neo.setupClass(DashboardSortZone);
