import GridContainer from './GridContainer.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.grid.tree.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.tree.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.tree.MainContainer',
        /**
         * @member {Object} layout={ntype:'fit'}
         * @reactive
         */
        layout: {ntype: 'fit'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: GridContainer
        }]
    }
}

export default Neo.setupClass(MainContainer);
