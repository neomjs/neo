import Viewport from '../../../../src/container/Viewport.mjs';

/**
 * @class CovidMap.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='CovidMap.MainContainer'
         * @protected
         */
        className: 'SharedCovidMap.MainContainer',
        /**
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'}
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
