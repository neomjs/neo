import Base from './Base.mjs';

/**
 * @class Neo.manager.RpcMessage
 * @extends Neo.manager.Base
 * @singleton
 */
class RpcMessage extends Base {
    /**
     * Stores the urls of endpoints for which a setTimeout() call is in progress
     * @member {String[]} endPointTimeouts=[]
     */
    endPointTimeouts = []
    /**
     * internal incrementing flag
     * @member {Number} messageId=1
     * @protected
     */
    messageId = 1
    /**
     * Time window in ms for buffering incoming call requests
     * @member {Number} requestBuffer=20
     */
    requestBuffer = 20
    /**
     * internal incrementing flag
     * @member {Number} transactionId=1
     * @protected
     */
    transactionId = 1

    static getConfig() {return {
        /**
         * @member {String} className='Neo.manager.RpcMessage'
         * @protected
         */
        className: 'Neo.manager.RpcMessage',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Object[]} sorters
         */
        sorters: [{
            direction: 'ASC',
            property : 'id'
        }]
    }}

    /**
     *
     * @param {Object} msg
     * @returns {Promise<any>}
     */
    onMessage(msg) {
        return new Promise((resolve, reject) => {
            let me     = this,
                method = Neo.manager.RpcApi.get(`${msg.service}.${msg.method}`),
                url    = method.url;

            me.register({
                id           : me.messageId,
                method       : msg.method,
                params       : msg.params,
                reject,
                resolve,
                service      : msg.service,
                transactionId: 0,
                url
            });

            me.messageId++;

            if (!me.endPointTimeouts.includes(url)) {
                me.endPointTimeouts.push(url);

                setTimeout(() => {
                    me.resolveBufferTimeout(url);
                }, me.requestBuffer)
            }
        });
    }

    /**
     * @param {String} url
     */
    resolveBufferTimeout(url) {
        console.log('resolveBufferTimeout', url);
        console.log(this.items);

        //let response = await Neo.Fetch.get(msg);
    }
}

Neo.applyClassConfig(RpcMessage);

let instance = Neo.create(RpcMessage);

Neo.applyToGlobalNs(instance);

export default instance;
