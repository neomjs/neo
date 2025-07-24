import Collection from '../collection/Base.mjs';

/**
 * The VDomUpdate manager is a singleton responsible for orchestrating and optimizing
 * component VDOM updates within the Neo.mjs framework. It acts as a central coordinator
 * to optimize the VDOM update process. Its primary goal is to reduce the amount of
 * message roundtrips between the application and VDOM workers by aggregating multiple
 * component updates into a single, optimized VDOM tree.
 *
 * Key Responsibilities:
 * 1. **Update Merging & Aggregation:** Allows a parent component to absorb the update
 *    requests of its children. Instead of each child triggering a separate VDOM update
 *    message to the VDOM worker, the parent sends a single, aggregated VDOM tree. This
 *    significantly reduces the overhead of worker communication and can result in smaller,
 *    more focused data for the VDOM worker to process. While the amount of final DOM
 *    modifications remains the same, this aggregation is key to performance.
 *
 * 2. **Asynchronous Flow Control:** Manages the asynchronous nature of VDOM updates, which
 *    are often processed in a worker thread. It ensures that code awaiting an update
 *    (e.g., via a returned Promise) is correctly notified upon completion.
 *
 * 3. **Dependency Chaining:** Provides a "post-update" queue, allowing one component's
 *    update to be declaratively chained to another's, ensuring a predictable order of
 *    operations.
 *
 * 4. **State Tracking:** Keeps track of updates that are "in-flight" (i.e., currently
 *    being processed), which helps to avoid race conditions and redundant work.
 *
 * By centralizing these concerns, VDomUpdate plays a critical role in the framework's
 * performance and rendering efficiency.
 *
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
         * A collection that maps a parent component's ID (`ownerId`) to the set of child
         * components whose VDOM updates have been merged into that parent's update cycle.
         *
         * The structure for each entry is:
         * `{ ownerId: 'parent-id', children: Map<'child-id', {childUpdateDepth, distance}> }`
         *
         * - `ownerId`: The `id` of the parent component taking responsibility for the update.
         * - `children`: A Map where keys are the `id`s of the merged children and values
         *   are objects containing metadata needed to calculate the total update scope.
         *
         * @member {Neo.collection.Base|null} mergedCallbackMap=null
         * @protected
         */
        mergedCallbackMap: null,
        /**
         * A collection that queues components that need to be updated immediately after
         * another component's update cycle completes. This is used to handle rendering
         * dependencies.
         *
         * The structure for each entry is:
         * `{ ownerId: 'component-id', children: [{childId, resolve}] }`
         *
         * - `ownerId`: The `id` of the component whose update completion will trigger the queued updates.
         * - `children`: An array of objects, where `childId` is the component to update and
         *   `resolve` is the Promise resolver to call after that subsequent update is done.
         *
         * @member {Neo.collection.Base|null} postUpdateQueueMap=null
         * @protected
         */
        postUpdateQueueMap: null,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * A Map that tracks VDOM updates that have been dispatched to the VDOM worker but
     * have not yet completed. This prevents redundant updates for the same component.
     *
     * The structure is: `Map<'component-id', updateDepth>`
     *
     * @member {Map|null} inFlightUpdateMap=null
     * @protected
     */
    inFlightUpdateMap = null;
    /**
     * A Map that stores Promise `resolve` functions associated with a component's update.
     * When a component's VDOM update is finalized, the callbacks for its ID are executed,
     * resolving the Promise returned by the component's `update()` method.
     *
     * The structure is: `Map<'component-id', [callback1, callback2, ...]>`
     *
     * @member {Map|null} promiseCallbackMap=null
     * @protected
     */
    promiseCallbackMap = null;

    /**
     * Initializes the manager's internal collections and maps.
     * This is called automatically when the singleton instance is created.
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
     * Registers a callback function to be executed when a specific component's
     * VDOM update completes. This is the mechanism that resolves the Promise
     * returned by `Component#update()`.
     * @param {String}   ownerId  The `id` of the component owning the update.
     * @param {Function} callback The function to execute upon completion.
     */
    addPromiseCallback(ownerId, callback) {
        let me = this;

        if (!me.promiseCallbackMap.has(ownerId)) {
            me.promiseCallbackMap.set(ownerId, [])
        }

        me.promiseCallbackMap.get(ownerId).push(callback)
    }

    /**
     * Executes all callbacks associated with a completed VDOM update for a given `ownerId`.
     * This method first processes callbacks for any children that were merged into this
     * update cycle, then executes the callbacks for the `ownerId` itself.
     * @param {String} ownerId The `id` of the component whose update has just completed.
     * @param {Object} [data]  Optional data to pass to the callbacks.
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
     * A helper method that invokes all registered promise callbacks for a given
     * component ID and then clears them from the queue.
     * @param {String} ownerId The `id` of the component.
     * @param {Object} [data]  Optional data to pass to the callbacks.
     */
    executePromiseCallbacks(ownerId, data) {
        let me        = this,
            callbacks = me.promiseCallbackMap.get(ownerId);

        callbacks?.forEach(callback => callback(data));
        me.promiseCallbackMap.delete(ownerId);
    }

    /**
     * Calculates the required `updateDepth` for a parent component based on its own
     * needs and the needs of all child components whose updates have been merged into it.
     * The final depth is the maximum required depth to ensure all changes are rendered.
     *
     * For example, if a parent needs to update its direct content (`updateDepth: 1`) but
     * a merged child 3 levels down needs a full subtree update (`childUpdateDepth: -1`),
     * this method will return -1, signaling a full recursive update from the parent.
     *
     * This method is called by the parent component right before it dispatches its VDOM update.
     * @param {String} ownerId The `id` of the parent component.
     * @returns {Number|null} The adjusted update depth, or `null` if no merged children exist.
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
                    newDepth = -1
                } else {
                    // The new depth is the distance to the child plus the child's own required update depth.
                    newDepth = value.distance + value.childUpdateDepth
                }

                if (newDepth === -1) {
                    maxDepth = -1
                } else if (maxDepth !== -1) {
                    maxDepth = Math.max(maxDepth, newDepth)
                }
            });

            return maxDepth
        }

        return null
    }

    /**
     * Retrieves the `updateDepth` for a component's update that is currently in-flight.
     * @param {String} ownerId The `id` of the component owning the update.
     * @returns {Number|undefined} The update depth, or `undefined` if no update is in-flight.
     */
    getInFlightUpdateDepth(ownerId) {
        return this.inFlightUpdateMap.get(ownerId)
    }

    /**
     * Returns a Set of child component IDs that have been merged into a parent's update cycle.
     * This is used by the parent to know which children it is responsible for updating.
     * @param {String} ownerId The `id` of the parent component.
     * @returns {Set<String>|null} A Set containing the IDs of the merged children, or `null`.
     */
    getMergedChildIds(ownerId) {
        const item = this.mergedCallbackMap.get(ownerId);
        if (item) {
            return new Set(item.children.keys())
        }
        return null
    }

    /**
     * Marks a component's VDOM update as "in-flight," meaning it has been sent to the
     * worker for processing.
     * @param {String} ownerId     The `id` of the component owning the update.
     * @param {Number} updateDepth The depth of the in-flight update.
     */
    registerInFlightUpdate(ownerId, updateDepth) {
        this.inFlightUpdateMap.set(ownerId, updateDepth)
    }

    /**
     * Registers a child's update request to be merged into its parent's update cycle.
     * This is called by a child component when it determines it can delegate its update
     * to an ancestor.
     * @param {String} ownerId          The `id` of the parent component that will own the merged update.
     * @param {String} childId          The `id` of the child component requesting the merge.
     * @param {Number} childUpdateDepth The update depth required by the child.
     * @param {Number} distance         The component tree distance (number of levels) between the parent and child.
     */
    registerMerged(ownerId, childId, childUpdateDepth, distance) {
        let me   = this,
            item = me.mergedCallbackMap.get(ownerId);

        if (!item) {
            item = {ownerId, children: new Map()};
            me.mergedCallbackMap.add(item)
        }

        item.children.set(childId, {childUpdateDepth, distance})
    }

    /**
     * Queues a component update to be executed after another component's update is complete.
     * @param {String} ownerId     The `id` of the component to wait for.
     * @param {String} childId     The `id` of the component to update afterward.
     * @param {Function} [resolve] The Promise resolver to be called when the `childId`'s subsequent update finishes.
     */
    registerPostUpdate(ownerId, childId, resolve) {
        let me   = this,
            item = me.postUpdateQueueMap.get(ownerId);

        if (!item) {
            item = {ownerId, children: []};
            me.postUpdateQueueMap.add(item)
        }

        item.children.push({childId, resolve})
    }

    /**
     * Triggers all pending updates that were queued to run after the specified `ownerId`'s
     * update has completed.
     * @param {String} ownerId The `id` of the component whose update has just finished.
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
                    component.update()
                }
            });

            me.postUpdateQueueMap.remove(item)
        }
    }

    /**
     * Removes a component's update from the "in-flight" registry. This is called after
     * the VDOM worker confirms the update has been processed.
     * @param {String} ownerId The `id` of the component owning the update.
     */
    unregisterInFlightUpdate(ownerId) {
        this.inFlightUpdateMap.delete(ownerId)
    }
}

export default Neo.setupClass(VDomUpdate);
