import TableContainer from './TableContainer.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.table.covid.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.table.covid.MainContainer'
         * @protected
         */
        className: 'Neo.examples.table.covid.MainContainer',
        /**
         * @member {Object[]} items=[TableContainer]
         */
        items: [TableContainer],
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

Neo.setupClass(MainContainer);

export default MainContainer;
