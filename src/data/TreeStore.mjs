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

        // 1. Ingest all data into maps
        items.forEach(data => {
            let key      = me.getKey(data),
                parentId = data.parentId || 'root';

            me.#allRecordsMap.set(key, data);

            if (!me.#childrenMap.has(parentId)) {
                me.#childrenMap.set(parentId, []);
            }
            me.#childrenMap.get(parentId).push(data);
        });

        // 2. Identify root nodes
        // A node is a root if its parentId is 'root' or its parent does not exist in the dataset.
        let roots = me.#childrenMap.get('root') || [];

        items.forEach(data => {
            let parentId = data.parentId;
            if (parentId && parentId !== 'root' && !me.#allRecordsMap.has(parentId)) {
                roots.push(data);
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
        });

        // 3. Compute flat visible list
        let visibleItems = [];
        roots.forEach(root => {
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
     * @param {String|Number} nodeId
     */
    expand(nodeId) {
        let me   = this,
            node = me.get(nodeId);

        if (!node || node.collapsed === false || node.isLeaf) {
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

        node.collapsed = false;

        me.onRecordChange({
            fields: [{name: 'collapsed', oldValue: true, value: false}],
            model : me.model,
            record: node
        });

        let children = me.#childrenMap.get(nodeId) || [];
        
        if (children.length > 0) {
            let visibleDescendants = [];
            children.forEach(child => me.collectVisibleDescendants(child, visibleDescendants));
            
            let parentIndex = me.indexOf(node);
            if (parentIndex > -1) {
                me.splice(parentIndex + 1, 0, visibleDescendants);
            }
        } else {
            // Note: Async fetching for missing children will be implemented here later (#9413).
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
            // Fallback to the full tree map for hidden nodes
            item = me.#allRecordsMap.get(key);
            
            // Handle Turbo mode lazy instantiation just like Store.get
            if (item && !RecordFactory.isRecord(item)) {
                item = RecordFactory.createRecord(me.model, item);
                me.#allRecordsMap.set(key, item);
                
                // Update in childrenMap to keep references consistent
                let parentId = item.parentId || 'root',
                    siblings = me.#childrenMap.get(parentId);

                if (siblings) {
                    let idx = siblings.findIndex(s => me.getKey(s) === key);
                    if (idx > -1) {
                        siblings[idx] = item;
                    }
                }
            }
        }
        return item || null;
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
