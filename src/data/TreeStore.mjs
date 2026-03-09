import RecordFactory from './RecordFactory.mjs';
import Store         from './Store.mjs';
import TreeModel     from './TreeModel.mjs';

/**
 * @class Neo.data.TreeStore
 * @extends Neo.data.Store
 *
 * @summary A specialized store to manage hierarchical data for Tree Grids.
 *
 * TreeStore provides a flat `items` array to the UI (for virtual scrolling) while
 * maintaining the full hierarchical data structure internally using `#childrenMap`.
 * Expanding or collapsing nodes mathematically injects or removes rows from the
 * flattened array, ensuring O(1) rendering performance regardless of tree depth.
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
     * Overrides Store:add() to intercept data ingestion.
     * It populates the internal hierarchical maps and calculates the initial
     * flattened array of visible nodes, passing ONLY the visible nodes to `super.add()`.
     *
     * @param {Array|Object} item
     * @param {Boolean} [init=this.autoInitRecords]
     * @returns {Number|Object[]|Neo.data.Model[]}
     */
    add(item, init=this.autoInitRecords) {
        let me    = this,
            items = Array.isArray(item) ? item : [item];

        if (items.length === 0) {
            return items;
        }

        let newRoots = [];

        // 1. Ingest all data into maps
        items.forEach(data => {
            let key      = me.getKey(data),
                parentId = data.parentId || 'root';

            me.#allRecordsMap.set(key, data);

            if (!me.#childrenMap.has(parentId)) {
                me.#childrenMap.set(parentId, []);
            }
            
            // Avoid duplicates if data is re-added
            if (!me.#childrenMap.get(parentId).includes(data)) {
                me.#childrenMap.get(parentId).push(data);
            }

            // 2. Identify new root nodes from the current batch.
            // A node is a root if its parentId is 'root' or its parent does not exist in the dataset.
            if (parentId === 'root' || !me.#allRecordsMap.has(parentId)) {
                newRoots.push(data);
                
                if (parentId !== 'root') {
                    // Re-parent to 'root' internally to heal the disconnected branch
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
                    }
                }
            }
        });

        // 3. Compute flat visible list ONLY for the new roots.
        // Child nodes of an already expanded parent will be spliced in by expand(),
        // so we don't want them appended to the end of the collection here.
        let visibleItems = [];
        newRoots.forEach(root => {
            me.collectVisibleDescendants(root, visibleItems);
        });

        // 4. Delegate to super.add but ONLY for the visible items
        // The hidden items remain in #allRecordsMap as raw data (Turbo Mode) until accessed via get()
        return super.add(visibleItems, init);
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

            children.forEach(child => {
                this.collectVisibleDescendants(child, resultArr);
            });
        }
    }

    /**
     * Collapses a node, removing its visible descendants from the flat grid view.
     * @param {String|Number} nodeId
     */
    collapse(nodeId) {
        let me   = this,
            node = me.get(nodeId);

        if (!node || node.collapsed || node.isLeaf) {
            return;
        }

        node.collapsed = true;
        
        me.onRecordChange({
            fields: [{name: 'collapsed', oldValue: false, value: true}],
            model : me.model,
            record: node
        });

        // Find how many visible descendants to remove
        let visibleDescendants = [],
            children           = me.#childrenMap.get(nodeId) || [];

        children.forEach(child => me.collectVisibleDescendants(child, visibleDescendants));

        if (visibleDescendants.length > 0) {
            let parentIndex = me.indexOf(node);
            if (parentIndex > -1) {
                // Pass the array of items to remove so `Collection.splice` removes them by key
                me.splice(null, visibleDescendants);
            }
        }
    }

    /**
     * Expands a node, injecting its children into the flat grid view.
     * Supports asynchronous loading if children are missing and an API/URL is configured.
     * @param {String|Number} nodeId
     */
    async expand(nodeId) {
        let me   = this,
            node = me.get(nodeId);

        if (!node || node.collapsed === false || node.isLeaf || node.isLoading) {
            return;
        }

        if (me.singleExpand && node.parentId) {
            let siblings = me.#childrenMap.get(node.parentId) || [];
            siblings.forEach(sibling => {
                if (sibling !== node && sibling.collapsed === false) {
                    me.collapse(me.getKey(sibling));
                }
            });
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

        let children = me.#childrenMap.get(nodeId) || [];
        
        // Case A: Children are already in memory
        if (children.length > 0) {
            node.collapsed = false;

            me.onRecordChange({
                fields: [{name: 'collapsed', oldValue: true, value: false}],
                model : me.model,
                record: node
            });

            let visibleDescendants = [];
            children.forEach(child => me.collectVisibleDescendants(child, visibleDescendants));
            
            let parentIndex = me.indexOf(node);
            if (parentIndex > -1) {
                me.splice(parentIndex + 1, 0, visibleDescendants);
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
                    params: { parentId: nodeId } 
                });

                children = me.#childrenMap.get(nodeId) || [];

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
                    children.forEach(child => me.collectVisibleDescendants(child, visibleDescendants));
                    
                    let parentIndex = me.indexOf(node);
                    if (parentIndex > -1) {
                        me.splice(parentIndex + 1, 0, visibleDescendants);
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
     * @param {Number|String} key
     * @returns {Object|null}
     */
    get(key) {
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
}

export default Neo.setupClass(TreeStore);
