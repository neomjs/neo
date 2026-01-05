import DomEventManager from '../../manager/DomEvent.mjs';
import HashHistory     from '../../util/HashHistory.mjs';
import Service         from './Service.mjs';

/**
 * Handles runtime environment related Neural Link requests.
 * @class Neo.ai.client.RuntimeService
 * @extends Neo.ai.client.Service
 */
class RuntimeService extends Service {
    static config = {
        /**
         * @member {String} className='Neo.ai.client.RuntimeService'
         * @protected
         */
        className: 'Neo.ai.client.RuntimeService'
    }

    /**
     * Checks if a namespace exists in the current environment.
     * @param {Object} params
     * @param {String} params.namespace
     * @returns {Object} {exists: Boolean}
     */
    checkNamespace({namespace}) {
        return {
            exists: !!Neo.ns(namespace)
        }
    }

    /**
     * @param {Object} params
     * @param {String} params.componentId
     * @returns {Object}
     */
    getDomEventListeners({componentId}) {
        const
            listeners = [],
            eventMap  = DomEventManager.items?.[componentId];

        if (eventMap) {
            Object.entries(eventMap).forEach(([eventName, events]) => {
                events.forEach(event => {
                    listeners.push({
                        delegate: event.delegate,
                        event   : eventName,
                        handler : typeof event.fn === 'function' ? event.fn.name || 'anonymous' : event.fn,
                        priority: event.priority,
                        scope   : event.scope?.id || 'unknown'
                    })
                })
            })
        }

        return {listeners}
    }

    /**
     * @param {Object} params
     * @returns {Object}
     */
    getDomEventSummary(params) {
        const summary = {
            byComponent: {},
            byEvent    : {},
            totalEvents: 0
        };

        Object.entries(DomEventManager.items).forEach(([componentId, eventMap]) => {
            let componentCount = 0;

            Object.entries(eventMap).forEach(([eventName, events]) => {
                const count = events.length;

                summary.totalEvents       += count;
                componentCount            += count;
                summary.byEvent[eventName] = (summary.byEvent[eventName] || 0) + count
            });

            if (componentCount > 0) {
                summary.byComponent[componentId] = componentCount
            }
        });

        return summary
    }

    /**
     * @param {Object} params
     * @returns {Object}
     */
    getDragState(params) {
        const dragCoordinator = Neo.manager?.DragCoordinator;

        if (dragCoordinator) {
            return dragCoordinator.toJSON()
        }

        return {};
    }

    /**
     * Retrieves the source code of a method on a class prototype.
     * @param {Object} params
     * @param {String} params.className  The fully qualified class name.
     * @param {String} params.methodName The name of the method.
     * @returns {Object} {success: Boolean, source?: String, error?: String}
     */
    getMethodSource({className, methodName}) {
        const cls = Neo.ns(className);

        if (!cls) {
            return {success: false, error: `Class '${className}' not found`}
        }

        const type = Neo.typeOf(cls);
        let proto;

        if (type === 'NeoClass') {
            proto = cls.prototype
        } else if (type === 'NeoInstance') {
            proto = cls.constructor.prototype
        } else {
            return {success: false, error: `Target '${className}' is not a Neo class or instance`}
        }

        if (typeof proto[methodName] !== 'function') {
            return {success: false, error: `Method '${methodName}' not found on '${className}'`}
        }

        return {
            success: true,
            source : proto[methodName].toString()
        }
    }

    /**
     * Retrieves the loaded namespace tree.
     * @param {Object} params
     * @param {String} [params.root='Neo'] The root namespace to start from (e.g., 'Neo', 'MyApp').
     * @returns {Object}
     */
    getNamespaceTree({root='Neo'}) {
        const
            me        = this,
            startNode = Neo.ns(root),
            tree      = {};

        if (!startNode) {
            return {tree: {}, error: `Namespace '${root}' not found`}
        }

        me.#traverseNamespace(startNode, root, tree);

        return {root, tree}
    }

    /**
     * @param {Object} params
     * @param {String} [params.windowId]
     * @returns {Object}
     */
    getNeoConfig({windowId}) {
        if (windowId) {
            return Neo.windowConfigs?.[windowId] || null
        }
        return Neo.config
    }

    /**
     * @param {Object} params
     * @param {String} [params.windowId]
     * @returns {Object}
     */
    getRouteHistory({windowId}) {
        const stack = HashHistory.getStack(windowId);

        return {
            count   : stack.length,
            history : stack,
            windowId: windowId || null
        }
    }

    /**
     * @param {Object} params
     * @returns {Object}
     */
    getWindowInfo(params) {
        const windowManager = Neo.manager?.Window;

        if (windowManager) {
            return windowManager.toJSON()
        }

        return {windows: []};
    }

    /**
     * Inspects a class to retrieve its full schema (configs, methods, hierarchy).
     * @param {Object} params
     * @param {String} params.className
     * @param {String} [params.detail='standard'] 'standard' | 'compact'
     * @returns {Object}
     */
    inspectClass({className, detail='standard'}) {
        const cls = Neo.ns(className);

        if (!cls) {
            throw new Error(`Class not found: ${className}`)
        }

        const
            isClass = cls.isClass,
            ctor    = isClass ? cls : cls.constructor,
            proto   = ctor.prototype;

        // 1. Hierarchy & Mixins
        const getMixinNames = (obj) => {
            const names = [];
            if (Neo.isObject(obj)) {
                Object.values(obj).forEach(value => {
                    if (value && value.isClass) {
                        names.push(value.prototype.className)
                    } else {
                        names.push(...getMixinNames(value))
                    }
                })
            }
            return names
        };

        // 2. Configs & Methods
        const
            configs        = {},
            methods        = new Set(),
            configKeys     = new Set(Object.keys(ctor.config)),
            descriptors    = ctor.configDescriptors || {},
            ignoredProps   = ['constructor', 'construct', 'init', 'onConstructed', 'onAfterConstructed'],
            hookRegex      = /^(before|after)(Get|Set)([A-Z])/,
            // Helper to get raw hook name from config key
            getHookName    = (prefix, key) => prefix + key[0].toUpperCase() + key.slice(1);

        // Serialize the default values first
        const defaultValues = this.serializeConfig(ctor.config);

        // Get superclass config for comparison in compact mode
        const
            superCtor   = ctor.__proto__,
            superConfig = superCtor?.config || {};

        // Process Configs
        Object.keys(defaultValues).forEach(key => {
            // In compact mode, only include configs that are "own" (not in super or changed)
            if (detail === 'compact') {
                const isOwn = !Object.hasOwn(superConfig, key) || superConfig[key] !== ctor.config[key];
                if (!isOwn) return
            }

            configs[key] = {
                value: defaultValues[key]
            };

            // Add Descriptor info if available
            if (descriptors[key]) {
                configs[key].meta = this.serializeConfig(descriptors[key])
            }

            // Check for Hooks
            const hooks = [];
            ['beforeGet', 'beforeSet', 'afterSet'].forEach(prefix => {
                const hookName = getHookName(prefix, key);
                // In compact mode, only check for hooks on the current prototype
                if (detail === 'compact') {
                    if (Object.hasOwn(proto, hookName)) {
                        hooks.push(prefix)
                    }
                } else {
                    if (typeof proto[hookName] === 'function') {
                        hooks.push(prefix)
                    }
                }
            });

            if (hooks.length > 0) {
                configs[key].hooks = hooks
            }
        });

        // Process Methods
        let currentProto = proto;

        // Traverse up to Neo.core.Base
        while (currentProto && currentProto.constructor.className !== 'Object') {
            Object.getOwnPropertyNames(currentProto).forEach(name => {
                if (
                    !configKeys.has(name) &&
                    !ignoredProps.includes(name) &&
                    !name.startsWith('_') &&
                    !name.startsWith('#')
                ) {
                    // Check if it's a hook
                    const hookMatch = name.match(hookRegex);
                    if (hookMatch) {
                        // It is a hook. We only care if it wasn't already caught by the config loop.
                        // But since we want a clean method list, we generally exclude hooks here.
                        // The config loop above captures hooks *associated with known configs*.
                        // Orphaned hooks (for non-existent configs?) are rare/invalid.
                    } else {
                        const descriptor = Object.getOwnPropertyDescriptor(currentProto, name);
                        if (typeof descriptor.value === 'function') {
                            methods.add(name)
                        }
                    }
                }
            });

            // In compact mode, we only look at the top-level prototype
            if (detail === 'compact') {
                break
            }

            currentProto = currentProto.__proto__
        }

        return {
            className : proto.className,
            ntype     : proto.ntype,
            ntypeChain: ctor.ntypeChain,
            superClass: proto.__proto__?.constructor?.config?.className || null,
            mixins    : proto.mixins ? getMixinNames(proto.mixins) : [],
            configs,
            methods   : Array.from(methods).sort()
        }
    }

    /**
     * Replaces a method implementation on a class prototype at runtime.
     * RESTRICTED: Requires Neo.config.enableHotPatching = true.
     *
     * @param {Object} params
     * @param {String} params.className  The fully qualified class name (e.g., 'Neo.button.Base')
     * @param {String} params.methodName The name of the method to patch
     * @param {String} params.source     The new function source code (e.g., 'function(args) { ... }' or 'async (args) => { ... }')
     * @returns {Object} {success: Boolean, error?: String}
     */
    patchCode({className, methodName, source}) {
        if (Neo.config.enableHotPatching !== true) {
            return {
                success: false,
                error  : 'Hot patching is disabled. Set Neo.config.enableHotPatching = true to enable.'
            }
        }

        const cls = Neo.ns(className);

        if (!cls) {
            return {
                success: false,
                error  : `Class '${className}' not found`
            }
        }

        if (!cls.prototype) {
            return {
                success: false,
                error  : `Class '${className}' has no prototype (is it a singleton?)`
            }
        }

        try {
            // Use new Function to parse the source code safely into a function object.
            // This avoids direct use of eval() and ensures the code runs in the global scope.
            // eslint-disable-next-line no-new-func
            const fn = new Function('return ' + source)();

            if (typeof fn !== 'function') {
                return {
                    success: false,
                    error  : 'Source did not evaluate to a function'
                }
            }

            // 1. Log the patch for audit
            console.warn(`[Neo.ai.client.RuntimeService] Hot-patching ${className}.prototype.${methodName}`);

            // 2. Apply the patch
            cls.prototype[methodName] = fn;

            // 3. Mark method as patched (useful for debugging)
            fn.$isPatched = true;
            fn.$originalSource = source;

            return {success: true}

        } catch (e) {
            console.error('[Neo.ai.client.RuntimeService] Hot patch failed:', e);
            return {
                success: false,
                error  : e.message
            }
        }
    }

    /**
     * @param {Object} params
     * @returns {Object}
     */
    reloadPage(params) {
        Neo.Main.reloadWindow();
        return {status: 'reloading'};
    }

    /**
     * @param {Object} params
     * @param {Object} params.config
     * @returns {Object}
     */
    setNeoConfig({config}) {
        Neo.setGlobalConfig(config);
        return {status: 'ok'}
    }

    /**
     * @param {Object} params
     * @param {String} params.hash
     * @param {String} [params.windowId]
     * @returns {Object}
     */
    setRoute({hash, windowId}) {
        Neo.Main.setRoute({
            value: hash,
            windowId
        });

        return {status: 'ok', hash}
    }

    /**
     * @param {Object} node
     * @param {String} path
     * @param {Object} output
     */
    #traverseNamespace(node, path, output) {
        Object.keys(node).forEach(key => {
            const
                value       = node[key],
                type        = Neo.typeOf(value),
                currentPath = path ? `${path}.${key}` : key;

            if (type === 'NeoClass') {
                output[key] = {
                    type     : 'class',
                    className: value.prototype.className
                }
            } else if (type === 'NeoInstance') {
                output[key] = {
                    type     : 'singleton',
                    className: value.className
                }
            } else if (type === 'Object') {
                // Only traverse plain objects (namespaces)
                // Neo.typeOf returns 'Object' for plain objects
                output[key] = {};
                this.#traverseNamespace(value, currentPath, output[key]);

                // Clean up empty packages
                if (Object.keys(output[key]).length === 0) {
                    delete output[key]
                }
            }
        })
    }
}

export default Neo.setupClass(RuntimeService);
