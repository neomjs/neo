import BaseViewport          from '../../../src/container/Viewport.mjs';
import GridContainer         from './GridContainer.mjs';
import ViewportController    from './ViewportController.mjs';
import ViewportStateProvider from './ViewportStateProvider.mjs';

/**
 * @class Finance.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Finance.view.Viewport'
         * @protected
         */
        className: 'Finance.view.Viewport',
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController,
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : GridContainer,
            reference: 'grid'
        }],
        /*
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'},
        /**
         * @member {Neo.state.Provider} stateProvider=ViewportStateProvider
         */
        stateProvider: ViewportStateProvider,
        /**
         * @member {Object} style
         */
        style: {padding: '2em'}
    }
}

export default Neo.setupClass(Viewport);
