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
     * @param api
     */
    registerApi(api) {
        Object.entries(api.services).forEach(([service, serviceValue]) => {
            Object.entries(serviceValue.methods).forEach(([method, methodValue]) => {
                this.register({
                    id : `${service}.${method}`,
                    method,
                    service,
                    url: methodValue.url || serviceValue.url || api.url
                })
            })
        })
    }
}

Neo.applyClassConfig(RpcApi);

let instance = Neo.create(RpcApi);

Neo.applyToGlobalNs(instance);

export default instance;
