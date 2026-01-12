import Base             from '../core/Base.mjs';
import ComponentManager from './Component.mjs';
import FocusManager     from './Focus.mjs';
import Logger           from '../util/Logger.mjs';
import NeoArray         from '../util/Array.mjs';
import VDomUtil         from '../util/VDom.mjs';
import VNodeUtil        from '../util/VNode.mjs';

const eventConfigKeys = [
    'bubble',
    'delegate',
    'local',
    'scope',
    'vnodeId'
];

const handlerMap = {
    change     : 'onChange',
    click      : 'onClick',
    contextmenu: 'onContextMenu',
    dblclick   : 'onDoubleClick',
    focusin    : 'onFocusIn',
    focusout   : 'onFocusOut',
    input      : 'onChange',
    keydown    : 'onKeyDown',
    keyup      : 'onKeyUp',
    mousedown  : 'onMouseDown',
    mouseenter : 'onMouseEnter',
    mouseleave : 'onMouseLeave',
    mouseup    : 'onMouseUp',
    scroll     : 'onScroll',
    wheel      : 'onWheel'
};

const globalDomEvents = [
    'change',
    'click',
    'contextmenu',
    'dblclick',
    'drag:end',
    'drag:move',
    'drag:start',
    'focusin',
    'focusout',
    'input',
    'intersect',
    'keydown',
    'keyup',
    'mousedown',
    'mouseenter',
    'mouseleave',
    'mouseup',
    'neonavigate',
    'scroll',
    'selectionchange',
    'touchmove',
    'wheel'
];

/**
 * The DomEvent Manager is responsible for distributing DOM events to the matching components.
 * It supports event delegation and "Logical Component Bubbling", allowing events to bubble up
 * the logical component hierarchy (e.g. `component.parent`) even if the DOM hierarchy is
 * disconnected (e.g. Portals, DragProxies, Multi-Window setups).
 *
 * @class Neo.manager.DomEvent
 * @extends Neo.core.Base
 * @singleton
 */
class DomEvent extends Base {
    static config = {
        /**
         * @member {String} className='Neo.manager.DomEvent'
         * @protected
         */
        className: 'Neo.manager.DomEvent',
        /**
         * @member {Object} items={}
         * @protected
         */
        items: {},
        /**
         * @member {Object} map={}
         * @protected
         */
        map: {},
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     *
     * @param {Neo.component.Base} component
     * @param {data} event
     */
    async addResizeObserver(component, event) {
        let {id, windowId} = component,
            ResizeObserver = await Neo.currentWorker.getAddon('ResizeObserver', windowId);

        // ResizeObservers need to get registered to a specific target id
        if (event.delegate?.startsWith('#')) {
            id = event.delegate.substring(1)
        }

        ResizeObserver.register({id, windowId})
    }

    /**
     * Iterates the event path to find matching listeners on components.
     * It utilizes `ComponentManager.getParentPath()` to construct a logical component path,
     * ensuring events bubble to logical ancestors (like a Dashboard owning a DragProxy)
     * even if they are not physical ancestors in the DOM.
     *
     * @param {Object} event
     * @protected
     */
    fire(event) {
        let me          = this,
            bubble      = true,
            data        = event.data || {},
            {eventName} = event,
            i           = 0,
            listeners   = null,
            pathIds     = data.path.map(e => e.id),
            path        = ComponentManager.getParentPath(pathIds),
            len         = path.length,
            component, delegationTargetId, id, preventFire;

        for (; i < len; i++) {
            id        = path[i];
            component = Neo.getComponent(id);

            if (!component || component.disabled) {
                break
            }

            if (eventName === 'scroll') {
                if (component.saveScrollPosition && typeof component.onScrollCapture === 'function') {
                    component.onScrollCapture(data)
                }
            }

            listeners = me.items[id]?.[eventName];

            if (listeners) {
                if (Array.isArray(listeners)) {
                    // Stop iteration if a handler returns false
                    listeners.every(listener => {
                        let result;

                        if (listener && listener.fn) {
                            if (eventName === 'resize') {
                                // we do not want delegation for custom main.addon.ResizeObserver events
                                delegationTargetId = data.id === component.id ? data.id : false
                            } else {
                                delegationTargetId = me.verifyDelegationPath(listener, data.path, path)
                            }

                            if (delegationTargetId !== false) {
                                preventFire = false;

                                // we only want mouseenter & leave to fire on their top level nodes, not for children
                                if (eventName === 'mouseenter' || eventName === 'mouseleave') {
                                    preventFire = !DomEvent.verifyMouseEnterLeave(component, data, delegationTargetId, eventName)
                                }

                                if (!preventFire) {
                                    // multiple listeners would change the reference of data.component
                                    data = Neo.clone(data, true, true);

                                    data.component = component;

                                    // Handler needs to know which actual target matched the delegate
                                    data.currentTarget = delegationTargetId;

                                    if (Neo.isString(listener.fn)) {
                                        me.bindCallback(listener.fn, 'fn', listener.scope, listener)
                                    }

                                    result = listener.fn.apply(listener.scope || globalThis, [data]);

                                    if (!listener.bubble) {
                                        bubble = false
                                    }
                                }
                            }
                        }
                        // If a listener returns false, we stop iterating the listeners
                        return result !== false
                    })
                }
            }

            // we do want to trigger the FocusManager after normal domListeners on these events got executed
            if (eventName === 'focusin' || eventName === 'focusout') {
                FocusManager['on' + Neo.capitalize(eventName)]({
                    componentPath: path,
                    data
                });

                break
            }

            // Honor the Event cancelBubble property
            if (!bubble || data.cancelBubble) {
                break
            }
        }

        if (eventName === 'contextmenu' && data.ctrlKey) {
            Neo.util?.Logger?.onContextMenu(data)
        } else if (eventName.startsWith('drag:') || eventName.startsWith('drop')) {
            let dragZone = data.dragZoneId && Neo.get(data.dragZoneId);

            if (dragZone) {
                // drag:move & drag:end
                if (eventName.startsWith('drag:')) {
                    dragZone[eventName === 'drag:move' ? 'onDragMove' : 'onDragEnd']?.(data)
                } else {
                    dragZone.fire(eventName, data);
                    dragZone[{
                        'drop'      : 'onDrop',
                        'drop:enter': 'onDropEnter',
                        'drop:leave': 'onDropLeave',
                    }[eventName]].call(dragZone, data)
                }
            }
        }
    }

    /**
     * @param config
     * @param scope
     * @returns {Object}
     */
    generateListenerConfig(config, scope) {
        return {
            bubble   : config.bubble,
            delegate : config.delegate,
            eventName: config.eventName,
            id       : scope.id,
            opts     : config,
            priority : config.priority,
            scope    : config.scope   || scope,
            vnodeId  : config.vnodeId || scope.vdom.id
        };
    }

    getEventName(config) {
        let eventName = null;

        if (Neo.isObject(config)) {
            Object.keys(config).forEach(key => {
                if (!eventConfigKeys.includes(key)) {
                    eventName = key
                }
            })
        }

        return eventName
    }

    /**
     * @param {Object} config
     * @param {Boolean} config.bubble
     * @param {String} config.delegate
     * @param {String} config.eventName
     * @param {String} config.id
     * @param {Object} config.opts
     * @param {Object} config.scope
     * @param {String} config.vnodeId
     * @returns {Object}
     */
    getListener(config) {
        let listeners = this.items,
            event;

        if (listeners?.[config.id]) {
            event = listeners[config.id][config.eventName];

            return event || null
        }
    }

    /**
     * Mounts local domEvent listeners for a given component
     * @param {Neo.component.Base} component
     * @protected
     */
    mountDomListeners(component) {
        let listeners   = this.items[component.id],
            localEvents = [];

        if (listeners) {
            Object.entries(listeners).forEach(([eventName, value]) => {
                value.forEach(event => {
                    eventName = event.eventName;

                    if (eventName === 'resize') {
                        this.addResizeObserver(component, event)
                    } else if (eventName && (event.local || !globalDomEvents.includes(eventName))) {
                        let options = {};

                        if (event.opts) {
                            if (Object.hasOwn(event.opts, 'capture')) {
                                options.capture = event.opts.capture
                            }
                            if (Object.hasOwn(event.opts, 'once')) {
                                options.once = event.opts.once
                            }
                            if (Object.hasOwn(event.opts, 'passive')) {
                                options.passive = event.opts.passive
                            }
                        }

                        localEvents.push({
                            name   : eventName,
                            handler: handlerMap[eventName] || 'domEventListener',
                            options,
                            vnodeId: event.vnodeId
                        })
                    }
                })
            });

            if (localEvents.length > 0) {
                Neo.worker.App.promiseMessage(component.windowId, {
                    action : 'addDomListener',
                    appName: component.appName,
                    events : localEvents
                }).then(data => {
                    // console.log('added domListener', data);
                }).catch(err => {
                    console.log('App: Got error attempting to add a domListener', err)
                })
            }
        }
    }

    /**
     * @param {Object}  config
     * @param {Boolean} config.bubble
     * @param {String}  config.delegate
     * @param {String}  config.eventName
     * @param {String}  config.id
     * @param {Boolean} config.local
     * @param {Number}  config.opts
     * @param {Number}  config.originalConfig
     * @param {String}  config.ownerId
     * @param {Number}  config.priority=1
     * @param {Object}  config.scope
     * @param {String}  config.vnodeId
     * @returns {Boolean} true if the listener got registered successfully (false in case it was already there)
     */
    register(config) {
        let me                           = this,
            alreadyRegistered            = false,
            {eventName, id, opts, scope} = config,
            listeners                    = me.items,
            fnType                       = typeof opts,
            fn, listener, listenerConfig, listenerId;

        // Ensure we register the listener under the component ID, even if it is a wrapper node
        if (config.ownerId) {
            id = config.ownerId
        }

        if (fnType === 'function' || fnType === 'string') {
            fn = opts
        } else {
            fn    = opts.fn;
            scope = opts.scope || scope
        }

        if (!listeners[id]) {
            listeners[id] = {}
        }

        if (listeners[id][eventName]) {
            listener = listeners[id][eventName];

            Object.keys(listener).forEach(key => {
                if (
                    listener[key].fn.toString() === fn.toString() && // todo: add a better check
                    listener[key].scope         === scope &&
                    listener[key].delegate      === config.delegate
                ) {
                    alreadyRegistered = true
                }
            })
        } else {
            listeners[id][eventName] = []
        }

        if (alreadyRegistered === true) {
            return false
        }

        listenerId = Neo.getId('dom-event');

        config.listenerId = listenerId;

        let local = config.local || (Neo.isObject(opts) && opts.local) || false;

        listenerConfig = {
            bubble        : config.hasOwnProperty('bubble') ? config.bubble : opts.hasOwnProperty('bubble') ? opts.bubble : true,
            delegate      : config.delegate,
            eventName,
            fn,
            id            : listenerId,
            local,
            mounted       : !local && globalDomEvents.includes(eventName),
            originalConfig: config.originalConfig,
            ownerId       : config.ownerId,
            priority      : config.priority || opts.priority || 1,
            scope,
            vnodeId       : config.vnodeId
        };

        me.map[listenerId] = listenerConfig;

        listeners[id][eventName].push(listenerConfig);

        listeners[id][eventName].sort((a, b) => b.priority - a.priority);

        return true
    }

    /**
     * @param {Object} config
     * @param {Boolean} config.bubble
     * @param {String} config.eventName
     * @param {String} config.id
     * @param {Object} config.opts
     * @param {Object} config.scope
     * @param {String} config.vnodeId
     * @param {Object} scope
     * @returns {Boolean} true in case the listener did exist and got removed
     */
    unregister(config, scope) {
        // todo
        console.log('unregister', config);
        console.log(this.generateListenerConfig(config, scope));
        return;

        let listener = this.getListener(config);

        if (listener) {
            console.log('listener found', listener)
        }
    }

    /**
     * @param {Neo.component.Base} component
     * @param {Object[]} domListeners
     * @param {Object[]} oldDomListeners
     */
    updateDomListeners(component, domListeners, oldDomListeners) {
        let me                  = this,
            registeredListeners = me.items[component.id] || {},
            i, len, listeners;

        if (Array.isArray(domListeners)) {
            if (Array.isArray(oldDomListeners)) {
                oldDomListeners.forEach(oldDomListener => {
                    // find & remove no longer existing listeners
                    if (!domListeners.includes(oldDomListener)) {
                        listeners = registeredListeners[me.getEventName(oldDomListener)] || [];
                        i         = 0;
                        len       = listeners.length;

                        for (; i < len; i++) {
                            if (listeners[i].originalConfig === oldDomListener) {
                                NeoArray.remove(listeners, listeners[i]);
                                break
                            }
                        }
                    }
                })
            }

            // add new listeners
            domListeners.forEach(domListener => {
                Object.entries(domListener).forEach(([key, value]) => {
                    if (!eventConfigKeys.includes(key)) {
                        me.register({
                            bubble        : domListener.bubble   || value.bubble,
                            delegate      : domListener.delegate || value.delegate || '#' + (component.vdom.id || component.id),
                            eventName     : key,
                            id            : component.vdom.id || component.id, // honor wrapper nodes
                            opts          : value,
                            originalConfig: domListener,
                            ownerId       : component.id,
                            priority      : domListener.priority || value.priority || 1,
                            scope         : domListener.scope    || component,
                            vnodeId       : domListener.vnodeId  || value.vnodeId  || component.vdom.id
                        })
                    }
                })
            });

            if (component.mounted && domListeners?.length > 0) {
                me.timeout(100).then(() => {
                    me.mountDomListeners(component)
                })
            }
        } else {
            Logger.logError('Component.domListeners have to be an array', component)
        }
    }

    /**
     * Verifies if the event target (or a delegate matching node) is a descendant of the listener's component.
     * This check supports two modes:
     * 1. **DOM Ancestry (Standard):** Checks if the target is physically inside the listener's DOM node.
     * 2. **Logical Ancestry (Fallback):** If the DOM check fails, it checks the `componentPath` to see if the
     *    target belongs to a component that is logically a descendant of the listener component.
     *    This is crucial for handling events from detached components (Portals/Proxies).
     *
     * @param {Object} listener
     * @param {Array} path            The raw DOM path from the event
     * @param {Array} [componentPath] The logical component ID path
     * @returns {Boolean|String} true/targetId in case the delegation string matches the event path
     */
    verifyDelegationPath(listener, path, componentPath) {
        let {delegate} = listener,
            j          = 0,
            pathLen    = path.length,
            targetId;

        if (typeof delegate === 'function') {
            j = delegate(path);

            if (j != null) {
                targetId = path[j].id
            }
        } else {
            let delegationArray = delegate.split(' '),
                len             = delegationArray.length,
                hasMatch, i, item, isId;

            for (i=len-1; i >= 0; i--) {
                hasMatch = false;
                item     = delegationArray[i];
                isId     = item.startsWith('#');

                if (isId || item.startsWith('.')) {
                    item = item.substring(1)
                }

                for (; j < pathLen; j++) {
                    if (
                        (isId && path[j].id === item) ||
                        path[j].cls.includes(item)
                    ) {
                        hasMatch = true;
                        targetId = path[j].id;
                        break
                    }
                }

                if (!hasMatch) {
                    return false
                }
            }
        }

        // Phase 1: Physical Boundary Check (The Fast Path)
        // Ensure the delegation path is a child of the owner component's root node in the physical DOM.
        // This covers standard inline components and is O(N).
        for (let k = j; k < pathLen; k++) {
            if (path[k].id === listener.vnodeId) {
                return targetId
            }
        }

        // Phase 2: Physical Anchor Verification (The Logical Fallback)
        // If the physical check fails (listener not in path), we check the logical `componentPath`.
        // The `componentPath` starts with the "Anchor Component" - the first component found in the physical path.
        // We must verify that our `targetId` is physically inside this Anchor Component.
        // If it is, and the Anchor is logically below the Listener (guaranteed if we are here), then the delegation is valid.
        //
        // This handles:
        // - Portals: Anchor is the Portal Child. Target is inside Portal Child. Anchor -> Parent (Listener). Valid.
        // - Menus: Anchor is SubMenu. Target is inside SubMenu. Anchor -> Menu (Listener). Valid.
        // - Multi-Window: Anchor is ViewB. Target is inside ViewB. Anchor -> ViewA (Listener). Valid.
        if (componentPath?.length > 0) {
            let anchorId = componentPath[0];

            // Verify target is physically inside the Anchor
            for (let k = j; k < pathLen; k++) {
                if (path[k].id === anchorId) {
                    return targetId
                }
            }
        }

        return false
    }

    /**
     * @param {Neo.component.Base} component
     * @param {Object} data
     * @param {String} delegationTargetId
     * @param {String} eventName
     * @returns {Boolean}
     */
    static verifyMouseEnterLeave(component, data, delegationTargetId, eventName) {
        let targetId = eventName === 'mouseenter' ? data.fromElementId : data.toElementId,
            delegationVdom;

        if (targetId && targetId !== delegationTargetId) {
            delegationVdom = VDomUtil.find(component.vdom, delegationTargetId);

            // delegationVdom can be undefined when dragging a proxy over the node.
            // see issues/1137 for details.
            if (!delegationVdom || delegationVdom.vdom && VDomUtil.find(delegationVdom.vdom, targetId)) {
                return false
            }
        }

        return true
    }
}

export default Neo.setupClass(DomEvent);
