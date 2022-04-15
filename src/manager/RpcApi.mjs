import Base from './Base.mjs';

/**
 * @class Neo.manager.RpcApi
 * @extends Neo.manager.Base
 * @singleton
 */
class RpcApi extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.manager.RpcApi'
         * @protected
         */
        className: 'Neo.manager.RpcApi',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }}

    /**
     * Registers each service & method combination into the collection
     * @param data
     */
    registerApi(data) {
        console.log('registerApi', data);
    }
}

Neo.applyClassConfig(RpcApi);

let instance = Neo.create(RpcApi);

Neo.applyToGlobalNs(instance);

export default instance;
