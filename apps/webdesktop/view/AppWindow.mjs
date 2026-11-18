import AppView from './AppView.mjs';
import Dialog  from '../../../src/dialog/Base.mjs';

/**
 * @summary One app's window. Created on the first open, then kept: closing hides it, and reopening shows it again.
 *
 * The desktop's `Neo.desktop.WindowManager` creates it, keeps its place among the other windows and handles its
 * minimize action. The controller's window config passes `animateTargetId` (the app's launcher icon), `appName`,
 * `windowId` and a state provider with the app as its data, parented to the desktop's provider.
 * @class WebDesktop.view.AppWindow
 * @extends Neo.dialog.Base
 */
class AppWindow extends Dialog {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.AppWindow'
         * @protected
         */
        className: 'WebDesktop.view.AppWindow',
        /**
         * @member {Object} bind
         */
        bind: {title: data => data.app.text},
        /**
         * @member {String} closeAction='hide'
         */
        closeAction: 'hide',
        /**
         * @member {String[]} cls=['webdesktop-window']
         */
        cls: ['webdesktop-window'],
        /**
         * @member {Object} headerConfig
         */
        headerConfig: {
            actions: [{action: 'minimize', iconCls: 'far fa-window-minimize'}, 'maximize', 'close']
        },
        /**
         * @member {Number} height=380
         */
        height: 380,
        /**
         * @member {Number} width=520
         */
        width: 520,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: AppView,
            bind  : {
                account: data => data.account,
                app    : data => data.app
            }
        }]
    }
}

export default Neo.setupClass(AppWindow);
