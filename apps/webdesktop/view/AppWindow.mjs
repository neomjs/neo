import AppView   from './AppView.mjs';
import AppWindow from '../../../src/desktop/AppWindow.mjs';

/**
 * @summary An app's window: the engine's app window with the app's card as its content. The card binds the app from
 * the window's own state provider and the signed-in account from the desktop's, which the window's provider continues
 * into.
 * @class WebDesktop.view.AppWindow
 * @extends Neo.desktop.AppWindow
 */
class WebDesktopAppWindow extends AppWindow {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.AppWindow'
         * @protected
         */
        className: 'WebDesktop.view.AppWindow',
        /**
         * @member {Object[]} items
         */
        items: [{
            module: AppView,
            bind  : {
                account: data => data.account,
                app    : data => data.record
            }
        }]
    }
}

export default Neo.setupClass(WebDesktopAppWindow);
