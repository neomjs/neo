import Base from './Base.mjs';

/**
 * @class Neo.manager.RpcCall
 * @extends Neo.manager.Base
 * @singleton
 */
class RpcCall extends Base {
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
        let method = Neo.manager.RpcApi.get(`${msg.service}.${msg.method}`);

        console.log(msg);
        console.log(method);

        let response = await Neo.Fetch.get(msg);

        return response;
    }
}

Neo.applyClassConfig(RpcCall);

let instance = Neo.create(RpcCall);

Neo.applyToGlobalNs(instance);

export default instance;
