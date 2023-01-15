import Base from '../../core/Base.mjs';

/**
 * Basic CRUD support for window.localStorage
 * @class Neo.main.addon.LocalStorage
 * @extends Neo.core.Base
 * @singleton
 */
class LocalStorage extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.main.addon.LocalStorage'
         * @protected
         */
        className: 'Neo.main.addon.LocalStorage',
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @protected
         */
        remote: {
            app: [
                'createLocalStorageItem',
                'destroyLocalStorageItem',
                'readLocalStorageItem',
                'updateLocalStorageItem'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }}

    /**
     * Creates a new item into window.localStorage
     * Uses updateLocalStorageItem() internally
     * @param {Object} opts
     * @param {String} opts.key
     * @param {String} opts.value
     */
    createLocalStorageItem(opts) {
        this.updateLocalStorageItem(opts);
    }

    /**
     * Removes an item from window.localStorage
     * @param {Object} opts
     * @param {String} opts.key
     */
    destroyLocalStorageItem(opts) {
        window.localStorage.removeItem(opts.key);
    }

    /**
     * Gets an item from window.localStorage
     * @param {Object} opts
     * @param {String} opts.key
     */
    readLocalStorageItem(opts) {
        return {
            key  : opts.key,
            value: window.localStorage.getItem(opts.key)
        }
    }

    /**
     * Reads an item from window.localStorage
     * @param {Object} opts
     * @param {String} opts.key
     * @param {String} opts.value
     */
    updateLocalStorageItem(opts) {
        window.localStorage.setItem(opts.key, opts.value);
    }
}

Neo.applyClassConfig(LocalStorage);

let instance = Neo.create(LocalStorage);

Neo.applyToGlobalNs(instance);

export default instance;