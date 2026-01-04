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
     * @returns {Object}
     */
    inspectClass({className}) {
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

        // Process Configs
        Object.keys(defaultValues).forEach(key => {
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
                if (typeof proto[hookName] === 'function') {
                    hooks.push(prefix)
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
