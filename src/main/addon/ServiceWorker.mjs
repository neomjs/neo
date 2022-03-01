import Base from '../../core/Base.mjs';

/**
 * Creates a ServiceWorker instance, in case Neo.config.useServiceWorker is set to true
 * @class Neo.main.addon.ServiceWorker
 * @extends Neo.core.Base
 * @singleton
 */
class ServiceWorker extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.main.addon.ServiceWorker'
         * @protected
         */
        className: 'Neo.main.addon.ServiceWorker',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('../../../ServiceWorker.mjs', {
                type: 'module'
            })
        }
    }
}

Neo.applyClassConfig(ServiceWorker);

let instance = Neo.create(ServiceWorker);

Neo.applyToGlobalNs(instance);

export default instance;
