import Component     from '../../../src/component/Base.mjs';
import DockWorkspace from '../../../src/dashboard/dock/Workspace.mjs';

/**
 * @summary The minimal tear-out workspace: panes, zones, the lifecycle opt-in and a cross-window sort group.
 *
 * No window-opening code: `Neo.dashboard.dock.Workspace#openTearOutVessel` reopens the app's page for the
 * torn-out pane, and the published sort group lets the pane be dragged back.
 * @class Neo.examples.dashboard.tearOut.Workspace
 * @extends Neo.dashboard.dock.Workspace
 */
class Workspace extends DockWorkspace {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.tearOut.Workspace'
         * @protected
         */
        className: 'Neo.examples.dashboard.tearOut.Workspace',
        /**
         * @member {Boolean} enableDockTearOutLifecycle=true
         */
        enableDockTearOutLifecycle: true,
        /**
         * @member {Object} panes
         */
        panes: {
            queue  : {module: Component, header: {text: 'Queue'},   style: {padding: '1em'}, html: 'Queue'},
            metrics: {module: Component, header: {text: 'Metrics'}, style: {padding: '1em'}, html: 'Metrics'},
            alerts : {module: Component, header: {text: 'Alerts'},  style: {padding: '1em'}, html: 'Alerts'}
        },
        /**
         * @member {Object} zones
         */
        zones: {
            center: {
                orientation: 'horizontal',
                sizes      : [0.6, 0.4],
                children   : [{items: ['queue']}, {items: ['metrics', 'alerts']}]
            }
        }
    }

    /**
     * Publishes the cross-window sort group, so a torn-out window can be dragged back.
     * @returns {Object}
     */
    getDockProjectionOptions() {
        return {...super.getDockProjectionOptions(), crossWindowSortGroup: 'tear-out-example'}
    }
}

export default Neo.setupClass(Workspace);
