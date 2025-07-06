import Base                          from '../core/Base.mjs';
import ClassSystemUtil               from '../util/ClassSystem.mjs';
import Config                        from '../core/Config.mjs';
import Effect                        from '../core/Effect.mjs';
import Observable                    from '../core/Observable.mjs';
import {createHierarchicalDataProxy} from './createHierarchicalDataProxy.mjs';

const twoWayBindingSymbol = Symbol.for('twoWayBinding');

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
     * @member {Map} #bindings=new Map()
     * @private
     */
    #bindings = new Map()
    /**
     * @member {Object} #dataConfigs={}
     * @private
     */
    #dataConfigs = {}

    /**
     * @param {Object} config
     */
    construct(config) {
        Neo.currentWorker.isUsingStateProviders = true;
        super.construct(config)
    }

    /**
     * Triggered after the data config got changed.
     * This method initializes the internal #dataConfigs map, converting each
     * plain data property into a reactive Neo.core.Config instance.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetData(value, oldValue) {
        value && this.processDataObject(value)
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
            let me = this;

            Object.entries(value).forEach(([key, storeValue]) => {
                // support mapping string based listeners into the stateProvider instance
                Object.entries(storeValue.listeners || {}).forEach(([listenerKey, listener]) => {
                    me.bindCallback(listener, listenerKey, me, storeValue.listeners)
                })

                value[key] = ClassSystemUtil.beforeSetInstance(storeValue)
            })
        }

        return value
    }

    /**
     * @param {Function} formatter
     * @returns {String}
     */
    callFormatter(formatter) {
        return formatter.call(this, this.getHierarchyData())
    }

    /**
     * Creates a new binding for a component's config to a data property.
     * This now uses the Effect-based reactivity system.
     * @param {String} componentId
     * @param {String} configKey The component config to bind (e.g., 'text').
     * @param {String|Function} formatter The function that computes the value.
     */
    createBinding(componentId, configKey, formatter) {
        let me = this;

        if (!me.#bindings.has(componentId)) {
            me.#bindings.set(componentId, [])
        }

        const effect = new Effect({
            fn: () => {
                const component = Neo.get(componentId);

                if (component && !component.isDestroyed) {
                    const
                        hierarchicalData = me.getHierarchyData(),
                        newValue         = formatter.call(me, hierarchicalData);

                    component.set(configKey, newValue)
                }
            }
        });

        me.#bindings.get(componentId).push(effect)
    }

    /**
     * @param {Neo.component.Base} component
     */
    createBindings(component) {
        Object.entries(component.bind).forEach(([key, value]) => {
            let twoWayBinding = false;

            if (Neo.isObject(value)) {
                twoWayBinding = true;
                value         = value.value
            }

            if (!this.isStoreValue(value)) {
                this.createBinding(component.id, key, value);

                if (twoWayBinding) {
                    // This part needs re-evaluation. How to get the dependency?
                    // For now, two-way binding might be broken by this refactoring.
                    // We can add a mechanism to the effect to report its dependencies.
                    component[twoWayBindingSymbol] = true
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
     * @returns {*} value
     */
    getData(key) {
        const ownerDetails = this.getOwnerOfDataProperty(key);

        if (ownerDetails) {
            return ownerDetails.owner.getDataConfig(ownerDetails.propertyName).value;
        }

        console.error(`data property '${key}' does not exist.`, this)
    }

    /**
     * Retrieves the underlying core.Config instance for a given data property path.
     * @param {String} path The full path of the data property (e.g., 'user.firstname').
     * @returns {Neo.core.Config|null}
     */
    getDataConfig(path) {
        return this.#dataConfigs[path] || null
    }

    /**
     * Returns the merged, hierarchical data object as a reactive Proxy.
     * @returns {Proxy}
     */
    getHierarchyData() {
        return createHierarchicalDataProxy(this)
    }

    /**
     * Finds the state.Provider instance that owns a specific data property.
     * @param {String} path The full path of the data property.
     * @returns {{owner: Neo.state.Provider, propertyName: String}|null}
     */
    getOwnerOfDataProperty(path) {
        if (this.#dataConfigs[path]) {
            return {owner: this, propertyName: path}
        }

        // Check for parent ownership
        const parent = this.getParent();
        if (parent) {
            return parent.getOwnerOfDataProperty(path)
        }

        return null
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
     * Checks if any data property in the hierarchy starts with the given path.
     * This is used by the HierarchicalDataProxy to determine if it should return a nested proxy.
     * @param {String} path The path to check (e.g., 'user').
     * @returns {Boolean}
     */
    hasNestedDataStartingWith(path) {
        const pathWithDot = `${path}.`;

        if (Object.keys(this.#dataConfigs).some(key => key.startsWith(pathWithDot))) {
            return true
        }

        return this.getParent()?.hasNestedDataStartingWith(path) || false
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
        if (Neo.isObject(key)) {
            Object.entries(key).forEach(([dataKey, dataValue]) => {
                this.internalSetData(dataKey, dataValue, originStateProvider);
            });

            return
        }

        const
            targetProvider = originStateProvider ? (this.getOwnerOfDataProperty(key)?.owner || originStateProvider) : this,
            config         = targetProvider.getDataConfig(key);

        if (config) {
            config.value = value
        } else {
            // Create the config if it doesn't exist on the target provider
            targetProvider.processDataObject({[key]: value})
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
     * Recursively processes a data object, creating or updating Neo.core.Config instances
     * for each property and storing them in the #dataConfigs map.
     * @param {Object} obj The data object to process.
     * @param {String} [path=''] The current path prefix for nested objects.
     * @protected
     */
    processDataObject(obj, path = '') {
        Object.entries(obj).forEach(([key, value]) => {
            const fullPath = path ? `${path}.${key}` : key;

            if (this.#dataConfigs[fullPath]) {
                this.#dataConfigs[fullPath].value = value;
            } else {
                this.#dataConfigs[fullPath] = new Config({value});
            }

            if (Neo.isObject(value) && !Neo.isObject(value.ntype)) { // a component config
                this.processDataObject(value, fullPath);
            }
        });
    }

    /**
     * Removes all bindings for a given component id inside this stateProvider as well as inside all parent stateProviders.
     * @param {String} componentId
     */
    removeBindings(componentId) {
        if (this.#bindings.has(componentId)) {
            this.#bindings.get(componentId).forEach(effect => effect.destroy());
            this.#bindings.delete(componentId);
        }

        this.getParent()?.removeBindings(componentId)
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
