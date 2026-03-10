import RecordFactory from './RecordFactory.mjs';
import Store         from './Store.mjs';
import TreeModel     from './TreeModel.mjs';

/**
 * @summary Manages hierarchical data by projecting a visible subset into a flat array for virtual scrolling.
 *
 * `Neo.data.TreeStore` is the architectural bridge between deep, hierarchical data and flat,
 * high-performance UI components like `Neo.grid.Container`.
 *
 * ### The Projection Architecture
 * Unlike a standard `Store` which manages a single flat array, `TreeStore` maintains two distinct states:
 * 1. **The Structural Layer (`#childrenMap`, `#allRecordsMap`):** These native `Map`s hold the complete
 *    tree structure and all data nodes (visible or hidden) in O(1) accessible memory. It intentionally avoids
 *    using a secondary `Neo.collection.Base` for `#allRecordsMap` to prevent memory bloat and "flat array" impedance mismatches.
 * 2. **The Projection Layer (inherited `items` array):** This is a flattened array containing *only* the currently
 *    expanded (visible) nodes. UI components bind to this array, allowing them to render 50k row TreeGrids using
 *    standard virtual scrolling without knowing it's a tree.
 *
 * ### Reactivity & Mutations
 * - **Visibility (Expand/Collapse):** Toggling a node mathematically splices its visible descendants into or
 *   out of the Projection Layer, triggering targeted UI updates.
 * - **Structural Mutations (CRUD):** The overridden `splice` method acts as the single source of truth,
 *   safely updating the Structural Layer (preventing ghost nodes) and recalculating the visible delta.
 * - **ARIA & Accessibility:** During mutations, `siblingCount` and `siblingIndex` are written directly to the records.
 *   This explicitly sacrifices write performance (O(N) during ingestion) to guarantee maximum read performance
 *   (O(1) property access) in the `grid.Row` hot-path rendering loop (60-120fps).
 *
 * @class Neo.data.TreeStore
 * @extends Neo.data.Store
 * @see Neo.grid.Container
 * @see Neo.grid.column.Tree
 */
class TreeStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.data.TreeStore'
         * @protected
         */
        className: 'Neo.data.TreeStore',
        /**
         * @member {String} ntype='tree-store'
         * @protected
         */
        ntype: 'tree-store',
        /**
         * @member {Neo.data.Model} model=TreeModel
         */
        model: TreeModel,
        /**
         * If true, expanding a node will automatically collapse its siblings.
         * @member {Boolean} singleExpand=false
         */
        singleExpand: false
    }

    /**
     * Map containing all nodes (visible or hidden) keyed by their keyProperty.
     * @member {Map} #allRecordsMap
     * @private
     */
    #allRecordsMap = new Map()

    /**
     * Map containing arrays of child nodes, keyed by their parentId (or 'root').
     * @member {Map} #childrenMap
     * @private
     */
    #childrenMap = new Map()

    /**
     * Recursively collects a node and all of its descendants (visible or hidden) into a flat array.
     * Used for deep removal operations.
     * @param {Object|Neo.data.Record} node
     * @param {Array} resultArr
     * @protected
     */
    collectAllDescendants(node, resultArr) {
        resultArr.push(node);

        let key      = this.getKey(node),
            children = this.#childrenMap.get(key) || [];

        for (let i = 0, len = children.length; i < len; i++) {
            this.collectAllDescendants(children[i], resultArr);
        }
    }

    /**
     * Recursively collects a node and all of its visible descendants into a flat array.
     * @param {Object|Neo.data.Record} node
     * @param {Array} resultArr
     * @protected
     */
    collectVisibleDescendants(node, resultArr) {
        resultArr.push(node);

        if (node.collapsed === false) {
            let key      = this.getKey(node),
                children = this.#childrenMap.get(key) || [];

            for (let i = 0, len = children.length; i < len; i++) {
                this.collectVisibleDescendants(children[i], resultArr);
            }
        }
    }

    /**
     * @summary The definitive mutation hook for hierarchical TreeStore data.
     *
     * Unlike a standard `Neo.collection.Base` which manages a single flat array, the `TreeStore`
     * operates on two distinct layers:
     * 1. **The Structural Layer:** Deep, hierarchical maps (`#allRecordsMap`, `#childrenMap`) that represent the true tree.
     * 2. **The Projection Layer:** A flat array of *currently visible* nodes used for high-performance virtual scrolling.
     *
     * This `splice` override intercepts all structural mutations (`add`, `remove`, `splice`) to ensure both layers
     * remain perfectly synchronized.
     *
     * **Architecture & Mechanics:**
     * - **Removals:** When a node is removed, this method recursively identifies and deletes all of its
     *   deep descendants from the Structural Layer, preventing memory leaks and ghost nodes.
     * - **Additions/Moves:** When nodes are added (or moved to a new parent via Drag & Drop), they are
     *   ingested into the Structural Layer.
     * - **ARIA Synchronization:** After any mutation, the O(N) `updateSiblingStats` is called on affected
     *   parents to recalculate `siblingCount` and `siblingIndex`. This trade-off guarantees O(1) reads
     *   during the `grid.Row` hot-path rendering.
     * - **Projection Delta:** Finally, the method calculates the delta of *visible* nodes and delegates
     *   only those specific visual changes to `super.splice()`.
     *
     * @param {Number|null} index
     * @param {Number|Object[]} [removeCountOrToRemoveArray]
     * @param {Object|Object[]} [toAddArray]
     * @returns {Object} An object containing the addedItems & removedItems arrays
     */
    splice(index, removeCountOrToRemoveArray, toAddArray) {
        let me              = this,
            affectedParents = new Set(),
            visibleToRemove = [],
            visibleToAdd    = [],
            nodesToRemove   = [],
            i, len, node, key, parentId;

        // --- 1. Process Removals ---
        if (removeCountOrToRemoveArray) {
            let toRemoveArray;

            if (Array.isArray(removeCountOrToRemoveArray)) {
                toRemoveArray = removeCountOrToRemoveArray;
            } else if (Neo.isNumber(index) && Neo.isNumber(removeCountOrToRemoveArray)) {
                // Map index-based removal to actual items from the flat visible view
                toRemoveArray = me._items.slice(index, index + removeCountOrToRemoveArray);
            }

            if (toRemoveArray && toRemoveArray.length > 0) {
                // 1a. Gather all target nodes and structurally detach them from their parents
                for (i = 0, len = toRemoveArray.length; i < len; i++) {
                    node = me.isItem(toRemoveArray[i]) ? toRemoveArray[i] : me.get(toRemoveArray[i]);
                    if (node) {
                        parentId = node.parentId || 'root';
                        affectedParents.add(parentId);

                        let siblings = me.#childrenMap.get(parentId);
                        if (siblings) {
                            let idx = siblings.indexOf(node);
                            if (idx > -1) {
                                siblings.splice(idx, 1);
                            }
                        }

                        // Collect this node and ALL deep children to ensure full cleanup
                        me.collectAllDescendants(node, nodesToRemove);
                    }
                }

                // 1b. Deep map cleanup. We iterate the flattened descendants to ensure no ghost nodes
                // remain in memory, calculating the visible delta simultaneously.
                for (i = 0, len = nodesToRemove.length; i < len; i++) {
                    node = nodesToRemove[i];
                    key  = me.getKey(node);

                    me.#allRecordsMap.delete(key);
                    me.#childrenMap.delete(key);

                    // Track items that must be removed from the base Collection's flat array
                    if (me.indexOf(node) > -1) {
                        visibleToRemove.push(node);
                    }
                }
            }
        }

        // --- 2. Process Additions & Moves ---
        if (toAddArray) {
            let items    = Array.isArray(toAddArray) ? toAddArray : [toAddArray],
                newRoots = [];

            if (items.length > 0) {
                // 2a. Ingest nodes into the Structural Layer maps
                for (i = 0, len = items.length; i < len; i++) {
                    let data = items[i];
                    key      = me.getKey(data);
                    parentId = data.parentId || 'root';

                    // Soft Hydration for hierarchical fields
                    if (data.depth === undefined) {
                        if (parentId === 'root') {
                            data.depth = 0;
                        } else {
                            let parentNode = me.#allRecordsMap.get(parentId);
                            data.depth = parentNode && parentNode.depth !== undefined ? parentNode.depth + 1 : 1;
                        }
                    }

                    if (data.isLeaf === undefined) {
                        data.isLeaf = true;
                    }
                    
                    if (data.childCount === undefined) {
                        data.childCount = 0;
                    }
                    
                    if (data.collapsed === undefined) {
                        data.collapsed = true;
                    }

                    me.#allRecordsMap.set(key, data);

                    if (!me.#childrenMap.has(parentId)) {
                        me.#childrenMap.set(parentId, []);
                        
                        // If a parent is gaining children, it's no longer a leaf
                        if (parentId !== 'root') {
                            let parentNode = me.#allRecordsMap.get(parentId);
                            if (parentNode && parentNode.isLeaf) {
                                parentNode.isLeaf = false;
                            }
                        }
                    }

                    if (!me.#childrenMap.get(parentId).includes(data)) {
                        me.#childrenMap.get(parentId).push(data);
                        affectedParents.add(parentId);
                    }

                    // Identify nodes that need their flat visible descendants calculated
                    if (parentId === 'root' || !me.#allRecordsMap.has(parentId)) {
                        newRoots.push(data);

                        // Auto-heal disconnected branches by reparenting them to 'root'
                        if (parentId !== 'root') {
                            data.parentId = 'root';
                            let siblings = me.#childrenMap.get(parentId);
                            if (siblings) {
                                let idx = siblings.indexOf(data);
                                if (idx > -1) {
                                    siblings.splice(idx, 1);
                                }
                            }
                            if (!me.#childrenMap.has('root')) {
                                me.#childrenMap.set('root', []);
                            }
                            if (!me.#childrenMap.get('root').includes(data)) {
                                me.#childrenMap.get('root').push(data);
                                affectedParents.add('root');
                            }
                        }
                    }
                }

                // 2b. Calculate the visible delta for all new roots
                for (i = 0, len = newRoots.length; i < len; i++) {
                    me.collectVisibleDescendants(newRoots[i], visibleToAdd);
                }
            }
        }

        // --- 3. Synchronize ARIA Stats ---
        for (const pid of affectedParents) {
            me.updateSiblingStats(pid);
        }

        // --- 4. Finalize Mutations ---

        // Delegate to super.splice ONLY if the Projection Layer (visible items) actually changed.
        if (visibleToRemove.length > 0 || visibleToAdd.length > 0 || index === 0 && removeCountOrToRemoveArray === me.count) {
             return super.splice(index, visibleToRemove, visibleToAdd);
        }

        // Fallback Mutation Event: If we added/removed hidden nodes, the visible array didn't change,
        // so we skipped super.splice(). We must manually fire 'mutate' to keep systems like Store.count in sync.
        if (toAddArray || removeCountOrToRemoveArray) {
             me.fire('mutate', {
                 addedItems     : toAddArray,
                 preventBubbleUp: me.preventBubbleUp,
                 removedItems   : nodesToRemove
             });
        }

        return {
            addedItems  : visibleToAdd,
            removedItems: visibleToRemove
        };
    }

    /**
     * Collapses a node, removing its visible descendants from the flat grid view.
     * @param {String|Number|Object|Neo.data.Record} nodeId
     */
    collapse(nodeId) {
        let me   = this,
            node = me.get(nodeId);

        if (!node || node.collapsed || node.isLeaf) {
            return;
        }

        let key = me.getKey(node);

        node.collapsed = true;

        me.onRecordChange({
            fields: [{name: 'collapsed', oldValue: false, value: true}],
            model : me.model,
            record: node
        });

        // Find how many visible descendants to remove
        let visibleDescendants = [],
            children           = me.#childrenMap.get(key) || [];

        for (let i = 0, len = children.length; i < len; i++) {
            me.collectVisibleDescendants(children[i], visibleDescendants);
        }

        if (visibleDescendants.length > 0) {
            let parentIndex = me.indexOf(node);
            if (parentIndex > -1) {
                // Pass the array of items to remove so `Collection.splice` removes them by key
                super.splice(null, visibleDescendants);
            }
        }
    }


    /**
     * @summary Hierarchically sorts the TreeStore.
     *
     * Overrides `Store.doSort` because the default implementation blindly sorts the flat `_items` array,
     * which destroys the parent-child relationships. This override:
     * 1. Soft-hydrates all nodes (Turbo Mode support).
     * 2. Iterates through the `#childrenMap` and sorts each parent's children array individually.
     * 3. Re-projects the flat `_items` view recursively to maintain tree structural integrity.
     *
     * @param {Object[]} [items=this._items]  Ignored in TreeStore, as it sorts the entire tree structure.
     * @param {Boolean} [silent=false]
     * @protected
     */
    doSort(items=this._items, silent=false) {
        let me            = this,
            previousItems = me._items.slice(),
            isSorted      = Symbol.for('isSorted'),
            updatingIndex = Symbol.for('updatingIndex');

        // 1. Turbo Mode Soft Hydration (from Store.mjs)
        // Since we are sorting the *entire* tree, we must hydrate all nodes, not just visible ones.
        if (!me.autoInitRecords && me.model?.hasComplexFields && me.sorters.length > 0) {
            const
                sortProperties = me.sorters.map(s => s.property),
                len            = sortProperties.length;

            me.#allRecordsMap.forEach(item => {
                if (!RecordFactory.isRecord(item)) {
                    for (let i = 0; i < len; i++) {
                        const property = sortProperties[i];
                        if (!Object.hasOwn(item, property)) {
                            item[property] = me.resolveField(item, property);
                        }
                    }
                }
            });
        }

        // If there are no sorters, just clear the sorted flag and exit
        if (!me.sortProperties || me.sortProperties.length === 0) {
            me[isSorted] = false;
            return;
        }

        // 2. Hierarchically sort each children array in the Structural Layer
        for (let children of me.#childrenMap.values()) {
            me.sortArray(children);
        }

        // 3. Re-project the flat _items array from the sorted Structural Layer
        me._items = [];
        let roots = me.#childrenMap.get('root') || [];
        for (let i = 0, len = roots.length; i < len; i++) {
            me.collectVisibleDescendants(roots[i], me._items);
        }

        // 4. Update the Collection keys map and isSorted flag
        me._keys = me._items.map(item => me.getKey(item));
        me[isSorted] = true;

        // 5. Fire the sort event, passing the flat view items
        if (!silent && me[updatingIndex] === 0) {
            me.fire('sort', {
                items: me._items,
                previousItems,
                scope: me
            });
        }
    }

    /**
     * Sorts an array of records/objects based on the Store's current sorters.
     * Extracted from `Neo.collection.Base` to sort localized child arrays.
     * @param {Array} arr The array to sort.
     * @protected
     */
    sortArray(arr) {
        let me = this,
            {sorters, sortDirections, sortProperties} = me,
            countSorters      = sortProperties.length || 0,
            hasSortByMethod   = false,
            hasTransformValue = false,
            i, mappedItems, obj, sorter, sortProperty, sortValue, val1, val2;

        sorters.forEach(key => {
            if (key.sortBy)            hasSortByMethod   = true;
            if (key.useTransformValue) hasTransformValue = true;
        });

        if (hasSortByMethod) {
            arr.sort((a, b) => {
                i = 0;
                for (; i < countSorters; i++) {
                    sorter    = sorters[i];
                    sortValue = sorter[sorter.sortBy ? 'sortBy' : 'defaultSortBy'](a, b);
                    if (sortValue !== 0) return sortValue;
                }
                return 0;
            });
        } else {
            if (hasTransformValue) {
                mappedItems = arr.map((item, index) => {
                    obj = {index, original: item};
                    i   = 0;
                    for (; i < countSorters; i++) {
                        if (sorters[i].useTransformValue) {
                            obj[sortProperties[i]] = sorters[i].transformValue(item[sortProperties[i]]);
                        } else {
                            obj[sortProperties[i]] = item[sortProperties[i]];
                        }
                    }
                    return obj;
                });
            } else {
                mappedItems = arr;
            }

            mappedItems.sort((a, b) => {
                i = 0;
                for (; i < countSorters; i++) {
                    sortProperty = sortProperties[i];
                    val1         = a[sortProperty];
                    val2         = b[sortProperty];

                    if (val1 == null && val2 != null) return  1;
                    if (val1 != null && val2 == null) return -1;
                    if (val1 > val2) return  1 * sortDirections[i];
                    if (val1 < val2) return -1 * sortDirections[i];
                }
                return 0;
            });

            if (hasTransformValue) {
                // Map the sorted mappedItems back into the original array in place
                let sortedOriginals = mappedItems.map(el => el.original);
                for (i = 0; i < arr.length; i++) {
                    arr[i] = sortedOriginals[i];
                }
            }
        }
    }

    /**
     * Expands a node, injecting its children into the flat grid view.
     * Supports asynchronous loading if children are missing and an API/URL is configured.
     * @param {String|Number|Object|Neo.data.Record} nodeId
     */
    async expand(nodeId) {
        let me   = this,
            node = me.get(nodeId);

        if (!node || node.collapsed === false || node.isLeaf || node.isLoading) {
            return;
        }

        let key = me.getKey(node);

        if (me.singleExpand && node.parentId) {
            let siblings = me.#childrenMap.get(node.parentId) || [];
            for (let i = 0, len = siblings.length; i < len; i++) {
                let sibling = siblings[i];
                if (sibling !== node && sibling.collapsed === false) {
                    me.collapse(me.getKey(sibling));
                }
            }
        }

        // Clear previous error state on retry
        if (node.hasError) {
            node.hasError = false;
            me.onRecordChange({
                fields: [{name: 'hasError', oldValue: true, value: false}],
                model : me.model,
                record: node
            });
        }

        let children = me.#childrenMap.get(key) || [];

        // Case A: Children are already in memory
        if (children.length > 0) {
            node.collapsed = false;

            me.onRecordChange({
                fields: [{name: 'collapsed', oldValue: true, value: false}],
                model : me.model,
                record: node
            });

            let visibleDescendants = [];
            for (let i = 0, len = children.length; i < len; i++) {
                me.collectVisibleDescendants(children[i], visibleDescendants);
            }

            let parentIndex = me.indexOf(node);
            if (parentIndex > -1) {
                super.splice(parentIndex + 1, 0, visibleDescendants);
            }
        }
        // Case B: Async Fetch required
        else if (me.url || me.api || me.proxy) {
            node.isLoading = true;

            me.onRecordChange({
                fields: [{name: 'isLoading', oldValue: false, value: true}],
                model : me.model,
                record: node
            });

            try {
                // The load() call will eventually trigger add(), which populates #childrenMap
                // but won't blindly append them to the flat array because their parent is known.
                await me.load({
                    append: true,
                    params: { parentId: key }
                });

                children = me.#childrenMap.get(key) || [];

                node.isLoading = false;
                node.collapsed = false;

                me.onRecordChange({
                    fields: [
                        {name: 'isLoading', oldValue: true, value: false},
                        {name: 'collapsed', oldValue: true, value: false}
                    ],
                    model : me.model,
                    record: node
                });

                if (children.length > 0) {
                    let visibleDescendants = [];
                    for (let i = 0, len = children.length; i < len; i++) {
                        me.collectVisibleDescendants(children[i], visibleDescendants);
                    }

                    let parentIndex = me.indexOf(node);
                    if (parentIndex > -1) {
                        super.splice(parentIndex + 1, 0, visibleDescendants);
                    }
                }
            } catch (error) {
                node.isLoading = false;
                node.hasError  = true;

                me.onRecordChange({
                    fields: [
                        {name: 'isLoading', oldValue: true, value: false},
                        {name: 'hasError', oldValue: false, value: true}
                    ],
                    model : me.model,
                    record: node
                });

                me.fire('loadError', { error, record: node });
            }
        }
    }

    /**
     * Overrides Store:get() to ensure records can be retrieved even if they are hidden
     * (not in the active flattened view).
     * @param {Number|String|Object|Neo.data.Record} key
     * @returns {Object|null}
     */
    get(key) {
        if (this.isItem(key)) {
            key = this.getKey(key);
        }

        let me   = this,
            item = super.get(key); // Check the standard visible map first (fastest)

        if (!item && me.#allRecordsMap.has(key)) {
            // Fallback to the full tree map for hidden nodes.
            // Pass it through hydrateRecord to ensure Turbo Mode lazy instantiation works.
            item = me.hydrateRecord(me.#allRecordsMap.get(key));
        }

        return item || null;
    }

    /**
     * Extends the base Store's hydrateRecord to also update the TreeStore's internal maps.
     * This acts as the Single Source of Truth for "Soft Hydration" in Turbo Mode, ensuring
     * that when a raw data object becomes a Record, the TreeStore doesn't suffer from a split-brain.
     * @param {Object} item The raw data object or Record
     * @param {Number} [index] Optional index in the items array
     * @returns {Neo.data.Record|Object|null} The hydrated Record
     * @protected
     */
    hydrateRecord(item, index) {
        let me = this;

        // Base Store handles instantiation and updating the primary Collection maps
        const record = super.hydrateRecord(item, index);

        // If the item WAS a raw object, and IS NOW a Record, we must heal the Tree maps
        if (record && !RecordFactory.isRecord(item)) {
            const key = me.getKey(record);

            // Heal the all-records map
            me.#allRecordsMap.set(key, record);

            // Heal the children map to keep structural references consistent
            const parentId = record.parentId || 'root';
            const siblings = me.#childrenMap.get(parentId);

            if (siblings) {
                // We use the raw item's identity (=== item) to find it in the siblings array
                // because the array currently holds the raw object reference.
                const idx = siblings.indexOf(item);
                if (idx > -1) {
                    siblings[idx] = record;
                }
            }
        }

        return record;
    }

    /**
     * Toggles the expansion state of a node.
     * @param {String|Number} nodeId
     */
    toggle(nodeId) {
        let node = this.get(nodeId);
        if (node) {
            if (node.collapsed) {
                this.expand(nodeId);
            } else {
                this.collapse(nodeId);
            }
        }
    }

    /**
     * Recalculates the `siblingCount`, `siblingIndex`, and `childCount` for all children of a given parent.
     * This is an O(N) operation called during mutations to ensure O(1) reads during VDOM rendering.
     * @param {String|Number} parentId The ID of the parent node (or 'root').
     * @protected
     */
    updateSiblingStats(parentId) {
        let me       = this,
            siblings = me.#childrenMap.get(parentId);

        if (siblings) {
            let count = siblings.length;
            
            // 1. Update Parent's childCount
            if (parentId !== 'root') {
                let parentNode = me.#allRecordsMap.get(parentId);
                if (parentNode && parentNode.childCount !== count) {
                    parentNode.childCount = count;
                    
                    // Trigger reactivity if it's an instantiated record
                    if (parentNode.isRecord) {
                        me.onRecordChange({
                            fields: [{name: 'childCount', oldValue: undefined, value: count}], // Note: oldValue tracking might be complex here, keeping it simple for now
                            model : me.model,
                            record: parentNode
                        });
                    }
                }
            }

            // 2. Update Siblings' ARIA stats
            for (let i = 0; i < count; i++) {
                let sibling = siblings[i];
                if (sibling.siblingCount !== count || sibling.siblingIndex !== i + 1) {
                    sibling.siblingCount = count;
                    sibling.siblingIndex = i + 1; // 1-based for ARIA
                    
                    if (sibling.isRecord) {
                        me.onRecordChange({
                            fields: [
                                {name: 'siblingCount', oldValue: undefined, value: count},
                                {name: 'siblingIndex', oldValue: undefined, value: i + 1}
                            ],
                            model : me.model,
                            record: sibling
                        });
                    }
                }
            }
        } else if (parentId !== 'root') {
            // The parent has no children left.
            let parentNode = me.#allRecordsMap.get(parentId);
            if (parentNode && parentNode.childCount !== 0) {
                parentNode.childCount = 0;
                if (parentNode.isRecord) {
                    me.onRecordChange({
                        fields: [{name: 'childCount', oldValue: undefined, value: 0}],
                        model : me.model,
                        record: parentNode
                    });
                }
            }
        }
    }
}

export default Neo.setupClass(TreeStore);
