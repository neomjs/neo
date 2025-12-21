import BaseViewport       from '../../../src/container/Viewport.mjs';
import Dashboard          from '../../../src/dashboard/Container.mjs';
import Panel              from '../../../src/container/Panel.mjs';
import Blackboard         from './Blackboard.mjs';
import InterventionPanel  from './InterventionPanel.mjs';
import StrategyPanel      from './StrategyPanel.mjs';
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
                html : '<img src="../../resources/images/logo/neo_logo_cyberpunk.svg" alt="Neo.mjs Logo">'
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
            style            : {margin: '20px'},

            listeners: {
                dragBoundaryEntry: 'onDragBoundaryEntry',
                dragBoundaryExit : 'onDragBoundaryExit',
                dragEnd          : 'onDragEnd'
            },

            items: [{
                module   : StrategyPanel,
                flex     : 2,
                reference: 'strategy'
            }, {
                module   : Panel,
                cls      : ['agent-panel-swarm'],
                flex     : 5,
                reference: 'swarm',
                headers  : [{
                    dock: 'top',
                    cls : ['neo-draggable'],
                    text: 'Swarm View'
                }],
                items    : [{
                    module   : Blackboard,
                    style    : {
                        backgroundColor: '#000',
                        height         : '100%',
                        width          : '100%'
                    }
                }]
            }, {
                module   : InterventionPanel,
                flex     : 3,
                reference: 'intervention'
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);
