import Base               from '../core/Base.mjs';
import Message            from './Message.mjs';
import RemoteMethodAccess from './mixin/RemoteMethodAccess.mjs';

/**
 * @summary The programmable network layer of the Neo Application Engine.
 *
 * Unlike traditional Service Workers which are often static scripts, `ServiceBase` is a fully reactive
 * Neo.mjs class that allows the App Worker (and by extension, AI Agents via Neural Link) to orchestrate
 * the application's "physical reality"—network requests, caching, and asset availability—in real-time.
 *
 * **Key Responsibilities:**
 * 1.  **Asset Caching:** Manages the `neo-runtime` cache, storing core framework files, app logic, and resources.
 * 2.  **Offline Support:** Intercepts fetch requests to serve cached assets when offline (`onFetch`).
 * 3.  **Pre-emptive Asset Resolution:** Exposes the `preloadAssets` remote method, enabling AI Agents to
 *     time-shift network latency by predicting user intent and physically preparing the application state
 *     (assets, chunks) *before* the user acts. This achieves true "Just-in-Time" UX without page reloads.
 * 4.  **Multi-Context Communication:** Establishes message channels with all connected clients (browser tabs),
 *     enabling the "Shared Worker" pattern where one App Worker can control multiple windows.
 * 5.  **Lifecycle Management:** Handles `install` and `activate` events to manage cache versioning and cleanup.
 *
 * **Architectural Note:**
 * This class transforms the Service Worker from a passive cache into an active **Runtime Actor**.
 * Because it participates in the `RemoteMethodAccess` system, an AI Agent can inspect the current cache state,
 * decide what resources are needed for a future task, and command the Service Worker to fetch them immediately—
 * effectively bridging the gap between "Generative UI" and "Instant Performance."
 *
 * @class Neo.worker.ServiceBase
 * @extends Neo.core.Base
 * @abstract
 * @see Neo.main.addon.ServiceWorker
 */
class ServiceBase extends Base {
    static config = {
        /**
         * @member {String} className='Neo.worker.ServiceBase'
         * @protected
         */
        className: 'Neo.worker.ServiceBase',
        /**
         * The name of the CacheStorage key.
         * Appends the `version` property to create unique cache entries (e.g., "neo-runtime-1.0.0").
         * @member {String} cacheName_='neo-runtime'
         * @reactive
         */
        cacheName_: 'neo-runtime',
        /**
         * @member {String[]|Neo.core.Base[]|null} mixins=[RemoteMethodAccess]
         */
        mixins: [RemoteMethodAccess],
        /**
         * Flag to enable the automatic 404 recovery strategy.
         * If true, 404 errors on guarded paths will trigger a client reload.
         * @member {Boolean} reloadOn404=true
         */
        reloadOn404: true,
        /**
         * Remote method access for other workers.
         * Defines which methods can be called via RPC from the App Worker.
         * @member {Object} remote={app: [//...]}
         * @protected
         * @reactive
         */
        remote: {
            app: [
                'clearCache',
                'clearCaches',
                'preloadAssets',
                'removeAssets'
            ]
        }
    }

    /**
     * List of path partials that should be cached dynamically.
     * Requests matching these strings will be cached upon successful fetch.
     * @member {String[]} cachePaths
     */
    cachePaths = [
        'raw.githubusercontent.com/',
        '/dist/esm/',
        '/dist/production/',
        '/fontawesome',
        '/node_modules',
        '/resources/'
    ]
    /**
     * Registry of active message ports for connected clients (tabs/windows).
     * Used to route messages to specific windows.
     * @member {Object[]|null} channelPorts=null
     * @protected
     */
    channelPorts = null
    /**
     * The most recently active client (source of the last message).
     * @member {Client|null} lastClient=null
     * @protected
     */
    lastClient = null
    /**
     * Timestamp of the last triggered reload to prevent loops.
     * @member {Number|null} lastReload=null
     * @protected
     */
    lastReload = null
    /**
     * List of path partials that should be forced to load from network first.
     *
     * **Strategy: Network First, Cache Fallback**
     * These files (`DefaultConfig.mjs`, `neo-config.json`) contain the application version.
     * If they are served from a stale cache, the App Worker will initialize with an old version string.
     * It will then perform a handshake with the Service Worker (which is likely new).
     * The SW will detect the mismatch (`App v1 !== SW v2`) and command a reload.
     * Without Network First, the browser might serve the stale config again, causing an infinite reload loop.
     *
     * @member {String[]} networkFirstPaths=['DefaultConfig.mjs','neo-config.json']
     */
    networkFirstPaths = [
        'DefaultConfig.mjs',
        'neo-config.json'
    ]
    /**
     * @member {Object[]} promises=[]
     * @protected
     */
    promises = []
    /**
     * @member {String[]} remotes=[]
     * @protected
     */
    remotes = []
    /**
     * @member {Object[]} remotesToRegister=[]
     * @protected
     */
    remotesToRegister = []
    /**
     * @member {String|null} workerId=null
     * @protected
     */
    workerId = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me   = this,
            bind = name => me[name].bind(me);

        me.channelPorts = [];

        // Bind standard Service Worker lifecycle events to class methods.
        Object.assign(globalThis, {
            onactivate: bind('onActivate'),
            onfetch   : bind('onFetch'),
            oninstall : bind('onInstall'),
            onmessage : bind('onMessage')
        });

        Neo.currentWorker = me;
        Neo.workerId      = me.workerId
    }

    /**
     * Triggered when accessing the cacheName config.
     * Appends the application version to ensure cache invalidation on upgrades.
     * @param {String} value
     * @protected
     */
    beforeGetCacheName(value) {
        return value + '-' + this.version
    }

    /**
     * Lazy cleanup of old caches.
     * Iterates over all caches and removes those matching the prefix but not the current version.
     * @returns {Promise<void>}
     */
    async cleanUpCaches() {
        let me   = this,
            keys = await caches.keys(),
            key;

        for (key of keys) {
            // Clear caches for prior SW versions, without touching non-related caches
            if (key.startsWith(me._cacheName) && key !== me.cacheName) {
                console.log('Deleting old cache:', key);
                await me.clearCache(key)
            }
        }
    }

    /**
     * Deletes a specific named cache.
     * Accessible remotely from the App Worker.
     * @param {String} name=this.cacheName
     * @returns {Promise<Object>}
     */
    async clearCache(name=this.cacheName) {
        await caches.delete(name);
        return {success: true}
    }

    /**
     * Nuke option: Deletes ALL caches managed by this origin.
     * Use with caution. Accessible remotely.
     * @returns {Promise<Object>}
     */
    async clearCaches() {
        let keys = await caches.keys();
        await Promise.all(keys.map(name => caches.delete(name)));
        return {success: true}
    }

    /**
     * Establishes a 2-way MessageChannel with a connecting client (window).
     * This is the handshake that allows the App Worker to control this Service Worker.
     * @param {Client} client
     */
    createMessageChannel(client) {
        let me             = this,
            channel        = new MessageChannel(),
            {port1, port2} = channel;

        // Listen for messages on our end (port1)
        port1.onmessage = me.onMessage.bind(me);

        // Inform the client about any remote methods we want to expose to it
        me.remotesToRegister.forEach(remote => {
            port1.postMessage({
                action   : 'registerRemote',
                className: remote.className,
                methods  : remote.methods
            })
        });

        // Send the other end (port2) to the App Worker (via the Main Thread/Client)
        me.sendMessage('app', {action: 'registerPort', transfer: port2}, [port2]);

        me.channelPorts.push({
            clientId   : client.id,
            destination: 'app',
            port       : port1
        })
    }

    /**
     * @param {String} destination
     * @param {String} clientId=this.lastClient.id
     * @returns {MessagePort|null}
     */
    getPort(destination, clientId=this.lastClient?.id) {
        for (let port of this.channelPorts) {
            if (clientId === port.clientId && destination === port.destination) {
                return port.port
            }
        }

        return null
    }

    /**
     * @param {String} name
     * @returns {Boolean}
     */
    hasWorker(name) {
        return !!this.getPort(name) || !!this.lastClient
    }

    /**
     * Ignore the call in case there is no connected client in place yet
     */
    initRemote() {
        let me           = this,
            lastClientId = me.lastClient?.id;

        if (lastClientId && !me.remotes.includes(lastClientId)) {
            me.remotes.push(lastClientId);
            super.initRemote()
        }
    }

    /**
     * Intercepts 404 errors on guarded paths (dist/production, src) to detect version mismatches.
     * If a mismatch is suspected (old app asking for deleted asset), triggers a forced client reload.
     *
     * Use Case: "Reactive Recovery" for when the Boot-Time check passes (or hasn't run) but the
     * environment changes mid-session (Atomic Deployment deletes assets).
     *
     * @param {ExtendableMessageEvent} event
     */
    async on404(event) {
        let me = this;

        if (me.reloadOn404) {
            // Check paths: dist/production, dist/esm, src
            let url = event.request.url;

            if (url.includes('/dist/production/') || url.includes('/dist/esm/') || url.includes('/src/')) {
                let now = Date.now();

                if (!me.lastReload || now - me.lastReload > 5000) {
                    me.lastReload = now;

                    let client = await clients.get(event.clientId);

                    if (client) {
                        console.warn('Neo: 404 on guarded asset. Reloading.', url);
                        client.postMessage({
                            action         : 'remoteMethod',
                            data           : {force: true},
                            remoteClassName: 'Neo.Main',
                            remoteMethod   : 'reloadWindow'
                        })
                    }
                }
            }
        }
    }

    /**
     * Handle the 'activate' event.
     * Cleans up old caches that don't match the current version.
     * @param {ExtendableMessageEvent} event
     */
    onActivate(event) {
        console.log('Neo ServiceWorker activated:', this.version);

        // Claim clients immediately to take control of the page
        event.waitUntil(globalThis.clients.claim());

        // Perform cache cleanup lazily to avoid blocking the page load
        this.cleanUpCaches()
    }

    /**
     * Handle the 'connect' event (e.g. from shared workers or multiple tabs).
     * @param {Client} source
     */
    async onConnect(source) {
        this.createMessageChannel(source);
        this.initRemote()
    }

    /**
     * The core interceptor for network requests.
     *
     * Implements a hybrid caching strategy:
     * 1.  **Network First:** For `networkFirstPaths` (Configs). Priority is getting the latest version to prevent handshake loops.
     * 2.  **Cache First:** For `cachePaths` (Assets). Priority is speed and offline capability.
     *
     * @param {ExtendableMessageEvent} event
     */
    onFetch(event) {
        let me            = this,
            hasCacheMatch = false,
            hasNetMatch   = false,
            {request}     = event,
            key;

        // Check for Network First paths (Configs)
        for (key of me.networkFirstPaths) {
            if (request.url.includes(key)) {
                hasNetMatch = true;
                break
            }
        }

        if (hasNetMatch && request.method === 'GET') {
            event.respondWith(
                fetch(request, {cache: 'reload'}).then(response => {
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(me.cacheName).then(cache => {
                            cache.put(request, responseClone).catch(() => {})
                        });
                    }
                    return response
                }).catch(() => {
                    return caches.match(request)
                })
            );
            return
        }

        // Check for Cache First paths (Assets)
        for (key of me.cachePaths) {
            if (request.url.includes(key)) {
                hasCacheMatch = true;
                break
            }
        }

        if (hasCacheMatch && request.method === 'GET') {
            event.respondWith(
                caches.open(me.cacheName).then(cache => {
                    return cache.match(request).then(cachedResponse => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }

                        return fetch(request).then(response => {
                            // Cache successful responses for future use
                            if (response.ok || response.status === 0) {
                                // catch is important, e.g. in case the quota is full
                                const responseClone = response.clone();
                                cache.put(request, responseClone).catch(() => {});
                            } else if (response.status === 404) {
                                me.on404(event)
                            }
                            return response;
                        });
                    });
                })
            );
        }
    }

    /**
     * @param {Object} msg
     * @param {ExtendableMessageEvent} event
     */
    onGetVersion(msg, event) {
        this.resolve({version: this.version}, msg)
    }

    /**
     * Handle the 'install' event.
     * Forces the waiting Service Worker to become the active one.
     * @param {ExtendableMessageEvent} event
     */
    onInstall(event) {
        console.log('Neo ServiceWorker installed:', this.version);
        event.waitUntil(globalThis.skipWaiting());
    }

    /**
     * For a client based message we receive an ExtendableMessageEvent,
     * for a MessageChannel based message a MessageEvent
     * @param {ExtendableMessageEvent|MessageEvent} event
     */
    onMessage(event) {
        let me                = this,
            {data}            = event,
            {action, replyId} = data,
            promise;

        if (event.source) { // ExtendableMessageEvent
            me.lastClient = event.source
        }

        if (!action) {
            throw new Error('Message action is missing: ' + data.id)
        }

        if (action !== 'reply') {
            const method = me['on' + Neo.capitalize(action)];

            if (method) {
                const result = method.call(me, data, event);

                if (result instanceof Promise && event.waitUntil) {
                    event.waitUntil(result);
                }
            }
        } else if (promise = action === 'reply' && me.promises[replyId]) {
            promise[data.reject ? 'reject' : 'resolve'](data.data);
            delete me.promises[replyId]
        }
    }

    /**
     * @param {Object} msg
     * @param {ExtendableMessageEvent} event
     */
    onPing(msg, event) {
        this.resolve(msg, {originMsg: msg})
    }

    /**
     * @param {Object} msg
     * @param {ExtendableMessageEvent} event
     */
    async onRegisterNeoConfig(msg, event) {
        this.onConnect(event.source)
    }

    /**
     * @param {Object} msg
     * @param {ExtendableMessageEvent} event
     */
    async onSkipWaiting(msg, event) {
        await globalThis.skipWaiting()
    }

    /**
     * @param {Object} msg
     * @param {ExtendableMessageEvent} event
     */
    onUnregisterPort(msg, event) {
        for (let [index, value] of this.channelPorts.entries()) {
            if (value.clientId === event.source.id) {
                this.channelPorts.splice(index, 1);
                break
            }
        }
    }

    /**
     * Speculatively loads and caches assets before they are requested by the browser.
     *
     * **Use Case:** "Predictive Code Splitting". The App Worker (or an AI agent) anticipates
     * where the user is going next and preloads the necessary JS modules or images.
     *
     * @param {Object} data
     * @param {String} [data.cacheName=this.cacheName] Target cache
     * @param {String[]|String} data.files List of URLs to preload
     * @param {Boolean} [data.forceReload=false] True to bypass existing cache
     * @returns {Promise<Object>} Status report {failed, ratio, success}
     */
    async preloadAssets(data) {
        let cacheName = data.cacheName || this.cacheName,
            cache     = await caches.open(cacheName),
            {files}   = data,
            failed    = [],
            items     = [],
            asset, hasMatch, item;

        if (!Array.isArray(files)) {
            files = [files]
        }

        for (item of files) {
            hasMatch = false;

            if (!data.forceReload) {
                asset    = await cache.match(item);
                hasMatch = !!asset
            }

            !hasMatch && items.push(item)
        }

        if (items.length > 0) {
            await Promise.all(items.map(url =>
                fetch(url).then(response => {
                    if (!response.ok && response.status !== 0) {
                        failed.push(url)
                    } else {
                        return cache.put(url, response)
                    }
                }).catch(() => {
                    failed.push(url)
                })
            ))
        }

        return {
            failed,
            ratio  : files.length > 0 ? (files.length - failed.length) / files.length : 1,
            success: failed.length === 0
        }
    }

    /**
     * @param {String} dest app, data, main or vdom (excluding the current worker)
     * @param {Object} opts configs for Neo.worker.Message
     * @param {Array} [transfer] An optional array of Transferable objects to transfer ownership of.
     * If the ownership of an object is transferred, it becomes unusable (neutered) in the context it was sent from
     * and becomes available only to the worker it was sent to.
     * @returns {Promise<any>}
     */
    promiseMessage(dest, opts, transfer) {
        let me = this;

        return new Promise(function(resolve, reject) {
            let message = me.sendMessage(dest, opts, transfer),
                msgId   = message.id;

            me.promises[msgId] = {reject, resolve}
        })
    }

    /**
     * Removes specific assets from the cache.
     *
     * See: https://developer.mozilla.org/en-US/docs/Web/API/Cache/delete
     * @param {String|String[]|Object} data
     * @param {String|String[]} data.assets URL(s) to remove
     * @param {String} data.cacheName=this.cacheName
     * @param {Object} data.options Options for cache.delete (ignoreMethod, etc.)
     * @param {Boolean} data.options.ignoreMethod=false
     * @param {Boolean} data.options.ignoreSearch=false
     * @param {Boolean} data.options.ignoreVary=false
     * @returns {Promise<Object>}
     */
    async removeAssets(data) {
        if (!Neo.isObject(data)) {
            data = {assets: data}
        }

        let {assets, options={}} = data,
            cacheName            = data.cacheName || this.cacheName,
            cache                = await caches.open(cacheName),
            promises             = [];

        if (!Array.isArray(assets)) {
            assets = [assets]
        }

        assets.forEach(asset => {
            promises.push(cache.delete(asset, options))
        });

        await Promise.all(promises);

        return {success: true}
    }

    /**
     * @param {String} dest app, data, main or vdom (excluding the current worker)
     * @param {Object} opts configs for Neo.worker.Message
     * @param {Array} [transfer] An optional array of Transferable objects to transfer ownership of.
     * If the ownership of an object is transferred, it becomes unusable (neutered) in the context it was sent from
     * and becomes available only to the worker it was sent to.
     * @returns {Neo.worker.Message}
     * @protected
     */
    sendMessage(dest, opts, transfer) {
        opts.destination = dest;

        let message = new Message(opts),
            port    = this.getPort(dest) || this.lastClient;

        port.postMessage(message, transfer);
        return message
    }
}

export default Neo.setupClass(ServiceBase);
