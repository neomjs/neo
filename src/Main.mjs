import Neo                   from './Neo.mjs';
import * as core             from './core/_export.mjs';
import ClassHierarchyManager from './manager/ClassHierarchy.mjs';
import DomAccess             from './main/DomAccess.mjs'; // has to get imported before DeltaUpdates
import DeltaUpdates          from './main/DeltaUpdates.mjs';
import DomEvents             from './main/DomEvents.mjs';
import Observable            from './core/Observable.mjs';
import WorkerManager         from './worker/Manager.mjs';

let nativeWindowRoute;

/**
 * @summary Consumes the opener's one-time exact-window capability once per target document.
 * @description The token is useful only while the opener still owns a matching pending `WindowProxy`. It is
 * removed on the first attempt, then the admitted route is cached inside this exact target realm so geometry
 * observation and the shared-worker connect handshake can read the same authority in either order. A reload
 * creates a new realm and loses the cache; URL/name inference and same-name reuse still cannot reconstruct it.
 * Cross-origin or independently opened windows deliberately remain unaddressable.
 * @param {Window} win
 * @returns {{capabilities: {close: Boolean, focus: Boolean, position: Boolean, resize: Boolean}, nativeHandleKey: String, ownerWindowId: String, targetWindowId: String}|null}
 */
const resolveNativeWindowRoute = win => {
    if (nativeWindowRoute !== undefined) {
        return nativeWindowRoute
    }

    nativeWindowRoute = null;

    try {
        const
            opener     = win?.opener,
            openerMain = opener?.Neo?.Main,
            storageKey = openerMain?.nativeRouteStorageKey,
            token      = storageKey && win.sessionStorage?.getItem(storageKey);

        if (!opener || opener.closed || !openerMain || !token) {
            return nativeWindowRoute
        }

        win.sessionStorage.removeItem(storageKey);

        const route = openerMain.consumeNativeWindowRoute({
            targetWindowId: WorkerManager.windowId,
            token,
            win
        });

        if (route) {
            nativeWindowRoute = route;

            win.addEventListener('pagehide', () => {
                nativeWindowRoute = null;

                try {
                    openerMain.releaseNativeWindowRoute({...route, win})
                } catch {
                    // The opener may have closed or crossed origin first; its route is unreachable either way.
                }
            }, {once: true})
        }

        return nativeWindowRoute
    } catch {
        // Cross-origin opener/sessionStorage access is expected to fail closed. The window stays visible in
        // topology but intentionally exposes no native control route.
        return nativeWindowRoute
    }
};

/**
 * @class Neo.Main
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
 * @singleton
 */
class Main extends core.Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.Main'
         * @protected
         */
        className: 'Neo.Main',
        /**
         * @member {String} mode='read'
         * @protected
         */
        mode: 'read',
        /**
         * @member {String} nativeRouteStorageKey='neo-native-window-route'
         * @protected
         */
        nativeRouteStorageKey: 'neo-native-window-route',
        /**
         * @member {Number} nativeRouteTtl=5000
         * @protected
         */
        nativeRouteTtl: 5000,
        /**
         * @member {Object} nativeWindowCapabilities
         * @protected
         */
        nativeWindowCapabilities: {
            close   : false,
            focus   : true,
            position: true,
            resize  : false
        },
        /**
         * @member {Object} openWindows={}
         * @protected
         */
        openWindows: {},
        /**
         * @member {Array} readQueue=[]
         * @protected
         */
        readQueue: [],
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'alert',
                'brainHealth',
                'editRoute',
                'fleetRequest',
                'getByPath',
                'getWindowData',
                'importAddon',
                'log',
                'redirectTo',
                'reloadWindow',
                'setNeoConfig',
                'setRoute',
                'windowClose',
                'windowCloseAll',
                'windowFocus',
                'windowMoveTo',
                'windowNativeClose',
                'windowNativeFocus',
                'windowNativeGetGeometry',
                'windowNativeMoveTo',
                'windowNativeResizeTo',
                'windowOpen',
                'windowResizeTo'
            ]
        },
        /**
         * @member {Boolean} running=false
         * @protected
         */
        running: false,
        /**
         * @member {Boolean} showFps=false
         */
        showFps: false,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Number} timeLimit=15
         */
        timeLimit: 15,
        /**
         * should be dev only
         * @member {Number} totalFrameCount=0
         * @protected
         */
        totalFrameCount: 0,
        /**
         * @member {Number} windowMovePollAttempts=6
         * @protected
         */
        windowMovePollAttempts: 6,
        /**
         * @member {Number} windowMovePollDelay=50
         * @protected
         */
        windowMovePollDelay: 50,
        /**
         * @member {Array} writeQueue=[]
         * @protected
         */
        writeQueue: []
    }

    /**
     * @member {Map} #nativeWindowRoutes
     * @private
     */
    #nativeWindowRoutes = new Map()

    /**
     * @member {Map} #pendingWindowRoutes
     * @private
     */
    #pendingWindowRoutes = new Map()

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        WorkerManager.on({
            'automount' : me.onRender,
            'updateVdom': me.onUpdateVdom,
            scope       : me
        });

        DomEvents.on('domContentLoaded', me.onDomContentLoaded, me);

        if (document.readyState !== 'loading') {
            DomEvents.onDomContentLoaded()
        }
    }

    /**
     * Workers can not trigger alert(), so we need remote method access.
     * @param {Object} data
     * @param {String} data.message
     */
    alert(data) {
        alert(data.message)
    }

    /**
     * Edit the location.hash value
     * A value of null will remove the given key.
     * @param {Object} data
     */
    editRoute(data) {
        let hashObj = DomEvents.parseHash(window.location.hash.substr(1)),
            hashArr = [];

        if (typeof data === 'string') {
            data = DomEvents.parseHash(data)
        }

        Object.assign(hashObj, data);
        delete hashObj.windowId;

        Object.entries(hashObj).forEach(([key, value]) => {
            if (value !== null) {
                hashArr.push(encodeURIComponent(key) + '=' + encodeURIComponent(value))
            }
        });

        window.location.hash = hashArr.join('&')
    }

    /**
     * @summary Pull whole-Brain health from the Electron shell's lifecycle owner, when one hosts us.
     * Resolves the owner's `{state, cause}` payload. Without a shell (dev-server mode) it returns a
     * typed unavailable envelope, so consumers read absence as transport truth, never daemon truth.
     * @returns {Promise<Object>|Object}
     */
    brainHealth() {
        return globalThis.neoShell?.brainHealth
            ? globalThis.neoShell.brainHealth()
            : {ok: false, error: 'brain: shell health capability unavailable'}
    }

    /**
     * @summary Forward one credential-free Fleet wire request through the named preload capability.
     * Endpoint and bearer ownership stay in Electron main; this page-main method only bridges the
     * App Worker RMA call onto the capability-shaped preload API.
     * @param {Object} data
     * @param {Object} data.request `{method, params}`.
     * @returns {Promise<Object>|Object}
     */
    fleetRequest({request} = {}) {
        return globalThis.neoShell?.fleetRequest
            ? globalThis.neoShell.fleetRequest(request)
            : Promise.reject(new Error('fleet: shell request capability unavailable'))
    }

    /**
     * Request specific accessible window attributes by path into the app worker.
     * Keep in mind that this excludes anything DOM related or instances.
     * In case your path matches a method, you can also pass params for it.
     * @example:
     *     Neo.Main.getByPath({path: 'navigator.language', windowId}).then(data => {})
     * @example:
     *     Neo.Main.getByPath({path: 'CSS.supports', params: ['display: flex'], windowId}).then(data => {})
     * @param {Object} data
     * @param {Array}  data.params=[]
     * @param {String} data.path
     * @returns {*}
     */
    getByPath({params=[], path}) {
        let target = Neo.nsWithArrays(path);
        return Neo.isFunction(target) ? target(...params) : target
    }

    /**
     * window.screen is not spreadable
     * @returns {Object}
     */
    getWindowData() {
        let win      = window,
            {screen} = win;

        return {
            innerHeight    : win.innerHeight,
            innerWidth     : win.innerWidth,
            mozInnerScreenX: win.mozInnerScreenX, // Firefox specific
            mozInnerScreenY: win.mozInnerScreenY, // Firefox specific
            nativeRoute    : resolveNativeWindowRoute(win),
            outerHeight    : win.outerHeight,
            outerWidth     : win.outerWidth,
            screen         : {
                availHeight: screen.availHeight,
                availLeft  : screen.availLeft,
                availTop   : screen.availTop,
                availWidth : screen.availWidth,
                colorDepth : screen.colorDepth,
                height     : screen.height,
                orientation: {angle: screen.orientation?.angle, type: screen.orientation?.type},
                pixelDepth : screen.pixelDepth,
                width      : screen.width
            },
            screenLeft: win.screenLeft,
            screenTop : win.screenTop
        }
    }

    /**
     * Import main thread addons at run-time from within the app worker
     * @param {Object} data
     * @param {String} data.name
     * @returns {Boolean}
     */
    async importAddon(data) {
        let {name} = data,
            module;

        if (name.startsWith('WS/')) {
            module = await import(`../../../src/main/addon/${name.substring(3)}.mjs`)
        } else {
            module = await import(`./main/addon/${name}.mjs`)
        }

        this.registerAddon(module.default);
        await this.timeout(20); // Wait until remotes are registered

        return true
    }

    /**
     * Remote console access to main threads.
     * You can use appName or windowId to target specific windows.
     * @param {Object} data
     * @param {String} [data.appName]
     * @param {String} data.value
     * @param {String} [data.method] defaults to 'log'
     * @param {Number} [data.windowId]
     * @returns {Boolean}
     */
    log(data) {
        console[data.method || 'log'](data.value);
        return true
    }

    /**
     *
     */
    async onDomContentLoaded() {
        let me                                                = this,
            {config}                                          = Neo,
            imports                                           = [],
            {environment, mainThreadAddons, useServiceWorker} = config,
            modules;

        me.addon = {};

        if (window.__NEO_SSR__) {
            config.useSSR = true;
            let module = await import('./main/addon/ServerSideRendering.mjs');
            me.registerAddon(module.default)
        }

        DomAccess.onDomContentLoaded();

        // Intended for the online examples where we need an easy way to add GA to every generated app
        if (config.useGoogleAnalytics && !mainThreadAddons.includes('AnalyticsByGoogle')) {
            mainThreadAddons.push('AnalyticsByGoogle')
        }

        if ((
                useServiceWorker === true ||
                useServiceWorker === environment ||
                (useServiceWorker === 'dist/production' && environment === 'dist/esm')
            ) &&
            !mainThreadAddons.includes('ServiceWorker')
        ) {
            mainThreadAddons.push('ServiceWorker')
        }

        mainThreadAddons.forEach(addon => {
            if (addon.startsWith('WS/')) {
                imports.push(import(`../../../src/main/addon/${addon.substring(3)}.mjs`))
            } else {
                imports.push(import(`./main/addon/${addon}.mjs`))
            }
        });

        modules = await Promise.all(imports);

        const instances = modules.map(module => me.registerAddon(module.default));

        await Promise.all(instances.map(instance => instance.remotesReady()));

        await me.remotesReady();

        WorkerManager.onWorkerConstructed({
            origin: 'main'
        })
    }

    /**
     * @param {Object} data
     */
    onRender(data) {
        data.data.replyId = data.replyId;
        this.queueWrite(data.data)
    }

    /**
     * @param {Object} data
     */
    onUpdateVdom(data) {
        data.data.replyId = data.replyId;
        this.queueWrite(data.data)
    }

    /**
     * @param {Object[]} queue
     * @param {Date} start
     * @returns {Number}
     * @protected
     */
    processQueue(queue, start) {
        let me     = this,
            {mode} = me,
            limit  = me.timeLimit,
            operation;

        while (operation = queue.shift()) {
            if (new Date() - start > limit) {
                queue.unshift(operation);
                return me.scheduleRenderQueueDrain()
            } else {
                // Per-operation containment: a throwing delta must neither swallow this operation's
                // reply nor escape the loop and drop the replies of everything still queued behind it.
                // A dropped reply permanently wedges every component awaiting that update batch
                // (isVdomUpdating never clears) — the failure must settle the promise (reject)
                // and stay loud instead.
                try {
                    if (mode === 'read') {
                        DomAccess.read(operation)
                    } else {
                        DeltaUpdates.update(operation)
                    }

                    WorkerManager.resolveDomOperationPromise(operation.replyId)
                } catch (err) {
                    console.error('processQueue: DOM operation failed', mode, err, operation);
                    WorkerManager.rejectDomOperationPromise(operation.replyId, err)
                }
            }
        }
    }

    /**
     * @param {Object} data
     * @protected
     */
    queueRead(data) {
        let me = this;
        me.readQueue.push(data);

        if (!me.running) {
            me.running = true;
            me.scheduleRenderQueueDrain()
        }
    }

    /**
     * @param data
     * @protected
     */
    queueWrite(data) {
        let me = this;
        me.writeQueue.push(data);

        if (!me.running) {
            me.running = true;
            me.scheduleRenderQueueDrain()
        }
    }

    /**
     * @summary Schedules the next Main-thread DOM queue drain without stranding hidden documents.
     *
     * Visible documents stay aligned to the browser's paint cycle. Hidden documents can suspend
     * animation frames indefinitely, so their queued operations use a task instead. This preserves
     * the invariant that delayed worker replies settle only after their DOM operations are applied.
     *
     * @returns {Boolean} True once the queue drain has been scheduled
     * @protected
     */
    scheduleRenderQueueDrain() {
        const callback = this.renderFrame.bind(this);

        if (document.hidden) {
            setTimeout(callback, 0)
        } else {
            requestAnimationFrame(callback)
        }

        return true
    }

    /**
     * @param {Object} data
     * @param {String} data.url
     */
    redirectTo(data) {
        window.location.href = data.url
    }

    /**
     * Helper method to register main thread addons
     * @param {Neo.core.Base} addon Can either be a neo class or instance
     * @returns {Neo.core.Base} The addon instance
     */
    registerAddon(addon) {
        if (Neo.typeOf(addon) === 'NeoClass') {
            // Addons could get imported multiple times. Ensure to only create an instance once.
            if (Neo.typeOf(Neo.ns(addon.prototype.className)) !== 'NeoInstance') {
                addon = Neo.create(addon);

                // Main thread addons need to get registered as singletons inside the neo namespace
                Neo.applyToGlobalNs(addon)
            } else {
                addon = Neo.ns(addon.prototype.className);
            }
        }

        this.addon[addon.constructor.name] = addon;

        return addon
    }

    /**
     * @param {Object} data
     * @param {Boolean} [data.force]
     */
    reloadWindow(data) {
        location.reload(data?.force)
    }

    /**
     * Triggers the different DOM operation queues
     * @protected
     */
    renderFrame() {
        let me      = this,
            read    = me.readQueue,
            write   = me.writeQueue,
            reading = me.mode === 'read',
            start   = new Date();

        if (Neo.config.logDeltaUpdates) {
            me.totalFrameCount++;
            console.log('Total Frames: ' + me.totalFrameCount)
        }

        if (reading || !write.length) {
            me.mode = 'read';
            if (me.processQueue(read, start)) {
                return
            }
        }

        if (write.length) {
            me.mode = 'write';
            if (me.processQueue(write, start)) {
                return
            }
        }

        me.running = false
    }

    /**
     * Change a Neo.config from the app worker
     * @param {Object} data
     * @param {String} data.key
     * @param {*} data.value
     */
    setNeoConfig(data) {
        let {key, value} = data;

        Neo.config[key] = data.value;

        key === 'renderCountDeltas' && DeltaUpdates.set({[key]: value})
    }

    /**
     * Change the location.hash value
     * @param {Object} data
     * @param {String} data.value
     */
    setRoute(data) {
        window.location.hash = data.value
    }

    /**
     * Consumes one opener-minted capability and binds its opaque handle key to the exact connected target.
     * This method is intentionally absent from the App-Worker remote manifest: only the same-origin target
     * main thread calls it directly through its opener during `getWindowData()`.
     * @param {Object} data
     * @param {String} data.targetWindowId
     * @param {String} data.token
     * @param {Window} data.win
     * @returns {Object|null} The serializable worker-private route, or `null` when the grant is stale/invalid.
     */
    consumeNativeWindowRoute({targetWindowId, token, win}) {
        const pending = this.#pendingWindowRoutes.get(token);

        this.#pendingWindowRoutes.delete(token);

        if (
            !pending || pending.expiresAt < Date.now() || !targetWindowId ||
            pending.entry.win !== win || this.openWindows[pending.entry.windowName] !== pending.entry
        ) {
            return null
        }

        const
            {entry}      = pending,
            capabilities = {
                close   : entry.nativeCapabilities.close    && typeof win.close  === 'function',
                focus   : entry.nativeCapabilities.focus    && typeof win.focus  === 'function',
                position: entry.nativeCapabilities.position && typeof win.moveTo === 'function',
                resize  : entry.nativeCapabilities.resize   && typeof win.resizeTo === 'function'
            },
            route = {
                capabilities,
                nativeHandleKey: entry.nativeHandleKey,
                ownerWindowId  : entry.ownerWindowId,
                targetWindowId
            };

        this.#nativeWindowRoutes.set(entry.nativeHandleKey, {entry, targetWindowId});

        return route
    }

    /**
     * Releases an active private generation when its exact target document unloads or reloads.
     * Like consumption, this is a direct same-origin main-thread handshake and is not App-Worker remote API.
     * @param {Object} data
     * @param {String} data.nativeHandleKey
     * @param {String} data.targetWindowId
     * @param {Window} data.win
     * @returns {Boolean}
     */
    releaseNativeWindowRoute({nativeHandleKey, targetWindowId, win}) {
        const route = this.#nativeWindowRoutes.get(nativeHandleKey);

        if (!route || route.targetWindowId !== targetWindowId || route.entry.win !== win) {
            return false
        }

        this.#invalidateNativeWindowEntry(route.entry);

        return true
    }

    /**
     * Removes every pending/active capability associated with one semantic popup generation.
     * @param {Object} entry
     * @private
     */
    #invalidateNativeWindowEntry(entry) {
        if (!entry) return;

        this.#nativeWindowRoutes.delete(entry.nativeHandleKey);

        for (const [token, pending] of this.#pendingWindowRoutes) {
            if (pending.entry === entry) {
                this.#pendingWindowRoutes.delete(token)
            }
        }
    }

    /**
     * Resolves a private handle key only when its target generation, owner registry entry, grant, and native method
     * are all still live.
     * @param {Object} data
     * @param {String} data.nativeHandleKey
     * @param {String} data.targetWindowId
     * @param {'close'|'focus'|'position'|'resize'} capability
     * @returns {Object|null}
     * @private
     */
    #getNativeWindowRoute({nativeHandleKey, targetWindowId}, capability) {
        const
            route   = this.#nativeWindowRoutes.get(nativeHandleKey),
            entry   = route?.entry,
            methods = {close: 'close', focus: 'focus', position: 'moveTo', resize: 'resizeTo'};

        if (
            !route || route.targetWindowId !== targetWindowId ||
            this.openWindows[entry.windowName] !== entry ||
            entry.win.closed || entry.nativeCapabilities[capability] !== true ||
            typeof entry.win[methods[capability]] !== 'function'
        ) {
            entry?.win?.closed && this.#invalidateNativeWindowEntry(entry);
            return null
        }

        return route
    }

    /**
     * Focuses one exact native handle and verifies the target document accepted focus.
     * @param {Window} win
     * @returns {Promise<Boolean>}
     * @private
     */
    async #focusWindow(win) {
        if (!win || win.closed || typeof win.focus !== 'function') {
            return false
        }

        try {
            win.focus()
        } catch {
            return false
        }

        // The verification asks the TARGET, not the opener: did the popup's document take focus?
        // Asking the opener ("did I blur?") answers about the wrong subject — headless platforms
        // let every window claim focus simultaneously, so the opener never blurs even when the
        // popup genuinely focused. The answer feeds user-facing announcements, so it polls
        // briefly and must not lie in either direction; a same-origin read is expected (vessels
        // are same-app popups), and an inaccessible document degrades to the opener-blur
        // fallback rather than a throw.
        for (let attempt = 0; attempt < 6; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 50));

            try {
                if (win.document.hasFocus()) {
                    return true
                }
            } catch {
                if (!document.hasFocus()) {
                    return true
                }
            }
        }

        return false
    }

    /**
     * @summary Lets a mutated render target publish its complete observed geometry.
     * @description Browser window movement and resize have no guaranteed matching event. Publishing
     * the target realm's complete snapshot closes the mutation-to-observation edge without ever
     * projecting requested coordinates or extents into manager truth. Cross-origin or not-yet-
     * initialized targets remain valid physical handles; geometry publication is best-effort and
     * cannot change the strict platform verdict.
     * @param {Window} win
     * @private
     */
    #publishWindowGeometry(win) {
        try {
            const observer = win.Neo?.main?.addon?.WindowPosition;

            if (typeof observer?.publishGeometry === 'function') {
                observer.publishGeometry()
            } else {
                observer?.checkMovement?.()
            }
        } catch {
            // Cross-origin target realms are intentionally opaque.
        }
    }

    /**
     * Moves one exact native handle and verifies the target reached the requested coordinates.
     * @param {Window} win
     * @param {Number|String} requestedX
     * @param {Number|String} requestedY
     * @returns {Promise<Boolean>}
     * @private
     */
    async #moveWindow(win, requestedX, requestedY) {
        const
            x = Number(requestedX),
            y = Number(requestedY);

        let admitted = false;

        if (!win || win.closed || typeof win.moveTo !== 'function' || !Number.isFinite(x) || !Number.isFinite(y)) {
            return false
        }

        try {
            win.moveTo(x, y)
        } catch {
            this.#publishWindowGeometry(win);
            return false
        }

        for (let attempt = 0; attempt < this.windowMovePollAttempts; attempt++) {
            if (Math.abs(win.screenX - x) <= 1 && Math.abs(win.screenY - y) <= 1) {
                admitted = true;
                break
            }

            await new Promise(resolve => setTimeout(resolve, this.windowMovePollDelay))
        }

        this.#publishWindowGeometry(win);

        return admitted
    }

    /**
     * Resizes one exact native handle and verifies the target reached the requested outer extent.
     * `Window#resizeTo()` speaks outer dimensions, so callers must translate from any inner-layout
     * geometry before crossing this physical-capability boundary.
     * @param {Window} win
     * @param {Number|String} requestedWidth
     * @param {Number|String} requestedHeight
     * @returns {Promise<Boolean>}
     * @private
     */
    async #resizeWindow(win, requestedWidth, requestedHeight) {
        const
            height = Number(requestedHeight),
            width  = Number(requestedWidth);

        let admitted = false;

        if (
            !win || win.closed || typeof win.resizeTo !== 'function' ||
            !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0
        ) {
            return false
        }

        try {
            win.resizeTo(width, height)
        } catch {
            this.#publishWindowGeometry(win);
            return false
        }

        for (let attempt = 0; attempt < this.windowMovePollAttempts; attempt++) {
            if (Math.abs(win.outerWidth - width) <= 1 && Math.abs(win.outerHeight - height) <= 1) {
                admitted = true;
                break
            }

            await new Promise(resolve => setTimeout(resolve, this.windowMovePollDelay))
        }

        this.#publishWindowGeometry(win);

        return admitted
    }

    /**
     * Closes popup windows
     * @param {Object} data
     * @param {String|String[]} data.names
     * @returns {Boolean} True when every named live handle accepted the close request.
     */
    windowClose(data) {
        const names = Array.isArray(data.names) ? data.names : [data.names];

        let closed = names.length > 0;

        names.forEach(name => {
            const
                entry = this.openWindows[name],
                win   = entry?.win;

            if (!win || win.closed || typeof win.close !== 'function') {
                closed = false
            } else {
                win.close()
            }

            this.#invalidateNativeWindowEntry(entry);
            delete this.openWindows[name]
        });

        return closed
    }

    /**
     * Closes all popup windows
     * @param {Object} data
     */
    windowCloseAll(data) {
        Object.values(this.openWindows).forEach(entry => {
            entry.win.close();
            this.#invalidateNativeWindowEntry(entry)
        });

        this.openWindows = {}
    }

    /**
     * Focus a named popup window — Boolean admission, the `windowOpen` discipline applied to
     * focus: the platform may decline silently, so the answer is the VERIFIED outcome (did this
     * opener actually lose focus to the popup), never the attempt. A keyboard-command flow rides
     * its keystroke's user activation through this verb; a `false` answer is a legitimate
     * degraded terminal for the caller to announce, not an error.
     *
     * Omitting `windowName` targets this window's OPENER instead — the popup-origin return path:
     * the popup holds the keystroke's user activation, so routing the call to the popup's main
     * thread (via `windowId`) lets IT ask its opener to take focus, the direction focus-stealing
     * rules permit. Same Boolean-admission verification either way.
     * @param {Object} data
     * @param {String} [data.windowName] Named popup to focus; absent = this window's opener.
     * @returns {Promise<Boolean>} true when the target window verifiably took focus.
     */
    async windowFocus(data) {
        return this.#focusWindow(data.windowName ? this.openWindows[data.windowName]?.win : window.opener)
    }

    /**
     * Move a popup window
     * @param {Object} data
     * @param {String} data.windowName
     * @param {Number|String} data.x
     * @param {Number|String} data.y
     * @returns {Promise<Boolean>} True when the popup reaches the requested screen coordinates.
     */
    async windowMoveTo(data) {
        return this.#moveWindow(this.openWindows[data.windowName]?.win, data.x, data.y)
    }

    /**
     * Closes an exact owner-granted native handle generation and verifies the platform did it.
     * @param {Object} data
     * @param {String} data.nativeHandleKey
     * @param {String} data.targetWindowId
     * @returns {Promise<Boolean>} true once the popup is verifiably closed; false while it is not.
     */
    async windowNativeClose(data) {
        const route = this.#getNativeWindowRoute(data, 'close');

        if (!route) return false;

        const {entry} = route,
              {win}   = entry;

        try {
            win.close()
        } catch {
            return false
        }

        // The answer is the VERIFIED outcome, never the attempt — the discipline #focusWindow applies
        // to focus. A popup the OS is still dragging by its titlebar may keep the close deferred; the
        // caller (a native-titlebar drop's retirement) retries at a fixed cadence until the release
        // lets it through, and it can only do that while the route is still here — so the entry is
        // retired only once the window is gone.
        for (let attempt = 0; attempt < 6 && !win.closed; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 50))
        }

        if (!win.closed) {
            return false
        }

        this.#invalidateNativeWindowEntry(entry);

        if (this.openWindows[entry.windowName] === entry) {
            delete this.openWindows[entry.windowName]
        }

        return true
    }

    /**
     * Focuses an exact owner-granted native handle generation.
     * @param {Object} data
     * @param {String} data.nativeHandleKey
     * @param {String} data.targetWindowId
     * @returns {Promise<Boolean>}
     */
    async windowNativeFocus(data) {
        const route = this.#getNativeWindowRoute(data, 'focus');

        if (!route || !await this.#focusWindow(route.entry.win)) {
            return false
        }

        return this.#getNativeWindowRoute(data, 'focus') === route
    }

    /**
     * Reads the exact owner-granted native handle generation's current outer extent and viewport
     * origin. The caller uses this only as volatile recovery authority immediately before a
     * physical effect; manager topology remains the shared observation surface.
     * @param {Object} data
     * @param {String} data.nativeHandleKey
     * @param {String} data.targetWindowId
     * @returns {{height:Number,width:Number,x:Number,y:Number}|null}
     */
    windowNativeGetGeometry(data) {
        const
            route = this.#getNativeWindowRoute(data, 'position'),
            win   = route?.entry?.win,
            value = win && {
                height: Number(win.outerHeight),
                width : Number(win.outerWidth),
                x     : Number(win.screenX),
                y     : Number(win.screenY)
            };

        return value && Object.values(value).every(Number.isFinite) && value.height > 0 && value.width > 0
            ? value
            : null
    }

    /**
     * Moves an exact owner-granted native handle generation.
     * @param {Object} data
     * @param {String} data.nativeHandleKey
     * @param {String} data.targetWindowId
     * @param {Number|String} data.x
     * @param {Number|String} data.y
     * @returns {Promise<Boolean>}
     */
    async windowNativeMoveTo(data) {
        const route = this.#getNativeWindowRoute(data, 'position');

        if (!route || !await this.#moveWindow(route.entry.win, data.x, data.y)) {
            return false
        }

        return this.#getNativeWindowRoute(data, 'position') === route
    }

    /**
     * Resizes an exact owner-granted native handle generation to verified outer dimensions.
     * The route is revalidated after the asynchronous platform observation so same-name successor
     * windows can never inherit a predecessor completion.
     * @param {Object} data
     * @param {Number|String} data.height
     * @param {String} data.nativeHandleKey
     * @param {String} data.targetWindowId
     * @param {Number|String} data.width
     * @returns {Promise<Boolean>}
     */
    async windowNativeResizeTo(data) {
        const route = this.#getNativeWindowRoute(data, 'resize');

        if (!route || !await this.#resizeWindow(route.entry.win, data.width, data.height)) {
            return false
        }

        return this.#getNativeWindowRoute(data, 'resize') === route
    }

    /**
     * @summary Opens a popup and stages any same-origin canvas before its route-bearing navigation.
     * @param {Object}  data
     * @param {Object}  [data.nativeCapabilities] Owner-granted generic physical capabilities.
     * @param {'dark'|'light'} [data.stagedColorScheme] Admitted scheme for the temporary same-origin document.
     * @param {String}  data.url
     * @param {Boolean} [data.useTotalHeight=true] Using this flag will set outerHeight to innerHeight, ignoring header tools
     * @param {String}  data.windowFeatures
     * @param {String}  data.windowName
     * @return {Boolean}
     */
    windowOpen({nativeCapabilities, stagedColorScheme, url, useTotalHeight=true, windowFeatures, windowName}) {
        let existingWin = this.openWindows[windowName],
            stagedUrl   = null,
            targetName;

        try {
            const resolved = typeof url === 'string' && new URL(url, window.location.href);

            if (resolved?.origin === window.location.origin) {
                stagedUrl = resolved.href
            }
        } catch {
            // Invalid or inaccessible URLs retain the browser's direct-open behavior below.
        }

        if (existingWin && !existingWin.win.closed) {
            targetName = existingWin.targetName
        } else {
            targetName = crypto.randomUUID()
        }

        // Same-origin children can connect to the shared worker immediately when the opener is
        // warm. Open a blank same-origin realm first, mint its one-time route there, THEN navigate;
        // opening the final URL before writing sessionStorage races the child's getWindowData()
        // handshake and produces a connected but authority-less popup.
        let openedWindow = window.open(stagedUrl ? 'about:blank' : url, targetName, windowFeatures),
            success      = !!openedWindow;

        if (success) {
            this.#invalidateNativeWindowEntry(existingWin);

            if (stagedUrl && (stagedColorScheme === 'dark' || stagedColorScheme === 'light')) {
                try {
                    const meta = openedWindow.document.createElement('meta');

                    meta.name    = 'color-scheme';
                    meta.content = stagedColorScheme;
                    openedWindow.document.head.append(meta)
                } catch {/* Presentation must not revoke an otherwise valid physical handle. */}
            }

            const
                entry = {
                    nativeCapabilities: {...this.nativeWindowCapabilities, ...nativeCapabilities},
                    nativeHandleKey   : crypto.randomUUID(),
                    ownerWindowId     : WorkerManager.windowId,
                    targetName,
                    win               : openedWindow,
                    windowName
                },
                token   = crypto.randomUUID(),
                pending = {
                    entry,
                    expiresAt: Date.now() + this.nativeRouteTtl
                };

            this.openWindows[windowName] = entry;
            this.#pendingWindowRoutes.set(token, pending);

            setTimeout(() => {
                this.#pendingWindowRoutes.get(token) === pending && this.#pendingWindowRoutes.delete(token)
            }, this.nativeRouteTtl);

            try {
                openedWindow.sessionStorage.setItem(this.nativeRouteStorageKey, token)
            } catch {
                this.#pendingWindowRoutes.delete(token)
            }

            if (useTotalHeight) {
                openedWindow.resizeTo(openedWindow.outerWidth, openedWindow.innerHeight)
            }

            if (stagedUrl) {
                try {
                    openedWindow.location.replace(stagedUrl)
                } catch {
                    this.#invalidateNativeWindowEntry(entry);
                    delete this.openWindows[windowName];
                    openedWindow.close();
                    success = false
                }
            }
        }

        return success
    }

    /**
     * Move a popup window
     * @param {Object} data
     * @param {Number} [data.height]
     * @param {Number} [data.width]
     * @param {String} data.windowName
     */
    windowResizeTo(data) {
        let win    = this.openWindows[data.windowName]?.win,
            height = data.height || win.outerHeight,
            width  = data.width  || win.outerWidth;

        win.resizeTo(width, height)
    }
}

export default Neo.setupClass(Main);
