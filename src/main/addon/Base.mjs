import CoreBase from '../../core/Base.mjs';

/**
 * Base class for main thread addons
 * @class Neo.main.addon.Base
 * @extends Neo.core.Base
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
         * Will get set to true once all addon related files got loaded (if there is a need to load)
         * @member {Boolean} isReady_=false
         * @protected
         */
        isReady_: false,
        /**
         * Amount in ms to delay the loading of library files, unless remote method access happens
         * Change the value to false in case you don't want an automated preloading
         * @member {Boolean|Number} preloadFilesDelay=5000
         * @protected
         */
        preloadFilesDelay: 5000,
    }

    /**
     * @member {Object[]} cache=[]
     */
    cache = []
    /**
     * Will get set to true once we start loading Monaco related files
     * @member {Boolean} isLoading=false
     */
    isLoading = false
    /**
     * Internal flag to store the setTimeout() id for loading external files
     * @member {Number|null} loadingTimeoutId=null
     */
    loadingTimeoutId = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        if (me.loadFiles) {
            if (me.preloadFilesDelay === 0) {
                me.loadFiles()
            } else if (Neo.isNumber(me.preloadFilesDelay)) {
                me.loadingTimeoutId = setTimeout(() => {
                    me.loadFiles()
                }, me.preloadFilesDelay)
            }
        }
    }

    /**
     * Triggered after the isReady config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsReady(value, oldValue) {
        if (value) {
            let me = this,
                returnValue;

            me.cache.forEach(item => {
                returnValue = me[item.fn](item.data);
                item.resolve(returnValue)
            });

            me.cache = []
        }
    }

    /**
     * Internally caches call when isReady===false
     * Loads the library files in case this is not already happening
     * @param item
     * @returns {Promise<unknown>}
     */
    cacheMethodCall(item) {
        let me = this;

        if (!me.isLoading) {
            me.loadingTimeoutId && clearTimeout(me.loadingTimeoutId);
            me.loadingTimeoutId = null;
            me.loadFiles()
        }

        return new Promise((resolve, reject) => {
            me.cache.push({...item, resolve})
        })
    }
}

Neo.setupClass(Base);

export default Base;
