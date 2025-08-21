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
         * @member {Boolean} sortable_=true
         */
        sortable_: true
    }

    /**
     * Triggered after the sortable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetSortable(value, oldValue) {
        let me = this;

        if (value && !me.sortZone) {
            import('../draggable/dashboard/SortZone.mjs').then(module => {
                me.sortZone = Neo.create({
                    module             : module.default,
                    allowOverdrag      : true,
                    appName            : me.appName,
                    boundaryContainerId: me.id,
                    enableProxyToPopup : true,
                    owner              : me,
                    windowId           : me.windowId,
                    listeners          : {
                        dragBoundaryEntry: data => me.fire('dragBoundaryEntry', data),
                        dragBoundaryExit : data => me.fire('dragBoundaryExit',  data)
                    }
                })
            })
        }
    }
}

export default Neo.setupClass(Container);
