import BaseViewport          from '../../../src/container/Viewport.mjs';
import GridContainer         from './GridContainer.mjs';
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
         * @member {Object[]} items
         */
        items: [{
            module: GridContainer
        }],
        /*
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'},
        /**
         * @member {Neo.state.Provider} stateProvider=ViewportStateProvider
         */
        stateProvider: ViewportStateProvider,
        style: {padding: '2em'}
    }
}

export default Neo.setupClass(Viewport);
