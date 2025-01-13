import GridContainer from './GridContainer.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.grid.bigData.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.bigData.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.bigData.MainContainer',
        /**
         * @member {Object[]} items=[GridContainer]
         */
        items: [GridContainer],
        /**
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'},
        /**
         * @member {Object} style={padding:'20px'}
         */
        style: {padding: '20px'}
    }
}

export default Neo.setupClass(MainContainer);
