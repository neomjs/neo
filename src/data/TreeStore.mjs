import RecordFactory from './RecordFactory.mjs';
import Store         from './Store.mjs';
import TreeModel     from './TreeModel.mjs';

const
    isFiltered    = Symbol.for('isFiltered'),
    isSorted      = Symbol.for('isSorted'),
    updatingIndex = Symbol.for('updatingIndex');

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
     * The foundation of the Structural Layer. A map containing all nodes (visible or hidden)
     * keyed by their keyProperty, ensuring O(1) node retrieval regardless of expansion state.
     * @member {Map} #allRecordsMap
     * @private
     */
    #allRecordsMap = new Map()
    /**
     * The hierarchy of the Structural Layer. A map containing arrays of child nodes,
     * keyed by their parentId (or 'root'), enabling fast top-down recursive operations.
     * @member {Map} #childrenMap
     * @private
     */
    #childrenMap = new Map()

    /**
     * @summary Overrides `clear` to prevent memory leaks and split-brain states.
     *
     * The base `Store.clear()` only truncates the flat `_items` array (the Projection Layer).
     * If this override didn't exist, calling `clear()` on a TreeStore would leave `#allRecordsMap`
     * and `#childrenMap` fully populated, causing a massive memory leak and putting the UI out
     * of sync with the data model.
     *
     * This method ensures both the Projection Layer (via `super.clear()`) and the Structural Layer
     * are completely wiped. It also resets the `_keptNodes` mask used for filtering.
     */
    clear() {
        let me = this;

        me.#allRecordsMap.clear();
        me.#childrenMap.clear();

        if (me._keptNodes) {
            me._keptNodes.clear();
            me._keptNodes = null
        }

        super.clear()
    }

    /**
     * @summary Clears all active filters and completely rebuilds the visible projection.
     *
     * Overrides the base `Collection` implementation which relies on a cloned `allItems` array
     * to remember the unfiltered state. TreeStore bypasses `allItems` entirely, relying on
     * its `#allRecordsMap` and the `_keptNodes` visibility mask.
     *
     * This method removes the mask and forces a top-down re-calculation of the `_items` array
     * to instantly restore the full visible hierarchy.
     *
     * @param {Boolean} [silent=false] True to prevent firing the 'filter' event
     */
    clearFilters(silent=false) {
        let me = this;

        me.filters = [];

        if (me._keptNodes) {
            me._keptNodes.clear();
            me._keptNodes = null
        }

        me[isFiltered] = false;

        // Re-project the flat array from the unfiltered structural maps
        me._items = [];
        let roots = me.#childrenMap.get('root') || [];
        for (let i = 0; i < roots.length; i++) {
            me.collectVisibleDescendants(roots[i], me._items)
        }

        me.#rebuildKeysAndCount();

        // Restore structural sibling stats
        for (let parentId of me.#childrenMap.keys()) {
            me.updateSiblingStats(parentId)
        }

        me.calcValueBands();

        if (!silent && me[updatingIndex] === 0) {
            me.fire('filter', {
                isFiltered: false,
                scope     : me
            })
        }
    }

    /**
     * Collapses a node by mathematically removing its visible descendants from the
     * flat Projection Layer (`_items`), without altering the underlying Structural Layer.
     * @param {String|Number|Object|Neo.data.Record} nodeId
     */
    collapse(nodeId) {
        let me   = this,
            node = me.get(nodeId);

        if (!node || node.collapsed || node.isLeaf) {
            return
        }

        let key = me.getKey(node);

        node.collapsed = true;

        // Find how many visible descendants to remove
        let visibleDescendants = [],
            children           = me.#childrenMap.get(key) || [];

        for (let i = 0, len = children.length; i < len; i++) {
            me.collectVisibleDescendants(children[i], visibleDescendants)
        }

        if (visibleDescendants.length > 0) {
            let parentIndex = me.indexOf(node);
            if (parentIndex > -1) {
                // Pass the array of items to remove so `Collection.splice` removes them by key
                super.splice(null, visibleDescendants)
            }
        }
    }

    /**
     * @summary Collapses all nodes in the tree.
     *
     * Iterates through the entire structural layer, silently setting `collapsed = true`
     * on all non-leaf nodes. The visible projection (`_items`) is then completely
     * re-calculated from the roots, and a single `load` event is fired to trigger a UI refresh.
     * This avoids the O(N^2) cost of triggering individual `splice` operations.
     *
     * @param {Boolean} [silent=false] True to prevent firing the 'load' event
     */
    collapseAll(silent=false) {
        let me = this;

        for (let item of me.#allRecordsMap.values()) {
            if (!item.isLeaf && item.collapsed === false) {
                if (item.isRecord) {
                    item.setSilent({collapsed: true})
                } else {
                    item.collapsed = true
                }
            }
        }

        // Re-project the flat array from the roots
        me._items = [];
        let roots = me.#childrenMap.get('root') || [];
        for (let i = 0, len = roots.length; i < len; i++) {
            me.collectVisibleDescendants(roots[i], me._items)
        }

        me.#rebuildKeysAndCount();

        me.calcValueBands();

        if (!silent && me[updatingIndex] === 0) {
            me.fire('load', {items: me._items})
        }
    }

    /**
     * Recursively traverses the Structural Layer (`#childrenMap`) to collect a node and
     * ALL of its descendants (visible or hidden). Used for deep cleanup operations.
     * @param {Object|Neo.data.Record} node
     * @param {Array} resultArr
     * @protected
     */
    collectAllDescendants(node, resultArr) {
        resultArr.push(node);

        let me       = this,
            key      = me.getKey(node),
            children = me.#childrenMap.get(key) || [];

        for (let i = 0, len = children.length; i < len; i++) {
            me.collectAllDescendants(children[i], resultArr)
        }
    }

    /**
     * Recursively traverses the Structural Layer (`#childrenMap`) to project a node and
     * its currently expanded (visible) descendants into a flat array for the Projection Layer.
     * @param {Object|Neo.data.Record} node
     * @param {Array} resultArr
     * @protected
     */
    collectVisibleDescendants(node, resultArr) {
        let me  = this,
            key = this.getKey(node);

        if (me._keptNodes && !me._keptNodes.has(key)) {
            return
        }

        resultArr.push(node);

        if (node.collapsed === false) {
            let children = me.#childrenMap.get(key) || [];

            for (let i = 0, len = children.length; i < len; i++) {
                me.collectVisibleDescendants(children[i], resultArr)
            }
        }
    }

    /**
     * @summary Hierarchically sorts the TreeStore.
     *
     * Overrides `Store.doSort` because the default implementation blindly sorts the flat `_items` array,
     * which would destroy the parent-child relationships (e.g., an alphabetical sort would mix
     * all parents and children globally).
     *
     * **Architectural Mechanics:**
     * 1. **Soft Hydration:** If 'Turbo Mode' is active, the entire `#allRecordsMap` is soft-hydrated
     *    to ensure complex fields (like calculated fields) are evaluable without full Record instantiation.
     * 2. **Localized Sorting:** The algorithm iterates through the `#childrenMap` and applies the
     *    active Sorters individually to each parent's array of children.
     * 3. **Projection Re-calculation:** After the Structural Layer is sorted, the flat `_items` projection
     *    is completely rebuilt via a top-down recursive traversal (`collectVisibleDescendants`), ensuring
     *    the visual output remains strictly contiguous (parents immediately followed by their children).
     *
     * @param {Object[]} [items=this._items] Ignored in TreeStore, as it sorts the entire tree structure.
     * @param {Boolean} [silent=false]
     * @protected
     * @fires sort
     */
    doSort(items=this._items, silent=false) {
        let me            = this,
            previousItems = me._items.slice();

        // 1. Turbo Mode Soft Hydration (from Store.mjs)
        // Since we are sorting the *entire* tree, we must hydrate all nodes, not just visible ones.
        if (!me.autoInitRecords && me.model?.hasComplexFields && me.sorters.length > 0) {
            const
                sortProperties = me.sorters.map(s => s.property),
                len            = sortProperties.length;

            for (let item of me.#allRecordsMap.values()) {
                if (!RecordFactory.isRecord(item)) {
                    for (let i = 0; i < len; i++) {
                        const property = sortProperties[i];
                        if (!Object.hasOwn(item, property)) {
                            item[property] = me.resolveField(item, property)
                        }
                    }
                }
            }
        }

        // If there are no sorters, just clear the sorted flag and exit
        if (!me.sortProperties || me.sortProperties.length === 0) {
            me[isSorted] = false;
            return
        }

        // 2. Hierarchically sort each children array in the Structural Layer
        for (let children of me.#childrenMap.values()) {
            me.sortArray(children)
        }

        // 3. Update sibling stats after sorting to reflect new indices
        for (let parentId of me.#childrenMap.keys()) {
            me.updateSiblingStats(parentId)
        }

        // 4. Re-project the flat _items array from the sorted Structural Layer
        me._items = [];
        let roots = me.#childrenMap.get('root') || [];
        for (let i = 0, len = roots.length; i < len; i++) {
            me.collectVisibleDescendants(roots[i], me._items)
        }

        // 5. Update the Collection keys map and isSorted flag
        me.#rebuildKeysAndCount();
        me[isSorted] = true;

        me.calcValueBands();

        // 6. Fire the sort event, passing the flat view items
        if (!silent && me[updatingIndex] === 0) {
            me.fire('sort', {
                items: me._items,
                previousItems,
                scope: me
            })
        }
    }

    /**
     * Expands a node by projecting its visible children from the Structural Layer
     * into the flat Projection Layer (`_items`).
     * Supports asynchronous loading if children are missing and an API/URL is configured.
     * @param {String|Number|Object|Neo.data.Record} nodeId
     */
    async expand(nodeId) {
        let me   = this,
            node = me.get(nodeId);

        if (!node || node.collapsed === false || node.isLeaf || node.isLoading) {
            return
        }

        let key = me.getKey(node);

        if (me.singleExpand && node.parentId) {
            let siblings = me.#childrenMap.get(node.parentId) || [];
            for (let i = 0, len = siblings.length; i < len; i++) {
                let sibling = siblings[i];
                if (sibling !== node && sibling.collapsed === false) {
                    me.collapse(me.getKey(sibling))
                }
            }
        }

        // Clear previous error state on retry
        if (node.hasError) {
            node.hasError = false;
        }

        let children = me.#childrenMap.get(key) || [];

        // Case A: Children are already in memory
        if (children.length > 0) {
            node.collapsed = false;

            let visibleDescendants = [];
            for (let i = 0, len = children.length; i < len; i++) {
                me.collectVisibleDescendants(children[i], visibleDescendants)
            }

            let parentIndex = me.indexOf(node);
            if (parentIndex > -1) {
                super.splice(parentIndex + 1, 0, visibleDescendants)
            }
        }
        // Case B: Async Fetch required
        else if (me.url || me.api || me.parser) {
            node.isLoading = true;

            try {
                // The load() call will eventually trigger add(), which populates #childrenMap
                // but won't blindly append them to the flat array because their parent is known.
                await me.load({
                    append: true,
                    params: {parentId: key}
                });

                children = me.#childrenMap.get(key) || [];

                node.set({
                    collapsed: false,
                    isLoading: false
                });

                if (children.length > 0) {
                    let visibleDescendants = [];
                    for (let i = 0, len = children.length; i < len; i++) {
                        me.collectVisibleDescendants(children[i], visibleDescendants)
                    }

                    let parentIndex = me.indexOf(node);
                    if (parentIndex > -1) {
                        super.splice(parentIndex + 1, 0, visibleDescendants)
                    }
                }
            } catch (error) {
                node.set({
                    hasError : true,
                    isLoading: false
                });

                me.fire('loadError', {error, record: node})
            }
        }
    }

    /**
     * @summary Expands all nodes in the tree.
     *
     * Iterates through the entire structural layer, silently setting `collapsed = false`
     * on all non-leaf nodes. The visible projection (`_items`) is then completely
     * re-calculated from the roots, and a single `load` event is fired to trigger a UI refresh.
     * This avoids the O(N^2) cost of triggering individual `splice` operations.
     *
     * @param {Boolean} [silent=false] True to prevent firing the 'load' event
     */
    expandAll(silent=false) {
        let me = this;

        for (let item of me.#allRecordsMap.values()) {
            if (!item.isLeaf && item.collapsed) {
                if (item.isRecord) {
                    item.setSilent({collapsed: false})
                } else {
                    item.collapsed = false
                }
            }
        }

        // Re-project the flat array from the roots
        me._items = [];
        let roots = me.#childrenMap.get('root') || [];
        for (let i = 0, len = roots.length; i < len; i++) {
            me.collectVisibleDescendants(roots[i], me._items)
        }

        me.#rebuildKeysAndCount();

        me.calcValueBands();

        if (!silent && me[updatingIndex] === 0) {
            me.fire('load', {items: me._items})
        }
    }

    /**
     * @summary Overrides standard Collection filtering to provide "ancestor-aware" tree filtering.
     *
     * Unlike a flat data store where filtering simply hides non-matching rows, a TreeGrid
     * must preserve the hierarchical context of any matching node. If a user searches
     * for a deeply nested file, hiding its parent folders would break the visual tree structure
     * and orphan the result.
     *
     * **Architectural Mechanics:**
     * 1. **Soft Hydration:** If 'Turbo Mode' is active, the entire `#allRecordsMap` is soft-hydrated
     *    to ensure complex fields (like calculated 'name' paths) are evaluable without full Record instantiation.
     * 2. **Recursive Evaluation:** A top-down recursive pass (`evaluateNode`) evaluates every node against the active filters.
     * 3. **Ancestor Preservation:** If any descendant matches the filter, its `isKept` flag bubbles up,
     *    forcing all of its ancestors to also be kept and automatically expanded (`collapsed = false`),
     *    even if the ancestors themselves fail the filter string test.
     * 4. **Descendant Preservation:** If an ancestor explicitly matches the filter, its `ancestorMatched` flag
     *    cascades down, keeping all of its descendants visible and structurally intact.
     * 5. **Mask Application:** A `_keptNodes` Set is generated. The flat `_items` projection (`collectVisibleDescendants`)
     *    is then re-calculated using this Set as a visibility mask.
     *
     * @protected
     * @fires filter
     */
    filter() {
        let me = this;
        const activeFilters = me.filters.filter(f => !f.disabled && f.value !== null);

        // 1. Soft hydration (Turbo Mode)
        if (!me.autoInitRecords && me.model?.hasComplexFields && activeFilters.length > 0) {
            const filterProperties = activeFilters.map(f => f.property),
                  len              = filterProperties.length;

            if (len > 0) {
                for (let item of me.#allRecordsMap.values()) {
                    if (!RecordFactory.isRecord(item)) {
                        for (let i = 0; i < len; i++) {
                            const property = filterProperties[i];
                            if (!Object.hasOwn(item, property)) {
                                item[property] = me.resolveField(item, property)
                            }
                        }
                    }
                }
            }
        }

        const isFilteredFlag = activeFilters.length > 0;
        me[isFiltered] = isFilteredFlag;

        if (!isFilteredFlag) {
            me._keptNodes = null
        } else {
            me._keptNodes = new Set();

            const evaluateNode = (node, ancestorMatched) => {
                let key = me.getKey(node);

                let matchesSelf = true;
                for (let i = 0; i < activeFilters.length; i++) {
                    if (activeFilters[i].isFiltered(node)) {
                        matchesSelf = false;
                        break
                    }
                }

                let isKept                = matchesSelf || ancestorMatched;
                let hasMatchingDescendant = false;

                let children = me.#childrenMap.get(key) || [];
                for (let i = 0; i < children.length; i++) {
                    let childKept = evaluateNode(children[i], isKept);
                    if (childKept) {
                        hasMatchingDescendant = true
                    }
                }

                if (hasMatchingDescendant) {
                    isKept = true;
                    // Auto-expand ancestors to reveal the matched descendant
                    if (!matchesSelf && node.collapsed !== false) {
                        node.collapsed = false;
                        if (node.isRecord) {
                            me.onRecordChange({
                                fields: [{name: 'collapsed', oldValue: true, value: false}],
                                model : me.model,
                                record: node
                            })
                        }
                    }
                }

                if (isKept) {
                    me._keptNodes.add(key)
                }

                return isKept || hasMatchingDescendant
            };

            let roots = me.#childrenMap.get('root') || [];
            for (let i = 0; i < roots.length; i++) {
                evaluateNode(roots[i], false)
            }
        }

        // Re-project the flat array based on the new _keptNodes mask
        me._items = [];
        let roots = me.#childrenMap.get('root') || [];
        for (let i = 0; i < roots.length; i++) {
            me.collectVisibleDescendants(roots[i], me._items)
        }

        me.#rebuildKeysAndCount();

        // Update sibling stats to reflect the filtered counts and indices
        for (let parentId of me.#childrenMap.keys()) {
            me.updateSiblingStats(parentId)
        }

        if (me[updatingIndex] === 0) {
            me.fire('filter', {
                isFiltered: me[isFiltered],
                scope     : me
            })
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
            key = this.getKey(key)
        }

        let me   = this,
            item = super.get(key); // Check the standard visible map first (fastest)

        if (!item && me.#allRecordsMap.has(key)) {
            // Fallback to the full tree map for hidden nodes.
            // Pass it through hydrateRecord to ensure Turbo Mode lazy instantiation works.
            item = me.hydrateRecord(me.#allRecordsMap.get(key))
        }

        return item || null
    }

    /**
     * @summary Calculates the target flat array index for a newly added node.
     *
     * **Architectural Mechanics:**
     * When a node is dynamically added to an *already expanded* parent in an unfiltered, unsorted `TreeStore`,
     * it must be injected into the exact correct position within the `_items` flat projection array.
     * If we simply appended it to the end of `_items`, the Grid's virtual scroller would render the
     * child at the very bottom of the entire tree, visually breaking the hierarchy.
     *
     * This method recursively back-traces through the node's preceding siblings in `#childrenMap`
     * to find the *last visible descendant* of those siblings. The new node's insertion index is
     * immediately after that last descendant. If there are no preceding siblings, it returns
     * the index immediately following the parent node.
     *
     * **Optimization:** The loop breaks instantly upon finding the first valid preceding sibling
     * that has visible descendants, making this an O(subtree_size) operation for only the immediate
     * prior sibling, rather than an O(N) scan of the entire store.
     *
     * @param {Object|Neo.data.Record} node
     * @returns {Number} The exact index in the flat `_items` array where this node belongs.
     * @protected
     */
    getInsertIndexForNode(node) {
        let me       = this,
            parentId = node.parentId || 'root',
            siblings = me.#childrenMap.get(parentId);

        if (!siblings) return -1;

        let nodeIndex = siblings.indexOf(node);

        if (nodeIndex > 0) {
            for (let i = nodeIndex - 1; i >= 0; i--) {
                let prevSibling            = siblings[i],
                    prevVisibleDescendants = [];

                me.collectVisibleDescendants(prevSibling, prevVisibleDescendants);

                if (prevVisibleDescendants.length > 0) {
                    let lastNode  = prevVisibleDescendants[prevVisibleDescendants.length - 1],
                        lastIndex = me.indexOf(lastNode);

                    if (lastIndex > -1) {
                        return lastIndex + 1
                    }
                }
            }
        }

        if (parentId !== 'root') {
            let parentNode  = me.get(parentId),
                parentIndex = me.indexOf(parentNode);

            if (parentIndex > -1) {
                return parentIndex + 1
            }
        }

        if (parentId === 'root' && nodeIndex === 0) {
            return 0
        }

        return me.count
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
                    siblings[idx] = record
                }
            }
        }

        return record
    }

    /**
     * @summary Rebuilds the Projection Layer's internal indexing arrays and map to match the flat `_items` array.
     *
     * This method is an architectural requirement when performing bulk projections (like `expandAll`,
     * `collapseAll`, or `clearFilters`). Rather than letting the inherited `Collection` update its
     * internal structures one-by-one via cost-heavy `splice` operations, the `TreeStore` wipes and
     * completely regenerates the `_items` projection.
     *
     * Consequently, it must also manually synchronize the internal `map`
     * to reflect the newly calculated flat projection, guaranteeing O(1) lookup integrity for the VDOM rendering loop.
     * 
     * **Turbo Mode Consistency:**
     * In **Turbo Mode** (`autoInitRecords: false`), bulk projections deal with raw data objects. 
     * However, UI interactions (like Grid selections) rely on `SelectionModel` resolving DOM
     * `data-record-id` values (which fallback to `internalId`) back to records via `store.get()`.
     * To prevent `store.get()` from failing, this method explicitly invokes `getInternalId` to 
     * force generation of internal IDs on raw objects and perfectly synchronizes the `internalIdMap`.
     *
     * @private
     */
    #rebuildKeysAndCount() {
        let me    = this,
            items = me._items,
            len   = items.length,
            {map} = me,
            internalId, item, key;

        map.clear();

        if (me.trackInternalId) {
            me.internalIdMap?.clear()
        }

        for (let i = 0; i < len; i++) {
            item = items[i];
            key  = me.getKey(item);

            map.set(key, item);

            if (me.trackInternalId) {
                internalId = me.getInternalId(item);
                if (internalId) {
                    me.internalIdMap.set(internalId, item)
                }
            }
        }

        me.count = len
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
            if (key.useTransformValue) hasTransformValue = true
        });

        if (hasSortByMethod) {
            arr.sort((a, b) => {
                i = 0;
                for (; i < countSorters; i++) {
                    sorter    = sorters[i];
                    sortValue = sorter[sorter.sortBy ? 'sortBy' : 'defaultSortBy'](a, b);
                    if (sortValue !== 0) return sortValue;
                }
                return 0
            })
        } else {
            if (hasTransformValue) {
                mappedItems = arr.map((item, index) => {
                    obj = {index, original: item};
                    i   = 0;
                    for (; i < countSorters; i++) {
                        if (sorters[i].useTransformValue) {
                            obj[sortProperties[i]] = sorters[i].transformValue(item[sortProperties[i]])
                        } else {
                            obj[sortProperties[i]] = item[sortProperties[i]]
                        }
                    }
                    return obj;
                })
            } else {
                mappedItems = arr
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
                    if (val1 < val2) return -1 * sortDirections[i]
                }
                return 0
            });

            if (hasTransformValue) {
                // Map the sorted mappedItems back into the original array in place
                let sortedOriginals = mappedItems.map(el => el.original);
                for (i = 0; i < arr.length; i++) {
                    arr[i] = sortedOriginals[i]
                }
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
                toRemoveArray = removeCountOrToRemoveArray
            } else if (Neo.isNumber(index) && Neo.isNumber(removeCountOrToRemoveArray)) {
                // Map index-based removal to actual items from the flat visible view
                toRemoveArray = me._items.slice(index, index + removeCountOrToRemoveArray)
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
                                siblings.splice(idx, 1)
                            }
                        }

                        // Collect this node and ALL deep children to ensure full cleanup
                        me.collectAllDescendants(node, nodesToRemove)
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
                        visibleToRemove.push(node)
                    }
                }
            }
        }

        // --- 2. Process Additions & Moves ---
        let insertIndex = index;

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
                            data.depth = 0
                        } else {
                            let parentNode = me.#allRecordsMap.get(parentId);
                            data.depth = parentNode && parentNode.depth !== undefined ? parentNode.depth + 1 : 1
                        }
                    }

                    if (data.isLeaf === undefined) {
                        data.isLeaf = true
                    }

                    if (data.childCount === undefined) {
                        data.childCount = 0
                    }

                    if (data.collapsed === undefined) {
                        data.collapsed = true
                    }

                    me.#allRecordsMap.set(key, data);

                    if (!me.#childrenMap.has(parentId)) {
                        me.#childrenMap.set(parentId, []);

                        // If a parent is gaining children, it's no longer a leaf
                        if (parentId !== 'root') {
                            let parentNode = me.#allRecordsMap.get(parentId);
                            if (parentNode && parentNode.isLeaf) {
                                parentNode.isLeaf = false
                            }
                        }
                    }

                    if (!me.#childrenMap.get(parentId).includes(data)) {
                        me.#childrenMap.get(parentId).push(data);
                        affectedParents.add(parentId)
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
                                    siblings.splice(idx, 1)
                                }
                            }
                            if (!me.#childrenMap.has('root')) {
                                me.#childrenMap.set('root', [])
                            }
                            if (!me.#childrenMap.get('root').includes(data)) {
                                me.#childrenMap.get('root').push(data);
                                affectedParents.add('root')
                            }
                        }
                    } else {
                        let parentNode = me.#allRecordsMap.get(parentId);
                        if (parentNode.collapsed === false && me.indexOf(parentNode) > -1) {
                            me.collectVisibleDescendants(data, visibleToAdd);

                            if (!Neo.isNumber(insertIndex)) {
                                let calcIndex = me.getInsertIndexForNode(data);
                                if (calcIndex > -1) {
                                    insertIndex = calcIndex
                                }
                            }
                        }
                    }
                }

                // 2b. Calculate the visible delta for all new roots
                for (i = 0, len = newRoots.length; i < len; i++) {
                    me.collectVisibleDescendants(newRoots[i], visibleToAdd);

                    if (!Neo.isNumber(insertIndex)) {
                        let calcIndex = me.getInsertIndexForNode(newRoots[i]);
                        if (calcIndex > -1) {
                            insertIndex = calcIndex
                        }
                    }
                }
            }
        }

        // --- 3. Synchronize ARIA Stats ---
        for (const pid of affectedParents) {
            me.updateSiblingStats(pid)
        }

        // --- 4. Finalize Mutations ---

        if (me[isFiltered]) {
            me.filter();

            // Collection fires mutate if added or removed items > 0
            if (toAddArray || removeCountOrToRemoveArray) {
                me.fire('mutate', {
                    addedItems     : toAddArray || [],
                    preventBubbleUp: me.preventBubbleUp,
                    removedItems   : nodesToRemove
                })
            }
            return {
                addedItems  : toAddArray || [],
                removedItems: nodesToRemove
            }
        }

        // Delegate to super.splice ONLY if the Projection Layer (visible items) actually changed.
        if (visibleToRemove.length > 0 || visibleToAdd.length > 0 || index === 0 && removeCountOrToRemoveArray === me.count) {
            return super.splice(insertIndex, visibleToRemove, visibleToAdd)
        }

        // Fallback Mutation Event: If we added/removed hidden nodes, the visible array didn't change,
        // so we skipped super.splice(). We must manually fire 'mutate' to keep systems like Store.count in sync.
        if (toAddArray || removeCountOrToRemoveArray) {
            me.fire('mutate', {
                addedItems     : toAddArray,
                preventBubbleUp: me.preventBubbleUp,
                removedItems   : nodesToRemove
            })
        }

        return {
            addedItems  : visibleToAdd,
            removedItems: visibleToRemove
        }
    }

    /**
     * Toggles the expansion state of a node.
     * @param {String|Number} nodeId
     */
    toggle(nodeId) {
        let me   = this,
            node = me.get(nodeId);

        if (node) {
            me[node.collapsed ? 'expand' : 'collapse'](nodeId)
        }
    }

    /**
     * @summary Overrides `Collection.updateKey` to ensure TreeStore's structural maps remain perfectly synchronized.
     *
     * In a standard Collection, updating a key just changes the primary lookup maps.
     * However, in a TreeStore, a node's key is critical for both the O(1) `#allRecordsMap` lookup
     * AND structural integrity in `#childrenMap` (where a node's key acts as the `parentId` for its children).
     *
     * This override safely transitions both layers without creating ghost nodes or orphaned branches.
     *
     * @param {Object|Neo.data.Record} item
     * @param {Number|String} newKey
     * @returns {Boolean} true if the key changed, false otherwise.
     */
    updateKey(item, newKey) {
        let me = this,
            oldKey = me.getKey(item);

        if (oldKey === newKey) {
            return false;
        }

        // 1. Update the base Collection layer (Projection maps & allItems)
        super.updateKey(item, newKey);

        // 2. Heal #allRecordsMap
        if (me.#allRecordsMap.has(oldKey)) {
            let storedItem = me.#allRecordsMap.get(oldKey);
            me.#allRecordsMap.delete(oldKey);
            me.#allRecordsMap.set(newKey, storedItem);
        }

        // 3. Heal #childrenMap (Structural Hierarchy)
        if (me.#childrenMap.has(oldKey)) {
            let children = me.#childrenMap.get(oldKey);
            me.#childrenMap.delete(oldKey);
            me.#childrenMap.set(newKey, children);

            // Re-parent all children so their internal parentId properties match the new parent key.
            for (let i = 0, len = children.length; i < len; i++) {
                let child = children[i];
                if (child.isRecord) {
                    child.setSilent({parentId: newKey});
                } else {
                    child.parentId = newKey;
                }
            }
        }

        return true;
    }

    /**
     * Recalculates the `siblingCount`, `siblingIndex`, and `childCount` for all children of a given parent
     * within the Structural Layer. This explicitly trades O(N) mutation cost during data ingestion
     * to guarantee O(1) property reads during high-frequency VDOM rendering cycles.
     * @param {String|Number} parentId The ID of the parent node (or 'root').
     * @protected
     */
    updateSiblingStats(parentId) {
        let me       = this,
            siblings = me.#childrenMap.get(parentId);

        if (siblings) {
            let count = 0;

            // 1. Calculate count without allocating an array
            if (me._keptNodes) {
                for (let i = 0; i < siblings.length; i++) {
                    if (me._keptNodes.has(me.getKey(siblings[i]))) {
                        count++
                    }
                }
            } else {
                count = siblings.length
            }

            // 2. Update Parent's childCount
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
                        })
                    }
                }
            }

            // 3. Update Siblings' ARIA stats
            let index = 1;
            for (let i = 0; i < siblings.length; i++) {
                let sibling = siblings[i];

                if (me._keptNodes && !me._keptNodes.has(me.getKey(sibling))) {
                    continue
                }

                if (sibling.siblingCount !== count || sibling.siblingIndex !== index) {
                    sibling.siblingCount = count;
                    sibling.siblingIndex = index; // 1-based for ARIA

                    if (sibling.isRecord) {
                        me.onRecordChange({
                            fields: [
                                {name: 'siblingCount', oldValue: undefined, value: count},
                                {name: 'siblingIndex', oldValue: undefined, value: index}
                            ],
                            model : me.model,
                            record: sibling
                        })
                    }
                }
                index++;
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
                    })
                }
            }
        }
    }
}

export default Neo.setupClass(TreeStore);
