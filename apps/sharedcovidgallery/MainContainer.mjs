import Viewport from '../../src/container/Viewport.mjs';

/**
 * @class SharedCovidGallery.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        /**
         * @member {String} className='SharedCovidGallery.MainContainer'
         * @protected
         */
        className: 'SharedCovidGallery.MainContainer',
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
