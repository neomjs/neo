import Base                         from '../collection/Base.mjs';
import {default as ClassSystemUtil} from '../util/ClassSystem.mjs';
import Model                        from './Model.mjs';
import Observable                   from '../core/Observable.mjs';
import RecordFactory                from './RecordFactory.mjs';

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
         * @private
         */
        className: 'Neo.data.Store',
        /**
         * @member {String} ntype='store'
         * @private
         */
        ntype: 'store',
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
         * Url for Ajax requests
         * @member {String|null} url=null
         */
        url: null
    }}

    constructor(config) {
        super(config);

        let me = this;

        // todo
        me.on({
            mutate: me.onCollectionMutate,
            sort  : me.onCollectionSort,
            scope : me
        });
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
            }, 100)
        }
    }

    /**
     *
     * @param value
     * @param oldValue
     * @private
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
     *
     * @param value
     * @param oldValue
     * @private
     */
    afterSetInitialData(value, oldValue) {
        // console.log('afterSetInitialData', value, oldValue);
    }

    /**
     *
     * @param value
     * @param oldValue
     * @private
     */
    afterSetModel(value, oldValue) {
        if (value) {
            RecordFactory.createRecordClass(value);
        }
    }

    /**
     *
     * @param value
     * @param oldValue
     * @private
     * @returns {*}
     */
    beforeSetData(value, oldValue) {
        let me = this;

        if (value) {
            if (!Array.isArray(value)) {
                value = [value];
            }

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
     *
     * @param value
     * @param oldValue
     * @private
     * @returns {*}
     */
    beforeSetInitialData(value, oldValue) {
        if (!value && oldValue) {
            return oldValue;
        }

        return value;
    }

    /**
     *
     * @param {Neo.data.Model} value
     * @param {Neo.data.Model} oldValue
     * @private
     * @returns {Neo.data.Model}
     */
    beforeSetModel(value, oldValue) {
        if (oldValue) {
            oldValue.destroy();
        }

        return ClassSystemUtil.beforeSetInstance(value);
    }

    /**
     *
     * @param {Object} config
     */
    createRecord(config) {
        RecordFactory.createRecord(config);
    }

    load() {
        let me = this;

        Neo.Xhr.promiseJson({
            url: me.url
        }).then(data => {
            me.data = data.json.data;
            me.fire('load', me.items);
        }).catch(err => {
            console.log('Error for Neo.Xhr.request', err, me.id);
        });
    }

    /**
     *
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
     * Gets triggered after changing the value of a record field.
     * E.g. myRecord.foo = 'bar';
     * @param {Object} opts
     * @param {String} opts.field The name of the field which got changed
     * @param {Neo.data.Model} opts.model The model instance of the changed record
     * @param {*} opts.oldValue
     * @param {Object} opts.record
     * @param {*} opts.value
     */
    onRecordChange(opts) {
        this.fire('recordChange', opts);
    }

    /**
     *
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

export {Store as default};