import Dialog from '../dialog/Base.mjs';
import Icon   from '../component/Icon.mjs';

/**
 * @summary One app's window on a web desktop. Its only public input is {@link #record}, the app: the title and the
 * header icon follow it, and its items read it as `data.record` from the window's own state provider.
 *
 * A window here is an app window, addressed by its app's id. `windowId` keeps its engine meaning, the browser window
 * the app window lives in (`Neo.manager.Window`).
 *
 * `Neo.desktop.WindowManager` creates it and keeps it: a close hides it for the next open, and a minimize hides it
 * into its task. The manager also gives it the minimize action, since it can restore what it minimizes. Maximize and
 * close are the dialog's own.
 *
 * A consumer gives the window content by subclassing it, e.g. `items: [{module: MyAppView, bind: {app: data =>
 * data.record}}]`. `Neo.desktop.Container` makes itself the window's `parentComponent`, so the window's state
 * provider continues into the container's: an item binds the desktop's data as well as the app.
 * @class Neo.desktop.AppWindow
 * @extends Neo.dialog.Base
 */
class AppWindow extends Dialog {
    static config = {
        /**
         * @member {String} className='Neo.desktop.AppWindow'
         * @protected
         */
        className: 'Neo.desktop.AppWindow',
        /**
         * @member {String[]} baseCls=['neo-desktop-app-window','neo-dialog','neo-panel','neo-container']
         * @protected
         */
        baseCls: ['neo-desktop-app-window', 'neo-dialog', 'neo-panel', 'neo-container'],
        /**
         * The app's icon leads the header, before the title
         * @member {Object} headerConfig
         */
        headerConfig: {
            items: [{
                module: Icon,
                cls   : ['neo-desktop-app-window-icon'],
                flag  : 'app-icon'
            }]
        },
        /**
         * @member {Number} height=380
         */
        height: 380,
        /**
         * The app this window shows: `text` is its title, `iconCls` and `color` its header icon. Without a record the
         * window is empty and untitled.
         * @member {Neo.desktop.model.App|null} record_=null
         * @reactive
         */
        record_: null,
        /**
         * Holds the record for the window's items as `data.record`
         * @member {Object} stateProvider
         */
        stateProvider: {
            data: {record: null}
        },
        /**
         * @member {Number} width=520
         */
        width: 520
    }

    /**
     * Triggered after the record config got changed
     * @param {Neo.desktop.model.App|null} value
     * @param {Neo.desktop.model.App|null} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        let me = this;

        me.title = value?.text || null;
        // At its own level: a parent provider's `record` stays untouched
        me.stateProvider?.setDataAtSameLevel({record: value});
        me.syncAppIcon()
    }

    /**
     * The header exists only once the dialog's construction created it, after the record arrived
     */
    createHeader() {
        super.createHeader();
        this.syncAppIcon()
    }

    /**
     * Paints the header icon from the record: its glyph, on a tile of the app's color
     * @protected
     */
    syncAppIcon() {
        let {record} = this,
            icon     = this.headerToolbar?.down({flag: 'app-icon'});

        icon?.set({
            cellIconCls: record?.iconCls || null,
            hidden     : !record?.iconCls,
            style      : {'--desktop-app-color': record?.color || null}
        })
    }
}

export default Neo.setupClass(AppWindow);
