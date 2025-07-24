import Base                          from '../core/Base.mjs';
import ClassSystemUtil               from '../util/ClassSystem.mjs';
import Config                        from '../core/Config.mjs';
import Effect                        from '../core/Effect.mjs';
import EffectManager                 from '../core/EffectManager.mjs';
import Observable                    from '../core/Observable.mjs';
import {createHierarchicalDataProxy} from './createHierarchicalDataProxy.mjs';
import {isDescriptor}                from '../core/ConfigSymbols.mjs';

const twoWayBindingSymbol = Symbol.for('twoWayBinding');

/**
 * An optional component state provider for adding bindings to configs
 * @class Neo.state.Provider
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
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
         /**
         * The core data object managed by this StateProvider.
         * This object holds the reactive state that can be accessed and modified
         * by components and formulas within the provider's hierarchy.
         * Changes to properties within this data object will trigger reactivity.
         * When new data is assigned, it will be deeply merged with existing data.
         * @member {Object|null} data_=null
         * @example
         *     data: {
         *         user: {
         *             firstName: 'John',
         *             lastName : 'Doe'
         *         },
         *         settings: {
         *             theme: 'dark'
         *         }
         *     }
         * @reactive
         */
        data_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : {}
        },
        /**
         * Defines computed properties based on other data properties within the StateProvider hierarchy.
         * Each formula is a function that receives a `data` argument, which is a hierarchical proxy
         * allowing access to data from the current provider and all its parent providers.
         * Changes to dependencies (accessed via `data.propertyName`) will automatically re-run the formula.
         * @member {Object|null} formulas_=null
         * @example
         *     data: {
         *         a    : 1,
         *         b    : 2,
         *         total: 50
         *     }
         *     formulas: {
         *         aPlusB : (data) => data.a + data.b,
         *         aTimesB: (data) => data.a * data.b,
         *         // Accessing parent data (assuming a parent provider has a 'taxRate' property)
         *         totalWithTax: (data) => data.total * (1 + data.taxRate)
         *     }
         * @reactive
         */
        formulas_: null,
        /**
         * @member {Neo.state.Provider|null} parent_=null
         * @reactive
         */
        parent_: null,
        /**
         /**
         * A collection of Neo.data.Store instances managed by this StateProvider.
         * Stores are defined as config objects with a `module` property pointing
         * to the store class, which will then be instantiated by the framework.
         * @member {Object|null} stores_=null
         * @example
         *     stores: {
         *         myUsers: {
         *             module: Neo.data.Store,
         *             model : 'MyApp.model.User',
         *             data  : [{id: 1, name: 'John'}, {id: 2, name: 'Doe'}]
         *         },
         *         myCustomStore1: MyCustomStoreClass,
         *         myCustomStore2: {
         *             module  : MyCustomStoreClass,
         *             autoLoad: true
         *         }
         *     }
         * @reactive
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
     * Triggered after the formulas config got changed.
     * This method sets up reactive effects for each defined formula.
     * Each formula function receives the hierarchical data proxy, allowing implicit dependency tracking.
     * @param {Object|null} value The new formulas configuration.
     * @param {Object|null} oldValue The old formulas configuration.
     * @protected
     */
    afterSetFormulas(value, oldValue) {
        const me = this;

        // Destroy old formula effects to prevent memory leaks and stale calculations.
        me.#formulaEffects.forEach(effect => effect.destroy());
        me.#formulaEffects.clear();

        if (value) {
            Object.entries(value).forEach(([formulaKey, formulaFn]) => {
                // Create a new lazy Effect. It will not run until explicitly told to.
                const effect = new Effect({
                    fn: () => {
                        const
                            hierarchicalData = me.getHierarchyData(),
                            result           = formulaFn(hierarchicalData);

                        me.setData(formulaKey, result);
                    },
                    lazy: true
                });

                me.#formulaEffects.set(formulaKey, effect)
            })
        }
    }

    /**
     * Triggered when accessing the data config
     * @param {Object} value
     * @protected
     */
    beforeGetData(value) {
        return this.getHierarchyData()
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
    createBinding(componentId, configKey, formatter) {
        const
            me     = this,
            effect = new Effect(() => {
                const component = Neo.get(componentId);

                if (component && !component.isDestroyed) {
                    const
                        hierarchicalData = me.getHierarchyData(),
                        newValue         = Neo.isFunction(formatter) ? formatter.call(me, hierarchicalData) : hierarchicalData[formatter];

                    component._skipTwoWayPush = configKey;
                    component[configKey] = newValue;
                    delete component._skipTwoWayPush
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
     * Processes a component's `bind` configuration to create reactive bindings.
     * It differentiates between store bindings and data bindings, and sets up two-way binding if specified.
     * @param {Neo.component.Base} component The component instance whose bindings are to be created.
     */
    createBindings(component) {
        let me               = this,
            hasTwoWayBinding = false;

        Object.entries(component.bind || {}).forEach(([configKey, value]) => {
            let key = value;

            // If the binding value is an object, it might contain `twoWay` or a specific `key`.
            if (Neo.isObject(value)) {
                if (value.twoWay) {
                    hasTwoWayBinding = true
                }
                key = value.key
            }

            // Determine if it's a store binding or a data binding.
            if (me.isStoreValue(key)) {
                // For store bindings, resolve the store and assign it to the component config.
                me.resolveStore(component, configKey, key.substring(7)) // remove the "stores." prefix
            } else {
                // For data bindings, create an Effect to keep the component config in sync with the data.
                me.createBinding(component.id, configKey, key, value.twoWay)
            }
        });

        // Mark the component if it has any two-way bindings, for internal tracking.
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
            return ownerDetails.owner.getDataConfig(ownerDetails.propertyName).get()
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
            return me._parent
        }

        // If no explicit parent is set, try to find it dynamically via the component.
        // Ensure this.component exists before trying to access its parent.
        if (me.component) {
            return me.component.parent?.getStateProvider() || null
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
     * Returns the top-level data keys for a given path within this provider's data.
     * @param {String} path The path to get keys for (e.g., 'user.address').
     * @returns {String[]}
     */
    getTopLevelDataKeys(path) {
        const
            keys       = new Set(),
            pathPrefix = path ? `${path}.` : '';

        for (const fullPath in this.#dataConfigs) {
            if (fullPath.startsWith(pathPrefix)) {
                const
                    relativePath = fullPath.substring(pathPrefix.length),
                    topLevelKey  = relativePath.split('.')[0];

                if (topLevelKey) {
                    keys.add(topLevelKey)
                }
            }
        }

        return Array.from(keys)
    }

    /**
     * This is the core method for setting data, providing a single entry point for all data modifications.
     * It handles multiple scenarios:
     * 1.  **Object-based updates:** If `key` is an object, it recursively calls itself for each key-value pair.
     * 2.  **Data Records:** If `value` is a `Neo.data.Record`, it is treated as an atomic value and set directly.
     * 3.  **Bubbling Reactivity:** For a given key (e.g., 'user.name'), it sets the leaf value and then "bubbles up"
     *     the change, creating new parent objects (e.g., 'user') to ensure that effects depending on any part
     *     of the path are triggered.
     *
     * All updates are batched by the public `setData` methods to ensure effects run only once.
     * Use `setData()` or `setDataAtSameLevel()` instead of calling this method directly.
     *
     * @param {Object|String} key The property to set, or an object of key-value pairs.
     * @param {*} value The new value.
     * @param {Neo.state.Provider} [originStateProvider] The provider to start the search from for hierarchical updates.
     * @protected
     */
    internalSetData(key, value, originStateProvider) {
        const me = this;

        if (Neo.isObject(key)) {
            Object.entries(key).forEach(([dataKey, dataValue]) => {
                me.internalSetData(dataKey, dataValue, originStateProvider)
            });
            return
        }

        // Now 'key' is a string path.
        // If 'value' is a plain object, we need to drill down further.
        // If the value is a Neo.data.Record, treat it as an atomic value => it will not enter this block.
        if (Neo.typeOf(value) === 'Object') {
            Object.entries(value).forEach(([nestedKey, nestedValue]) => {
                const fullPath = `${key}.${nestedKey}`;
                me.internalSetData(fullPath, nestedValue, originStateProvider);
            });
            return // We've delegated the setting to deeper paths.
        }

        const
            ownerDetails   = me.getOwnerOfDataProperty(key),
            targetProvider = ownerDetails ? ownerDetails.owner : (originStateProvider || me);

        me.#setConfigValue(targetProvider, key, value, null);

        // This is the "reactivity bubbling" logic. When a leaf property like 'user.name' changes,
        // we must also trigger effects that depend on the parent object 'user'. We do this by
        // creating a new object reference for each parent in the path. The spread syntax
        // `{ ...oldParentValue, [leafKey]: latestValue }` is key, as it creates a new
        // object, which the reactivity system detects as a change.
        let path        = key,
            latestValue = value;

        while (path.includes('.')) {
            const leafKey = path.split('.').pop();
            path = path.substring(0, path.lastIndexOf('.'));

            const parentConfig = targetProvider.getDataConfig(path);

            if (parentConfig) {
                const oldParentValue = parentConfig.get();
                if (Neo.isObject(oldParentValue)) {
                    const newParentValue = { ...oldParentValue, [leafKey]: latestValue };
                    parentConfig.set(newParentValue);
                    latestValue = newParentValue;
                } else {
                    break // Stop if parent is not an object
                }
            } else {
                // If the parent config doesn't exist, we need to create it to support bubbling.
                // This is crucial for creating new nested data structures at runtime.
                const newParentValue = {[leafKey]: latestValue};
                me.#setConfigValue(targetProvider, path, newParentValue);
                latestValue = newParentValue
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
     * Gets called after all constructors & configs are applied.
     * @protected
     */
    onConstructed() {
        super.onConstructed();

        // After the provider is fully constructed and initial data is set,
        // run the formula effects for the first time to compute their initial values.
        this.#formulaEffects.forEach(effect => effect.run())
    }

    /**
     * @param {String} key
     * @param {*} value
     * @param {*} oldValue
     */
    onDataPropertyChange(key, value, oldValue) {
        // Can be overridden by subclasses
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

            // Ensure a Config instance exists for the current fullPath
            if (me.#dataConfigs[fullPath]) {
                me.#dataConfigs[fullPath].set(value)
            } else {
                me.#dataConfigs[fullPath] = new Config(value)
            }

            // If the value is a plain object, recursively process its properties
            if (Neo.typeOf(value) === 'Object') {
                me.processDataObject(value, fullPath)
            }
        });
    }

    /**
     * @param {Neo.component.Base} component
     * @param {String}             configName
     * @param {String}             storeName
     */
    resolveStore(component, configName, storeName) {
        let store = this.getStore(storeName);

        if (component[configName] !== store) {
            component[configName] = store
        }
    }

    /**
     * Helper function to set a config value and trigger reactivity.
     * This method creates a new Config instance if one doesn't exist for the given path,
     * or updates an existing one. It also triggers binding effects and calls onDataPropertyChange.
     * @param {Neo.state.Provider} provider The StateProvider instance owning the config.
     * @param {String}             path     The full path of the data property (e.g., 'user.firstname').
     * @param {*}                  newValue The new value to set.
     * @param {*}                 [oldVal]  The old value (optional, used for initial setup).
     * @private
     */
    #setConfigValue(provider, path, newValue, oldVal) {
        let currentConfig = provider.getDataConfig(path),
            oldValue      = oldVal;

        if (currentConfig) {
            oldValue = currentConfig.get();
            currentConfig.set(newValue);
        } else {
            currentConfig = new Config(newValue);
            provider.#dataConfigs[path] = currentConfig;
            // Trigger all binding effects to re-evaluate their dependencies
            provider.#bindingEffects.forEach(effect => effect.run())
        }

        // Notify subscribers of the data property change.
        provider.onDataPropertyChange(path, newValue, oldValue)
    }

    /**
     * The method will assign all values to the closest stateProvider where it finds an existing key.
     * In case no match is found inside the parent chain, a new data property will get generated.
     *
     * All updates within a single call are batched to ensure that reactive effects (bindings and formulas)
     * are run only once.
     *
     * @param {Object|String} key
     * @param {*}             value
     */
    setData(key, value) {
        EffectManager.pause();
        try {
            this.internalSetData(key, value, this)
        } finally {
            EffectManager.resume()
        }
    }

    /**
     * Use this method instead of setData() in case you want to enforce
     * setting all keys on this instance instead of looking for matches inside parent stateProviders.
     *
     * All updates within a single call are batched to ensure that reactive effects (bindings and formulas)
     * are run only once.
     *
     * @param {Object|String} key
     * @param {*}             value
     */
    setDataAtSameLevel(key, value) {
        EffectManager.pause();
        try {
            this.internalSetData(key, value)
        } finally {
            EffectManager.resume()
        }
    }
}

export default Neo.setupClass(Provider);
