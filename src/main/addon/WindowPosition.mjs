import Base from './Base.mjs';

/**
 * @class Neo.main.addon.WindowPosition
 * @extends Neo.main.addon.Base
 */
class WindowPosition extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.WindowPosition'
         * @protected
         */
        className: 'Neo.main.addon.WindowPosition',
        /**
         * @member {Boolean} adjustWindowPositions=false
         */
        adjustWindowPositions: false,
        /**
         * @member {String|null} intervalId=null
         */
        intervalId: null,
        /**
         * @member {Number} intervalTime=20
         */
        intervalTime: 20,
        /**
         * Keeps the movement poll armed independent of pointer state.
         *
         * By default the poll arms only on a `mouseout` that leaves the document, the signal a
         * pointer produces when it travels from page content onto the OS titlebar. A window whose
         * titlebar is grabbed WITHOUT the cursor ever entering its content (the header-action
         * pop-out places the new titlebar right under the pointer) never produces that signal, so
         * its movement is never published and {@link Neo.manager.Window} keeps the birth rect.
         * Render targets that take part in cross-window hit testing opt in; the poll costs two
         * integer compares per tick and publishes only on change.
         * @member {Boolean} observeMovement_=false
         * @reactive
         */
        observeMovement_: false,
        /**
         * @member {Boolean} observeResize_=false
         * @reactive
         */
        observeResize_: false,
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'registerWindow',
                'setConfigs',
                'setDock',
                'unregisterWindow'
            ]
        },
        /**
         * @member {Number|null} screenLeft=null
         */
        screenLeft: null,
        /**
         * @member {Number|null} screenTop=null
         */
        screenTop: null,
        /**
         * @member {Object} windows={}
         * @protected
         */
        windows: {}
    }

    /**
     * @member {Function|null} resizeListener=null
     * @protected
     */
    resizeListener = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me                      = this,
            {screenLeft, screenTop} = window;

        me.screenLeft = screenLeft;
        me.screenTop  = screenTop;

        window.addEventListener('mouseout', me.onMouseOut.bind(me))
    }

    /**
     * Triggered after the observeMovement config got changed.
     * While on, the config owns the poll: {@link #onMouseOut} neither arms nor clears it.
     * Switching off releases the poll back to pointer ownership; the next document-leaving
     * `mouseout` re-arms it.
     *
     * Arming also publishes the current snapshot once: the poll is change-driven against the
     * origin captured at construction, so a window that never moves would otherwise stay unknown
     * to `Neo.manager.Window` in a dedicated-worker app, where no connect handshake registers it.
     * A stream opens with its current value.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetObserveMovement(value, oldValue) {
        if (value) {
            this.startPolling();
            this.publishGeometry()
        } else {
            this.stopPolling()
        }
    }

    /**
     * Triggered after the observeResize config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetObserveResize(value, oldValue) {
        let me = this;

        if (!me.resizeListener) {
            me.resizeListener =  me.onResize.bind(me)
        }

        window[value ? 'addEventListener' : 'removeEventListener']('resize', me.resizeListener)
    }

    /**
     *
     */
    adjustPositions() {
        Object.entries(this.windows).forEach(([key, value]) => {
            let {left, top} = this.getPosition(value);

            Neo.Main.windowMoveTo({
                windowName: key,
                x         : left,
                y         : top
            })
        })
    }

    /**
     *
     */
    checkMovement() {
        let me                      = this,
            win                     = window,
            {screenLeft, screenTop} = win;

        if (me.screenLeft !== screenLeft || me.screenTop !== screenTop) {
            me.adjustWindowPositions && me.adjustPositions();

            me.publishGeometry();

            me.screenLeft = screenLeft;
            me.screenTop  = screenTop
        }
    }

    /**
     * @summary Publishes this render target's current position AND size to the App Worker.
     *
     * Movement and resize share this one authority so {@link Neo.manager.Window} never combines a
     * fresh origin with stale extents. The full `getWindowData()` snapshot is clone-safe and is
     * consumed by the existing `windowPositionChange` route.
     * @protected
     */
    publishGeometry() {
        let {Manager} = Neo.worker,
            winData   = Neo.Main.getWindowData();

        Manager.sendMessage('app', {
            action: 'windowPositionChange',
            data  : {
                appName: Manager.appName,
                ...winData,
                // `sendMessage()` also stamps this on the envelope, but App.onWindowPositionChange
                // deliberately forwards the nested payload only. Keep the registered render-target
                // identity inside that payload or live updates cannot reach their manager.Window row.
                windowId: Manager.windowId
            }
        })
    }

    /**
     * Returns true in case the dock direction changes from horizontal (left, right)
     * to vertical (bottom, top) or vice versa.
     * @param {String} oldValue
     * @param {String} newValue
     * @returns {Boolean}
     */
    dockDirectionChange(oldValue, newValue) {
        return (oldValue === 'bottom' || oldValue === 'top') && (newValue === 'left' || newValue === 'right')
            || (newValue === 'bottom' || newValue === 'top') && (oldValue === 'left' || oldValue === 'right')
    }

    /**
     * @param {Object} data
     */
    getPosition(data) {
        let {size}                  = data,
            win                     = window,
            {screenLeft, screenTop} = win,
            left, top;

        switch (data.dock) {
            case 'bottom':
                left = screenLeft;
                top  = win.outerHeight + screenTop - 62;
                break
            case 'left':
                left = screenLeft - size;
                top  = screenTop  + 24;
                break
            case 'right':
                left = win.outerWidth + screenLeft;
                top  = screenTop  + 24;
                break
            case 'top':
                left = screenLeft;
                top  = screenTop - size + 86;
                break
        }

        return {left, top}
    }

    /**
     * @param {MouseEvent} event
     */
    onMouseOut(event) {
        let me = this;

        // The config owns the poll while it observes movement; pointer travel must not clear it.
        if (me.observeMovement) {
            return
        }

        if (!event.toElement) {
            me.startPolling()
        } else {
            me.stopPolling()
        }
    }

    /**
     * @param {Object} event
     */
    onResize(event) {
        let me  = this,
            win = window,
            height, width;

        Object.entries(me.windows).forEach(([key, value]) => {
            switch (value.dock) {
                case 'bottom':
                case 'top':
                    width = win.outerWidth;
                    break
                case 'left':
                case 'right':
                    height = win.outerHeight - 28;
                    break
            }

            if (me.adjustWindowPositions) {
                Neo.Main.windowResizeTo({
                    height,
                    width,
                    windowName: key
                });

                me.adjustPositions()
            }
        });

        // A fixed-origin resize is still a geometry change. The conversion metric consumes live
        // extents every frame, so movement-only publication would make its post-resize decision stale.
        me.publishGeometry()
    }

    /**
     * @param {Object} data
     * @param {String} data.dock
     * @param {String} data.name
     * @param {Number} data.size
     */
    registerWindow(data) {
        this.windows[data.name] = data
    }

    /**
     * @summary Arms the movement poll once; a running poll is left untouched.
     * @protected
     */
    startPolling() {
        let me = this;

        if (!me.intervalId) {
            me.intervalId = setInterval(me.checkMovement.bind(me), me.intervalTime)
        }
    }

    /**
     * @summary Clears the movement poll if it is running.
     * @protected
     */
    stopPolling() {
        let me = this;

        if (me.intervalId) {
            clearInterval(me.intervalId);
            me.intervalId = null
        }
    }

    /**
     * Set configs from within the app worker
     * @param {Object} data
     * @param {String} data.appName
     */
    setConfigs(data) {
        delete data.appName;
        delete data.windowId;
        this.set(data)
    }

    /**
     * Docks an existing window to a new side
     * @param {Object} data
     * @param {String} data.dock
     * @param {String} data.name
     */
    setDock(data) {
        let me           = this,
            {dock, name} = data,
            win          = me.windows[name],
            dockDirectionChange, position;

        if (win) {
            dockDirectionChange = me.dockDirectionChange(dock, win.dock);

            win.dock = dock;
            position = me.getPosition(win);

            if (dockDirectionChange) {
                Neo.Main.windowResizeTo({
                    height    : dock === 'bottom' || dock === 'top'   ? win.size : window.outerHeight - 28,
                    width     : dock === 'left'   || dock === 'right' ? win.size : window.outerWidth,
                    windowName: name
                })
            }

            Neo.Main.windowMoveTo({
                windowName: name,
                x         : position.left,
                y         : position.top
            })
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.name
     */
    unregisterWindow(data) {
        delete this.windows[data.name]
    }
}

export default Neo.setupClass(WindowPosition);
