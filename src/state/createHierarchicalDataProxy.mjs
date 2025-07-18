import EffectManager from '../core/EffectManager.mjs';

/**
 * Creates a nested Proxy that represents a level in the hierarchical data structure.
 * @param {Neo.state.Provider} rootProvider The top-level provider to start searches from.
 * @param {String} path The current path of this proxy level (e.g., 'user' for data.user).
 * @returns {Proxy|null}
 * @private
 */
function createNestedProxy(rootProvider, path) {
    // The target object for the proxy can be empty because all lookups are dynamic.
    const target = {};

    return new Proxy(target, {
        /**
         * The get trap for the proxy. This is where the magic happens.
         * @param {Object} currentTarget The proxy's target object.
         * @param {String|Symbol} property The name of the property being accessed.
         * @returns {*} The value of the property or a new proxy for nested access.
         */
        get(currentTarget, property) {
            // Handle internal properties that might be set directly on the proxy's target
            // or are expected by the environment (like Siesta's __REFADR__).
            if (typeof property === 'symbol' || property === '__REFADR__' || property === 'inspect' || property === 'then') {
                return Reflect.get(currentTarget, property)
            }

            // Only allow string or number properties to proceed as data paths.
            if (typeof property !== 'string' && typeof property !== 'number') {
                return undefined; // For other non-string/non-number properties, return undefined.
            }

            // Special handling for the 'stores' property at the root level
            if (path === '' && property === 'stores') {
                return new Proxy({}, {
                    get(target, storeName) {
                        if (typeof storeName === 'symbol' || storeName === '__REFADR__') {
                            return Reflect.get(target, storeName)
                        }
                        // Delegate to the StateProvider's getStore method for hierarchical resolution
                        // Accessing store.count later will register the dependency via the Config system
                        return rootProvider.getStore(storeName)
                    }
                })
            }

            const fullPath = path ? `${path}.${property}` : property;

            // 1. Check if the full path corresponds to an actual data property.
            const ownerDetails = rootProvider.getOwnerOfDataProperty(fullPath);

            if (ownerDetails) {
                const
                    {owner, propertyName} = ownerDetails,
                    config                = owner.getDataConfig(propertyName);

                if (config) {
                    EffectManager.getActiveEffect()?.addDependency(config);

                    const value = config.get();
                    // If the value is an object, return a new proxy for it to ensure nested accesses are also proxied.
                    if (Neo.isObject(value)) {
                        return createNestedProxy(rootProvider, fullPath)
                    }

                    return value
                }
            }

            // 2. If not a direct match, it might be a parent object of a nested property
            //    (e.g., accessing `user` when a `user.firstname` binding exists).
            //    In this case, we return another proxy for the next level down.
            if (rootProvider.hasNestedDataStartingWith(fullPath)) {
                return createNestedProxy(rootProvider, fullPath)
            }

            // 3. If it's neither a data property nor a path to one, it doesn't exist.
            //    Returning undefined ensures that chained accesses (e.g., data.nonexistent.property) fail gracefully.
        },

        set(currentTarget, property, value) {
            // Allow internal properties (like Symbols or specific strings) to be set directly on the target.
            if (typeof property === 'symbol' || property === '__REFADR__') {
                return Reflect.set(currentTarget, property, value)
            }

            const
                fullPath     = path ? `${path}.${property}` : property,
                ownerDetails = rootProvider.getOwnerOfDataProperty(fullPath);
            let targetProvider;

            if (ownerDetails) {
                targetProvider = ownerDetails.owner
            } else {
                // If no owner is found, set it on the rootProvider (the one that created this proxy)
                targetProvider = rootProvider
            }

            targetProvider.setData(fullPath, value);
            return true // Indicate that the assignment was successful
        },

        ownKeys(currentTarget) {
            return rootProvider.getTopLevelDataKeys(path)
        },

        getOwnPropertyDescriptor(currentTarget, property) {
            const
                fullPath     = path ? `${path}.${property}` : property,
                ownerDetails = rootProvider.getOwnerOfDataProperty(fullPath);

            if (ownerDetails) {
                const config = ownerDetails.owner.getDataConfig(ownerDetails.propertyName);

                if (config) {
                    const value = config.get();
                    return {
                        value       : Neo.isObject(value) ? createNestedProxy(rootProvider, fullPath) : value,
                        writable    : true,
                        enumerable  : true,
                        configurable: true
                    }
                }
            }
        }
    })
}

/**
 * Creates a Proxy object that represents the merged, hierarchical data from a `state.Provider` chain.
 * When a property is accessed through this proxy while an Effect is running, it automatically
 * tracks the underlying core.Config instance as a dependency.
 * @param {Neo.state.Provider} provider The starting state.Provider.
 * @returns {Proxy}
 */
export function createHierarchicalDataProxy(provider) {
    return createNestedProxy(provider, '')
}
