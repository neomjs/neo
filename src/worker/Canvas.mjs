import Neo       from '../Neo.mjs';
import Base      from './Base.mjs';
import * as core from '../core/_export.mjs';

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
         * key: value => canvasId: OffscreenCanvas
         * @member {Object} map={}
         */
        map: {},
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String} workerId='canvas'
         * @protected
         */
        workerId: 'canvas'
    }

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
    onRegisterCanvas(data) {
        this.map[data.nodeId] = data.node;

        Neo.currentWorker.sendMessage(data.origin, {
            action : 'reply',
            replyId: data.id,
            success: true
        })
    }

    /**
     * @param {Object} msg
     */
    onRegisterNeoConfig(msg) {
        super.onRegisterNeoConfig(msg);

        let path = Neo.config.appPath.slice(0, -8); // removing "/app.mjs"

        import(
            /* webpackInclude: /\/canvas.mjs$/ */
            /* webpackExclude: /\/node_modules/ */
            /* webpackMode: "lazy" */
            `../../${path}/canvas.mjs`
        ).then(module => {
            module.onStart()
        })
    }
}

let instance = Neo.setupClass(Canvas);

export default instance;
