import Neo     from '../Neo.mjs';
import Base    from './Base.mjs';
import Message from './Message.mjs';

/**
 * The Vdom worker converts vdom templates into vnodes, as well as creating delta-updates.
 * See the tutorials for further infos.
 * @class Neo.worker.VDom
 * @extends Neo.worker.Base
 * @singleton
 */
class VDom extends Base {
    static config = {
        /**
         * @member {String} className='Neo.worker.VDom'
         * @protected
         */
        className: 'Neo.worker.VDom',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {String} workerId='vdom'
     * @protected
     */
    workerId = 'vdom'

    /**
     * @summary Establishes one App channel per realm pair. Advertise the helper only after both renderer
     * configuration and App's port are ready, so even the first update can return its tree directly.
     * @param {Object} msg The incoming message object.
     * @param {Object} [sourcePort] Connecting SharedWorker window.
     */
    onRegisterNeoConfig(msg, sourcePort) {
        super.onRegisterNeoConfig(msg, sourcePort);
        this.connectAppChannel(sourcePort)
    }

    /**
     * @summary Transfers the App end through the window which owns this handshake.
     * @param {Object} [sourcePort]
     * @protected
     */
    connectAppChannel(sourcePort) {
        if (this.appChannelPort) return;

        const {port1, port2} = new MessageChannel();
        this.appChannelPort = port1;
        this.channelOwner = sourcePort;
        port1.onmessage = event => {
            if (this.appChannelPort === port1) this.onMessage(event)
        };
        this.sendMessage('app', {action: 'registerPort', port: sourcePort?.id, transfer: port2}, [port2])
    }

    /** @summary Confirms that this is the current channel before it can replace App's previous channel. */
    onVdomChannelReady() {
        this.channelOwner = null;
        this.appChannelPort.postMessage({action: 'vdomChannelActive'})
    }

    /** @summary Publishes the configured helper's remote methods once App can receive direct replies. */
    onVdomChannelRegistered() {
        import('../vdom/Helper.mjs')
    }

    /**
     * @summary Rejects an update over its App channel even if the rendering window has departed.
     * @param {Object} msg
     * @param {*} error
     */
    reject(msg, error) {
        if (msg.origin === 'app' && Message.isVdomUpdate(msg) && this.appChannelPort) {
            try {
                this.appChannelPort.postMessage({
                    action : 'reply',
                    data   : error === Neo.isDestroyed ? new Error('Remote method target was destroyed') : error,
                    reject : true,
                    replyId: msg.id
                });
                return
            } catch (sendError) {
                error = sendError
            }
        }
        super.reject(msg, error)
    }

    /**
     * @summary A window leaving during the port transfer yields that handshake to another live window.
     * An acknowledged channel belongs to the two workers and outlives individual windows.
     * @param {Object} entry
     * @returns {Boolean}
     */
    removePort(entry) {
        const removed = super.removePort(entry);
        if (removed && this.channelOwner === entry) {
            this.appChannelPort.close();
            this.appChannelPort = null;
            this.channelOwner = null;
            if (this.ports.length) this.connectAppChannel(this.ports[0])
        }
        return removed
    }

    /**
     * @summary Sends update trees directly to App and only the write set to the collecting window.
     * Posting the tree first ensures a clone failure cannot leave an applied DOM write behind.
     * @param {Object} msg
     * @param {*} data
     */
    resolve(msg, data) {
        if (msg.origin !== 'app' || !data?.updateVdom || !Message.isVdomUpdate(msg)) {
            super.resolve(msg, data);
            return
        }

        const {deltas, meta} = data,
              domAckRequired = Boolean(deltas?.length || (meta && Object.keys(meta).length)),
              windowId       = msg.windowId ?? Neo.config.windowId;

        try {
            this.appChannelPort.postMessage({action: 'vdomTreeReply', replyId: msg.id, data, domAckRequired});
            if (domAckRequired && !this.sendMessage(windowId, {
                action: 'updateVdom', id: msg.id, origin: 'app', windowId, deltas, meta, port: msg.port
            })) {
                this.reject(msg, {code: 'NEO_DEAD_PORT', windowId, message: 'VDom update window departed'})
            }
        } catch (error) {
            this.reject(msg, error)
        }
    }
}

export default Neo.setupClass(VDom);
