import AppWindow from '../../../src/desktop/AppWindow.mjs';
import Component from '../../../src/component/Base.mjs';

/**
 * @summary An app window that shows its app's description: the content reads the app as `data.record`, the window's
 * only input.
 * @class Neo.examples.desktop.basic.AppWindow
 * @extends Neo.desktop.AppWindow
 */
class BasicAppWindow extends AppWindow {
    static config = {
        /**
         * @member {String} className='Neo.examples.desktop.basic.AppWindow'
         * @protected
         */
        className: 'Neo.examples.desktop.basic.AppWindow',
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Component,
            bind  : {text: data => data.record?.description},
            cls   : ['desktop-basic-app-description']
        }]
    }
}

export default Neo.setupClass(BasicAppWindow);
