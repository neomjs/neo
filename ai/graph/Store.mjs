import DataStore from '../../src/data/Store.mjs';

/**
 * A highly specialized Store natively optimized for the Native Edge Graph Database engine.
 * Extends the framework data collection layer by introducing generic reactive associative map indices,
 * reducing massive O(E) semantic topology loop traversals (GraphRAG mappings) to instantaneous O(1) retrievals.
 * 
 * @class Neo.ai.graph.Store
 * @extends Neo.data.Store
 */
class Store extends DataStore {
    static config = {
        /**
         * @member {String} className='Neo.ai.graph.Store'
         * @protected
         */
        className: 'Neo.ai.graph.Store',
        /**
         * Array of secondary index objects. Each object must have a `property` string.
         * Example: `[{property: 'source'}, {property: 'target'}]`
         * @member {Object[]|null} indices_=null
         * @reactive
         */
        indices_: null
    }

    /**
     * Map of secondary index maps for fast lookups.
     * me.indexMaps.get('source') -> Map<sourceValue, Set<Object>>
     */
    indexMaps = null

    /**
     * Triggered after the indices config gets changed.
     * Re-initializes empty maps for each index and optionally seeds them.
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetIndices(value, oldValue) {
        let me = this;
        
        if (value && value.length > 0) {
            me.indexMaps = new Map();

            value.forEach(indexConfig => {
                me.indexMaps.set(indexConfig.property, new Map());
            });

            // Seed items if the collection already contains data
            if (me._items && me._items.length > 0) {
                me.updateIndexMaps(me._items, null);
            }
        } else {
            me.indexMaps = null;
        }
    }

    /**
     * Hook bypassing natural splice flow during raw structural deletion.
     * Flush all Native Graph Topologies.
     * @param {Boolean} [reset=true]
     */
    clearSilent(reset=true) {
        let me = this;
        super.clearSilent(reset);

        if (me.indexMaps) {
            let value = me.indices;
            me.indexMaps.clear();
            value.forEach(indexConfig => {
                me.indexMaps.set(indexConfig.property, new Map());
            });
        }
    }

    /**
     * Extracts exact matching items synchronously from the GraphStore topography in O(1) mapping operations.
     * Assumes `property` exists dynamically within `indices_`.
     * @param {String} property 
     * @param {*} value 
     * @returns {Object[]}
     */
    getByIndex(property, value) {
        let me = this;
        
        if (me.indexMaps) {
            let propertyMap = me.indexMaps.get(property);
            if (propertyMap) {
                let matchSet = propertyMap.get(value);
                if (matchSet) {
                    return Array.from(matchSet);
                }
            }
        }
        
        return [];
    }

    /**
     * Central topological funnel parsing addition mapped data vs removal tracked data for O(1) bindings.
     * @param {Number|null} index
     * @param {Number|Object[]} [removeCountOrToRemoveArray]
     * @param {Object|Object[]} [toAddArray]
     * @returns {Object} An object containing the addedItems & removedItems arrays
     */
    splice(index, removeCountOrToRemoveArray, toAddArray) {
        let me       = this,
            mutation = super.splice(index, removeCountOrToRemoveArray, toAddArray);

        if (me.indexMaps) {
            me.updateIndexMaps(mutation.addedItems, mutation.removedItems);
        }

        return mutation;
    }

    /**
     * Resolves all property map relationships via Neo Native Object or Document.get accessors.
     * @param {Object[]} [addedItems]
     * @param {Object[]} [removedItems]
     * @protected
     */
    updateIndexMaps(addedItems, removedItems) {
        let me       = this,
            indices  = me.indices,
            i        = 0,
            len, item, isRecord, val, propertyMap, itemSet;

        if (removedItems && (len = removedItems.length) > 0) {
            indices.forEach(indexConfig => {
                let prop    = indexConfig.property;
                propertyMap = me.indexMaps.get(prop);

                for (i = 0; i < len; i++) {
                    item     = removedItems[i];
                    isRecord = Neo.isRecord(item);
                    val      = isRecord ? item.get(prop) : Neo.ns(prop, false, item) ?? item[prop];
                    
                    if (val != null) {
                        itemSet = propertyMap.get(val);
                        if (itemSet) {
                            itemSet.delete(item);
                            if (itemSet.size === 0) {
                                propertyMap.delete(val);
                            }
                        }
                    }
                }
            });
        }

        if (addedItems && (len = addedItems.length) > 0) {
            indices.forEach(indexConfig => {
                let prop    = indexConfig.property;
                propertyMap = me.indexMaps.get(prop);

                for (i = 0; i < len; i++) {
                    item     = addedItems[i];
                    isRecord = Neo.isRecord(item);
                    val      = isRecord ? item.get(prop) : Neo.ns(prop, false, item) ?? item[prop];
                    
                    if (val != null) {
                        itemSet = propertyMap.get(val);
                        if (!itemSet) {
                            itemSet = new Set();
                            propertyMap.set(val, itemSet);
                        }
                        itemSet.add(item);
                    }
                }
            });
        }
    }
}

export default Neo.setupClass(Store);
