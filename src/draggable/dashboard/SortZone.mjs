import NeoArray from '../../util/Array.mjs';
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
        dragHandleSelector: '.neo-draggable',
        /**
         * Add extra CSS selectors to the drag proxy root.
         * @member {String[]} dragProxyExtraCls=[]
         */
        dragProxyExtraCls: []
    }

    /**
     * @returns {Object}
     */
    getDragProxyConfig() {
        const config = super.getDragProxyConfig();

        config.cls = config.cls.filter(cls => !cls.includes('neo-viewport'));
        NeoArray.add(config.cls, this.dragProxyExtraCls);

        return config
    }
}

export default Neo.setupClass(DashboardSortZone);
