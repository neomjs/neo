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
     * @summary Reloads a page that started on another build's worker, once the new build's worker is active.
     *
     * Until the new worker takes over, the previous one answers this page's workers from the previous build's cache,
     * so the session can run files of two builds. The new worker's activation deletes that cache, and the reload loads
     * one build. Its install handler calls `skipWaiting()`, yet Chromium can leave it waiting while the previous worker
     * serves this page, so the page asks again through `onSkipWaiting()`, once a second for up to a minute. A page
     * inside the scope, which the previous worker controls itself, can keep it waiting until the page navigates. The
     * page does not force that navigation: in the replay, one started while the previous worker served the page's
     * startup froze the page.
     *
     * The reload happens at most once per build in a tab's session, so registrations that change hands between builds
     * cannot start a reload loop.
     * @param {ServiceWorkerRegistration} registration
     * @param {String}                    scriptUrl    The absolute URL of the new build's worker
     */
    reloadWhenActive(registration, scriptUrl) {
        let worker = registration.installing || registration.waiting,
            ask    = (attempts=60) => {
                if (worker.state === 'installed' && attempts > 0) {
                    worker.postMessage({action: 'skipWaiting'});
                    setTimeout(() => ask(attempts - 1), 1000)
                }
            },
            reload = () => {
                const key = `neoBuildReload:${scriptUrl}`;

                if (!sessionStorage.getItem(key)) {
                    sessionStorage.setItem(key, '1');
                    WorkerManager.reloadOnce(`The build changed, ${scriptUrl} is active. Reloading.`)
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
