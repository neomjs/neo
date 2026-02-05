import ControlsContainer  from './ControlsContainer.mjs';
import GridContainer      from './GridContainer.mjs';
import Header             from './HeaderToolbar.mjs';
import BaseViewport       from '../../../src/container/Viewport.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class DevRank.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='DevRank.view.Viewport'
         * @protected
         */
        className: 'DevRank.view.Viewport',
        /**
         * @member {String[]} cls=['devrank-viewport', 'neo-viewport']
         * @reactive
         */
        cls: ['devrank-viewport', 'neo-viewport'],
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         * @reactive
         */
        controller: ViewportController,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Header,
            flex  : 'none'
        }, {
            ntype      : 'container',
            activeIndex: 0,
            flex       : 1,
            layout     : 'card',
            items      : [{
                ntype : 'container',
                layout: {ntype: 'hbox', align: 'stretch'},
                items : [{
                    module   : GridContainer,
                    reference: 'grid',
                    flex     : 1
                }, {
                    module: ControlsContainer
                }]
            }, {
                ntype: 'container',
                cls  : ['devrank-about'],
                style: {padding: '20px'},
                html : '<h1>About DevRank</h1><p>Data Source: GitHub GraphQL API</p><p>Todo: Write about the methodology...</p>'
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);
