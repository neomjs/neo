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
                distEsm         = environment === 'dist/esm',
                useMjsFiles     = devMode || distEsm,
                fileName        = useMjsFiles ? 'ServiceWorker.mjs' : 'serviceworker.js',
                opts            = {type: 'module'},
                path            = (useMjsFiles ? config.basePath : config.workerBasePath) + fileName,
                {serviceWorker} = navigator,
                previous, registration, scriptUrl;

            if (distEsm) {
                path = path.substring(6)
            }

            // A build registers its worker under its own id: the changed script URL makes the browser install it
            // although its bytes may equal the previous build's, and the worker keys its cache on the id
            if (config.buildId) {
                path += '?buildId=' + encodeURIComponent(config.buildId)
            }

            scriptUrl    = new URL(path, document.baseURI).href;
            previous     = (await serviceWorker.getRegistration(scriptUrl))?.active;
            registration = await serviceWorker.register(path, opts);

            previous && previous.scriptURL !== scriptUrl && me.reloadWhenActive(registration, scriptUrl);

            window.addEventListener('beforeunload', me.onBeforeUnload.bind(me));

            await serviceWorker.ready;

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

    /**
     * @summary Activates the new build's worker and reloads the page once it is active, for a page that started on
     * another build's.
     *
     * Until the new worker takes over, the previous one answers this page's workers from the previous build's cache,
     * so the session can run files of two builds. Its activation deletes that cache, and the reload loads one build.
     *
     * The worker's install handler calls `skipWaiting()`, yet Chromium can still leave it waiting while the previous
     * build's worker serves this page's workers, and does not retry once that worker is idle. Asking again through
     * `onSkipWaiting()`, once a second for up to a minute, activates it.
     * @param {ServiceWorkerRegistration} registration
     * @param {String}                    scriptUrl    The absolute URL of the new build's worker
     */
    reloadWhenActive(registration, scriptUrl) {
        let worker = registration.installing || registration.waiting,
            reload = () => WorkerManager.reloadOnce(`The build changed, ${scriptUrl} is active. Reloading.`),
            ask    = (attempts=60) => {
                if (worker.state === 'installed' && attempts > 0) {
                    worker.postMessage({action: 'skipWaiting'});
                    setTimeout(() => ask(attempts - 1), 1000)
                }
            };

        if (registration.active?.scriptURL === scriptUrl) {
            reload()
        } else if (worker) {
            worker.addEventListener('statechange', () => {
                worker.state === 'installed' && ask();
                worker.state === 'activated' && reload()
            });

            ask()
        }
    }
}

export default Neo.setupClass(ServiceWorker);
