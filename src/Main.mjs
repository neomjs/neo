import Neo                        from './Neo.mjs';
import * as core                  from './core/_export.mjs';
import AmCharts                   from './main/lib/AmCharts.mjs';
import DomAccess                  from './main/DomAccess.mjs';
import DomEvents                  from './main/DomEvents.mjs';
import LocalStorage               from './main/mixins/LocalStorage.mjs';
import OpenStreetMaps             from './main/lib/OpenStreetMaps.mjs';
import {default as WorkerManager} from './worker/Manager.mjs';

/**
 * @class Neo.Main
 * @extends Neo.core.Base
 * @singleton
 */
class Main extends core.Base {
    static getStaticConfig() {return {
        /**
         * True automatically applies the core/Observable.mjs mixin
         * @member {Boolean} observable=true
         * @static
         */
        observable: true
    }}

    static getConfig() {return {
        /**
         * @member {String} className='Neo.Main'
         * @private
         */
        className: 'Neo.Main',
        /**
         * @member {Boolean} singleton=true
         * @private
         */
        singleton: true,
        /**
         * @member {Boolean} isReady=false
         * @private
         */
        isReady: false,
        /**
         * @member {boolean} logAnimationFrames=true
         */
        logAnimationFrames: true,
        /**
         * @member {Array} mixins=[LocalStorage]
         */
        mixins: [LocalStorage],
        /**
         * @member {String} mode='read'
         * @private
         */
        mode: 'read',
        /**
         * @member {Array} readQueue=[]
         * @private
         */
        readQueue: [],
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @private
         */
        remote: {
            app: [
                'createLocalStorageItem',
                'destroyLocalStorageItem',
                'editRoute',
                'readLocalStorageItem',
                'setRoute',
                'updateLocalStorageItem'
            ]
        },
        /**
         * @member {Boolean} running=false
         * @private
         */
        running: false,
        /**
         * @member {Boolean} showFps=false
         */
        showFps: false,
        /**
         * @member {Number} timeLimit=15
         */
        timeLimit: 15,
        /**
         * should be dev only
         * @member {Number} totalFrameCount=0
         * @private
         */
        totalFrameCount: 0,
        /**
         * @member {Array} updateQueue=[]
         * @private
         */
        updateQueue: [],
        /**
         * @member {Array} writeQueue=[]
         * @private
         */
        writeQueue: []
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        DomEvents.on('domContentLoaded', me.onDomContentLoaded, me);

        WorkerManager.on({
            'automount'        : me.onRender,
            'message:mountDom' : me.onMountDom,
            'message:updateDom': me.onUpdateDom,
            'updateVdom'       : me.onUpdateVdom,
            scope              : me
        });
    }

    /**
     * Edit the location.hash value
     * A value of null will remove the given key.
     * @param {Object} data
     */
    editRoute(data) {
        let hashObj = DomEvents.parseHash(window.location.hash.substr(1)),
            hashArr = [];

        if (typeof data === 'string') {
            data = DomEvents.parseHash(data);
        }

        Object.assign(hashObj, data);

        Object.entries(hashObj).forEach(([key, value]) => {
            if (value !== null) {
                hashArr.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
            }
        });

        window.location.hash = hashArr.join('&');
    }

    /**
     *
     */
    onDomContentLoaded() {
        let me = this;

        me.isReady = true;

        if (Neo.config.applyBodyCls) {
            DomAccess.applyBodyCls({cls: ['neo-body']});
        }

        if (Neo.config.useFontAwesome) {
            DomAccess.createStyleSheet(null, null, Neo.config.basePath + 'node_modules/@fortawesome/fontawesome-free/css/all.min.css');
        }

        DomAccess.insertTheme();

        if (Neo.config.isInsideSiesta) {
            DomAccess.adjustSiestaEnvironment();
        }

        // we can not use dynamic imports until webpack is ready to support it.
        // using a static import for now. see:
        // https://github.com/neomjs/neo/issues/393
        /*if (Neo.config.useAmCharts) {
            import('./main/AmCharts.mjs');
        }*/

        if (Neo.config.useGoogleAnalytics) {
            DomAccess.insertGoogleAnalyticsScript();
        }

        if (Neo.config.appPath) {
            WorkerManager.loadApplication(Neo.config.appPath);
        }

        // not in use right now
        // window.addEventListener('resize', me['globalResizeListener'].bind(me));
    }

    // todo: https://developer.mozilla.org/en-US/docs/Web/Events/resize
    globalResizeListener(event) {
        console.log('globalResizeListener', event);
    }

    /**
     *
     * @param data
     */
    onMountDom(data) {
        this.queueWrite(data);

        WorkerManager.sendMessage(data.origin || 'app', {
            action : 'reply',
            replyId: data.id,
            success: true
        });
    }

    /**
     *
     * @param data
     */
    onRender(data) {
        data.data.replyId = data.replyId;
        this.queueWrite(data.data);
    }

    /**
     *
     * @param data
     */
    onUpdateDom(data) {
        this.queueUpdate(data);
    }

    /**
     *
     * @param data
     */
    onUpdateVdom(data) {
        data.data.replyId = data.replyId;
        this.queueUpdate(data.data);
    }

    /**
     *
     * @param queue
     * @param start
     * @returns {number}
     * @private
     */
    processQueue(queue, start) {
        let me    = this,
            limit = me.timeLimit,
            operation;

        while (operation = queue.shift()) {
            if (new Date() - start > limit) {
                queue.unshift(operation);
                return requestAnimationFrame(me.renderFrame.bind(me));
            } else {
                DomAccess[me.mode](operation);
                WorkerManager.resolveDomOperationPromise(operation.replyId);
            }
        }
    }

    /**
     *
     * @param data
     * @private
     */
    queueRead(data) {
        let me = this;
        me.readQueue.push(data);

        if (!me.running) {
            me.running = true;
            requestAnimationFrame(me.renderFrame.bind(me));
        }
    }

    /**
     *
     * @param data
     * @private
     */
    queueUpdate(data) {
        let me = this;
        me.updateQueue.push(data);

        if (!me.running) {
            me.running = true;
            requestAnimationFrame(me.renderFrame.bind(me));
        }
    }

    /**
     *
     * @param data
     * @private
     */
    queueWrite(data) {
        let me = this;
        me.writeQueue.push(data);

        if (!me.running) {
            me.running = true;
            requestAnimationFrame(me.renderFrame.bind(me));
        }
    }

    /**
     * Triggers the different DOM operation queues
     * @private
     */
    renderFrame() {
        let me      = this,
            read    = me.readQueue,
            update  = me.updateQueue,
            write   = me.writeQueue,
            reading = me.mode === 'read',
            start   = new Date();

        if (me.logAnimationFrames) {
            me.totalFrameCount++;
            console.log('Total Frames: ' + me.totalFrameCount);
        }

        if (reading || !write.length) {
            me.mode = 'read';
            if (me.processQueue(read, start)) {
                return;
            }
        }

        if (update.length) {
            me.mode = 'update';
            if (me.processQueue(update, start)) {
                return;
            }
        }

        if (write.length) {
            me.mode = 'write';
            if (me.processQueue(write, start)) {
                return;
            }
        }

        me.running = false;
    }

    /**
     * Change the location.hash value
     * @param {Object} data
     * @param {String} data.value
     */
    setRoute(data) {
        window.location.hash = data.value;
    }
}

Neo.applyClassConfig(Main);

let instance = Neo.create(Main);

Neo.applyToGlobalNs(instance);

export default instance;