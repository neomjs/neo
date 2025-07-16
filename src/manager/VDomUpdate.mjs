import Collection from '../collection/Base.mjs';

/**
 * @class Neo.manager.VDomUpdate
 * @extends Neo.collection.Base
 * @singleton
 */
class VDomUpdate extends Collection {
    static config = {
        /**
         * @member {String} className='Neo.manager.VDomUpdate'
         * @protected
         */
        className: 'Neo.manager.VDomUpdate',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Neo.collection.Base|null} mergedCallbackMap=null
         * @protected
         */
        mergedCallbackMap: null,
        /**
         * @member {Neo.collection.Base|null} postUpdateQueueMap=null
         * @protected
         */
        postUpdateQueueMap: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.mergedCallbackMap  = Neo.create(Collection, {keyProperty: 'ownerId'});
        me.postUpdateQueueMap = Neo.create(Collection, {keyProperty: 'ownerId'});
    }

    /**
     * @param {String} ownerId
     * @param {String} childId
     * @param {Array} callbacks
     */
    registerMerged(ownerId, childId, callbacks) {
        let me   = this,
            item = me.mergedCallbackMap.get(ownerId);

        if (!item) {
            item = {ownerId, callbacks: [], childIds: []};
            me.mergedCallbackMap.add(item);
        }

        item.callbacks.push(...callbacks);
        item.childIds.push(childId);
    }

    /**
     * @param {String} ownerId
     * @param {String} childId
     */
    registerPostUpdate(ownerId, childId) {
        let me   = this,
            item = me.postUpdateQueueMap.get(ownerId);

        if (!item) {
            item = {ownerId, childIds: []};
            me.postUpdateQueueMap.add(item);
        }

        item.childIds.push(childId);
    }

    /**
     * @param {String} ownerId
     */
    executeCallbacks(ownerId) {
        let me   = this,
            item = me.mergedCallbackMap.get(ownerId);

        if (item) {
            item.callbacks.forEach(callback => callback());
            me.mergedCallbackMap.remove(item);
        }
    }

    /**
     * @param {String} ownerId
     */
    triggerPostUpdates(ownerId) {
        let me   = this,
            item = me.postUpdateQueueMap.get(ownerId);

        if (item) {
            item.childIds.forEach(childId => {
                let component = Neo.getComponent(childId);
                component?.update();
            });

            me.postUpdateQueueMap.remove(item);
        }
    }
}

export default Neo.setupClass(VDomUpdate);
