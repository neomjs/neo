import BaseViewport       from '../../../src/container/Viewport.mjs';
import Dashboard          from '../../../src/dashboard/Container.mjs';
import Panel              from '../../../src/container/Panel.mjs';
import Blackboard         from './Blackboard.mjs';
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
            items: [{
                ntype: 'label',
                text : 'Agent OS Command Center'
            }, '->', {
                ntype  : 'button',
                iconCls: 'fa fa-window-restore',
                text   : 'Detach Swarm View',
                handler: 'onOpenSwarmClick'
            }]
        }, {
            module   : Dashboard,
            flex     : 1,
            reference: 'dashboard',
            style    : {margin: '20px'},

            listeners: {
                dragBoundaryEntry: 'onDragBoundaryEntry',
                dragBoundaryExit : 'onDragBoundaryExit'
            },

            items: [{
                module   : Panel,
                flex     : 1,
                reference: 'strategy-panel',
                headers  : [{
                    dock: 'top',
                    cls : ['neo-draggable'],
                    text: 'Strategy Dashboard'
                }],
                items    : [{
                    ntype    : 'component',
                    reference: 'strategy-content',
                    html     : '<h1>Strategy Dashboard</h1><p>KPIs and Roadmap go here.</p>',
                    style    : {padding: '20px'}
                }]
            }, {
                module   : Panel,
                flex     : 1,
                reference: 'swarm-panel',
                headers  : [{
                    dock: 'top',
                    cls : ['neo-draggable'],
                    text: 'Swarm View'
                }],
                items    : [{
                    module   : Blackboard,
                    reference: 'swarm-content',
                    style    : {
                        backgroundColor: '#1e1e1e',
                        height         : '100%',
                        width          : '100%'
                    }
                }]
            }, {
                module   : Panel,
                flex     : 1,
                reference: 'intervention-panel',
                headers  : [{
                    dock: 'top',
                    cls : ['neo-draggable'],
                    text: 'Intervention'
                }],
                items    : [{
                    ntype    : 'container',
                    reference: 'intervention-content',
                    cls      : ['neo-intervention-panel'],
                    style    : {
                        backgroundColor: '#2d2d2d',
                        color          : '#e57373',
                        padding        : '20px',
                        borderRadius   : '4px',
                        border         : '1px solid #b71c1c'
                    },
                    html     : '<h2>Intervention Required</h2><p>Derailment logs and recovery chat will appear here.</p>'
                }]
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);
