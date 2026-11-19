import Component     from '../../../src/component/Base.mjs';
import DockWorkspace from '../../../src/dashboard/dock/Workspace.mjs';
import List          from '../../../src/list/Base.mjs';
import TextField     from '../../../src/form/field/Text.mjs';

/**
 * @summary The minimal tear-out workspace: a small support desk in four panes, the lifecycle opt-in and a
 * cross-window sort group.
 *
 * No window-opening code: `Neo.dashboard.dock.Workspace#openTearOutVessel` reopens the app's page for the
 * torn-out pane, and the published sort group lets the pane be dragged back. The Notes pane holds a
 * field, so a draft typed before the pane leaves shows whether the same live component arrives. Notes stays
 * the page's first input: the default-route spec types into it.
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
         * Open tickets, three figures, recent alerts, and a draft that travels with its pane
         * @member {Object} panes
         */
        panes: {
            queue: {
                module          : List,
                cls             : ['neo-example-tearout-list', 'neo-example-tearout-queue'],
                disableSelection: true,
                displayField    : 'title',
                header          : {text: 'Queue'},

                store: {
                    model: {fields: [{name: 'id', type: 'Integer'}, {name: 'title', type: 'String'}, {name: 'cls', type: 'Array'}]},
                    data : [
                        {id: 4512, title: '#4512 · Refund for a double charge',       cls: ['neo-example-tearout-urgent']},
                        {id: 4509, title: '#4509 · Export stops at 10,000 rows',      cls: ['neo-example-tearout-urgent']},
                        {id: 4507, title: '#4507 · Invite link expired after a day',  cls: ['neo-example-tearout-normal']},
                        {id: 4503, title: '#4503 · Dark mode for the invoice PDF',    cls: ['neo-example-tearout-low']},
                        {id: 4498, title: '#4498 · Two seats after a plan downgrade', cls: ['neo-example-tearout-normal']},
                        {id: 4494, title: '#4494 · Webhook retries arrive twice',     cls: ['neo-example-tearout-normal']},
                        {id: 4490, title: '#4490 · A CSV import maps dates as text',  cls: ['neo-example-tearout-low']},
                        {id: 4487, title: '#4487 · SSO login loops on Safari',        cls: ['neo-example-tearout-normal']}
                    ]
                }
            },
            metrics: {
                module: Component,
                cls   : ['neo-example-tearout-metrics'],
                header: {text: 'Metrics'},
                html  : '<div><b>5</b>open</div><div><b>2</b>urgent</div><div><b>18 min</b>to first reply</div>'
            },
            alerts: {
                module          : List,
                cls             : ['neo-example-tearout-list'],
                disableSelection: true,
                displayField    : 'text',
                header          : {text: 'Alerts'},

                store: {
                    model: {fields: [{name: 'id', type: 'Integer'}, {name: 'text', type: 'String'}]},
                    data : [
                        {id: 1, text: '09:42 · Two urgent tickets wait longer than an hour'},
                        {id: 2, text: '09:15 · The export service answers slowly'},
                        {id: 3, text: '08:58 · The night shift handed over three tickets'}
                    ]
                }
            },
            notes: {module: TextField, header: {text: 'Notes'}, style: {padding: '1em'}, labelPosition: 'top', labelText: 'Draft'}
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
    }
}

export default Neo.setupClass(Workspace);
