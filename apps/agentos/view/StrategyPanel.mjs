import Dashboard               from '../../../src/dashboard/Container.mjs';
import DashboardPanel          from '../../../src/dashboard/Panel.mjs';
import StrategyCardPanel       from './StrategyCardPanel.mjs';
import StrategyPanelController from './StrategyPanelController.mjs';

/**
 * @class AgentOS.view.StrategyPanel
 * @extends Neo.dashboard.Panel
 */
class StrategyPanel extends DashboardPanel {
    static config = {
        /**
         * @member {String} className='AgentOS.view.StrategyPanel'
         * @protected
         */
        className: 'AgentOS.view.StrategyPanel',
        /**
         * @member {String[]} cls=['agent-panel-strategy']
         * @reactive
         */
        cls: ['agent-panel-strategy'],
        /**
         * @member {Neo.controller.Component} controller=StrategyPanelController
         * @reactive
         */
        controller: StrategyPanelController,
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
            text: 'Strategy Dashboard'
        }],
        /**
         * @member {Object} layout='fit'
         * @reactive
         */
        layout: 'fit',
        /**
         * @member {Function|String|null} popupUrl='apps/agentos/childapps/widget/index.html'
         */
        popupUrl: 'apps/agentos/childapps/widget/index.html',
        /**
         * @member {Object[]} items
         */
        items: [{
            module           : Dashboard,
            cls              : ['agent-kpi-dashboard'],
            dragProxyExtraCls: ['agent-panel-strategy', 'neo-panel'], // Ensure styles carry over to popup proxy
            layout           : {ntype: 'hbox', align: 'stretch'},
            popupUrl         : 'apps/agentos/childapps/strategy/index.html',

            itemDefaults: {
                module: StrategyCardPanel,
                flex  : 1
            },

            items: [{
                cls      : ['velocity'],
                reference: 'kpi-velocity',
                title    : 'Velocity',
                value    : '85%'
            }, {
                cls      : ['active-epics'],
                reference: 'kpi-active-epics',
                title    : 'Active Epics',
                value    : '12'
            }, {
                cls      : ['uptime'],
                reference: 'kpi-uptime',
                title    : 'Uptime',
                value    : '98.5%'
            }]
        }]
    }
}

export default Neo.setupClass(StrategyPanel);
