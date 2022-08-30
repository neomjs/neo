import TableContainer from './TableContainer.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.table.covid.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.table.covid.MainContainer'
         * @protected
         */
        className: 'Neo.examples.table.covid.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Object[]} items=[TableContainer]
         */
        items: [TableContainer],
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {ntype: 'fit'}
    }}
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
