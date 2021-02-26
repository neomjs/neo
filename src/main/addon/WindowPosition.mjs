import Base from '../../core/Base.mjs';

/**
 *
 * @class Neo.main.addon.WindowPosition
 * @extends Neo.core.Base
 * @singleton
 */
class WindowPosition extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.main.addon.WindowPosition'
         * @protected
         */
        className: 'Neo.main.addon.WindowPosition',
        /**
         * @member {String|null} intervalId=null
         */
        intervalId: null,
        /**
         * @member {Number} intervalTime=100
         */
        intervalTime: 20,
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'registerWindow',
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
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Object} windows={}
         * @protected
         */
        windows: {}
    }}

    /**
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me  = this,
            win = window;

        me.screenLeft = win.screenLeft;
        me.screenTop  = win.screenTop;

        win.addEventListener('mouseout', me.onMouseOut.bind(me));
        win.addEventListener('resize',   me.onResize.bind(me));
    }

    /**
     *
     * @param {Object} data
     */
    adjustPositions(data) {
        let position;

        Object.entries(this.windows).forEach(([key, value]) => {
            position = this.getPosition(value);

            Neo.Main.windowMoveTo({
                windowName: key,
                x         : position.left,
                y         : position.top
            });
        });
    }

    /**
     *
     * @param {Object} data
     */
    getPosition(data) {
        let win = window,
            left, top;

        switch (data.dock) {
            case 'bottom':
                left = win.screenLeft;
                top  = win.outerHeight + win.screenTop - 50;
                break;
            case 'left':
                left = win.screenLeft - data.size;
                top  = win.screenTop  + 28;
                break;
            case 'right':
                left = win.outerWidth + win.screenLeft;
                top  = win.screenTop  + 28;
                break;
            case 'top':
                left = win.screenLeft;
                top  = win.screenTop - data.size;
                break;
        }

        return {
            left: left,
            top : top
        };
    }

    /**
     *
     */
    checkMovement() {
        let me         = this,
            Manager    = Neo.worker.Manager,
            win        = window,
            screenLeft = win.screenLeft,
            screenTop  = win.screenTop,
            winData;

        if (me.screenLeft !== screenLeft || me.screenTop !== screenTop) {
            winData = Neo.Main.getWindowData();

            me.adjustPositions(winData);

            Manager.sendMessage('app', {
                action: 'windowPositionChange',
                data  : {
                    appName: Manager.appName,
                    ...winData
                }
            });

            me.screenLeft = screenLeft;
            me.screenTop  = screenTop;
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
            || (newValue === 'bottom' || newValue === 'top') && (oldValue === 'left' || oldValue === 'right');
    }

    /**
     *
     * @param {MouseEvent} event
     */
    onMouseOut(event) {
        let me = this;

        if (!event.toElement) {
            if (!me.intervalId) {
                me.intervalId = setInterval(me.checkMovement.bind(me), me.intervalTime);
            }
        } else if (me.intervalId) {
            clearInterval(me.intervalId);
            me.intervalId = null;
        }
    }

    /**
     *
     * @param {Object} event
     */
    onResize(event) {
        let me      = this,
            winData = Neo.Main.getWindowData(), // todo: use window instead
            height, width;

        Object.entries(me.windows).forEach(([key, value]) => {
            switch (value.dock) {
                case 'bottom':
                case 'top':
                    width = winData.outerWidth;
                    break;
                case 'left':
                case 'right':
                    height = winData.outerHeight - 28;
                    break;
            }

            Neo.Main.windowResizeTo({
                height    : height,
                width     : width,
                windowName: key
            });
        });

        me.adjustPositions(winData);
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.dock
     * @param {String} data.name
     * @param {Number} data.size
     */
    registerWindow(data) {console.log(data);
        this.windows[data.name] = data;
    }

    /**
     * Docks an existing window to a new side
     * @param {Object} data
     * @param {String} data.dock
     * @param {String} data.name
     */
    setDock(data) {
        let me   = this,
            dock = data.dock,
            name = data.name,
            win  = me.windows[name],
            dockDirectionChange, position;

        if (win) {
            dockDirectionChange = me.dockDirectionChange(dock, win.dock);

            win.dock = dock;
            position = me.getPosition(win);

            Neo.Main.windowMoveTo({
                windowName: name,
                x         : position.left,
                y         : position.top
            });

            if (dockDirectionChange) {
                Neo.Main.windowResizeTo({
                    height    : dock === 'bottom' || dock === 'top'   ? win.size : window.outerHeight,
                    width     : dock === 'left'   || dock === 'right' ? win.size : window.outerWidth,
                    windowName: name
                });
            }
        }
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.name
     */
    unregisterWindow(data) {
        delete this.windows[data.name];
    }
}

Neo.applyClassConfig(WindowPosition);

let instance = Neo.create(WindowPosition);

Neo.applyToGlobalNs(instance);

export default instance;