import ControlsContainer  from './ControlsContainer.mjs';
import GridContainer      from './GridContainer.mjs';
import Header             from './HeaderToolbar.mjs';
import LearnContainer     from './learn/MainContainer.mjs';
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
            reference  : 'main-content',
            items      : [{
                ntype : 'container',
                layout: {ntype: 'hbox', align: 'stretch'},
                items : [{
                    module   : GridContainer,
                    reference: 'grid',
                    flex     : 1
                }, {
                    module   : ControlsContainer,
                    reference: 'controls'
                }]
            }, {
                module   : LearnContainer,
                reference: 'learn-container'
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);
