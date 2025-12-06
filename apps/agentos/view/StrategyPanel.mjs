import Dashboard               from '../../../src/dashboard/Container.mjs';
import Panel                   from '../../../src/container/Panel.mjs';
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
            reference        : 'strategy',
            layout           : {ntype: 'hbox', align: 'stretch'},

            listeners: {
                dragBoundaryEntry: 'onDragBoundaryEntry',
                dragBoundaryExit : 'onDragBoundaryExit'
            },

            items: [{
                module   : Panel,
                cls      : ['agent-kpi-card-panel', 'velocity'],
                flex     : 1,
                reference: 'kpi-velocity',
                headers  : [{
                    cls : ['neo-panel-header', 'neo-draggable'],
                    dock: 'top',
                    text: 'Velocity'
                }],
                items    : [{
                    ntype: 'component',
                    cls  : ['agent-kpi-card'],
                    html : `
                        <div class="agent-kpi-value">85%</div>
                    `
                }]
            }, {
                module   : Panel,
                cls      : ['agent-kpi-card-panel', 'active-epics'],
                flex     : 1,
                reference: 'kpi-active-epics',
                headers  : [{
                    cls : ['neo-panel-header', 'neo-draggable'],
                    dock: 'top',
                    text: 'Active Epics'
                }],
                items    : [{
                    ntype: 'component',
                    cls  : ['agent-kpi-card'],
                    html : `
                        <div class="agent-kpi-value">12</div>
                    `
                }]
            }, {
                module   : Panel,
                cls      : ['agent-kpi-card-panel', 'uptime'],
                flex     : 1,
                reference: 'kpi-uptime',
                headers  : [{
                    cls : ['neo-panel-header', 'neo-draggable'],
                    dock: 'top',
                    text: 'Uptime'
                }],
                items    : [{
                    ntype: 'component',
                    cls  : ['agent-kpi-card'],
                    html : `
                        <div class="agent-kpi-value">98.5%</div>
                    `
                }]
            }]
        }]
    }
}

export default Neo.setupClass(StrategyPanel);
