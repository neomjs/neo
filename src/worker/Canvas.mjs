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
                'loadModule',
                'registerCanvas',
                'retrieveCanvas',
                'unregisterCanvas'
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
     * @summary Remotely loads an ES module into the Canvas Worker.
     * This method uses a scoped dynamic import to ensure Webpack only bundles
     * relevant modules (inside 'canvas/' directories) for this worker.
     *
     * @param {Object} data
     * @param {String} data.path The path to the module to load (e.g., 'apps/MyApp/canvas/MyShape.mjs').
     * @returns {Promise<Object>} {success: true, path} or {success: false, path, error}
     */
    async loadModule({path}) {
        if (path.endsWith('.mjs')) {
            path = path.slice(0, -4)
        }

        try {
            await import(
                /* webpackInclude: /(?:apps|examples|src)\/.*canvas\/.*\.mjs$/ */
                /* webpackExclude: /(?:\/|\\)(buildScripts|dist|node_modules(?:\/|\\)(?!neo\.mjs)|ai(?:\/|\\)|\.claude(?:\/|\\)|server\.mjs|test(?:\/|\\))/ */
                /* webpackMode: "lazy" */
                `../../${path}.mjs`
            );
            return {success: true, path}
        } catch (e) {
            console.error(`Canvas Worker: Failed to load module ${path}`, e);
            return {success: false, path, error: e.message}
        }
    }

    /**
     * Overrides worker/Base to handle specific messages like registerCanvasDirect
     * @param {MessageEvent} e
     */
    onMessage(e) {
        let msg = e.data;

        if (msg.action === 'registerCanvasDirect') {
            this.registerCanvasDirect(msg)
        } else {
            super.onMessage(e)
        }
    }

    /**
     * @summary Reply-shaped entry point for {@link Neo.worker.Canvas#createPresenterCanvas}.
     *
     * Named `on<Action>` so {@link Neo.worker.Base#onMessage} dispatches to it, and answered through
     * `resolve()` so the caller's `promiseMessage()` settles. That is what makes the caller able to AWAIT a
     * presenter registration instead of holding a callback until some later message happens to arrive.
     *
     * @param {Object} msg
     * @protected
     */
    onCreatePresenterCanvas(msg) {
        this.resolve(msg, this.createPresenterCanvas(msg))
    }

    /**
     * @summary Reply-shaped entry point for {@link Neo.worker.Canvas#readFrame}.
     *
     * The `{result, transfer}` shape is what `resolve()` understands: it moves the pixel buffer rather than
     * copying it, and delivers `result` to the caller. A frame therefore crosses the thread boundary once,
     * and the caller receives a buffer it owns.
     *
     * @param {Object} msg
     * @protected
     */
    onReadFrame(msg) {
        let frame = this.readFrame(msg);

        this.resolve(msg, frame.success ? {result: frame, transfer: [frame.buffer]} : frame)
    }

    /**
     * @param {Object} msg
     */
    onRegisterNeoConfig(msg) {
        super.onRegisterNeoConfig(msg);

        if (Neo.config.useCanvasWorkerStartingPoint) {
            let path = Neo.config.appPath;

            if (path.endsWith('.mjs')) {
                path = path.slice(0, -8); // removing "/app.mjs"
            }

            import(
                /* webpackInclude: /(?:apps|examples|src)\/.*canvas\.mjs$/ */
                /* webpackExclude: /(?:\/|\\)(buildScripts|dist|node_modules(?:\/|\\)(?!neo\.mjs)|ai(?:\/|\\)|\.claude(?:\/|\\)|server\.mjs|test(?:\/|\\))/ */
                /* webpackMode: "lazy" */
                `../../${path}/canvas.mjs`
                ).then(module => {
                module.onStart()
            })
        }
    }

    /**
     * @summary Creates a canvas this worker OWNS, rather than adopting one a document transferred in.
     *
     * The distinction is the whole point. A canvas that arrives from a document carries that document's
     * renderer process with it, and painting into it from a worker hosted elsewhere is what terminates the
     * host — the failure this path exists to make unreachable. A canvas constructed here belongs to this
     * worker, so no paint ever crosses a process boundary and the scene, the contexts and the render loop
     * stay shared exactly as they are today.
     *
     * Registration lands in the same two maps as an adopted canvas, so {@link Neo.canvas.Base#waitForCanvas}
     * finds it without knowing which kind it got. That is why the renderers need no change: they only ever
     * ask for a 2d context and a size, and both are identical on an `OffscreenCanvas` the worker built.
     *
     * Sizes are LOGICAL CSS pixels. `devicePixelRatio` is backing-store resolution and belongs to whoever
     * presents the frame, never to a coordinate.
     *
     * @param {Object} data
     * @param {Number} data.height
     * @param {String} data.nodeId
     * @param {Number} data.width
     * @param {String} data.windowId
     * @returns {Object} {success: Boolean}
     */
    createPresenterCanvas({height, nodeId, width, windowId}) {
        this.registerCanvas({node: new OffscreenCanvas(width, height), nodeId, windowId});

        return {success: true}
    }

    /**
     * @summary Reads a worker-owned canvas's current pixels as a transferable RGBA buffer.
     *
     * The transport is a transferable `ArrayBuffer` rather than an `ImageBitmap` because only the pixel
     * buffer survives in every engine we support: bitmap delivery is a Chromium-only capability for a
     * client outside the producing document, and a path that works in one engine is not a path.
     *
     * This is a PULL, answered from the worker's message queue, and that is what makes it safe without any
     * cooperation from a renderer. A renderer paints its frame synchronously and only then schedules the
     * next one, so a read served between messages can never observe a half-drawn frame. Nothing here needs
     * a renderer to announce that it finished, which is why no renderer changes.
     *
     * Transferring detaches the buffer, so each read allocates a fresh one; the caller owns what it
     * receives and is responsible for releasing it.
     *
     * @param {Object} data
     * @param {String} data.nodeId
     * @param {String} data.windowId
     * @returns {Object} {success: Boolean, buffer: ArrayBuffer, height: Number, width: Number}
     */
    readFrame({nodeId, windowId}) {
        let canvas = this.canvasWindowMap[nodeId]?.[windowId];

        if (!canvas) {
            return {success: false}
        }

        let image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);

        return {buffer: image.data.buffer, height: image.height, success: true, width: image.width}
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
     * @summary Receives an OffscreenCanvas directly from the Main Thread.
     *
     * This is the receiving end of the "Triangular Communication" pattern initiated by `Neo.main.DomAccess.transferCanvasToWorker`.
     * By receiving the canvas directly from Main, we avoid the `OffscreenCanvas` transfer restrictions inherent in Firefox's SharedWorker implementation.
     * Once the canvas is registered internally, this method pings the App Worker back over their direct `MessageChannel` to confirm receipt so the App Worker can proceed with rendering instructions.
     *
     * @param {Object} msg
     * @protected
     */
    registerCanvasDirect(msg) {
        this.registerCanvas(msg);

        // Ping App worker that canvas was received from main.
        this.sendMessage('app', {
            action     : 'canvasRegistered',
            componentId: msg.componentId,
            nodeId     : msg.nodeId
        })
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
     * @param {Object} data
     * @param {String} data.nodeId
     */
    unregisterCanvas(data) {
        let me = this;

        delete me.map[data.nodeId];

        // We could also cleanup canvasWindowMap, but it might be overkill since
        // windowIds are reused. However, for correctness:
        if (me.canvasWindowMap[data.nodeId]) {
            delete me.canvasWindowMap[data.nodeId]
        }
    }
}

export default Neo.setupClass(Canvas);
