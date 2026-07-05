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
        className: 'ColorsWidget.view.Viewport',
        /**
         * Stable id so whitebox e2e runs (Neural Link childapp-connect proof) can read the
         * viewport back through a live session without relying on generated ids.
         * @member {String} id='colors-widget-viewport'
         */
        id: 'colors-widget-viewport'
    }
}

export default Neo.setupClass(Viewport);
