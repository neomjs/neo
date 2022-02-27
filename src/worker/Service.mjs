import Base               from '../core/Base.mjs';
import Message            from './Message.mjs';
import RemoteMethodAccess from './mixin/RemoteMethodAccess.mjs';

/**
 * @class Neo.worker.Service
 * @extends Neo.core.Base
 * @abstract
 */
class Service extends Base {
    /**
     * @member {Object[]} promises=[]
     */
    promises = []

    static getConfig() {return {
        /**
         * @member {String} className='Neo.worker.Service'
         * @protected
         */
        className: 'Neo.worker.Service',
        /**
         * @member {String[]|Neo.core.Base[]|null} mixins=[RemoteMethodAccess]
         */
        mixins: [RemoteMethodAccess],
        /**
         * @member {String} workerId='service'
         * @protected
         */
        workerId: 'service'
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        Object.assign(globalThis, {
            activate : me.onActivate.bind(me),
            fetch    : me.onFetch   .bind(me),
            install  : me.onInstall .bind(me),
            onmessage: me.onMessage .bind(me)
        });

        Neo.currentWorker = me;
        Neo.workerId      = me.workerId;
    }

    /**
     * @param {Object} e
     */
    onActivate(e) {
        console.log('onActivate', e);
    }

    /**
     * @param {Object} e
     */
    onFetch(e) {
        console.log('onFetch', e);
    }

    /**
     * @param {Object} e
     */
    onInstall(e) {
        console.log('onInstall', e);
    }

    /**
     * @param {Object} e
     */
    onMessage(e) {
        let me      = this,
            data    = e.data,
            action  = data.action,
            replyId = data.replyId,
            promise;

        if (!action) {
            throw new Error('Message action is missing: ' + data.id);
        }

        if (action !== 'reply') {
            me['on' + Neo.capitalize(action)](data);
        } else if (promise = action === 'reply' && me.promises[replyId]) {
            if (data.reject) {
                promise.reject(data.data);
            } else {
                promise.resolve(data.data);
            }

            delete me.promises[replyId];
        }
    }

    /**
     * @param {Object} msg
     */
    onPing(msg) {
        this.resolve(msg, {
            originMsg: msg
        });
    }


    /**
     * @param {String} dest app, data, main or vdom (excluding the current worker)
     * @param {Object} opts configs for Neo.worker.Message
     * @param {Array} [transfer] An optional array of Transferable objects to transfer ownership of.
     * If the ownership of an object is transferred, it becomes unusable (neutered) in the context it was sent from
     * and becomes available only to the worker it was sent to.
     * @returns {Promise<any>}
     */
    promiseMessage(dest, opts, transfer) {
        let me = this;

        return new Promise(function(resolve, reject) {
            let message = me.sendMessage(dest, opts, transfer),
                msgId   = message.id;

            me.promises[msgId] = {
                resolve,
                reject
            };
        });
    }

    /**
     * @param {String} dest app, data, main or vdom (excluding the current worker)
     * @param {Object} opts configs for Neo.worker.Message
     * @param {Array} [transfer] An optional array of Transferable objects to transfer ownership of.
     * If the ownership of an object is transferred, it becomes unusable (neutered) in the context it was sent from
     * and becomes available only to the worker it was sent to.
     * @returns {Neo.worker.Message}
     * @protected
     */
    sendMessage(dest, opts, transfer) {
        opts.destination = dest;

        let me = this,
            message, port, portObject;

        if (me.channelPorts[dest]) {
            port = me.channelPorts[dest];
        } else if (!me.isSharedWorker) {
            port = globalThis;
        } else {
            if (opts.port) {
                port = me.getPort({id: opts.port}).port;
            } else if (opts.appName) {
                portObject = me.getPort({appName: opts.appName});
                port       = portObject.port;

                opts.port = portObject.id;
            } else {
                port = me.ports[0].port;
            }
        }

        message = new Message(opts);

        port.postMessage(message, transfer);
        return message;
    }
}

Neo.applyClassConfig(Service);

export default Service;
