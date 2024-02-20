import Base from '../Base.mjs';

/**
 * @class Neo.manager.rpc.Api
 * @extends Neo.manager.Base
 * @singleton
 */
class Api extends Base {
    static config = {
        /**
         * @member {String} className='Neo.manager.rpc.Api'
         * @protected
         */
        className: 'Neo.manager.rpc.Api',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Registers each service & method combination into the collection
     * @param api
     */
    registerApi(api) {
        Object.entries(api.services).forEach(([service, serviceValue]) => {
            Object.entries(serviceValue.methods).forEach(([method, methodValue]) => {
                this.register({
                    id  : `${service}.${method}`,
                    method,
                    service,
                    type: methodValue.type || serviceValue.type || api.type || 'ajax',
                    url : methodValue.url  || serviceValue.url  || api.url
                })
            })
        })
    }
}

let instance = Neo.setupClass(Api);

export default instance;
