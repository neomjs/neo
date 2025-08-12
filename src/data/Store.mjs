import Base            from '../collection/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import Model           from './Model.mjs';
import Observable      from '../core/Observable.mjs';
import RecordFactory   from './RecordFactory.mjs';

/**
 * @class Neo.data.Store
 * @extends Neo.collection.Base
 * @mixes Neo.core.Observable
 */
class Store extends Base {
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
         * @member {Array|null} initialData_=null
         * @reactive
         */
        initialData_: null,
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
        });
    }

    /**
     * Overrides collection.Base: add() to convert items into records if needed
     * @param {Array|Object} item The item(s) to add
     * @returns {Number} the collection count
     */
    add(item) {
        let items = Array.isArray(item) ? item : [item];
        const threshold = 1000;

        if (items.length > threshold) {
            const me    = this,
                  total = me.count + items.length,
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

            return me.count;
        }

        return super.add(this.createRecord(item));
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
                } else {
                    me.initialData = [...value]
                }

                me.isLoading = false;

                me.add(value);

                me.isLoaded = true
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
    afterSetInitialData(value, oldValue) {
        // console.log('afterSetInitialData', value, oldValue);
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
     * @param value
     * @param oldValue
     * @protected
     * @returns {*}
     */
    beforeSetInitialData(value, oldValue) {
        if (!value && oldValue) {
            return oldValue
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
        let item = super.get(key); // Get item from Collection.Base (could be raw data)

        if (item && !RecordFactory.isRecord(item)) {
            const record = RecordFactory.createRecord(this.model, item);
            // Replace the raw data with the record instance in the collection
            this.map.set(key, record);
            const index = this._items.indexOf(item); // Find the index of the raw item
            if (index !== -1) {
                this._items[index] = record; // Replace it with the record
            }
            return record;
        }
        return item; // Already a record or null
    }

    /**
     * Overrides collection.Base:getAt() to ensure the returned item is a Record instance.
     * @param {Number} index
     * @returns {Object|undefined}
     */
    getAt(index) {
        let item = super.getAt(index); // Get item from Collection.Base (could be raw data)

        if (item && !RecordFactory.isRecord(item)) {
            const record = RecordFactory.createRecord(this.model, item);
            // Replace the raw data with the record instance in the collection
            this._items[index] = record;
            // Also update the map, as the key might be derived from the item
            this.map.set(record[this.keyProperty], record);
            return record;
        }
        return item; // Already a record or undefined
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
                const data = await Neo.Xhr.promiseJson(opts);

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
            if (me.chunkingTotal) {
                me.fire('load', {items: me.items, total: me.chunkingTotal});
            } else {
                me.fire('load', {items: me.items});
            }
        }
    }

    /**
     * todo: add will fire mutate and sort right after another
     */
    onCollectionSort() {
        let me = this;

        if (me.isConstructed) {
            //me.fire('load', me.items)
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
                    me.startUpdate();
                    me.clear()
                }

                me.sorters = [];

                if (!me.remoteSort) {
                    me.add([...me.initialData]);
                    me.endUpdate();
                    me.fire('sort')
                }
            }
        }
    }
}

export default Neo.setupClass(Store);
