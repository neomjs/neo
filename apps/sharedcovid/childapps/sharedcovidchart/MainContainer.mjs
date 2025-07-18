import Viewport from '../../../../src/container/Viewport.mjs';

/**
 * @class SharedCovidChart.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='SharedCovidChart.MainContainer'
         * @protected
         */
        className: 'SharedCovidChart.MainContainer',
        /**
         * @member {Object} layout={ntype:'fit'}
         * @reactive
         */
        layout: {ntype: 'fit'}
    }
}

export default Neo.setupClass(MainContainer);
