import Base              from '../core/Base.mjs';
import ComponentManager  from './Component.mjs';
import FocusManager      from './Focus.mjs';
import Logger            from '../util/Logger.mjs';
import NeoArray          from '../util/Array.mjs';
import {resolveCallback} from '../util/Function.mjs';
import VDomUtil          from '../util/VDom.mjs';

const eventConfigKeys = [
    'bubble',
    'delegate',
    'local',
    'scope',
    'vnodeId'
];

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
    addResizeObserver(component, event) {
        if (!Neo.main.addon.ResizeObserver) {
            console.error('For using resize domListeners, you must include main.addon.ResizeObserver.', event)
        }

        let {id, windowId} = component;

        Neo.main.addon.ResizeObserver.register({id, windowId})
    }

    /**
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

            listeners = me.items[id]?.[eventName];

            if (listeners) {
                // console.log('fire', eventName, data, listeners, path);

                if (Array.isArray(listeners)) {
                    // Stop iteration if a handler returns false
                    listeners.every(listener => {
                        let result;

                        if (listener && listener.fn) {
                            if (eventName === 'resize') {
                                // we do not want delegation for custom main.addon.ResizeObserver events
                                delegationTargetId = data.id === component.id ? data.id : false
                            } else {
                                delegationTargetId = me.verifyDelegationPath(listener, data.path)
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
        } else if (eventName.startsWith('drop')) {
            let dragZone = data.dragZoneId && Neo.get(data.dragZoneId);

            if (dragZone) {
                dragZone.fire(eventName, data);
                dragZone[{
                    'drop'      : 'onDrop',
                    'drop:enter': 'onDropEnter',
                    'drop:leave': 'onDropLeave',
                }[eventName]].call(dragZone, data)
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
            vnodeId  : config.vnodeId || scope.id
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
                        localEvents.push({
                            name   : eventName,
                            handler: 'domEventListener',
                            vnodeId: event.vnodeId
                        })
                    }
                })
            });

            if (localEvents.length > 0) {
                Neo.worker.App.promiseMessage('main', {
                    action  : 'addDomListener',
                    appName : component.appName,
                    events  : localEvents,
                    windowId: component.windowId
                }).then(data => {
                    // console.log('added domListener', data);
                }).catch(err => {
                    console.log('App: Got error attempting to add a domListener', err)
                })
            }
        }
    }

    /**
     * @param {Object} config
     * @param {Boolean} config.bubble
     * @param {String} config.delegate
     * @param {String} config.eventName
     * @param {String} config.id
     * @param {Boolean} config.local
     * @param {Number} config.opts
     * @param {Number} config.originalConfig
     * @param {String} config.ownerId
     * @param {Number} config.priority=1
     * @param {Object} config.scope
     * @param {String} config.vnodeId
     * @returns {Boolean} true if the listener got registered successfully (false in case it was already there)
     */
    register(config) {
        let me                           = this,
            alreadyRegistered            = false,
            {eventName, id, opts, scope} = config,
            listeners                    = me.items,
            fnType                       = typeof opts,
            fn, listener, listenerConfig, listenerId;

        if (fnType === 'function') {
            fn = opts
        } else if (fnType === 'string') {
            fn = resolveCallback(opts, scope).fn
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

        // console.log('manager.DomEvent register', eventName, config);

        listenerId = Neo.getId('dom-event');

        config.listenerId = listenerId;

        listenerConfig = {
            bubble        : config.hasOwnProperty('bubble') ? config.bubble : opts.hasOwnProperty('bubble') ? opts.bubble : true,
            delegate      : config.delegate,
            eventName,
            fn,
            id            : listenerId,
            mounted       : !config.local && globalDomEvents.includes(eventName),
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
                            delegate      : domListener.delegate || value.delegate || '#' + component.id,
                            eventName     : key,
                            id            : component.id,
                            opts          : value,
                            originalConfig: domListener,
                            ownerId       : component.id,
                            priority      : domListener.priority || value.priority || 1,
                            scope         : domListener.scope    || component,
                            vnodeId       : domListener.vnodeId  || value.vnodeId  || component.id
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
     * @param {Object} listener
     * @param {Array} path
     * @returns {Boolean|String} true in case the delegation string matches the event path
     */
    verifyDelegationPath(listener, path) {
        let {delegate} = listener,
            j          = 0,
            pathLen    = path.length,
            targetId;

        if (typeof delegate === 'function') {
            j = delegate(path);

            if (j != null) {
                targetId = path[j].id
            }
        }
        else {
            let delegationArray = delegate.split(' '),
                len             = delegationArray.length,
                hasMatch, i, item, isId;

            for (i=len-1; i >= 0; i--) {
                hasMatch = false;
                item     = delegationArray[i];
                isId     = item.startsWith('#');

                if (isId || item.startsWith('.')) {
                    item = item.substr(1)
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

        // ensure the delegation path is a child of the owner components root node
        for (; j < pathLen; j++) {
            if (path[j].id === listener.vnodeId) {
                return targetId
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
            delegationVdom = VDomUtil.findVdomChild(component.vdom, delegationTargetId);

            // delegationVdom can be undefined when dragging a proxy over the node.
            // see issues/1137 for details.
            if (!delegationVdom || delegationVdom.vdom && VDomUtil.findVdomChild(delegationVdom.vdom, targetId)) {
                return false
            }
        }

        return true
    }
}

export default Neo.setupClass(DomEvent);
