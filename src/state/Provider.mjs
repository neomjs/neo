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
     * @member {Map} #bindingEffects=new Map()
     * @private
     */
    #bindingEffects = new Map()
    /**
     * @member {Object} #dataConfigs={}
     * @private
     */
    #dataConfigs = {}
    /**
     * @member {Map} #formulaEffects=new Map()
     * @private
     */
    #formulaEffects = new Map()

    /**
     * @param {Object} config
     */
    construct(config) {
        Neo.isUsingStateProviders = true;
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
        const me = this;

        // Destroy old formula effects
        me.#formulaEffects.forEach(effect => effect.destroy());
        me.#formulaEffects.clear();

        if (value) {
            Object.entries(value).forEach(([formulaKey, formulaDef]) => {
                const effect = new Effect({
                    fn: () => {
                        const
                            hierarchicalData = me.getHierarchyData(),
                            bindObject       = Neo.clone(formulaDef.bind),
                            fn               = formulaDef.get;

                        // Populate bindObject with actual data values
                        Object.keys(bindObject).forEach(key => {
                            bindObject[key] = hierarchicalData[bindObject[key]];
                        });

                        const result = fn(bindObject);

                        // Assign the result back to the state provider's data
                        if (isNaN(result)) {
                            me.setData(formulaKey, null);
                        } else {
                            me.setData(formulaKey, result);
                        }
                    }
                });
                me.#formulaEffects.set(formulaKey, effect);
            });
        }
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
        return value
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
     * Creates a new binding for a component's config to a data property.
     * This now uses the Effect-based reactivity system.
     * @param {String} componentId
     * @param {String} configKey The component config to bind (e.g., 'text').
     * @param {String|Function} formatter The function that computes the value.
     */
    createBinding(componentId, configKey, key, isTwoWay) {
        const
            me     = this,
            effect = new Effect({
            fn: () => {
                const component = Neo.get(componentId);

                if (component && !component.isDestroyed) {
                    const
                        hierarchicalData = me.getHierarchyData(),
                        newValue         = isTwoWay ? hierarchicalData[key] : key.call(me, hierarchicalData);

                    component._skipTwoWayPush = configKey;
                    component[configKey] = newValue;
                    delete component._skipTwoWayPush
                }
            }
        });

        me.#bindingEffects.set(componentId, effect);

        // The effect observes the component's destruction to clean itself up.
        me.observeConfig(componentId, 'isDestroying', (value) => {
            if (value) {
                effect.destroy();
                me.#bindingEffects.delete(componentId)
            }
        });

        // The effect is returned to be managed by the component.
        return effect
    }

    /**
     * @param {Neo.component.Base} component
     */
    createBindings(component) {
        let hasTwoWayBinding = false;

        Object.entries(component.bind || {}).forEach(([configKey, value]) => {
            let key = value;

            if (Neo.isObject(value)) {
                if (value.twoWay) {
                    hasTwoWayBinding = true;
                }
                key = value.key;
            }

            if (!this.isStoreValue(key)) {
                this.createBinding(component.id, configKey, key, value.twoWay)
            }
        });

        if (hasTwoWayBinding) {
            component[twoWayBindingSymbol] = true
        }
    }

    /**
     * Destroys the state provider and cleans up all associated effects.
     */
    destroy() {
        const me = this;

        me.#formulaEffects.forEach(effect => effect.destroy());
        me.#formulaEffects.clear();

        me.#bindingEffects.forEach(effect => effect.destroy());
        me.#bindingEffects.clear();

        super.destroy()
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
        let me = this;

        if (me.#dataConfigs[path]) {
            return {owner: me, propertyName: path}
        }

        // Check for parent ownership
        const parent = me.getParent();
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
        let me = this;

        // Access the internal value of the parent_ config directly.
        // This avoids recursive calls to the getter.
        if (me._parent) {
            return me._parent;
        }

        // If no explicit parent is set, try to find it dynamically via the component.
        // Ensure this.component exists before trying to access its parent.
        if (me.component) {
            return me.component.parent?.getStateProvider() || null;
        }

        // No explicit parent and no component to derive it from.
        return null
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
                this.internalSetData(dataKey, dataValue, originStateProvider)
            });
            return
        }

        const
            ownerDetails = this.getOwnerOfDataProperty(key),
            targetProvider = ownerDetails ? ownerDetails.owner : (originStateProvider || this);

        const pathParts = key.split('.');
        let currentPath = '';
        let currentConfig = null;
        let currentProvider = targetProvider;

        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            currentPath = currentPath ? `${currentPath}.${part}` : part;
            currentConfig = currentProvider.getDataConfig(currentPath);

            if (i === pathParts.length - 1) { // Last part of the path
                if (currentConfig) {
                    currentConfig.set(value);
                } else {
                    currentConfig = new Config(value);
                    currentProvider.#dataConfigs[currentPath] = currentConfig;
                    // Trigger all binding effects to re-evaluate their dependencies
                    currentProvider.#bindingEffects.forEach(effect => effect.run());
                }
            } else { // Intermediate part of the path
                if (!currentConfig) {
                    currentConfig = new Config({}); // Create an empty object config
                    currentProvider.#dataConfigs[currentPath] = currentConfig;
                } else if (!Neo.isObject(currentConfig.get())) {
                    // If an intermediate path exists but is not an object, overwrite it
                    currentConfig.set({});
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
     * Recursively processes a data object, creating or updating Neo.core.Config instances
     * for each property and storing them in the #dataConfigs map.
     * @param {Object} obj The data object to process.
     * @param {String} [path=''] The current path prefix for nested objects.
     * @protected
     */
    processDataObject(obj, path = '') {
        let me = this;

        Object.entries(obj).forEach(([key, value]) => {
            const fullPath = path ? `${path}.${key}` : key;

            if (Neo.isObject(value) && !Neo.isObject(value.ntype)) { // a component config
                me.processDataObject(value, fullPath);
            } else {
                if (me.#dataConfigs[fullPath]) {
                    me.#dataConfigs[fullPath].set(value);
                } else {
                    me.#dataConfigs[fullPath] = new Config(value)
                }
            }
        })
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
