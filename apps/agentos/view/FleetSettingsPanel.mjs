import AgentDefinitions from '../store/AgentDefinitions.mjs';
import Button           from '../../../src/button/Base.mjs';
import DashboardPanel   from '../../../src/dashboard/Panel.mjs';
import GridContainer    from '../../../src/grid/Container.mjs';
import Toolbar          from '../../../src/toolbar/Base.mjs';

/**
 * @class AgentOS.view.FleetSettingsPanel
 * @extends Neo.dashboard.Panel
 *
 * @summary The **Fleet view** — run the fleet: the live, redacted roster (grid) + the lifecycle
 * controls (Start / Stop / Restart, gated until the service bridge is consumed). Reads the shared
 * `AgentDefinitions` roster singleton that `AgentOS.view.Accounts` writes into; identity *setup* +
 * all credential handling now live in `Accounts` (the cockpit keeper-view split). This view
 * holds no credential logic and writes nothing — it is read + lifecycle only.
 */
class FleetSettingsPanel extends DashboardPanel {
    static config = {
        /**
         * @member {String} className='AgentOS.view.FleetSettingsPanel'
         * @protected
         */
        className: 'AgentOS.view.FleetSettingsPanel',
        /**
         * @member {String[]} cls=['agent-panel-settings']
         * @reactive
         */
        cls: ['agent-panel-settings'],
        /**
         * @member {Number} flex=1
         */
        flex: 1,
        /**
         * @member {Object[]} headers
         */
        headers: [{
            dock: 'top',
            cls : ['neo-draggable'],
            text: 'Fleet'
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Function|String|null} popupUrl='apps/agentos/childapps/widget/index.html'
         */
        popupUrl: 'apps/agentos/childapps/widget/index.html',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : GridContainer,
            cls      : ['agent-definition-grid'],
            flex     : 1,
            reference: 'agent-grid',
            store    : AgentDefinitions,

            columns: [{
                dataField: 'githubUsername',
                text     : 'GitHub',
                width    : 140
            }, {
                dataField: 'harnessType',
                text     : 'Harness',
                width    : 130
            }, {
                dataField: 'credentialState',
                text     : 'Credential',
                width    : 120,
                renderer : ({value}) => ({
                    cls : ['agent-status-pill', `is-${value}`],
                    text: value
                })
            }, {
                dataField: 'lifecycleState',
                text     : 'Lifecycle',
                width    : 110,
                renderer : ({value}) => ({
                    cls : ['agent-status-pill', `is-${value}`],
                    text: value
                })
            }, {
                dataField: 'statusText',
                flex     : 1,
                text     : 'Status'
            }]
        }, {
            module: Toolbar,
            cls   : ['agent-fleet-actions'],
            flex  : 'none',
            items : ['->', {
                module  : Button,
                cls     : ['agent-button', 'agent-lifecycle-button'],
                disabled: true,
                iconCls : 'fa fa-play',
                text    : 'Start',
                tooltip : {
                    text     : 'Lifecycle controls are gated until the service bridge is consumed.',
                    showDelay: 0,
                    hideDelay: 0
                }
            }, {
                module  : Button,
                cls     : ['agent-button', 'agent-lifecycle-button'],
                disabled: true,
                iconCls : 'fa fa-stop',
                text    : 'Stop',
                tooltip : {
                    text     : 'Lifecycle controls are gated until the service bridge is consumed.',
                    showDelay: 0,
                    hideDelay: 0
                }
            }, {
                module  : Button,
                cls     : ['agent-button', 'agent-lifecycle-button'],
                disabled: true,
                iconCls : 'fa fa-rotate-right',
                text    : 'Restart',
                tooltip : {
                    text     : 'Lifecycle controls are gated until the service bridge is consumed.',
                    showDelay: 0,
                    hideDelay: 0
                }
            }]
        }]
    }
}

export default Neo.setupClass(FleetSettingsPanel);
