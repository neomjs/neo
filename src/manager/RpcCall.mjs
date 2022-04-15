import Base from './Base.mjs';

/**
 * @class Neo.manager.RpcCall
 * @extends Neo.manager.Base
 * @singleton
 */
class RpcCall extends Base {
    /**
     * Time window in ms for buffering incoming call requests
     * @member {Number} callBuffer=20
     */
    callBuffer = 20
    /**
     * Stores the urls of endpoints for which a setTimeout() call is in progress
     * @member {String[]} endPointTimeouts=[]
     */
    endPointTimeouts = []
    /**
     * internal incrementing flag
     * @member {Number} transactionId=1
     * @protected
     */
    transactionId = 1

    static getConfig() {return {
        /**
         * @member {String} className='Neo.manager.RpcCall'
         * @protected
         */
        className: 'Neo.manager.RpcCall',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }}

    /**
     *
     * @param msg
     * @returns {Promise<any>}
     */
    async onMessage(msg) {
        let me     = this,
            method = Neo.manager.RpcApi.get(`${msg.service}.${msg.method}`),
            url    = method.url;

        console.log(msg);
        console.log(method);

        me.register({
            id     : me.transactionId,
            method : msg.method,
            params : msg.params,
            service: msg.service,
            url
        });

        me.transactionId++;

        if (!me.endPointTimeouts.includes(url)) {
            me.endPointTimeouts.push(url);

            setTimeout(() => {
                me.resolveBufferTimeout(url);
            }, me.callBuffer)
        }

        let response = await Neo.Fetch.get(msg);

        return response;
    }

    /**
     * @param {String} url
     */
    resolveBufferTimeout(url) {
        console.log('resolveBufferTimeout', url);
        console.log(this.items);
    }
}

Neo.applyClassConfig(RpcCall);

let instance = Neo.create(RpcCall);

Neo.applyToGlobalNs(instance);

export default instance;
