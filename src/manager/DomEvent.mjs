import Base             from '../core/Base.mjs';
import ComponentManager from './Component.mjs';
import FocusManager     from './Focus.mjs';
import Logger           from '../core/Logger.mjs';
import NeoArray         from '../util/Array.mjs';
import VDomUtil         from '../util/VDom.mjs';

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
    'drag:end',
    'drag:move',
    'drag:start',
    'focusin',
    'focusout',
    'input',
    'keydown',
    'keyup',
    'mouseenter',
    'mouseleave',
    'wheel'
];

/**
 * @class Neo.manager.DomEvent
 * @extends Neo.core.Base
 * @singleton
 */
class DomEvent extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.manager.DomEvent'
         * @protected
         */
        className: 'Neo.manager.DomEvent',
        /**
         * @member {String} ntype='dom-event-manager'
         * @protected
         */
        ntype: 'dom-event-manager',
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
    }}

    /**
     *
     * @param {Object} event
     * @protected
     */
    fire(event) {
        let me         = this,
            bubble     = true,
            data       = event.data || {},
            eventName  = event.eventName,
            i          = 0,
            listeners  = null,
            pathIds    = data.path.map(e => e.id),
            path       = ComponentManager.getParentPath(pathIds),
            len        = path.length,
            component, delegationTargetId, id, preventFire;

        for (; i < len; i++) {
            id        = path[i];
            component = Neo.getComponent(id);

            if (!component || component.disabled) {
                break;
            }

            listeners = me.items[id] && me.items[id][eventName];

            if (listeners) {
                // console.log('fire', eventName, data, listeners, path);

                if (Array.isArray(listeners)) {
                    listeners.forEach(listener => {
                        if (listener && listener.fn) {
                            delegationTargetId = me.verifyDelegationPath(listener, data.path);

                            if (delegationTargetId !== false) {
                                preventFire = false;

                                // we only want mouseenter & leave to fire on their top level nodes, not for children
                                if (eventName === 'mouseenter' || eventName === 'mouseleave') {
                                    preventFire = !DomEvent.verifyMouseEnterLeave(component, data, delegationTargetId, eventName);
                                }

                                if (!preventFire) {
                                    // console.log(Neo.get(id));
                                    data.component = component;
                                    listener.fn.apply(listener.scope || self, [data]);

                                    if (!listener.bubble) {
                                        bubble = false;
                                    }
                                }
                            }
                        }
                    });
                }
            }

            // we do want to trigger the FocusManager after normal domListeners on these events got executed
            if (eventName === 'focusin' || eventName === 'focusout') {
                FocusManager['on' + Neo.capitalize(eventName)]({
                    componentPath: path,
                    data         : data
                });

                break;
            }

            if (!bubble) {
                break;
            }
        }

        if (eventName.startsWith('drop')) {
            let dragZone = data.dragZoneId && Neo.get(data.dragZoneId);

            if (dragZone) {
                dragZone.fire(eventName, data);
                dragZone[{
                    'drop'      : 'onDrop',
                    'drop:enter': 'onDropEnter',
                    'drop:leave': 'onDropLeave',
                }[eventName]].call(dragZone, data);
            }
        }
    }

    /**
     *
     * @param config
     * @param scope
     * @returns {Object}
     */
    generateListenerConfig(config, scope) {
        return {
            delegate : config.delegate,
            eventName: config.eventName,
            id       : scope.id,
            opts     : config,
            scope    : config.scope   || scope,
            vnodeId  : config.vnodeId || scope.id
        };
    }

    getEventName(config) {
        let eventName = null;

        if (Neo.isObject(config)) {
            Object.keys(config).forEach(key => {
                if (!eventConfigKeys.includes(key)) {
                    eventName = key;
                }
            });
        }

        return eventName;
    }

    /**
     * @param {Object} config
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

        if (listeners && listeners[config.id]) {
            event = listeners[config.id][config.eventName];

            if (event) {
                console.log(event);
            }
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

                    if (eventName && (event.local || !globalDomEvents.includes(eventName))) {
                        // console.log('localEvents', eventName);

                        localEvents.push({
                            name   : eventName,
                            handler: 'domEventListener',
                            vnodeId: event.vnodeId
                        });
                    }
                });
            });

            if (localEvents.length > 0) {
                Neo.worker.App.promiseMessage('main', {
                    action : 'addDomListener',
                    appName: component.appName,
                    events : localEvents
                }).then(data => {
                    // console.log('added domListener', data);
                }).catch(err => {
                    console.log('App: Got error attempting to add a domListener', err);
                });
            }
        }
    }

    /**
     * @param {Object} config
     * @param {String} config.delegate
     * @param {String} config.eventName
     * @param {String} config.id
     * @param {Boolean} config.local
     * @param {Number} config.opts
     * @param {Number} config.originalConfig
     * @param {String} config.ownerId
     * @param {Number} config.priority
     * @param {Object} config.scope
     * @param {String} config.vnodeId
     * @returns {Boolean} true if the listener got registered successfully (false in case it was already there)
     */
    register(config) {
        let alreadyRegistered = false,
            eventName         = config.eventName,
            id                = config.id,
            listeners         = this.items,
            opts              = config.opts,
            scope             = config.scope,
            fnType            = typeof opts,
            fn, listener, listenerConfig, listenerId;

        if (fnType === 'function' || fnType === 'string') {
            fn = opts;
        } else {
            fn    = opts.fn;
            scope = opts.scope || scope;
        }

        if (!listeners[id]) {
            listeners[id] = {};
        }

        if (listeners[id][eventName]) {
            listener = listeners[id][eventName];

            Object.keys(listener).forEach(key => {
                if (
                    listener[key].fn.toString() === fn.toString() && // todo: add a better check
                    listener[key].scope         === scope &&
                    listener[key].delegate      === config.delegate
                ) {
                    alreadyRegistered = true;
                }
            });
        } else {
            listeners[id][eventName] = [];
        }

        if (alreadyRegistered === true) {
            return false;
        }

        // console.log('manager.DomEvent register', eventName, config);

        listenerId = Neo.getId('dom-event');

        config.listenerId = listenerId;

        listenerConfig = {
            bubble        : config.hasOwnProperty('bubble') ? config.bubble : opts.hasOwnProperty('bubble') ? opts.bubble : true,
            delegate      : config.delegate,
            eventName     : eventName,
            fn            : fn,
            id            : listenerId,
            mounted       : !config.local && globalDomEvents.includes(eventName),
            originalConfig: config.originalConfig,
            ownerId       : config.ownerId,
            priority      : config.priority || 1,
            scope         : scope,
            vnodeId       : config.vnodeId
        };

        this.map[listenerId] = listenerConfig;

        listeners[id][eventName].push(listenerConfig);

        listeners[id][eventName].sort((a, b) => a.priority > b.priority);

        // console.log(this.map);

        return true;
    }

    /**
     * @param {Object} config
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
            console.log('listener found', listener);
        }
    }

    /**
     *
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
                                break;
                            }
                        }
                    }
                });
            }

            // add new listeners
            domListeners.forEach(domListener => {
                Object.entries(domListener).forEach(([key, value]) => {
                    if (!eventConfigKeys.includes(key)) {
                        me.register({
                            delegate      : value.delegate || domListener.delegate || '#' + component.id,
                            eventName     : key,
                            id            : component.id,
                            opts          : value,
                            originalConfig: domListener,
                            ownerId       : component.id,
                            scope         : domListener.scope || component,
                            vnodeId       : value.vnodeId || component.id
                        });
                    }
                });
            });

            if (component.mounted) {
                me.mountDomListeners(component);
            }
        } else {
            Logger.logError('Component.domListeners have to be an array', component);
        }
    }

    /**
     * Intended for Neo.controller.Component to replace listener placeholders provided as a string
     * @param {Object} config
     * @param {String} config.componentId
     * @param {Function} config.eventHandlerMethod
     * @param {String} config.eventHandlerName
     * @param {String} config.eventName
     * @param {Neo.core.Base} config.scope
     */
    updateListenerPlaceholder(config) {
        let me             = this,
            items          = me.items[config.componentId] || {},
            eventListeners = items[config.eventName] || [],
            i              = 0,
            len            = eventListeners.length,
            listener;

        for (; i < len; i++) {
            listener = eventListeners[i];

            if (listener.fn === config.eventHandlerName) {
                listener.fn    = config.eventHandlerMethod;
                listener.scope = config.scope;
                break;
            }
        }
    }

    /**
     *
     * @param {Object} listener
     * @param {Array} path
     * @returns {Boolean|String} true in case the delegation string matches the event path
     */
    verifyDelegationPath(listener, path) {
        let delegationArray = listener.delegate.split(' '),
            j               = 0,
            len             = delegationArray.length,
            pathLen         = path.length,
            hasMatch, i, item, isId, targetId;

        for (i=len-1; i >= 0; i--) {
            hasMatch = false;
            item     = delegationArray[i];
            isId     = item.startsWith('#');

            if (isId || item.startsWith('.')) {
                item = item.substr(1);
            }

            for (; j < pathLen; j++) {
                if (
                    (isId && path[j].id === item) ||
                    path[j].cls.includes(item)
                ) {
                    hasMatch = true;
                    targetId = path[j].id;
                    break;
                }
            }

            if (!hasMatch) {
                return false;
            }
        }

        // ensure the delegation path is a child of the owner components root node
        for (; j < pathLen; j++) {
            if (path[j].id === listener.vnodeId) {
                return targetId;
            }
        }

        return false;
    }

    /**
     *
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
                return false;
            }
        }

        return true;
    }
}

Neo.applyClassConfig(DomEvent);

let instance = Neo.create(DomEvent);

Neo.applyToGlobalNs(instance);

export default instance;