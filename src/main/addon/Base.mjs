import CoreBase from '../../core/Base.mjs';

/**
 * Base class for main thread addons
 * @class Neo.main.addon.Base
 * @extends Neo.core.Base
 *
 * This version aligns the file loading and readiness state according to the rule:
 * `initAsync()` MUST await for `loadFiles()` to be completed before the addon is considered `isReady`.
 * `preloadFilesDelay` controls when `loadFiles()` is initiated in the background, but can be
 * overridden by `cacheMethodCall()`.
 */
class Base extends CoreBase {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.Base'
         * @protected
         */
        className: 'Neo.main.addon.Base',
        /**
         * An identifier for core.Base to get handled like singletons for remote method access
         * @member {Boolean} isMainThreadAddon=true
         * @protected
         */
        isMainThreadAddon: true,
        /**
         * Amount in ms to delay the background loading of library files.
         * Set to `false` to disable automated preloading and rely solely on lazy loading
         * via `cacheMethodCall()`. Set to `0` for immediate background preload.
         * @member {Boolean|Number} preloadFilesDelay=5000
         * @protected
         */
        preloadFilesDelay: 5000
    }

    /**
     * Internal cache for remote method calls received when `isReady` is false.
     * @member {Object[]} cache=[]
     */
    cache = []
    /**
     * Returns true if `loadFiles()` has been initiated and is currently in progress.
     * @member {Boolean} isLoading
     */
    get isLoading() {
        // isLoading is true if the promise exists and its resolver is still available (meaning it's pending).
        return !!this.#loadFilesPromise && !!this.#loadFilesPromiseResolver
    }
    /**
     * A private promise that tracks the completion of `loadFiles()`.
     * This ensures `loadFiles()` is called only once and can be awaited by multiple consumers.
     * @member {Promise<void>|null} #loadFilesPromise=null
     */
    #loadFilesPromise = null
    /**
     * The `resolve` function for `#loadFilesPromise`, allowing external control over its resolution.
     * @member {Function|null} #loadFilesPromiseResolver=null
     */
    #loadFilesPromiseResolver = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        // Initialize #loadFilesPromise as a controllable promise.
        // This promise will be awaited by initAsync and resolved by executeLoadFiles.
        me.#loadFilesPromise = new Promise(resolve => {
            me.#loadFilesPromiseResolver = resolve
        });

        if (me.preloadFilesDelay === false) {
            // No automated preload: resolve #loadFilesPromise immediately as it won't be triggered by delay.
            // It will only be triggered by cacheMethodCall or initAsync if needed.
            me.#loadFilesPromiseResolver();
            me.#loadFilesPromiseResolver = null // Mark as resolved/no longer pending
        } else {
            const delay = Neo.isNumber(me.preloadFilesDelay) ? me.preloadFilesDelay : 0;

            if (delay === 0) {
                // Immediate preload: Directly execute loadFiles and resolve the promise.
                me.#executeLoadFiles()
            } else {
                // Delayed preload: Set up a timer to execute loadFiles later.
                me.timeout(delay).then(() => {
                    // This callback checks if #loadFilesPromise is still pending (resolver is available).
                    if (me.#loadFilesPromiseResolver) {
                        me.#executeLoadFiles()
                    }
                })
            }
        }
    }

    /**
     * Executes the actual `loadFiles()` method and resolves `#loadFilesPromise`.
     * This method is called internally to manage the single execution of `loadFiles()`.
     * It ensures `loadFiles()` is only truly called once.
     * @private
     */
    async #executeLoadFiles() {
        let me = this;

        // Only execute if the promise is still pending (resolver is available).
        if (me.#loadFilesPromiseResolver) {
            const resolver = me.#loadFilesPromiseResolver;
            me.#loadFilesPromiseResolver = null; // Mark as no longer pending/resolved

            await me.loadFiles();
            resolver() // Resolve the main #loadFilesPromise
        }
    }

    /**
     * Async initialization hook for instances.
     * `initAsync` MUST await for `loadFiles()` to be completed. Only then the addon is ready.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        let me = this;

        // `initAsync` must always wait for `me.#loadFilesPromise` to complete its resolution,
        // regardless of how it was triggered (immediate, delayed, or by cacheMethodCall).
        // `me.#loadFilesPromise` is always initialized in `construct()`.
        await me.#loadFilesPromise
    }

    /**
     * Triggered after the `isReady` config got changed.
     * When `isReady` becomes true, any cached remote method calls are executed.
     * At this point, `initAsync` has already ensured that `me.#loadFilesPromise` is resolved.
     *
     * This method is kept synchronous, delegating the async cache processing to a private method.
     *
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsReady(value, oldValue) { // Keep this synchronous
        if (value) {
            // Initiate the asynchronous processing of cached method calls.
            // This method itself does not need to be awaited here.
            this.#processCachedMethodCalls();
        }
    }

    /**
     * Internally caches remote method calls if `isReady` is false.
     * It also ensures that `loadFiles()` is initiated immediately, bypassing `preloadFilesDelay`.
     * @param {Object} item - Contains method name (`fn`) and data (`data`).
     * @returns {Promise<unknown>} A promise that resolves with the method's return value.
     */
    cacheMethodCall(item) {
        let me = this;

        // If loadFiles is defined, and it hasn't started yet (i.e., #loadFilesPromiseResolver is still available),
        // execute it now, bypassing any pending preloadFilesDelay timer.
        if (me.#loadFilesPromiseResolver) {
            me.#executeLoadFiles() // This will resolve #loadFilesPromise immediately
        }

        return new Promise((resolve, reject) => {
            me.cache.push({...item, reject, resolve})
        })
    }

    /**
     * Placeholder method for loading external files.
     * Subclasses (e.g., `Neo.main.addon.AmCharts`) must implement this.
     * It **must** return a Promise that resolves when all necessary files are loaded.
     * If `loadFiles()` is called multiple times, it should return the same pending promise
     * or a resolved promise if files are already loaded.
     * @returns {Promise<void>}
     */
    async loadFiles() {}

    /**
     * Sequentially processes any method calls that were cached while the addon was not ready.
     * This method is asynchronous to allow awaiting the execution of individual cached methods.
     * @returns {Promise<void>} A promise that resolves when all cached methods have been processed.
     * @private
     */
    async #processCachedMethodCalls() {
        let me = this;

        // Iterate over the cache items and await each one in sequence
        for (const item of me.cache) {
            let returnValue;

            try {
                returnValue = me[item.fn](item.data);

                if (Neo.isPromise(returnValue)) {
                    returnValue = await returnValue;
                }

                item.resolve(returnValue)
            } catch (e) {
                // If an error occurs (either synchronous or a promise rejection),
                // reject the promise associated with the current cached item.
                item.reject(e)

                // *** FAIL-FAST STRATEGY ***
                // If any cached method call fails, we assume subsequent cached calls
                // (especially for the same addon instance) are likely to also fail.
                break
            }
        }

        me.cache = []
    }
}

export default Neo.setupClass(Base);
