import Neo  from '../Neo.mjs';
import Base from './Base.mjs';

/**
 * The Canvas worker is responsible for dynamically manipulating offscreen canvas.
 * See: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
 * @class Neo.worker.Canvas
 * @extends Neo.worker.Base
 * @singleton
 */
class Canvas extends Base {
    static config = {
        /**
         * @member {String} className='Neo.worker.Canvas'
         * @protected
         */
        className: 'Neo.worker.Canvas',
        /**
         * key: value => canvasId: {windowId: OffscreenCanvas}
         * @member {Object} canvasWindowMap={}
         */
        canvasWindowMap: {},
        /**
         * key: value => canvasId: OffscreenCanvas
         * @member {Object} map={}
         */
        map: {},
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'registerCanvas',
                'retrieveCanvas'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {String} workerId='canvas'
     * @protected
     */
    workerId = 'canvas'

    /**
     *
     */
    afterConnect() {
        let me             = this,
            channel        = new MessageChannel(),
            {port1, port2} = channel;

        port1.onmessage = me.onMessage.bind(me);

        me.sendMessage('app', {action: 'registerPort', transfer: port2}, [port2]);

        me.channelPorts.app = port1
    }

    /**
     * @param {Object} data
     */
    registerCanvas(data) {
        let me = this;

        if (data.windowId) {
            me.canvasWindowMap[data.nodeId] ??= {};
            me.canvasWindowMap[data.nodeId][data.windowId] = data.node
        }

        me.map[data.nodeId] = data.node;

        return true
    }

    /**
     * @param {Object} data
     * @param {String} data.nodeId
     * @param {String} data.origin
     * @param {Number} data.windowId
     */
    retrieveCanvas(data) {
        let me     = this,
            canvas = me.canvasWindowMap[data.nodeId]?.[data.windowId];

        if (canvas) {
            me.map[data.nodeId] = canvas
        }

        return {hasCanvas: !!canvas}
    }

    /**
     * @param {Object} msg
     */
    onRegisterNeoConfig(msg) {
        super.onRegisterNeoConfig(msg);

        let path = Neo.config.appPath;

        if (path.endsWith('.mjs')) {
            path = path.slice(0, -8); // removing "/app.mjs"
        }

        import(
            /* webpackExclude: /(?:\/|\\)(dist|node_modules)/ */
            /* webpackMode: "lazy" */
            `../../${path}/canvas.mjs`
        ).then(module => {
            module.onStart()
        })
    }
}

export default Neo.setupClass(Canvas);
