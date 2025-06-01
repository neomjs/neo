import Base          from './Base.mjs';
import WorkerManager from '../../worker/Manager.mjs';

/**
 * Creates a ServiceWorker instance, in case Neo.config.useServiceWorker is set to true
 * @class Neo.main.addon.ServiceWorker
 * @extends Neo.main.addon.Base
 */
class ServiceWorker extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.ServiceWorker'
         * @protected
         */
        className: 'Neo.main.addon.ServiceWorker'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.registerServiceWorker()
    }

    /**
     * @returns {Promise<void>}
     */
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            let me              = this,
                {config}        = Neo,
                {environment}   = config,
                devMode         = environment === 'development',
                hasJsModules    = devMode || environment === 'dist/esm',
                fileName        = hasJsModules ? 'ServiceWorker.mjs' : 'serviceworker.js',
                opts            = hasJsModules ? {type: 'module'} : {},
                path            = (hasJsModules ? config.basePath : config.workerBasePath) + fileName,
                {serviceWorker} = navigator,
                registration;

            registration = await serviceWorker.register(path, opts);

            window.addEventListener('beforeunload', me.onBeforeUnload.bind(me));

            registration.addEventListener('updatefound', () => {
                window.location.reload()
            })

            await serviceWorker.ready;

            serviceWorker.onmessage = WorkerManager.onWorkerMessage.bind(WorkerManager);

            if (!WorkerManager.getWorker('service')) {
                /*
                 * navigator.serviceWorker.controller can be null in case we load a page for the first time
                 * or in case of a force refresh.
                 * See: https://www.w3.org/TR/service-workers/#navigator-service-worker-controller
                 */
                WorkerManager.serviceWorker = registration.active
            }

            WorkerManager.sendMessage('service', {
                action: 'registerNeoConfig',
                data  : config
            })
        }
    }

    /**
     *
     */
    onBeforeUnload() {
        WorkerManager.sendMessage('service', {
            action: 'unregisterPort'
        })
    }
}

export default Neo.setupClass(ServiceWorker);
