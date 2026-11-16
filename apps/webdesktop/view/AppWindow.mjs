import AppView from './AppView.mjs';
import Dialog  from '../../../src/dialog/Base.mjs';

/**
 * Shared by every app window, so the window a user touches last is drawn on top
 * @type {Number}
 */
let zIndex = 100;

/**
 * @summary One app's window. Created on the first open, then kept: closing hides it, and reopening shows it again.
 *
 * The opener passes `animateTargetId` (the app's launcher icon), `appName`, `windowId` and a state provider with the
 * app as its data, parented to the desktop's provider. Minimizing is a header action the opener handles.
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

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct({style: {zIndex: ++zIndex}, ...config});

        let me = this;

        me.addDomListeners({
            mousedown: me.toFront,
            scope    : me
        })
    }

    /**
     * Draws this window above every other app window
     */
    toFront() {
        let me = this;

        if (me.style.zIndex !== zIndex) {
            me.style = {...me.style, zIndex: ++zIndex}
        }
    }
}

export default Neo.setupClass(AppWindow);
