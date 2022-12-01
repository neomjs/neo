import Base          from '../../core/Base.mjs';
import WorkerManager from '../../worker/Manager.mjs';

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
            let me            = this,
                config        = Neo.config,
                devMode       = config.environment === 'development',
                fileName      = devMode ? 'ServiceWorker.mjs' : 'serviceworker.js',
                folder        = window.location.pathname.includes('/examples/') ? 'examples/' : 'apps/',
                opts          = devMode ? {type: 'module'} : {},
                path          = (devMode ? config.basePath : config.workerBasePath) + (devMode ? folder : '') + fileName,
                serviceWorker = navigator.serviceWorker;

            window.addEventListener('beforeunload', me.onBeforeUnload.bind(me));

            serviceWorker.register(path, opts)
                .then(registration => {
                    serviceWorker.ready.then(() => {
                        serviceWorker.onmessage = WorkerManager.onWorkerMessage.bind(WorkerManager);

                        if (!WorkerManager.getWorker('service')) {
                            /*
                             * navigator.serviceWorker.controller can be null in case we load a page for the first time
                             * or in case of a force refresh.
                             * See: https://www.w3.org/TR/service-workers/#navigator-service-worker-controller
                             */
                            WorkerManager.serviceWorker = registration.active;
                        }

                        WorkerManager.sendMessage('service', {
                            action: 'registerNeoConfig',
                            data  : config
                        })
                    });
                })
        }
    }

    /**
     *
     */
    onBeforeUnload() {
        WorkerManager.sendMessage('service', {
            action: 'unregisterPort'
        });
    }
}

Neo.applyClassConfig(ServiceWorker);

let instance = Neo.create(ServiceWorker);

Neo.applyToGlobalNs(instance);

export default instance;
