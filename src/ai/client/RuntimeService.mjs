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
     * @param {Object} params
     * @param {Number} [params.windowId]
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
     * @param {String} params.hash
     * @param {Number} [params.windowId]
     * @returns {Object}
     */
    setRoute({hash, windowId}) {
        Neo.Main.setRoute({
            value: hash,
            windowId
        });

        return {status: 'ok', hash}
    }
}

export default Neo.setupClass(RuntimeService);
