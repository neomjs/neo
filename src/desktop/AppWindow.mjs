import Dialog         from '../dialog/Base.mjs';
import Icon           from '../component/Icon.mjs';
import Window         from '../manager/Window.mjs';
import WindowDragZone from './WindowDragZone.mjs';
import WindowTearOut  from './WindowTearOut.mjs';
import '../component/Toast.mjs';

/**
 * @summary One app's window on a web desktop. Its title and header icon follow its app {@link #record}, and its
 * items read that record as `data.record` from the window's own state provider.
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
         * A same-app popup entry for a desktop that supports tearing out its windows in a shared App Worker.
         * @member {String|null} tearOutUrl=null
         */
        tearOutUrl: null,
        /**
         * @member {Number} width=520
         */
        width: 520
    }

    /**
     * @member {Boolean} #popOutPending=false
     */
    #popOutPending = false;

    /**
     * @member {Object|null} #sourceVisibility=null
     */
    #sourceVisibility = null;

    /**
     * @summary Whether the source still accepts a header-initiated popout.
     * @returns {Boolean}
     */
    get #canPopOut() {
        return Boolean(this.tearOut && !this.tearOut.committed && this.mounted && !this.hidden &&
            !this.isDragging && !this.isDestroying && !this.isDestroyed)
    }

    /**
     * @summary Opts a shared-worker window into desktop tear-out through its header and drag zone.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (this.tearOutUrl && Neo.currentWorker.isSharedWorker) {
            this.tearOut = Neo.create(WindowTearOut, {owner: this, popupUrl: this.tearOutUrl});
            this.dragZoneConfig = {...this.dragZoneConfig, module: WindowDragZone, alwaysFireDragMove: true, allowOverdrag: true};

            const toolbar = this.headerToolbar,
                  factory = toolbar.actionMap?.['pop-out'];

            if (factory && !toolbar.getAction('pop-out')) {
                toolbar.addActionContribution(factory())
            }
        }
    }

    /**
     * @summary Retires the source gesture and its native window along with the managed dialog.
     * @param {...*} args
     */
    destroy(...args) {
        if (this.tearOut) {
            this.dragZone?.destroy();
            this.dragZone = null;
            this.tearOut.destroy()
        }
        super.destroy(...args)
    }

    /**
     * @summary Opens a tear-out from the native header button and preserves the dialog's header action event.
     * @param {Object} data
     */
    executeHeaderAction(data) {
        if (data.action === 'pop-out') this.popOutWindow();
        super.executeHeaderAction(data)
    }

    /**
     * @summary Directs a task activation to the popup while it owns the app.
     * @returns {Boolean}
     */
    focusTornOutWindow() {
        if (!this.tearOut?.committed) return false;
        this.tearOut.focus();
        return true
    }

    /**
     * @summary Adds the popout button to the desktop window's header vocabulary.
     * @returns {Object}
     * @protected
     */
    getWindowActionMap() {
        return {
            ...super.getWindowActionMap(),
            'pop-out': () => ({
                action : 'pop-out',
                iconCls: 'far fa-window-restore',
                tooltip: 'Pop out window',
                vdom   : {'aria-label': 'Pop out window'}
            })
        }
    }

    /**
     * @summary Returns an app's content before a close, minimize or revoked task hides its desktop window.
     * @param {...*} args
     * @returns {Promise<void>}
     */
    hide(...args) {
        if (this.tearOut) {
            this.dragZone?.restoreSource();
            this.tearOut.returnToDesktop()
        }
        return super.hide(...args)
    }

    /**
     * @summary Completes an opt-in gesture at its pointer position. Ordinary dialogs keep their proxy-based release.
     * @param {Object} data
     */
    onDragEnd(data) {
        if (this.tearOut) {
            this.dragZone?.finishGesture(data)
        } else {
            super.onDragEnd(data)
        }
    }

    /**
     * @summary Consumes the Escape that cancels an active header drag while leaving the next Escape to the dialog.
     * @param {Object} data Keyboard event forwarded by Main
     */
    onKeyDownEscape(data) {
        const zone = this.tearOut && this.dragZone;
        if (zone?.gesture) {
            zone.onDragCancel(data)
        } else if (!zone || data?.timeStamp == null || zone.cancelledAt !== data.timeStamp) {
            super.onKeyDownEscape(data)
        }
    }

    /**
     * @summary Recovers a held drag or closes the task when the user closes its committed native window.
     * @param {Object} [data]
     * @param {Boolean} [data.committed]
     */
    onTearOutDisconnect({committed}={}) {
        if (committed) this.hide(false);
        else this.dragZone?.restoreSource()
    }

    /**
     * @summary Explains a refused native open in the originating desktop without interrupting its drag.
     */
    onPopupOpenRefused() {
        Neo.toast({
            appName    : this.appName,
            msg        : 'Could not open the popup. If your browser blocked it, allow pop-ups for this site and try the drag again.',
            removeDelay: 8000,
            role       : 'status',
            windowId   : this.windowId
        })
    }

    /**
     * @summary Positions a popup over its settled desktop dialog, admitting one header activation at a time.
     * @returns {Promise<Boolean>}
     */
    async popOutWindow() {
        if (this.#popOutPending || !this.#canPopOut) return false;

        const {windowId} = this;
        this.#popOutPending = true;

        try {
            if (this.mountFlight) {
                await this.mountFlight;
                if (!this.#canPopOut || this.windowId !== windowId) return false
            }

            const [rect, windowData] = await Promise.all([
                this.getDomRect(),
                Neo.Main.getWindowData({windowId})
            ]);

            if (!this.#canPopOut || this.windowId !== windowId) return false;

            const {innerRect} = Window.calculateGeometry(windowData);

            return Boolean(await this.tearOut.open({rect: {
                left  : innerRect.left + rect.left,
                top   : innerRect.top + rect.top,
                width : rect.width,
                height: rect.height
            }}))
        } catch (reason) {
            if (reason !== Neo.isDestroyed && !Neo.currentWorker.isDeparture(reason, windowId)) {
                console.error('desktop.AppWindow: popout failed', {reason, windowId})
            }
            return false
        } finally {
            this.#popOutPending = false
        }
    }

    /**
     * @summary Hides the dialog during a tear-out and restores its previous wrapper visibility on return.
     * @param {Boolean} visible
     */
    setTearOutSourceVisible(visible) {
        const style = this.wrapperStyle;

        if (!visible && !this.#sourceVisibility) {
            this.#sourceVisibility = {value: style?.visibility};
            this.wrapperStyle = {...style, visibility: 'hidden'}
        } else if (visible && this.#sourceVisibility) {
            this.wrapperStyle = {...style, visibility: this.#sourceVisibility.value ?? null};
            this.#sourceVisibility = null
        }
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
