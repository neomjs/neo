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
     * @member {Object} items=[]
     * @protected
     */
    items = []

    /**
     * @param {Object} data
     * @param {String} data.sourceId
     * @param {String} data.targetId
     */
    register(data) {
        let me       = this,
            items    = me.items,
            sourceId = data.sourceId,
            targetId = data.targetId;

        // ensure that there are no duplicate entries
        me.removeItem(sourceId, targetId);

        items.push({
            source: {id: sourceId},
            target: {id: targetId}
        })

        console.log('register', data, items)
    }

    /**
     * @param {String} sourceId
     * @param {String} targetId
     * @returns {Boolean}
     */
    removeItem(sourceId, targetId) {
        let items = this.items,
            i     = 0,
            len   = items.length,
            item;

        for (; i < len; i++) {
            item = items[i];

            if (item.source.id === sourceId && item.target.id === targetId) {
                items.splice(i, 1);
                return true
            }
        }

        return false
    }

    /**
     * @param {Object} data
     * @param {String} data.sourceId
     * @param {String} data.targetId
     */
    unregister(data) {
        this.removeItem(data.sourceId, data.targetId)
    }
}

Neo.applyClassConfig(ScrollSync);

let instance = Neo.create(ScrollSync);

Neo.applyToGlobalNs(instance);

export default instance;
