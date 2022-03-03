import Base               from '../../core/Base.mjs';
import RemoteMethodAccess from '../../worker/mixin/RemoteMethodAccess.mjs';
import WorkerManager      from '../../worker/Manager.mjs';

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
         * @member {String[]|Neo.core.Base[]|null} mixins=[RemoteMethodAccess]
         */
        mixins: [RemoteMethodAccess],
        /**
         * @member {ServiceWorkerRegistration|null} registration=null
         * @protected
         */
        registration: null,
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
            let me = this;

            navigator.serviceWorker.register('../../../ServiceWorker.mjs', {type: 'module'})
                .then(registration => {
                    me.registration = registration;

                    navigator.serviceWorker.onmessage = WorkerManager.onWorkerMessage.bind(WorkerManager);

                    WorkerManager.sendMessage('service', {
                        action: 'registerNeoConfig',
                        data  : Neo.config
                    });
                })
        }
    }
}

Neo.applyClassConfig(ServiceWorker);

let instance = Neo.create(ServiceWorker);

Neo.applyToGlobalNs(instance);

export default instance;
