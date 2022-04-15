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
     * @param msg
     * @returns {Promise<any>}
     */
    async onMessage(msg) {
        return new Promise((resolve, reject) => {
            let me     = this,
                method = Neo.manager.RpcApi.get(`${msg.service}.${msg.method}`),
                url    = method.url;

            me.register({
                id     : me.transactionId,
                method : msg.method,
                params : msg.params,
                reject,
                resolve,
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

Neo.applyClassConfig(RpcCall);

let instance = Neo.create(RpcCall);

Neo.applyToGlobalNs(instance);

export default instance;
