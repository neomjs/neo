import Viewport from '../../src/container/Viewport.mjs';

/**
 * @class SharedCovidHelix.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        /**
         * @member {String} className='SharedCovidHelix.MainContainer'
         * @protected
         */
        className: 'SharedCovidHelix.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'}
    }}
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
