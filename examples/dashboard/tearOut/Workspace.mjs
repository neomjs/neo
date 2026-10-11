import Component     from '../../../src/component/Base.mjs';
import DockWorkspace from '../../../src/dashboard/dock/Workspace.mjs';
import TextField     from '../../../src/form/field/Text.mjs';

/**
 * @summary The minimal tear-out workspace: panes, zones, the lifecycle opt-in and a cross-window sort group.
 *
 * No window-opening code: `Neo.dashboard.dock.Workspace#openTearOutVessel` reopens the app's page for the
 * torn-out pane, and the published sort group lets the pane be dragged back. The Notes pane holds a
 * field, so a draft typed before the pane leaves shows whether the same live component arrives.
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
            alerts : {module: Component, header: {text: 'Alerts'},  style: {padding: '1em'}, html: 'Alerts'},
            notes  : {module: TextField, header: {text: 'Notes'},   style: {padding: '1em'}, labelText: 'Draft'}
        },
        /**
         * @member {Object} zones
         */
        zones: {
            center: {
                orientation: 'horizontal',
                sizes      : [0.6, 0.4],
                children   : [{items: ['queue']}, {items: ['notes', 'metrics', 'alerts']}]
            }
        }
    }

    /**
     * Publishes the cross-window sort group, so a torn-out window can be dragged back.
     * @returns {Object}
     */
    getDockProjectionOptions() {
        return {...super.getDockProjectionOptions(), crossWindowSortGroup: 'tear-out-example'}
    }}

export default Neo.setupClass(Workspace);
