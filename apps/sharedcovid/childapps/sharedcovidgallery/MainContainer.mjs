import Viewport from '../../../../src/container/Viewport.mjs';

/**
 * @class SharedCovidGallery.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='SharedCovidGallery.MainContainer'
         * @protected
         */
        className: 'SharedCovidGallery.MainContainer',
        /**
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'}
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
