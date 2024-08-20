import BaseViewport from '../../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.component.multiWindowCoronaGallery.childapp.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.multiWindowCoronaGallery.childapp.Viewport'
         * @protected
         */
        className: 'Neo.examples.component.multiWindowCoronaGallery.childapp.Viewport',
        /**
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'}
    }
}

export default Neo.setupClass(Viewport);
