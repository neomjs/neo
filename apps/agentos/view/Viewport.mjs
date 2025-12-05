import BaseViewport       from '../../../src/container/Viewport.mjs';
import Dashboard          from '../../../src/dashboard/Container.mjs';
import Panel              from '../../../src/container/Panel.mjs';
import Blackboard         from './Blackboard.mjs';
import InterventionPanel  from './InterventionPanel.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class AgentOS.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='AgentOS.view.Viewport'
         * @protected
         */
        className: 'AgentOS.view.Viewport',
        /**
         * @member {String[]} cls=['agent-os-viewport']
         * @reactive
         */
        cls: ['agent-os-viewport'],
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController,
        /**
         * @member {Object} layout={ntype:'vbox', align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype: 'toolbar',
            cls  : ['agent-top-toolbar'],
            flex : 'none',
            items: [{
                ntype: 'component',
                cls  : ['agent-logo'],
                html : '<img src="../../resources/images/logo/neo_logo_white.svg" alt="Neo.mjs Logo">'
            }, {
                ntype: 'label',
                text : 'Agent OS Command Center'
            }, '->', {
                ntype  : 'button',
                cls    : ['agent-button'],
                iconCls: 'fa fa-window-restore',
                text   : 'Detach Swarm View',
                handler: 'onOpenSwarmClick'
            }]
        }, {
            module           : Dashboard,
            dragProxyExtraCls: ['agent-os-viewport', 'neo-viewport'],
            flex             : 1,
            reference        : 'dashboard',
            cls              : ['agent-dashboard'],
            style            : {margin: '20px 10px'},

            listeners: {
                dragBoundaryEntry: 'onDragBoundaryEntry',
                dragBoundaryExit : 'onDragBoundaryExit'
            },

            items: [{
                module   : Panel,
                cls      : ['agent-panel-strategy'],
                flex     : 1,
                reference: 'strategy-panel',
                headers  : [{
                    dock: 'top',
                    cls : ['neo-draggable'],
                    text: 'Strategy Dashboard'
                }],
                items    : [{
                    ntype    : 'component',
                    cls      : ['agent-kpi-container'],
                    reference: 'strategy',
                    style    : {padding: '20px', backgroundColor: 'var(--agent-bg-dark)'},
                    html     : `
                        <div class="agent-kpi-card">
                            <div class="agent-kpi-value">85%</div>
                            <div class="agent-kpi-label">Velocity</div>
                        </div>
                        <div class="agent-kpi-card">
                            <div class="agent-kpi-value">12</div>
                            <div class="agent-kpi-label">Active Epics</div>
                        </div>
                        <div class="agent-kpi-card">
                            <div class="agent-kpi-value">98.5%</div>
                            <div class="agent-kpi-label">Uptime</div>
                        </div>
                    `
                }]
            }, {
                module   : Panel,
                cls      : ['agent-panel-swarm'],
                flex     : 1,
                reference: 'swarm-panel',
                headers  : [{
                    dock: 'top',
                    cls : ['neo-draggable'],
                    text: 'Swarm View'
                }],
                items    : [{
                    module   : Blackboard,
                    reference: 'swarm',
                    style    : {
                        backgroundColor: '#000',
                        height         : '100%',
                        width          : '100%'
                    }
                }]
            }, {
                module   : InterventionPanel,
                flex     : 1,
                reference: 'intervention-panel'
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);
