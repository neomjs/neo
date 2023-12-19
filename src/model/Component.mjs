import Base            from '../core/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import NeoArray        from '../util/Array.mjs';
import Observable      from '../core/Observable.mjs';

const dataVariableRegex = /data((?!(\.[a-z_]\w*\(\)))\.[a-z_]\w*)+/gi,
      variableNameRegex = /^\w*/;

/**
 * An optional component (view) model for adding bindings to configs
 * @class Neo.model.Component
 * @extends Neo.core.Base
 */
class Component extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
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
         * @member {Neo.component.Base|null} component=null
         * @protected
         */
        component: null,
        /**
         * @member {Object|null} data_=null
         */
        data_: null,
        /**
         * @member {Object|null} formulas_=null
         *
         * @example
         *     data: {
         *         a: 1,
         *         b: 2
         *     }
         *     formulas: {
         *         aPlusB: {
         *             bind: {
         *                 foo: 'a',
         *                 bar: 'b'
         *             },
         *             get(data) {
         *                 return data.foo + data.bar
         *             }
         *         }
         *     }
         */
        formulas_: null,
        /**
         * @member {Neo.model.Component|null} parent_=null
         */
        parent_: null,
        /**
         * @member {Object|null} stores_=null
         */
        stores_: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        Neo.currentWorker.isUsingViewModels = true;
        super.construct(config);
        this.bindings = {}
    }

    /**
     * Adds a given key/value combination on this model level.
     * The method is used by setData() & setDataAtSameLevel()
     * in case the  data property does not exist yet.
     * @param {String} key
     * @param {*} value
     * @private
     */
    addDataProperty(key, value) {
        let me = this,
            data, scope;

        Neo.ns(key, true, me.data);

        data = me.getDataScope(key);
        scope = data.scope;

        scope[data.key] = value;

        me.createDataProperties(me.data, 'data')
    }

    /**
     * Triggered after the data config got changed
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetData(value, oldValue) {
        value && this.createDataProperties(value, 'data')
    }

    /**
     * Triggered after the formulas config got changed
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetFormulas(value, oldValue) {
        value && this.resolveFormulas(null)
    }

    /**
     * Triggered when accessing the data config
     * @param {Object} value
     * @protected
     */
    beforeGetData(value) {
        return value || {}
    }

    /**
     * Triggered before the parent config gets changed
     * @param {Neo.model.Component|null} value
     * @param {Neo.model.Component|null} oldValue
     * @protected
     */
    beforeSetParent(value, oldValue) {
        return value ? value : this.getParent()
    }

    /**
     * Triggered before the stores config gets changed.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @returns {Object|null}
     * @protected
     */
    beforeSetStores(value, oldValue) {
        let controller = this.component.getController();

        value && Object.entries(value).forEach(([key, storeValue]) => {
            controller?.parseConfig(storeValue);
            value[key] = ClassSystemUtil.beforeSetInstance(storeValue)
        });

        return value
    }

    /**
     * @param {Function} formatter
     * @param {Object} data=null optionally pass this.getHierarchyData() for performance reasons
     * @returns {String}
     */
    callFormatter(formatter, data=null) {
        if (!data) {
            data = this.getHierarchyData()
        }

        return formatter.call(this, data)
    }

    /**
     * Registers a new binding in case a matching data property does exist.
     * Otherwise it will use the closest model with a match.
     * @param {String} componentId
     * @param {String} key
     * @param {String} value
     * @param {String} formatter
     */
    createBinding(componentId, key, value, formatter) {
        let me      = this,
            data    = me.getDataScope(key),
            scope   = data.scope,
            keyLeaf = data.key,
            bindingScope, parentModel;

        if (scope?.hasOwnProperty(keyLeaf)) {
            bindingScope = Neo.ns(`${key}.${componentId}`, true, me.bindings);
            bindingScope[value] = formatter
        } else {
            parentModel = me.getParent();

            if (parentModel) {
                parentModel.createBinding(componentId, key, value, formatter)
            } else {
                console.error('No model.Component found with the specified data property', componentId, keyLeaf, value)
            }
        }
    }

    /**
     * Registers a new binding in case a matching data property does exist.
     * Otherwise, it will use the closest model with a match.
     * @param {String} componentId
     * @param {String} formatter
     * @param {String} value
     */
    createBindingByFormatter(componentId, formatter, value) {
        let me            = this,
            formatterVars = me.getFormatterVariables(formatter);

        formatterVars.forEach(key => {
            me.createBinding(componentId, key, value, formatter)
        })
    }

    /**
     * @param {Neo.component.Base} component
     */
    createBindings(component) {
        Object.entries(component.bind).forEach(([key, value]) => {
            if (Neo.isObject(value)) {
                value = value.value
            }

            if (!this.isStoreValue(value)) {
                this.createBindingByFormatter(component.id, value, key)
            }
        })
    }

    /**
     * @param {Object} config
     * @param {String} path
     */
    createDataProperties(config, path) {
        let me   = this,
            root = Neo.ns(path, false, me),
            descriptor, keyValue, newPath;

        Object.entries(config).forEach(([key, value]) => {
            if (!key.startsWith('_')) {
                descriptor = Object.getOwnPropertyDescriptor(root, key);
                newPath    = `${path}.${key}`

                if (!(typeof descriptor === 'object' && typeof descriptor.set === 'function')) {
                    keyValue = config[key];
                    me.createDataProperty(key, newPath, root);
                    root[key] = keyValue
                }

                if (Neo.isObject(value)) {
                    me.createDataProperties(config[key], newPath)
                }
            }
        })
    }

    /**
     * @param {String} key
     * @param {String} path
     * @param {Object} root=this.data
     */
    createDataProperty(key, path, root=this.data) {
        let me = this;

        if (path?.startsWith('data.')) {
            path = path.substring(5)
        }

        Object.defineProperty(root, key, {
            get() {
                return root['_' + key]
            },

            set(value) {
                let _key     = `_${key}`,
                    oldValue = root[_key];

                if (!root[_key]) {
                    Object.defineProperty(root, _key, {
                        enumerable: false,
                        value,
                        writable  : true
                    })
                } else {
                    root[_key] = value
                }

                if (!Neo.isEqual(value, oldValue)) {
                    me.onDataPropertyChange(path ? path : key, value, oldValue)
                }
            }
        })
    }

    /**
     * Convenience shortcut
     * @param {String} [ntype]
     * @returns {Neo.controller.Component|null}
     */
    getController(ntype) {
        return this.component.getController(ntype)
    }

    /**
     * Access the closest data property inside the VM parent chain.
     * @param {String} key
     * @param {Neo.model.Component} originModel=this for internal usage only
     * @returns {*} value
     */
    getData(key, originModel=this) {
        let me      = this,
            data    = me.getDataScope(key),
            scope   = data.scope,
            keyLeaf = data.key,
            parentModel;

        if (scope?.hasOwnProperty(keyLeaf)) {
            return scope[keyLeaf]
        }

        parentModel = me.getParent();

        if (!parentModel) {
            console.error(`data property '${key}' does not exist.`, originModel)
        }

        return parentModel.getData(key, originModel)
    }

    /**
     * Helper method to get the scope for a nested data property via Neo.ns() if needed.
     *
     * Example: passing the value 'foo.bar.baz' will return the bar object as the scope
     * and 'baz' as the key.
     * @param key
     * @returns {Object}
     */
    getDataScope(key) {
        let me      = this,
            keyLeaf = key,
            data    = me.data;

        if (key.includes('.')) {
            key     = key.split('.');
            keyLeaf = key.pop();
            data    = Neo.ns(key.join('.'), false, data)
        }

        return {
            key  : keyLeaf,
            scope: data
        }
    }

    /**
     * Extracts data variables from a given formatter string
     * @param {String} value
     */
    getFormatterVariables(value) {
        if (Neo.isFunction(value)) {
            value = value.toString()
        }

        if (Neo.config.environment === 'dist/production') {
            // see: https://github.com/neomjs/neo/issues/2371
            // inside dist/prod the formatter:
            // data => DateUtil.convertToyyyymmdd(data.currentDate)
            // will get minified to:
            // e=>s.Z.convertToyyyymmdd(e.currentDate)
            // the new strategy: find the first variable name => "e"
            // replace it with "data":
            // data=>s.Z.convertToyyyymmdd(data.currentDate)
            // from there we can use the dev mode regex again.

            let dataName       = value.match(variableNameRegex)[0],
                variableRegExp = new RegExp(`(^|[^\\w.])(${dataName})(?!\\w)`, 'g');

            value = value.replace(variableRegExp, '$1data')
        }

        let dataVars = value.match(dataVariableRegex) || [],
            result   = [];

        dataVars.forEach(variable => {
            // remove the "data." at the start
            variable = variable.substr(5);
            NeoArray.add(result, variable)
        });

        result.sort();

        return result
    }

    /**
     * Returns the merged data
     * @param {Object} data=this.getPlainData()
     * @returns {Object} data
     */
    getHierarchyData(data=this.getPlainData()) {
        let me     = this,
            parent = me.getParent();

        if (parent) {
            return {
                ...parent.getHierarchyData(data),
                ...me.getPlainData()
            }
        }

        return me.getPlainData()
    }

    /**
     * Returns a plain version of this.data.
     * This excludes the property getters & setters.
     * @param {Object} data=this.data
     * @returns {Object}
     */
    getPlainData(data=this.data) {
        let plainData = {};

        Object.entries(data).forEach(([key, value]) => {
            if (Neo.typeOf(value) === 'Object') {
                plainData[key] = this.getPlainData(value)
            } else {
                plainData[key] = value
            }
        });

        return plainData
    }

    /**
     * Get the closest model inside the components parent tree
     * @returns {Neo.model.Component|null}
     */
    getParent() {
        let me = this;

        if (me.parent) {
            return me.parent
        }

        return me.component.parent?.getModel() || null
    }

    /**
     * Access the closest store inside the VM parent chain.
     * @param {String} key
     * @param {Neo.model.Component} originModel=this for internal usage only
     * @returns {Neo.data.Store}
     */
    getStore(key, originModel=this) {
        let me     = this,
            stores = me.stores,
            parentModel;

        if (stores?.hasOwnProperty(key)) {
            return stores[key]
        }

        parentModel = me.getParent();

        if (!parentModel) {
            console.error(`store '${key}' not found inside this model or parents.`, originModel)
        }

        return parentModel.getStore(key, originModel)
    }

    /**
     * Internal method to avoid code redundancy.
     * Use setData() or setDataAtSameLevel() instead.
     *
     * Passing an originModel param will try to set each key on the closest property match
     * inside the parent model chain => setData()
     * Not passing it will set all values on the model where the method gets called => setDataAtSameLevel()
     * @param {Object|String} key
     * @param {*} value
     * @param {Neo.model.Component} [originModel]
     * @protected
     */
    internalSetData(key, value, originModel) {
        let me = this,
            data, keyLeaf, parentModel, scope;

        if (Neo.isObject(value) && !value[Symbol.for('isRecord')]) {
            Object.entries(value).forEach(([dataKey, dataValue]) => {
                me.internalSetData(`${key}.${dataKey}`, dataValue, originModel)
            })
        } else if (Neo.isObject(key)) {
            Object.entries(key).forEach(([dataKey, dataValue]) => {
                me.internalSetData(dataKey, dataValue, originModel)
            })
        } else {
            data    = me.getDataScope(key);
            keyLeaf = data.key;
            scope   = data.scope;

            if (scope?.hasOwnProperty(keyLeaf)) {
                scope[keyLeaf] = value
            } else {
                if (originModel) {
                    parentModel = me.getParent();

                    if (parentModel) {
                        parentModel.internalSetData(key, value, originModel)
                    } else {
                        originModel.addDataProperty(key, value)
                    }
                } else {
                    me.addDataProperty(key, value)
                }
            }
        }
    }

    /**
     * Internal convenience method to check if a binding value is supposed to match a store
     * @param {String} value
     * @returns {Boolean}
     */
    isStoreValue(value) {
        return Neo.isString(value) && value.startsWith('stores.')
    }

    /**
     * Override this method to change the order configs are applied to this instance.
     * @param {Object} config
     * @param {Boolean} [preventOriginalConfig] True prevents the instance from getting an originalConfig property
     * @returns {Object} config
     */
    mergeConfig(config, preventOriginalConfig) {
        if (config.data) {
            config.data = Neo.merge(Neo.clone(this.constructor.config.data, true) || {}, config.data)
        }

        return super.mergeConfig(config, preventOriginalConfig)
    }

    /**
     * @param {String} key
     * @param {*} value
     * @param {*} oldValue
     */
    onDataPropertyChange(key, value, oldValue) {
        let me      = this,
            binding = me.bindings && Neo.ns(key, false, me.bindings),
            component, config, hierarchyData, model;

        if (binding) {
            hierarchyData = {};

            Object.entries(binding).forEach(([componentId, configObject]) => {
                component = Neo.getComponent(componentId) || Neo.get(componentId); // timing issue: the cmp might not be registered inside manager.Component yet
                config    = {};
                model     = component.getModel();

                if (!hierarchyData[model.id]) {
                    hierarchyData[model.id] = model.getHierarchyData()
                }

                Object.entries(configObject).forEach(([configField, formatter]) => {
                    // we can not call me.callFormatter(), since a data property inside a parent model
                    // could have changed which is relying on data properties inside a closer model
                    config[configField] = model.callFormatter(formatter, hierarchyData[model.id])
                });

                component?.set(config)
            })
        }

        me.resolveFormulas({key, id: me.id, oldValue, value});

        me.fire('dataPropertyChange', {key, id: me.id, oldValue, value})
    }

    /**
     * This method will assign binding values at the earliest possible point inside the component lifecycle.
     * It can not store bindings though, since child component ids most likely do not exist yet.
     * @param {Neo.component.Base} component=this.component
     */
    parseConfig(component=this.component) {
        let me     = this,
            config = {};

        if (component.bind) {
            me.createBindings(component);

            Object.entries(component.bind).forEach(([key, value]) => {
                if (Neo.isObject(value)) {
                    value.key = me.getFormatterVariables(value.value)[0];
                    value = value.value
                }

                if (me.isStoreValue(value)) {
                    me.resolveStore(component, key, value.substring(7)) // remove the "stores." at the start
                } else {
                    config[key] = me.callFormatter(value)
                }
            });

            component.set(config)
        }
    }

    /**
     * Removes all bindings for a given component id inside this model
     * as well as inside all parent models.
     * @param {String} componentId
     */
    removeBindings(componentId) {
        let me          = this,
            parentModel = me.getParent();

        Object.entries(me.bindings).forEach(([dataProperty, binding]) => {
            delete binding[componentId]
        });

        parentModel?.removeBindings(componentId)
    }

    /**
     * Resolve the formulas initially and update, when data change
     * @param {Object} data data from event or null on initial call
     */
    resolveFormulas(data) {
        let me         = this,
            formulas   = me.formulas,
            initialRun = !data,
            affectFormula, bindObject, fn, key, result, value;

        if (formulas) {
            if (!initialRun && (!data.key || !data.value)) {
                console.warn('[ViewModel:formulas] missing key or value', data.key, data.value)
            }

            for ([key, value] of Object.entries(formulas)) {
                affectFormula = true;

                // Check if the change affects a formula
                if (!initialRun) {
                    affectFormula = Object.values(value.bind).includes(data.key)
                }

                if (affectFormula) {
                    // Create Bind-Object and fill with new values
                    bindObject = Neo.clone(value.bind);
                    fn         = value.get;

                    Object.keys(bindObject).forEach((key, index) => {
                        bindObject[key] = me.getData(bindObject[key])
                    });

                    // Calc the formula
                    result = fn(bindObject);

                    // Assign if no error or null
                    if (isNaN(result)) {
                        me.setData(key, null)
                    } else {
                        me.setData(key, result)
                    }
                }
            }
        }
    }

    /**
     * @param {Neo.component.Base} component
     * @param {String} configName
     * @param {String} storeName
     */
    resolveStore(component, configName, storeName) {
        component[configName] = this.getStore(storeName)
    }

    /**
     * The method will assign all values to the closest model where it finds an existing key.
     * In case no match is found inside the parent chain, a new data property will get generated.
     * @param {Object|String} key
     * @param {*} value
     */
    setData(key, value) {
        this.internalSetData(key, value, this)
    }

    /**
     * Use this method instead of setData() in case you want to enforce
     * setting all keys on this instance instead of looking for matches inside parent models.
     * @param {Object|String} key
     * @param {*} value
     */
    setDataAtSameLevel(key, value) {
        this.internalSetData(key, value)
    }
}

Neo.applyClassConfig(Component);

export default Component;
