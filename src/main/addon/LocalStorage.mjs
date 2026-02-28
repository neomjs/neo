import Base from './Base.mjs';

/**
 * Basic CRUD support for window.localStorage
 * @class Neo.main.addon.LocalStorage
 * @extends Neo.main.addon.Base
 */
class LocalStorage extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.LocalStorage'
         * @protected
         */
        className: 'Neo.main.addon.LocalStorage',
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @protected
         * @reactive
         */
        remote: {
            app: [
                'createLocalStorageItem',
                'destroyLocalStorageItem',
                'readLocalStorageItem',
                'updateLocalStorageItem'
            ]
        }
    }

    /**
     * Creates a new item into window.localStorage
     * Uses updateLocalStorageItem() internally
     * @param {Object} opts
     * @param {String} opts.key
     * @param {String} opts.value
     */
    createLocalStorageItem(opts) {
        this.updateLocalStorageItem(opts)
    }

    /**
     * Removes an item from window.localStorage
     * @param {Object} opts
     * @param {String} opts.key
     */
    destroyLocalStorageItem(opts) {
        window.localStorage.removeItem(opts.key)
    }

    /**
     * Gets an item from window.localStorage
     * @param {Object} opts
     * @param {String|String[]} opts.key
     */
    readLocalStorageItem(opts) {
        let {key} = opts;

        if (Array.isArray(key)) {
            let value = {};

            key.forEach(item => {
                value[item] = window.localStorage.getItem(item)
            });

            return {key, value}
        }

        return {
            key,
            value: window.localStorage.getItem(key)
        }
    }

    /**
     * Reads an item from window.localStorage
     * @param {Object} opts
     * @param {String} opts.key
     * @param {String} opts.value
     */
    updateLocalStorageItem(opts) {
        window.localStorage.setItem(opts.key, opts.value)
    }
}

export default Neo.setupClass(LocalStorage);
