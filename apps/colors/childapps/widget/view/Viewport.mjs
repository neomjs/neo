import BaseViewport from '../../../../../src/container/Viewport.mjs';

/**
 * @class ColorsWidget.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='ColorsWidget.view.Viewport'
         * @protected
         */
        className: 'Widget.view.Viewport'
    }
}

export default Neo.setupClass(Viewport);
