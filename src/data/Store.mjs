import ClassSystemUtil from '../util/ClassSystem.mjs';
import Collection      from '../collection/Base.mjs';
import Model           from './Model.mjs';
import Observable      from '../core/Observable.mjs';
import RecordFactory   from './RecordFactory.mjs';

const initialIndexSymbol = Symbol.for('initialIndex');

/**
 * @class Neo.data.Store
 * @extends Neo.collection.Base
 * @mixes Neo.core.Observable
 *
 * @summary A powerful, observable collection that manages a set of data records.
 *
 * Neo.data.Store is the central data management class in the framework. It handles the lifecycle of
 * data records, including loading, filtering, sorting, and synchronization with backend APIs.
 *
 * ### Record Instantiation Strategies: Eager vs. Lazy ("Turbo Mode")
 *
 * The Store supports two distinct strategies for handling record creation, controlled by the `autoInitRecords` config
 * (which defaults to `true`) and the `init` parameter in methods like `add()` and `insert()`.
 *
 * **1. Eager Instantiation (Default: `autoInitRecords: true`)**
 *    - **Behavior**: Raw data objects are immediately converted into `Neo.data.Model` instances.
 *    - **Use Case**: Standard operations, adding single items, interactive edits.
 *    - **Pros**: Returns usable Record instances immediately. High Developer Experience (DX).
 *    - **Cons**: Can be slow for massive datasets (10k+ records).
 *
 * **2. Lazy Instantiation ("Turbo Mode")**
 *    - **Behavior**: Raw data objects are stored directly. `Neo.data.Model` instances are created
 *      "just-in-time" only when they are accessed via `get()`, `getAt()`, or iteration.
 *    - **Use Case**: Bulk loading large datasets (e.g., grids, charts with thousands of points).
 *    - **Pros**: Massive performance gains for initial data load. Enables internal "chunking" to prevent UI freezes.
 *    - **Cons**: `add()` returns a count instead of records. Records are not available until accessed.
 *    - **How to enable**:
 *      - **Global**: Set `autoInitRecords: false` on the Store config.
 *      - **Per-call**: Pass `false` as the second argument to `add()` or `insert()`.
 *      ```javascript
 *      // Global setting
 *      Neo.create(Store, {
 *          autoInitRecords: false,
 *          data: hugeArrayOfData
 *      });
 *
 *      // Per-call override
 *      store.add(hugeArrayOfData, false);
 *      ```
 */
class Store extends Collection {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.data.Store'
         * @protected
         */
        className: 'Neo.data.Store',
        /**
         * @member {String} ntype='store'
         * @protected
         */
        ntype: 'store',
        /**
         * Instead of setting an url, you can define the RPC BE API methods.
         * In case the 4 methods are using the same service and this service is using the CRUD based fn-names,
         * you can switch to a string based shortcut.
         * The following 2 examples are equivalent.
         * @example
         * api: {
         *    create : 'MyApp.backend.UserService.create',
         *    destroy: 'MyApp.backend.UserService.destroy',
         *    read   : 'MyApp.backend.UserService.read',
         *    update : 'MyApp.backend.UserService.update'
         * }
         * @example
         * api: 'MyApp.backend.UserService'
         * @member {Object|String|null} api_=null
         * @reactive
         */
        api_: null,
        /**
         * True to automatically create record instances when adding items.
         * Set to false to enable "Turbo Mode" (Lazy Instantiation) globally for this store.
         * @member {Boolean} autoInitRecords=true
         */
        autoInitRecords: true,
        /**
         * @member {Boolean} autoLoad=false
         */
        autoLoad: false,
        /**
         * @member {Number} currentPage_=1
         * @reactive
         */
        currentPage_: 1,
        /**
         * @member {Array|null} data_=null
         * @reactive
         */
        data_: null,
        /**
         * The initial chunk size for adding large datasets. Set to 0 to disable chunking.
         * @member {Number} initialChunkSize=0
         */
        initialChunkSize: 0,
        /**
         * @member {Boolean} isGrouped=false
         */
        isGrouped: false,
        /**
         * @member {Boolean} isLoaded=false
         */
        isLoaded: false,
        /**
         * @member {Boolean} isLoading=false
         */
        isLoading: false,
        /**
         * @member {Neo.data.Model} model_=null
         * @reactive
         */
        model_: null,
        /**
         * Use a value of 0 to not limit the pageSize
         * @member {Number} pageSize_=0
         * @reactive
         */
        pageSize_: 0,
        /**
         * True to let the backend handle the filtering.
         * Useful for buffered stores
         * @member {Boolean} remoteFilter=false
         */
        remoteFilter: false,
        /**
         * True to let the backend handle the sorting.
         * Useful for buffered stores
         * @member {Boolean} remoteSort=false
         */
        remoteSort: false,
        /**
         * Add a path to the root of your data.
         * If the responseRoot is 'data' this is optional.
         * @member {String} responseRoot='data'
         */
        responseRoot: 'data',
        /**
         * @member {Number} totalCount=0
         */
        totalCount: 0,
        /**
         * Url for Ajax requests
         * @member {String|null} url=null
         */
        url: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        // todo
        me.on({
            mutate: me.onCollectionMutate,
            sort  : me.onCollectionSort,
            scope : me
        })
    }

    /**
     * Overrides collection.Base: add() to convert items into records if needed.
     *
     * **1. Eager Mode (`init=true` - Default):**
     * Immediately converts raw data into `Neo.data.Model` instances.
     * Returns an `Array` of the created records.
     *
     * **2. Lazy Mode (`init=false`):**
     * Adds raw data directly for maximum performance. Instantiates records only on access.
     *
     * - **Chunking Active**: If `initialChunkSize > 0` and `items.length > threshold`:
     *   Adds items in chunks to prevent blocking the App Worker (Main Actor).
     *   Returns the new collection `count` (Number).
     *
     * - **No Chunking**: If `initialChunkSize === 0` or `items.length <= threshold`:
     *   Adds raw items directly.
     *   Returns an `Array` of the added raw data objects.
     *
     * @example
     * // 1. Default: Get records immediately
     * const [newRecord] = store.add({name: 'New Item'});
     *
     * @example
     * // 2. Turbo Mode (No Chunking): Get raw objects
     * const [rawObject] = store.add({name: 'Item'}, false);
     *
     * @example
     * // 3. Turbo Mode (Chunking): Get new count
     * store.initialChunkSize = 1000;
     * const newCount = store.add(hugeDataArray, false);
     *
     * @param {Array|Object} item The item(s) to add
     * @param {Boolean} [init=this.autoInitRecords] True to return the created records, false for "Turbo Mode"
     * @returns {Number|Object[]|Neo.data.Model[]} The collection count, raw items, or created records
     */
    add(item, init=this.autoInitRecords) {
        let me        = this,
            items     = Array.isArray(item) ? item : [item],
            threshold = me.initialChunkSize;

        if (init) {
            super.add(items);

            me.isLoaded = true;

            return items.map(i => me.get(i[me.getKeyProperty()]))
        }

        if (threshold > 0 && items.length > threshold) {
            const total = me.count + items.length,
                  chunk = items.splice(0, threshold);

            me.chunkingTotal = total;

            // 1. Add the first chunk. This fires 'mutate' -> 'load' (via onCollectionMutate)
            //    and triggers the initial grid render. The 'load' event will contain the final total count.
            super.add(chunk); // Pass raw chunk directly

            // 2. Suspend events to prevent the next 'add' from firing 'load'.
            me.suspendEvents = true;

            // 3. Add the rest of the items silently.
            super.add(items); // Pass raw items directly

            // 4. Resume events.
            me.suspendEvents = false;

            // 5. Manually fire a final 'load' event to update the grid's scrollbar and notify other listeners.
            me.fire('load', {items: me.items, postChunkLoad: true, total: me.chunkingTotal});

            delete me.chunkingTotal;

            return me.count
        }

        const returnValue = super.add(items);

        // If we use add() initially instead of setting `data`, we need to set the loaded flag here.
        me.isLoaded = true;

        return returnValue // Pass raw item directly
    }

    /**
     * Triggered after the currentPage config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetCurrentPage(value, oldValue) {
        oldValue && this.load()
    }

    /**
     * @param value
     * @param oldValue
     * @protected
     */
    afterSetData(value, oldValue) {
        let me = this;

        if (me.configsApplied) {
            if (value) {
                if (oldValue) {
                    me.clear()
                }

                me.isLoading = false;

                me.add(value, me.autoInitRecords)
            }
        }
    }

    /**
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetFilters(value, oldValue) {
        super.afterSetFilters(value, oldValue);

        let me = this;

        me._currentPage = 1; // silent update

        oldValue && me.remoteFilter && me.load()
    }

    /**
     * @param value
     * @param oldValue
     * @protected
     */
    afterSetModel(value, oldValue) {
        if (value) {
            value.storeId = this.id
        }
    }

    /**
     * Triggered after the pageSize config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetPageSize(value, oldValue) {
        if (oldValue) {
            this._currentPage = 1; // silent update
            this.load()
        }
    }

    /**
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetSorters(value, oldValue) {
        super.afterSetSorters(value, oldValue);

        let me = this;

        me._currentPage = 1; // silent update

        oldValue && me.remoteSort && me.load()
    }

    /**
     * @param {Object|String|null} value
     * @param {Object|String|null} oldValue
     * @protected
     * @returns {Object|null}
     */
    beforeSetApi(value, oldValue) {
        if (Neo.typeOf(value) === 'String') {
            value = {
                create : value + '.create',
                destroy: value + '.destroy',
                read   : value + '.read',
                update : value + '.update'
            }
        }

        return value
    }

    /**
     * @param value
     * @param oldValue
     * @protected
     * @returns {*}
     */
    beforeSetData(value, oldValue) {
        if (value) {
            this.isLoading = true;

            // value = this.createRecord(value)
        }

        return value
    }



    /**
     * @param {Neo.data.Model|Object} value
     * @param {Neo.data.Model|Object} oldValue
     * @protected
     * @returns {Neo.data.Model}
     */
    beforeSetModel(value, oldValue) {
        oldValue?.destroy();

        return ClassSystemUtil.beforeSetInstance(value, Model)
    }

    /**
     * Converts an object or array of objects into records
     * @param {Object|Object[]} config
     * @returns {Object|Object[]} Array in case an array was passed
     */
    createRecord(config) {
        let isArray = true;

        if (config) {
            if (!Array.isArray(config)) {
                isArray = false;
                config  = [config]
            }

            let me  = this,
                i   = 0,
                len = config.length,
                item;

            for (; i < len; i++) {
                item = config[i]

                if (!RecordFactory.isRecord(item)) {
                    config[i] = RecordFactory.createRecord(me.model, item)
                }
            }
        }

        return isArray ? config : config[0]
    }

    /**
     * Overrides collection.Base:find() to ensure the returned item(s) are Record instances.
     * @param {Object|String} property
     * @param {String|Number} [value] Only required in case the first param is a string
     * @param {Boolean} returnFirstMatch=false
     * @returns {Object|Object[]|null}
     */
    find(property, value, returnFirstMatch=false) {
        const result = super.find(property, value, returnFirstMatch);

        if (returnFirstMatch) {
            return result ? this.get(result[this.keyProperty]) : null;
        } else {
            return result.map(item => this.get(item[this.keyProperty]));
        }
    }

    /**
     * Overrides collection.Base:findBy() to ensure the returned item(s) are Record instances.
     * @param {function} fn The function to run for each item inside the start-end range. Return true for a match.
     * @param {Object} scope=this The scope in which the passed function gets executed
     * @param {Number} start=0 The start index
     * @param {Number} end=this.count The end index (up to, last value excluded)
     * @returns {Array}
     */
    findBy(fn, scope=this, start=0, end=this.count) {
        const result = super.findBy(fn, scope, start, end);
        return result.map(item => this.get(item[this.keyProperty]));
    }

    /**
     * Overrides collection.Base:forEach() to ensure the iterated item is a Record instance.
     * @param {Function} fn The function to execute for each record.
     * @param {Object} [scope] Value to use as `this` when executing `fn`.
     */
    forEach(fn, scope) {
        const me = this;
        for (let i = 0; i < me.count; i++) {
            fn.call(scope || me, me.getAt(i), i, me.items);
        }
    }

    /**
     * Overrides collection.Base:get() to ensure the returned item is a Record instance.
     * @param {Number|String} key
     * @returns {Object|null}
     */
    get(key) {
        let me   = this,
            item = super.get(key); // Get item from Collection.Base (could be raw data)

        if (item && !RecordFactory.isRecord(item)) {
            const record = RecordFactory.createRecord(me.model, item);
            const index  = me.indexOf(item);

            // Replace the raw data with the record instance in the current (filtered) collection
            me.map.set(key, record);
            if (index !== -1) {
                me._items[index] = record
            }

            // If this collection is filtered, we must also update the master 'allItems' collection
            if (me.allItems) {
                const masterIndex = me.allItems.indexOf(item);
                if (masterIndex !== -1) {
                    me.allItems.map.set(key, record);
                    me.allItems._items[masterIndex] = record
                }
            }
            return record
        }
        return item // Already a record or null
    }

    /**
     * Overrides collection.Base:getAt() to ensure the returned item is a Record instance.
     * @param {Number} index
     * @returns {Object|undefined}
     */
    getAt(index) {
        let me   = this,
            item = super.getAt(index); // Get item from Collection.Base (could be raw data)

        if (item && !RecordFactory.isRecord(item)) {
            const record = RecordFactory.createRecord(me.model, item);

            // Replace the raw data with the record instance in the current (filtered) collection
            me.map.set(record[me.keyProperty], record);
            me._items[index] = record;

            // If this collection is filtered, we must also update the master 'allItems' collection
            if (me.allItems) {
                const masterIndex = me.allItems.indexOf(item);
                if (masterIndex !== -1) {
                    me.allItems.map.set(record[me.keyProperty], record);
                    me.allItems._items[masterIndex] = record
                }
            }
            return record
        }
        return item // Already a record or undefined
    }

    /**
     * @returns {String}
     */
    getKeyProperty() {
        return this.keyProperty || this.model.keyProperty
    }

    /**
     * Convenience shortcut to check for int based keyProperties
     * @returns {String|null} lowercase value of the model field type
     */
    getKeyType() {
        let me       = this,
            {model}  = me,
            keyField = model?.getField(me.getKeyProperty());

        return keyField?.type?.toLowerCase() || null
    }

    /**
     * Converts a data object into a Record instance or returns it if it is already one.
     * This method is called by add() and insert() when init=true (default).
     * @param {Object} data The data object or Record instance
     * @returns {Object} The Record instance
     */
    initRecord(data) {
        if (RecordFactory.isRecord(data)) {
            return data
        }

        return this.get(data[this.getKeyProperty()])
    }

    /**
     * Overrides collection.Base: insert() to convert items into records if needed.
     *
     * **Eager Mode (`init=true` - Default):**
     * Immediately converts raw data into `Neo.data.Model` instances.
     * Returns an `Array` of the created records.
     *
     * **Lazy Mode (`init=false`):**
     * Inserts raw data directly. Instantiates records only on access.
     * Returns an `Array` of the inserted raw data objects.
     *
     * @param {Number} index The index to insert at
     * @param {Array|Object} item The item(s) to add
     * @param {Boolean} [init=this.autoInitRecords] True to return the created records
     * @returns {Object[]|Neo.data.Model[]} The inserted raw items or created records
     */
    insert(index, item, init=this.autoInitRecords) {
        let me    = this,
            items = super.insert(index, item);

        if (init) {
            return items.map(i => me.get(i[me.getKeyProperty()]))
        }

        return items
    }

    /**
     * @param {Object} opts={}
     * @param {Object} opts.data
     * @param {Object} opts.headers
     * @param {String} opts.method DELETE, GET, POST, PUT
     * @param {Object} opts.params
     * @param {String} opts.responseType
     * @param {Object} opts.scope
     * @param {String} opts.url
     * @returns {Promise<Object|Object[]>}
     * @protected
     */
    async load(opts={}) {
        let me     = this,
            params = {page: me.currentPage, pageSize: me.pageSize, ...opts.params};

        if (me.remoteFilter) {
            params.filters = me.exportFilters()
        }

        if (me.remoteSort) {
            params.sorters = me.exportSorters()
        }

        if (me.api) {
            let apiArray = me.api.read.split('.'),
                fn       = apiArray.pop(),
                service  = Neo.ns(apiArray.join('.'));

            if (!service) {
                console.error('Api is not defined', this)
            } else {
                const response = await service[fn](params);

                if (response.success) {
                    me.totalCount = response.totalCount;
                    me.data       = Neo.ns(me.responseRoot, false, response); // fires the load event
                    me.isLoaded   = true;

                    return me.data
                }

                return null
            }
        } else {
            opts.url ??= me.url;

            try {
                let data;

                // Fallback for non-browser based envs like nodejs
                if (globalThis.process?.release) {
                    const { readFile } = await import(/* webpackIgnore: true */ 'fs/promises');
                    const content = await readFile(opts.url, 'utf-8');
                    data = {json: JSON.parse(content)};
                } else {
                    data = await Neo.Xhr.promiseJson(opts);
                }

                if (data) {
                    me.data = Neo.ns(me.responseRoot, false, data.json) || data.json // fires the load event
                }

                me.isLoaded = true;

                return data?.json || null
            } catch(err) {
                console.error('Error for Neo.Xhr.request', {id: me.id, error: err, url: opts.url});
                return null
            }
        }
    }

    /**
     * @param {Object} opts
     */
    onCollectionMutate(opts) {
        let me = this;

        if (me.isConstructed && !me.isLoading) {
            me.fire('load', {items: me.items, total: me.chunkingTotal});
        }
    }

    /**
     *
     */
    onCollectionSort() {
        let me = this;

        if (me.isConstructed) {
            me.fire('load', {items: me.items})
        }
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        if (me.data) {
            me.afterSetData(me.data)
        }

        // Being constructed does not mean that related afterSetStore() methods got executed
        // => break the sync flow to ensure potential listeners got applied
        Promise.resolve().then(() => {
            if (me.isLoaded) {
                me.fire('load', {items: me.items})
            } else if (me.autoLoad) {
                me.load()
            }
        })
    }

    /**
     * @param {Object} opts
     * @protected
     */
    onFilterChange(opts) {
        let me = this;

        if (me.remoteFilter) {
            me._currentPage = 1; // silent update
            me.load()
        } else {
            super.onFilterChange(opts)
        }
    }

    /**
     * Gets triggered after changing the value of a record field.
     * E.g. myRecord.foo = 'bar';
     * @param {Object} data
     * @param {Object[]} data.fields Each field object contains the keys: name, oldValue, value
     * @param {Neo.data.Model} data.model The model instance of the changed record
     * @param {Object} data.record
     */
    onRecordChange(data) {
        this.fire('recordChange', {
            ...data,
            index: this.indexOf(data.record)
        })
    }

    /**
     * @param {Object} opts={}
     * @param {String} opts.direction
     * @param {String} opts.property
     */
    sort(opts={}) {
        let me = this;

        me._currentPage = 1; // silent update

        if (me.configsApplied) {
            if (opts.direction) {
                me.sorters = [{
                    direction: opts.direction,
                    property : opts.property
                }]
            } else {
                if (!me.remoteSort) {
                    me.sorters = [{
                        direction: 'ASC',
                        property : initialIndexSymbol
                    }]
                }
            }
        }
    }
}

export default Neo.setupClass(Store);
