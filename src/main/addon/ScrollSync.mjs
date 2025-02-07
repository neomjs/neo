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
     * @param {Object}  data
     * @param {String}  direction='vertical' 'horizontal', 'vertical' or 'both'
     * @param {String}  fromId
     * @param {String}  id                   The owner id (e.g. component id)
     * @param {String}  toId
     * @param {Boolean} twoWay=true          Sync the target's scroll state back to the source node
     */
    register({direction='vertical', fromId, id, toId, twoWay=true}) {
        console.log('register', direction, fromId, id, toId, twoWay);
    }

    /**
     * @param {Object} data
     */
    unregister(data) {
        console.log('unregister', data)
    }
}

export default Neo.setupClass(ScrollSync);
