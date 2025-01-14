import Base            from '../collection/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import Model           from './Model.mjs';
import Observable      from '../core/Observable.mjs';
import RecordFactory   from './RecordFactory.mjs';

/**
 * @class Neo.data.Store
 * @extends Neo.collection.Base
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
         */
        api_: null,
        /**
         * @member {Boolean} autoLoad=false
         */
        autoLoad: false,
        /**
         * @member {Number} currentPage_=1
         */
        currentPage_: 1,
        /**
         * @member {Array|null} data_=null
         */
        data_: null,
        /**
         * @member {Array|null} initialData_=null
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
         */
        model_: null,
        /**
         * Use a value of 0 to not limit the pageSize
         * @member {Number} pageSize_=0
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
        return super.add(this.beforeSetData(item))
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

                me.add(value)
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
            value.storeId = this.id;
            RecordFactory.createRecordClass(value)
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
            if (!Array.isArray(value)) {
                value = [value]
            }

            let me  = this,
                i   = 0,
                len = value.length,
                item;

            for (; i < len; i++) {
                item = value[i]

                if (!RecordFactory.isRecord(item)) {
                    value[i] = RecordFactory.createRecord(me.model, item)
                }
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
     * @param {Object} config
     */
    createRecord(config) {
        RecordFactory.createRecord(config)
    }

    /**
     * @returns {String}
     */
    getKeyProperty() {
        return this.keyProperty || this.model.keyProperty
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
     * @protected
     */
    load(opts={}) {
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
                console.log('Api is not defined', this)
            } else {
                service[fn](params).then(response => {
                    response = Neo.ns(me.responseRoot, false, response);

                    if (response.success) {
                        me.totalCount = response.totalCount;
                        me.data       = Neo.ns(me.responseRoot, false, response); // fires the load event
                    }
                })
            }
        } else {
            opts.url ??= me.url;

            Neo.Xhr.promiseJson(opts).catch(err => {
                console.log('Error for Neo.Xhr.request', err, me.id)
            }).then(data => {
                me.data = Neo.ns(me.responseRoot, false, data.json) || data.json
                // we do not need to fire a load event => onCollectionMutate()
            })
        }
    }

    /**
     * @param {Object} opts
     */
    onCollectionMutate(opts) {
        let me = this;

        if (me.configsApplied) {
            // console.log('onCollectionMutate', opts);
            me.fire('load', me.items)
        }
    }

    /**
     * todo: add will fire mutate and sort right after another
     */
    onCollectionSort() {
        let me = this;

        if (me.configsApplied) {
            // console.log('onCollectionSort', me.collection.items);
            // me.fire('load', me.items);
        }
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        if (me.data) {
            me.afterSetData(me.data);
        }

        if (me.autoLoad) {
            me.timeout(100).then(() => { // todo
                me.load()
            })
        }
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
