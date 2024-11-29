import Base            from '../core/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import NeoArray        from '../util/Array.mjs';
import Observable      from '../core/Observable.mjs';

const dataVariableRegex   = /data((?!(\.[a-z_]\w*\(\)))\.[a-z_]\w*)+/gi,
      twoWayBindingSymbol = Symbol.for('twoWayBinding'),
      variableNameRegex   = /^\w*/;

/**
 * An optional component state provider for adding bindings to configs
 * @class Neo.state.Provider
 * @extends Neo.core.Base
 */
class Provider extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.state.Provider'
         * @protected
         */
        className: 'Neo.state.Provider',
        /**
         * @member {String} ntype='state-provider'
         * @protected
         */
        ntype: 'state-provider',
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
         * @member {Neo.state.Provider|null} parent_=null
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
        Neo.currentWorker.isUsingStateProviders = true;
        super.construct(config);
        this.bindings = {}
    }

    /**
     * Adds a given key/value combination on this stateProvider level.
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
     * @param {Neo.state.Provider|null} value
     * @param {Neo.state.Provider|null} oldValue
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
        if (value) {
            let me         = this,
                controller = me.getController();

            Object.entries(value).forEach(([key, storeValue]) => {
                controller?.parseConfig(storeValue);

                // support mapping string based listeners into the stateProvider instance
                Object.entries(storeValue.listeners || {}).forEach(([listenerKey,listener]) => {
                    if (Neo.isString(listener) && Neo.isFunction(me[listener])) {
                        storeValue.listeners[listenerKey] = me[listener].bind(me)
                    }
                })

                value[key] = ClassSystemUtil.beforeSetInstance(storeValue)
            })
        }

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
     * Otherwise, it will use the closest stateProvider with a match.
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
            bindingScope, parentStateProvider;

        if (scope?.hasOwnProperty(keyLeaf)) {
            bindingScope = Neo.ns(`${key}.${componentId}`, true, me.bindings);
            bindingScope[value] = formatter
        } else {
            parentStateProvider = me.getParent();

            if (parentStateProvider) {
                parentStateProvider.createBinding(componentId, key, value, formatter)
            } else {
                console.error('No state.Provider found with the specified data property', componentId, keyLeaf, value)
            }
        }
    }

    /**
     * Registers a new binding in case a matching data property does exist.
     * Otherwise, it will use the closest stateProvider with a match.
     * @param {String} componentId
     * @param {String} formatter
     * @param {String} value
     * @returns {String[]}
     */
    createBindingByFormatter(componentId, formatter, value) {
        let me            = this,
            formatterVars = me.getFormatterVariables(formatter);

        formatterVars.forEach(key => {
            me.createBinding(componentId, key, value, formatter)
        });

        return formatterVars
    }

    /**
     * @param {Neo.component.Base} component
     */
    createBindings(component) {
        Object.entries(component.bind).forEach(([key, value]) => {
            let twoWayBinding = false,
                formatterVars;

            if (Neo.isObject(value)) {
                twoWayBinding = true;
                value         = value.value
            }

            if (!this.isStoreValue(value)) {
                formatterVars = this.createBindingByFormatter(component.id, value, key);

                if (twoWayBinding) {
                    component.bind[key].key = formatterVars[0];
                    component[twoWayBindingSymbol] = true;
                }
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
                let value = root['_' + key];

                if (Neo.typeOf(value) === 'Date') {
                    value = new Date(value.valueOf())
                }

                return value
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
     * Access the closest data property inside the parent chain.
     * @param {String} key
     * @param {Neo.state.Provider} originStateProvider=this for internal usage only
     * @returns {*} value
     */
    getData(key, originStateProvider=this) {
        let me      = this,
            data    = me.getDataScope(key),
            {scope} = data,
            keyLeaf = data.key,
            parentStateProvider;

        if (scope?.hasOwnProperty(keyLeaf)) {
            return scope[keyLeaf]
        }

        parentStateProvider = me.getParent();

        if (!parentStateProvider) {
            console.error(`data property '${key}' does not exist.`, originStateProvider)
        }

        return parentStateProvider.getData(key, originStateProvider)
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
            {data}  = me;

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
     * Get the closest stateProvider inside the components parent tree
     * @returns {Neo.state.Provider|null}
     */
    getParent() {
        let {parent} = this;

        if (parent) {
            return parent
        }

        return this.component.parent?.getStateProvider() || null
    }

    /**
     * Access the closest store inside the VM parent chain.
     * @param {String} key
     * @param {Neo.state.Provider} originStateProvider=this for internal usage only
     * @returns {Neo.data.Store}
     */
    getStore(key, originStateProvider=this) {
        let me       = this,
            {stores} = me,
            parentStateProvider;

        if (stores?.hasOwnProperty(key)) {
            return stores[key]
        }

        parentStateProvider = me.getParent();

        if (!parentStateProvider) {
            console.error(`store '${key}' not found inside this stateProvider or parents.`, originStateProvider)
        }

        return parentStateProvider.getStore(key, originStateProvider)
    }

    /**
     * Internal method to avoid code redundancy.
     * Use setData() or setDataAtSameLevel() instead.
     *
     * Passing an originStateProvider param will try to set each key on the closest property match
     * inside the parent stateProvider chain => setData()
     * Not passing it will set all values on the stateProvider where the method gets called => setDataAtSameLevel()
     * @param {Object|String} key
     * @param {*} value
     * @param {Neo.state.Provider} [originStateProvider]
     * @protected
     */
    internalSetData(key, value, originStateProvider) {
        let me = this,
            data, keyLeaf, parentStateProvider, scope;

        if (Neo.isObject(value) && !value.isRecord) {
            Object.entries(value).forEach(([dataKey, dataValue]) => {
                me.internalSetData(`${key}.${dataKey}`, dataValue, originStateProvider)
            })
        } else if (Neo.isObject(key)) {
            Object.entries(key).forEach(([dataKey, dataValue]) => {
                me.internalSetData(dataKey, dataValue, originStateProvider)
            })
        } else {
            data    = me.getDataScope(key);
            keyLeaf = data.key;
            scope   = data.scope;

            if (scope?.hasOwnProperty(keyLeaf)) {
                scope[keyLeaf] = value
            } else {
                if (originStateProvider) {
                    parentStateProvider = me.getParent();

                    if (parentStateProvider) {
                        parentStateProvider.internalSetData(key, value, originStateProvider)
                    } else {
                        originStateProvider.addDataProperty(key, value)
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
            component, config, hierarchyData, stateProvider;

        if (binding) {
            hierarchyData = {};

            Object.entries(binding).forEach(([componentId, configObject]) => {
                component     = Neo.getComponent(componentId) || Neo.get(componentId); // timing issue: the cmp might not be registered inside manager.Component yet
                config        = {};
                stateProvider = component.getStateProvider() || me;

                if (!hierarchyData[stateProvider.id]) {
                    hierarchyData[stateProvider.id] = stateProvider.getHierarchyData()
                }

                Object.entries(configObject).forEach(([configField, formatter]) => {
                    // we can not call me.callFormatter(), since a data property inside a parent stateProvider
                    // could have changed which is relying on data properties inside a closer stateProvider
                    config[configField] = stateProvider.callFormatter(formatter, hierarchyData[stateProvider.id])
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
     * Removes all bindings for a given component id inside this stateProvider as well as inside all parent stateProviders.
     * @param {String} componentId
     */
    removeBindings(componentId) {
        let me = this;

        Object.entries(me.bindings).forEach(([dataProperty, binding]) => {
            delete binding[componentId]
        });

        me.getParent()?.removeBindings(componentId)
    }

    /**
     * Resolve the formulas initially and update, when data change
     * @param {Object} data data from event or null on initial call
     */
    resolveFormulas(data) {
        let me         = this,
            {formulas} = me,
            initialRun = !data,
            affectFormula, bindObject, fn, key, result, value;

        if (formulas) {
            if (!initialRun && (!data.key || !data.value)) {
                console.warn('[StateProvider:formulas] missing key or value', data.key, data.value)
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
        let store = this.getStore(storeName);

        if (component[configName] !== store) {
            component[configName] = store
        }
    }

    /**
     * The method will assign all values to the closest stateProvider where it finds an existing key.
     * In case no match is found inside the parent chain, a new data property will get generated.
     * @param {Object|String} key
     * @param {*} value
     */
    setData(key, value) {
        this.internalSetData(key, value, this)
    }

    /**
     * Use this method instead of setData() in case you want to enforce
     * setting all keys on this instance instead of looking for matches inside parent stateProviders.
     * @param {Object|String} key
     * @param {*} value
     */
    setDataAtSameLevel(key, value) {
        this.internalSetData(key, value)
    }
}

export default Neo.setupClass(Provider);
