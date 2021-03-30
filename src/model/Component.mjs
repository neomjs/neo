import Base       from '../core/Base.mjs';
import Observable from '../core/Observable.mjs';

/**
 * An optional component model for adding bindings to configs
 * @class Neo.model.Component
 * @extends Neo.core.Base
 */
class Component extends Base {
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
         * @member {String} className='Neo.model.Component'
         * @protected
         */
        className: 'Neo.model.Component',
        /**
         * @member {String} ntype='component-model'
         * @protected
         */
        ntype: 'component-model',
        /**
         * @member {Object|null} bindings_=null
         * @protected
         */
        bindings_: null,
        /**
         * @member {Object|null} data_=null
         */
        data_: null,
        /**
         * @member {Neo.component.Base|null} owner=null
         * @protected
         */
        owner: null,
        /**
         * @member {String[]} parseConfigArrays=['headers','items']
         */
        parseConfigArrays: ['headers', 'items']
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.bindings = {};

        if (me.owner.isConstructed) {
            me.resolveBindings();
        } else {
            me.owner.on('constructed', () => {
                me.resolveBindings();
            });
        }
    }

    /**
     * Triggered after the data config got changed
     * @param {Object} value={}
     * @param {Object} oldValue={}
     * @protected
     */
    afterSetData(value={}, oldValue={}) {
        this.createDataProperties(value, 'data');
        console.log('afterSetData', this.data);
    }

    /**
     * Triggered when accessing the data config
     * @param {Object} value
     * @protected
     */
    beforeGetData(value) {
        return value || {};
    }

    /**
     * Registers a new binding in case a matching data property does exist.
     * Otherwise it will use the closest model with a match.
     * @param {String} componentId
     * @param {String} key
     * @param {*} value
     */
    createBinding(componentId, key, value) {
        let me       = this,
            bindings = me.bindings,
            parentModel;

        if (me.data[value]) {
            bindings[value] = bindings[value] || {};

            bindings[value][componentId] = bindings[value][componentId] || [];

            bindings[value][componentId].push(key);
        } else {
            parentModel = me.getParent();

            if (parentModel) {
                parentModel.createBinding(componentId, key, value);
            } else {
                console.error('No model.Component found with the specified data property', value);
            }
        }
    }

    /**
     *
     * @param {Neo.component.Base} component
     */
    createBindings(component) {
        Object.entries(component.bind).forEach(([key, value]) => {
            this.createBinding(component.id, key, value);
        });
    }

    /**
     *
     * @param {Object} config
     * @param {string} path
     */
    createDataProperties(config, path) {
        let me   = this,
            root = Neo.ns(path, false, me),
            descriptor, keyValue;

        Object.entries(config).forEach(([key, value]) => {
            descriptor = Object.getOwnPropertyDescriptor(root, key);

            if (!(typeof descriptor === 'object' && typeof descriptor.set === 'function')) {
                keyValue = config[key];
                this.createDataProperty(key, root);
                root[key] = keyValue;
            }

            if (Neo.isObject(value)) {
                this.createDataProperties(config[key], `${path}.${key}`);
            }
        });
    }

    /**
     *
     * @param {String} key
     * @param {Object} [root=this.data]
     */
    createDataProperty(key, root=this.data) {
        let me = this;

        Object.defineProperty(root, key, {
            get() {
                return root['_' + key];
            },

            set(value) {
                let oldValue = root['_' + key];

                root['_' + key] = value;

                if (value !== oldValue) {
                    me.onDataPropertyChange(key, value, oldValue);
                }
            }
        });
    }

    /**
     *
     * @param {String} key
     * @returns {*} value
     */
    getData(key) {
        let me = this,
            parentModel;

        if (me.data.hasOwnProperty(key)) {
            return me.data[key];
        }

        parentModel = me.getParent();

        if (!parentModel) {
            console.error(`data property "${key}" does not exist.`, me.id);
        }

        return parentModel.getData(key);
    }

    /**
     * Get the closest model inside the components parent tree
     * @returns {Neo.model.Component|null}
     */
    getParent() {
        let parentId        = this.owner.parentId,
            parentComponent = parentId && Neo.getComponent(parentId);

        return parentComponent && parentComponent.getModel();
    }

    /**
     *
     * @param {String} key
     * @param {*} value
     * @param {*} oldValue
     */
    onDataPropertyChange(key, value, oldValue) {
        let binding = this.bindings && this.bindings[key],
            component, config;

        if (binding) {
            Object.entries(binding).forEach(([componentId, configArray]) => {
                component = Neo.getComponent(componentId);
                config    = {};

                configArray.forEach(key => {
                    config[key] = value;
                });

                if (component) {
                    component.set(config);
                }
            });
        }
    }

    /**
     * This method will assign binding values at the earliest possible point inside the component lifecycle.
     * It can not store bindings though, since child component ids most likely do not exist yet.
     * @param {Object} [component=this.owner]
     */
    parseConfig(component=this.owner) {
        let me = this;

        if (component.bind) {
            Object.entries(component.bind).forEach(([key, value]) => {
                component[key] = me.getData(value);
            });
        }

        me.parseConfigArrays.forEach(value => {
            if (Array.isArray(component[value])) {
                component[value].forEach(item => {
                    if (!item.model) {
                        me.parseConfig(item);
                    }
                });
            }
        });
    }

    /**
     *
     * @param {Neo.component.Base} [component=this.owner]
     */
    resolveBindings(component=this.owner) {
        let me    = this,
            items = component.items || [];

        if (component.bind) {
            me.createBindings(component);

            Object.entries(component.bind).forEach(([key, value]) => {
                component[key] = me.getData(value);
            });
        }

        items.forEach(item => {
            if (!item.model) {
                me.resolveBindings(item);
            }
        });
    }

    /**
     * The method will assign all values to the closest model where it finds an existing key.
     * In case no match is found inside the parent chain, a new data property will get generated.
     * @param {Object|String} key
     * @param {*} value
     * @param {Neo.model.Component} [originModel=this] for internal usage only
     */
    setData(key, value, originModel=this) {
        let me   = this,
            data = me.data,
            parentModel;

        if (Neo.isObject(key)) {
            Object.entries(key).forEach(([dataKey, dataValue]) => {
                me.setData(dataKey, dataValue);
            });
        } else {
            if (data.hasOwnProperty(key)) {
                data[key] = value;
            } else {
                parentModel = me.getParent();

                if (parentModel) {
                    parentModel.setData(key, value, originModel);
                } else {
                    originModel.createDataProperty(key);
                    originModel.data[key] = value;
                }
            }
        }
    }

    /**
     * Use this method instead of setData() in case you want to enforce
     * to set all keys on this instance instead of looking for matches inside parent models.
     * @param {Object|String} key
     * @param {*} value
     */
    setDataAtSameLevel(key, value) {
        let me   = this,
            data = me.data;

        if (Neo.isObject(key)) {
            Object.entries(key).forEach(([dataKey, dataValue]) => {
                me.setDataAtSameLevel(dataKey, dataValue);
            });
        } else {
            if (!data.hasOwnProperty(key)) {
                me.createDataProperty(key);
            }

            data[key] = value;
        }
    }
}

Neo.applyClassConfig(Component);

export {Component as default};