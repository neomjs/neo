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
         * @member {Boolean} observeResize_=false
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

        let me  = this,
            win = window;

        me.screenLeft = win.screenLeft;
        me.screenTop  = win.screenTop;

        win.addEventListener('mouseout', me.onMouseOut.bind(me))
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
        let position;

        Object.entries(this.windows).forEach(([key, value]) => {
            position = this.getPosition(value);

            Neo.Main.windowMoveTo({
                windowName: key,
                x         : position.left,
                y         : position.top
            })
        })
    }

    /**
     *
     */
    checkMovement() {
        let me                      = this,
            {Manager}               = Neo.worker,
            win                     = window,
            {screenLeft, screenTop} = win,
            winData;

        if (me.screenLeft !== screenLeft || me.screenTop !== screenTop) {
            winData = Neo.Main.getWindowData();

            me.adjustWindowPositions && me.adjustPositions();

            Manager.sendMessage('app', {
                action: 'windowPositionChange',
                data  : {
                    appName: Manager.appName,
                    ...winData
                }
            });

            me.screenLeft = screenLeft;
            me.screenTop  = screenTop
        }
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

        switch(data.dock) {
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

        if (!event.toElement) {
            if (!me.intervalId) {
                me.intervalId = setInterval(me.checkMovement.bind(me), me.intervalTime)
            }
        } else if (me.intervalId) {
            clearInterval(me.intervalId);
            me.intervalId = null
        }
    }

    /**
     * @param {Object} event
     */
    onResize(event) { console.log('onResize');
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
        })
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
     * Set configs from within the app worker
     * @param {Object} data
     * @param {String} data.appName
     */
    setConfigs(data) {
        delete data.appName;
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
