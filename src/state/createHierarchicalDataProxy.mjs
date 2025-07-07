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
            // Pass through special properties for introspection and debugging.
            if (typeof property === 'symbol' || property === 'inspect' || property === 'then') {
                return null
            }

            const fullPath = path ? `${path}.${property}` : property;

            // 1. Check if the full path corresponds to an actual data property.
            const ownerDetails = rootProvider.getOwnerOfDataProperty(fullPath);

            if (ownerDetails) {
                const
                    {owner, propertyName} = ownerDetails,
                    config                = owner.getDataConfig(propertyName);

                if (config) {
                    const activeEffect = EffectManager.getActiveEffect();
                    if (activeEffect) {
                        activeEffect.addDependency(config);
                    }
                    return config.get();
                }
            }

            // 2. If not a direct match, it might be a parent object of a nested property
            //    (e.g., accessing `user` when a `user.firstname` binding exists).
            //    In this case, we return another proxy for the next level down.
            if (rootProvider.hasNestedDataStartingWith(fullPath)) {
                return createNestedProxy(rootProvider, fullPath)
            }

            // 3. If it's neither a data property nor a path to one, it doesn't exist in the state.
            return null
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
