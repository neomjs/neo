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
    static getStaticConfig() {return {
        /**
         * True automatically applies the core/Observable.mjs mixin
         * @member {Boolean} observable=true
         * @static
         */
        observable: true
    }}

    static getConfig() {return {
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
         * @member {Number} totalCount=0
         */
        totalCount: 0,
        /**
         * Url for Ajax requests
         * @member {String|null} url=null
         */
        url: null
    }}

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
        return super.add(this.beforeSetData(item));
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
                    me.clear();
                } else {
                    me.initialData = [...value];
                }

                me.add(value);
            }
        }
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
            RecordFactory.createRecordClass(value);
        }
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
            };
        }

        return value;
    }

    /**
     * @param value
     * @param oldValue
     * @protected
     * @returns {*}
     */
    beforeSetData(value, oldValue) {
        let me = this;

        if (value) {
            if (!Array.isArray(value)) {
                value = [value];
            }

            // todo: add a config to make the cloning optional
            value = Neo.clone(value, true);

            value.forEach((key, index) => {
                if (!RecordFactory.isRecord(key)) {
                    value[index] = RecordFactory.createRecord(me.model, key);
                }
            });

            // console.log('beforeSetData', value);
        }

        return value;
    }

    /**
     * @param value
     * @param oldValue
     * @protected
     * @returns {*}
     */
    beforeSetInitialData(value, oldValue) {
        if (!value && oldValue) {
            return oldValue;
        }

        return value;
    }

    /**
     * @param {Neo.data.Model|Object} value
     * @param {Neo.data.Model|Object} oldValue
     * @protected
     * @returns {Neo.data.Model}
     */
    beforeSetModel(value, oldValue) {
        if (oldValue) {
            oldValue.destroy();
        }

        return ClassSystemUtil.beforeSetInstance(value, Model);
    }

    /**
     * @param {Object} config
     */
    createRecord(config) {
        RecordFactory.createRecord(config);
    }

    load() {
        let me = this;

        if (me.api) {
            let apiArray = me.api.read.split('.'),
                fn       = apiArray.pop(),
                service  = Neo.ns(apiArray.join('.'));

            if (!service) {
                console.log('Api is not defined', this);
            } else {
                // todo: add params

                service[fn]().then(response => {
                    if (response.success) {
                        me.totalCount = response.totalCount;
                        me.data       = response.data; // fires the load event
                    }
                });
            }
        } else {
            Neo.Xhr.promiseJson({
                url: me.url
            }).catch(err => {
                console.log('Error for Neo.Xhr.request', err, me.id);
            }).then(data => {
                me.data = Array.isArray(data.json) ? data.json : data.json.data;
                // we do not need to fire a load event => onCollectionMutate()
            });
        }
    }

    /**
     * @param {Object} opts
     */
    onCollectionMutate(opts) {
        let me = this;

        if (me.configsApplied) {
            // console.log('onCollectionMutate', opts);
            me.fire('load', me.items);
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
            setTimeout(() => { // todo
                me.load();
            }, 100);
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
        });
    }

    /**
     * @param {Object} opts
     * @param {String} opts.direction
     * @param {String} opts.property
     */
    sort(opts={}) {
        let me = this;

        if (me.remoteSort) {
            // todo
        } else {
            // console.log('sort', opts.property, opts.direction, me.configsApplied);

            if (me.configsApplied) {
                if (opts.direction) {
                    me.sorters = [{
                        direction: opts.direction,
                        property : opts.property
                    }];
                } else {
                    me.startUpdate();
                    me.clear();
                    me.sorters = [];
                    me.add([...me.initialData]);
                    me.endUpdate();
                    me.fire('sort');
                }
            }
        }
    }
}

Neo.applyClassConfig(Store);

export default Store;
