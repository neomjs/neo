import BaseViewport       from '../../../src/container/Viewport.mjs';
import Component          from '../../../src/component/Base.mjs';
import TabContainer       from '../../../src/tab/Container.mjs';
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
        /*
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
                ntype: 'button',
                iconCls: 'fa fa-external-link-alt',
                text   : 'Open Swarm View',
                handler: 'onOpenSwarmClick'
            }]
        }, {
            module: TabContainer,
            flex  : 1,
            style : {margin: '20px'},

            itemDefaults: {
                module: Component,
                cls   : ['neo-examples-tab-component'],
                style : {padding: '20px'},
            },

            items: [{
                header: {
                    iconCls: 'fa fa-chess',
                    text   : 'Strategy'
                },
                html: '<h1>Strategy Dashboard</h1><p>KPIs and Roadmap go here.</p>'
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);
