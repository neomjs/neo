import Base               from '../core/Base.mjs';
import Message            from './Message.mjs';
import RemoteMethodAccess from './mixin/RemoteMethodAccess.mjs';

/**
 * @class Neo.worker.ServiceBase
 * @extends Neo.core.Base
 * @abstract
 */
class ServiceBase extends Base {
    /**
     * @member {Object[]} promises=[]
     */
    promises = []

    static getConfig() {return {
        /**
         * @member {String} className='Neo.worker.ServiceBase'
         * @protected
         */
        className: 'Neo.worker.ServiceBase',
        /**
         * @member {String} cacheName='neo-runtime'
         */
        cacheName: 'neo-runtime',
        /**
         * @member {String[]|null} cachePaths
         */
        cachePaths: [
            'raw.githubusercontent.com/',
            '/dist/production/',
            '/fontawesome',
            '/resources/'
        ],
        /**
         * @member {String[]|Neo.core.Base[]|null} mixins=[RemoteMethodAccess]
         */
        mixins: [RemoteMethodAccess],
        /**
         * @member {String|null} workerId=null
         * @protected
         */
        workerId: null
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        Object.assign(globalThis, {
            onactivate: me.onActivate.bind(me),
            onfetch   : me.onFetch   .bind(me),
            oninstall : me.onInstall .bind(me),
            onmessage : me.onMessage .bind(me)
        });

        Neo.currentWorker = me;
        Neo.workerId      = me.workerId;
    }

    /**
     * @param {Object} event
     */
    onActivate(event) {
        console.log('onActivate', event);
    }

    /**
     * @param {Object} event
     */
    onFetch(event) {
        let hasMatch = false,
            request  = event.request,
            key;

        for (key of this.cachePaths) {
            if (request.url.includes(key)) {
                hasMatch = true;
                break;
            }
        }

        hasMatch && event.respondWith(
            caches.match(request).then(cachedResponse => {
                if (cachedResponse) {
                    // console.log('cached', cachedResponse);
                    return cachedResponse;
                }

                return caches.open(this.cacheName)
                    .then(cache    => fetch(request)
                    .then(response => cache.put(request, response.clone())
                    .then(()       => response)
                ));
            })
        );
    }

    /**
     * @param {Object} event
     */
    onInstall(event) {
        console.log('onInstall', event);
        globalThis.skipWaiting();
    }

    /**
     * @param {Object} event
     */
    onMessage(event) {
        let me      = this,
            data    = event.data,
            action  = data.action,
            replyId = data.replyId,
            promise;

        if (!action) {
            throw new Error('Message action is missing: ' + data.id);
        }

        if (action !== 'reply') {
            me['on' + Neo.capitalize(action)](data);
        } else if (promise = action === 'reply' && me.promises[replyId]) {
            promise[data.reject ? 'reject' : 'resolve'](data.data);
            delete me.promises[replyId];
        }
    }

    /**
     * @param {Object} msg
     */
    onPing(msg) {
        this.resolve(msg, {originMsg: msg});
    }

    /**
     * @param {Object} msg
     */
    onRegisterNeoConfig(msg) {
        Neo.config = Neo.config || {};
        Object.assign(Neo.config, msg.data);
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

            me.promises[msgId] = {reject, resolve};
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

        let me      = this,
            port    = me.channelPorts[dest] ? me.channelPorts[dest] : globalThis,
            message = new Message(opts);

        port.postMessage(message, transfer);
        return message;
    }
}

Neo.applyClassConfig(ServiceBase);

export default ServiceBase;
