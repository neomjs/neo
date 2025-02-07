import Base from './Base.mjs';

/**
 * Syncs the scroll state of 2 DOM nodes
 * @class Neo.main.addon.ScrollSync
 * @extends Neo.main.addon.Base
 */
class ScrollSync extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.ScrollSync'
         * @protected
         */
        className: 'Neo.main.addon.ScrollSync',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'register',
                'unregister'
            ]
        }
    }

    /**
     * @param {Object} data
     */
    register(data) {
        console.log('register', data)
    }

    /**
     * @param {Object} data
     */
    unregister(data) {
        console.log('unregister', data)
    }
}

export default Neo.setupClass(ScrollSync);
