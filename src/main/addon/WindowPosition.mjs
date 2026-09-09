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
     * The one-shot pointer probe that measures the viewport origin. Non-null only while a sample is
     * outstanding, so re-arming is idempotent and no window carries a standing pointer listener.
     * @member {Function|null} viewportProbe=null
     * @protected
     */
    viewportProbe = null

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

        window[value ? 'addEventListener' : 'removeEventListener']('resize', me.resizeListener);

        value ? me.armViewportProbe() : me.disarmViewportProbe()
    }

    /**
     * @summary Releases an outstanding pointer sample when observation stops.
     *
     * Without this, a probe armed while observing outlives it: the `once` listener stays attached
     * and the next pointer motion writes an offset and publishes geometry for a window that has
     * stopped observing. `armViewportProbe`'s promise is that no window carries a standing pointer
     * listener, and that promise has to survive being switched off.
     * @protected
     */
    disarmViewportProbe() {
        let me = this;

        if (me.viewportProbe) {
            window.removeEventListener('pointermove', me.viewportProbe, {capture: true});
            me.viewportProbe = null
        }
    }

    /**
     * @summary Arms a single pointer sample that measures where this window's viewport actually
     * starts inside its frame.
     *
     * `event.screenX - event.clientX` IS the viewport's screen-space left edge — the browser states
     * it instead of us inferring it, so one reading survives a docked devtools panel, a platform's
     * border widths and the macOS menu bar alike. What {@link Neo.manager.Window#calculateGeometry}
     * has to guess from `outerWidth - innerWidth` is WHICH edge lost the space, and a panel docked
     * left and one docked right make that difference identical — the side is simply not in those
     * numbers. It is in this one.
     *
     * Stored relative to the frame, because that offset is invariant under movement: only a resize
     * can change it, and a resize is an event, so this needs no poll. One sample, then the listener
     * removes itself; a window nobody observes never arms one at all.
     * @protected
     */
    armViewportProbe() {
        let me = this;

        if (me.viewportProbe) return;

        me.viewportProbe = event => {
            // `screenLeft`/`screenTop`, not `screenX`/`screenY`: aliases on a real window, but this
            // offset is consumed relative to the frame origin `getWindowData` publishes, and that
            // is the pair it publishes. One name for one quantity.
            let win = window,
                x   = event.screenX - event.clientX - win.screenLeft,
                y   = event.screenY - event.clientY - win.screenTop;

            let old = win.neoViewportOffset;

            me.viewportProbe = null;

            if (!Number.isFinite(x) || !Number.isFinite(y)) return;

            win.neoViewportOffset = {x, y};

            // Change-driven, exactly like `checkMovement`: a publication is a worker round trip, and
            // a sample that confirms the offset we already hold is not news. Publishing on every
            // pointer sample would inject a message into whatever gesture happens to be running.
            if (!old || old.x !== x || old.y !== y) {
                me.publishGeometry()
            }
        };

        window.addEventListener('pointermove', me.viewportProbe, {capture: true, once: true, passive: true})
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

        // A native operation explicitly publishes before its effect marker is released. Advancing
        // this baseline prevents the poll from echoing that same position as an untagged user move.
        if (winData.nativeEffect) {
            this.set({screenLeft: winData.screenLeft, screenTop: winData.screenTop})
        }

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
        me.publishGeometry();

        // A resize is the only EVENT that reports the viewport moving inside its frame, so this is
        // where the measured offset goes stale and has to be taken again. Not the only cause: a
        // panel re-docked from one side to the other at equal width changes neither `innerWidth`
        // nor `innerHeight`, fires nothing, and leaves the previous offset standing. That case is
        // still no worse than the assumptions it replaced, and it is stated rather than papered
        // over — see `usableViewportOffset` for the other known bound.
        me.armViewportProbe()
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
