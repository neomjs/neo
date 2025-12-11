import BaseContainer from '../container/Base.mjs';

/**
 * @class Neo.dashboard.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.Container'
         * @protected
         */
        className: 'Neo.dashboard.Container',
        /**
         * @member {String} ntype='dashboard'
         * @protected
         */
        ntype: 'dashboard',
        /**
         * @member {String[]} baseCls=['neo-dashboard','neo-container']
         * @protected
         */
        baseCls: ['neo-dashboard', 'neo-container'],
        /**
         * Add extra CSS selectors to the drag proxy root.
         * @member {String[]} dragProxyExtraCls=[]
         */
        dragProxyExtraCls: [],
        /**
         * @member {Boolean} sortable=true
         * @reactive
         */
        sortable: true
    }

    /**
     * @param {Object} config
     */
    createSortZone(config) {
        let me = this;

        Neo.merge(config, {
            allowOverdrag     : true,
            dragProxyConfig   : me.dragProxyConfig,
            dragProxyExtraCls : me.dragProxyExtraCls,
            enableProxyToPopup: true,
            listeners         : {
                dragBoundaryEntry: data => me.fire('dragBoundaryEntry', data),
                dragBoundaryExit : data => me.fire('dragBoundaryExit',  data)
            }
        })

        super.createSortZone(config)
    }

    /**
     * @returns {Promise<any>}
     */
    loadSortZoneModule() {
        return import('../draggable/dashboard/SortZone.mjs')
    }
}

export default Neo.setupClass(Container);
