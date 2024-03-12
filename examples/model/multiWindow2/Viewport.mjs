import BaseViewport from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.model.multiWindow2.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.model.multiWindow2.Viewport'
         * @protected
         */
        className: 'Neo.examples.model.multiWindow2.Viewport',
        /**
         * @member {Object} style
         */
        style: {
            padding: '20px'
        }
    }
}

Neo.setupClass(Viewport);

export default Viewport;
