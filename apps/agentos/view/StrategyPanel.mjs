import Dashboard               from '../../../src/dashboard/Container.mjs';
import Panel                   from '../../../src/container/Panel.mjs';
import StrategyCardPanel       from './StrategyCardPanel.mjs';
import StrategyPanelController from './StrategyPanelController.mjs';

/**
 * @class AgentOS.view.StrategyPanel
 * @extends Neo.container.Panel
 */
class StrategyPanel extends Panel {
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
         */
        layout: 'fit',
        /**
         * @member {Object[]} items
         */
        items: [{
            module           : Dashboard,
            cls              : ['agent-kpi-dashboard'],
            dragProxyExtraCls: ['agent-panel-strategy', 'neo-panel'], // Ensure styles carry over to popup proxy
            layout           : {ntype: 'hbox', align: 'stretch'},

            listeners: {
                dragBoundaryEntry: 'onDragBoundaryEntry',
                dragBoundaryExit : 'onDragBoundaryExit',
                dragEnd          : 'onDragEnd'
            },

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
