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
    }
}

Neo.applyClassConfig(RpcCall);

let instance = Neo.create(RpcCall);

Neo.applyToGlobalNs(instance);

export default instance;
