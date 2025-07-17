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
        postUpdateQueueMap: null,
    }

    /**
     * @member {Map|null} inFlightUpdateMap=null
     * @protected
     */
    inFlightUpdateMap = null;
    /**
     * @member {Map|null} promiseCallbackMap=null
     * @protected
     */
    promiseCallbackMap = null;

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        me.inFlightUpdateMap  = new Map();
        me.mergedCallbackMap  = Neo.create(Collection, {keyProperty: 'ownerId'});
        me.postUpdateQueueMap = Neo.create(Collection, {keyProperty: 'ownerId'});
        me.promiseCallbackMap = new Map();
    }

    /**
     * @param {String} ownerId
     * @param {Function} callback
     */
    addPromiseCallback(ownerId, callback) {
        let me = this;

        if (!me.promiseCallbackMap.has(ownerId)) {
            me.promiseCallbackMap.set(ownerId, [])
        }

        me.promiseCallbackMap.get(ownerId).push(callback)
    }

    /**
     * Registers an update that is currently in-flight to the worker.
     * @param {String} ownerId The ID of the component owning the update.
     * @param {Number} updateDepth The depth of the in-flight update.
     */
    registerInFlightUpdate(ownerId, updateDepth) {
        this.inFlightUpdateMap.set(ownerId, updateDepth);
    }

    /**
     * Retrieves the update depth for an in-flight update.
     * @param {String} ownerId The ID of the component owning the update.
     * @returns {Number|undefined} The update depth, or undefined if not found.
     */
    getInFlightUpdateDepth(ownerId) {
        return this.inFlightUpdateMap.get(ownerId);
    }

    /**
     * Unregisters an in-flight update once it has completed.
     * @param {String} ownerId The ID of the component owning the update.
     */
    unregisterInFlightUpdate(ownerId) {
        this.inFlightUpdateMap.delete(ownerId);
    }

    /**
     * @param {String} ownerId
     * @param {String} childId
     * @param {Number} childUpdateDepth
     * @param {Number} distance
     */
    registerMerged(ownerId, childId, childUpdateDepth, distance) {
        let me   = this,
            item = me.mergedCallbackMap.get(ownerId);

        if (!item) {
            item = {ownerId, children: new Map()};
            me.mergedCallbackMap.add(item);
        }

        item.children.set(childId, {childUpdateDepth, distance});
    }

    /**
     * @param {String} ownerId
     * @param {String} childId
     * @param {Function} [resolve]
     */
    registerPostUpdate(ownerId, childId, resolve) {
        let me   = this,
            item = me.postUpdateQueueMap.get(ownerId),
            childCallbacks;

        if (!item) {
            item = {ownerId, children: []};
            me.postUpdateQueueMap.add(item);
        }

        item.children.push({childId, resolve})
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
            item.children.forEach(value => {
                if (value.childUpdateDepth === -1) {
                    newDepth = -1;
                } else {
                    // The new depth is the distance to the child plus the child's own required update depth.
                    newDepth = value.distance + value.childUpdateDepth;
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
            return new Set(item.children.keys());
        }
        return null;
    }

    /**
     * @param {String} ownerId
     * @param {Object} [data]
     */
    executeCallbacks(ownerId, data) {
        let me           = this,
            item         = me.mergedCallbackMap.get(ownerId),
            callbackData = data ? [data] : [];

        if (item) {
            item.children.forEach((value, key) => {
                me.executePromiseCallbacks(key, ...callbackData)
            });
            me.mergedCallbackMap.remove(item);
        }

        me.executePromiseCallbacks(ownerId, ...callbackData)
    }

    /**
     * @param {String} ownerId
     * @param {Object} [data]
     */
    executePromiseCallbacks(ownerId, data) {
        let me        = this,
            callbacks = me.promiseCallbackMap.get(ownerId);

        callbacks?.forEach(callback => callback(data));
        me.promiseCallbackMap.delete(ownerId);
    }

    /**
     * @param {String} ownerId
     */
    triggerPostUpdates(ownerId) {
        let me   = this,
            item = me.postUpdateQueueMap.get(ownerId),
            component;

        if (item) {
            item.children.forEach(entry => {
                component = Neo.getComponent(entry.childId);

                if (component) {
                    entry.resolve && me.addPromiseCallback(component.id, entry.resolve);
                    component.update();
                }
            });

            me.postUpdateQueueMap.remove(item);
        }
    }
}

export default Neo.setupClass(VDomUpdate);
