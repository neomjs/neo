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
        let me = this,
            left, top;

        Object.entries(me.windows).forEach(([key, value]) => {
            switch (value.dock) {
                case 'bottom':
                    left = data.screenLeft;
                    top  = data.outerHeight  + data.screenTop - 50;
                    break;
                case 'left':
                    left = data.screenLeft - value.size;
                    top  = data.screenTop  + 28;
                    break;
                case 'right':
                    left = data.outerWidth + data.screenLeft;
                    top  = data.screenTop  + 28;
                    break;
                case 'top':
                    left = data.screenLeft;
                    top  = data.screenTop - value.size;
                    break;
            }

            Neo.Main.windowMoveTo({
                windowName: key,
                x         : left,
                y         : top
            });
        });
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
            winData = Neo.Main.getWindowData(),
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
    registerWindow(data) {
        this.windows[data.name] = data;
    }

    /**
     * Docks an existing window to a new side
     * @param {Object} data
     * @param {String} data.dock
     * @param {String} data.name
     */
    setDock(data) {
        let me = this;

        Object.entries(me.windows).forEach(([key, value]) => {
            if (data.name === value.name) {
                value.dock = data.dock;
                console.log(data);

                Neo.Main.windowMoveTo({
                    windowName: key,
                    x         : 100,
                    y         : 100
                });
            }
        });
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