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
     * @param {Number} childUpdateDepth
     * @param {Number} distance
     */
    registerMerged(ownerId, childId, callbacks, childUpdateDepth, distance) {
        let me   = this,
            item = me.mergedCallbackMap.get(ownerId);

        if (!item) {
            item = {ownerId, children: []};
            me.mergedCallbackMap.add(item);
        }

        item.children.push({childId, callbacks, childUpdateDepth, distance});
    }

    /**
     * @param {String} ownerId
     * @param {String} childId
     * @param {Function} [resolve]
     */
    registerPostUpdate(ownerId, childId, resolve) {
        let me   = this,
            item = me.postUpdateQueueMap.get(ownerId);

        if (!item) {
            item = {ownerId, children: []};
            me.postUpdateQueueMap.add(item);
        }

        item.children.push({childId, resolve});
    }

    /**
     * Calculates the adjusted updateDepth for a parent component based on its merged children.
     * This method is called by the parent component right before it executes its own VDOM update.
     * @param {String} ownerId
     * @returns {Number|null} The adjusted update depth or null if no merged children are found
     */
    getAdjustedUpdateDepth(ownerId) {
        let me       = this,
            owner    = Neo.getComponent(ownerId),
            item     = me.mergedCallbackMap.get(ownerId),
            maxDepth = owner?.updateDepth ?? 1,
            newDepth;

        if (item) {
            item.children.forEach(child => {
                if (child.childUpdateDepth === -1) {
                    newDepth = -1;
                } else {
                    // The new depth is the distance to the child plus the child's own required update depth.
                    newDepth = child.distance + child.childUpdateDepth;
                }

                if (newDepth === -1) {
                    maxDepth = -1;
                } else if (maxDepth !== -1) {
                    maxDepth = Math.max(maxDepth, newDepth);
                }
            });

            return maxDepth;
        }

        return null;
    }

    /**
     * Returns a Set of child IDs that have been merged into a parent's update.
     * @param {String} ownerId The ID of the parent component owning the update.
     * @returns {Set<String>|null} A Set containing the IDs of the merged children, or null.
     */
    getMergedChildIds(ownerId) {
        const item = this.mergedCallbackMap.get(ownerId);
        if (item) {
            return new Set(item.children.map(c => c.childId));
        }
        return null;
    }

    /**
     * @param {String} ownerId
     */
    executeCallbacks(ownerId) {
        let me   = this,
            item = me.mergedCallbackMap.get(ownerId);

        if (item) {
            item.children.forEach(child => {
                child.callbacks.forEach(callback => callback());
            });
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
            item.children.forEach(entry => {
                let component = Neo.getComponent(entry.childId);
                if (component) {
                    entry.resolve && component.resolveUpdateCache.push(entry.resolve);
                    component.update();
                }
            });

            me.postUpdateQueueMap.remove(item);
        }
    }
}

export default Neo.setupClass(VDomUpdate);
