import BaseViewport from '../../../src/container/Viewport.mjs';
import MainView     from './MainView.mjs';

/**
 * @class Email.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Email.view.Viewport'
         * @protected
         */
        className: 'Email.view.Viewport',
        /**
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: MainView
        }]
    }
}

export default Neo.setupClass(Viewport);
