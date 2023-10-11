import BaseViewport       from '../../../src/container/Viewport.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class LearnNeo.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='LearnNeo.view.Viewport'
         * @protected
         */
        className: 'LearnNeo.view.Viewport',
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: () => import('./home/MainContainer.mjs')
        }],
        /**
         * @member {Object} layout={ntype:'card'}
         */
        layout: {ntype: 'card'}
    }
}

Neo.applyClassConfig(Viewport);

export default Viewport;
