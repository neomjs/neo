import Base from '../../core/Base.mjs';

/**
 * @class Neo.main.addon.ScrollSync
 * @extends Neo.core.Base
 * @singleton
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
         * @member {Object} remote={app: [//...]}
         * @protected
         */
        remote: {
            app: [
                'register',
                'unregister'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @param {Object} data
     * @param {String} data.sourceId
     * @param {String} data.targetId
     */
    register(data) {
        console.log('register', data)
    }

    /**
     * @param {Object} data
     * @param {String} data.sourceId
     * @param {String} data.targetId
     */
    unregister(data) {
        console.log('unregister', data)
    }
}

Neo.applyClassConfig(ScrollSync);

let instance = Neo.create(ScrollSync);

Neo.applyToGlobalNs(instance);

export default instance;
