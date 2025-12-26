import Panel from '../container/Panel.mjs';

/**
 * @class Neo.dashboard.Panel
 * @extends Neo.container.Panel
 */
class DashboardPanel extends Panel {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.Panel'
         * @protected
         */
        className: 'Neo.dashboard.Panel',
        /**
         * @member {String} ntype='dashboard-panel'
         * @protected
         */
        ntype: 'dashboard-panel',
        /**
         * @member {String[]} cls=['neo-dashboard-panel','neo-panel','neo-container']
         */
        cls: ['neo-dashboard-panel', 'neo-panel', 'neo-container'],
        /**
         * @member {Object|null} popupConfig=null
         */
        popupConfig: null,
        /**
         * @member {Function|String|null} popupUrl=null
         */
        popupUrl: null
    }
}

export default Neo.setupClass(DashboardPanel);
