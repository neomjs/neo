import Panel from '../container/Panel.mjs';

/**
 * @summary A specialized panel designed to be used as a child item within a `Neo.dashboard.Container`.
 *
 * While any component can be placed inside a dashboard, using `Neo.dashboard.Panel` is highly recommended as it exposes
 * specific configurations for the dashboard's "detach-to-window" functionality.
 *
 * **Key Features:**
 * - **Per-Item App Shells:** You can define a specific `popupUrl` for this panel. This is critical for complex dashboards where
 *   different widgets require different environments (e.g., a "Swarm" widget needing a canvas-enabled app shell vs. a simple "Grid" widget).
 * - **Window Customization:** Use `popupConfig` to define the default dimensions and features of the popup window when this item is detached.
 *
 * @class Neo.dashboard.Panel
 * @extends Neo.container.Panel
 * @see Neo.dashboard.Container
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
         * @reactive
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
