import AppView from './AppView.mjs';
import Dialog  from '../../../src/dialog/Base.mjs';

/**
 * The z-index below the lowest window. Windows stay under the engine's floating layer (menus at 100, drag proxies and
 * dialogs at 1000) and under the permission panel, so the taskbar's menu and panel open above every window.
 * @type {Number}
 */
const baseZIndex = 10;

/**
 * Every app window, back to front. A window's z-index is its place here, counted up from `baseZIndex`, so raising
 * windows never climbs: the demo opens one window per app, which keeps the stack far below 100.
 * @type {WebDesktop.view.AppWindow[]}
 */
const stack = [];

/**
 * Gives each window the z-index of its place in the stack; a window already at its place is left alone
 */
function restack() {
    stack.forEach((appWindow, index) => {
        let zIndex = baseZIndex + index + 1;

        if (appWindow.style.zIndex !== zIndex) {
            appWindow.style = {...appWindow.style, zIndex}
        }
    })
}

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
        super.construct({style: {zIndex: baseZIndex + stack.length + 1}, ...config});

        let me = this;

        stack.push(me);
        restack();

        me.addDomListeners({
            mousedown: me.toFront,
            scope    : me
        })
    }

    /**
     * Leaves the stack. The windows above keep their z-index until the next raise closes the gap.
     * @param {...*} args
     */
    destroy(...args) {
        let index = stack.indexOf(this);

        index > -1 && stack.splice(index, 1);

        super.destroy(...args)
    }

    /**
     * Draws this window above every other app window
     */
    toFront() {
        let me    = this,
            index = stack.indexOf(me);

        if (index > -1 && index < stack.length - 1) {
            stack.splice(index, 1);
            stack.push(me);
            restack()
        }
    }
}

export default Neo.setupClass(AppWindow);
