import BaseContainer      from '../container/Base.mjs';
import DragProxyContainer from '../draggable/DragProxyContainer.mjs';

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
         * @member {Boolean} dragResortable=true
         * @reactive
         */
        dragResortable: true
    }

    /**
     * @param {Object} config
     */
    createSortZone(config) {
        let me = this;

        Neo.merge(config, {
            allowOverdrag     : true,
            dragProxyConfig   : {module: DragProxyContainer, ...me.dragProxyConfig},
            dragProxyExtraCls : me.dragProxyExtraCls,
            enableProxyToPopup: true,
            listeners         : {
                dragBoundaryEntry: data => me.fire('dragBoundaryEntry', data),
                dragBoundaryExit : data => me.fire('dragBoundaryExit',  data),
                dragEnd          : data => me.fire('dragEnd',           data)
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
