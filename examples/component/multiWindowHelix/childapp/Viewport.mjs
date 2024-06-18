import BaseViewport from '../../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.component.multiWindowHelix.childapp.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.multiWindowHelix.childapp.Viewport'
         * @protected
         */
        className: 'Neo.examples.component.multiWindowHelix.childapp.Viewport',
        /**
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'}
    }
}

Neo.setupClass(Viewport);

export default Viewport;
