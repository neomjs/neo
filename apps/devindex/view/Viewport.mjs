import Header             from './HeaderToolbar.mjs';
import BaseViewport       from '../../../src/container/Viewport.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class DevIndex.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='DevIndex.view.Viewport'
         * @protected
         */
        className: 'DevIndex.view.Viewport',
        /**
         * @member {String[]} cls=['devindex-viewport', 'neo-viewport']
         * @reactive
         */
        cls: ['devindex-viewport', 'neo-viewport'],
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
            ntype    : 'container',
            flex     : 1,
            layout   : {ntype: 'card', activeIndex: null},
            reference: 'main-content',
            items    : [
                {module: () => import('./home/MainContainer.mjs')},
                {module: () => import('./learn/MainContainer.mjs')}
            ]
        }]
    }
}

export default Neo.setupClass(Viewport);
