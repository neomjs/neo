import BaseViewport from '../../../../../src/container/Viewport.mjs';

/**
 * @class Colors.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Widget.view.Viewport'
         * @protected
         */
        className: 'SharedDialog2.view.Viewport'
    }
}

Neo.setupClass(Viewport);

export default Viewport;
