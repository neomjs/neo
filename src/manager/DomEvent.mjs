import Base             from '../core/Base.mjs';
import ComponentManager from './Component.mjs';
import FocusManager     from './Focus.mjs';
import Logger           from '../util/Logger.mjs';
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
    mousemove  : 'onMouseMove',
    mouseup    : 'onMouseUp',
    scroll     : 'onScroll',
    wheel      : 'onWheel'
};

const gestureEvents = new Set([
    'tap', 'swipe',
    'press:start', 'press:end', 'press:cancel',
    'pan:start', 'pan:move', 'pan:end', 'pan:cancel',
    'pinch:start', 'pinch:move', 'pinch:end', 'pinch:cancel',
    'rotate:start', 'rotate:move', 'rotate:end', 'rotate:cancel'
]);

const maxPressHoldMs = 2_147_483_647;

const globalDomEvents = [
    'change',
    'click',
    'contextmenu',
    'dblclick',
    'drag:cancel',
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
    'touchcancel',
    'touchend',
    'touchmove',
    'touchstart',
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
     * Per-event index of component owner IDs with at least one `vnodeId: 'document.body'` listener.
     * Lets `fire()` skip the document-level pass in O(1) when empty instead of scanning `items`.
     * @member {Map<String, Set<String>>} bodyListenerOwners=new Map()
     * @protected
     */
    bodyListenerOwners = new Map()
    /**
     * @member {Object} mountTimeouts={}
     * @private
     */
    mountTimeouts = {}

    /**
     * The desired and acknowledged Main registrations for each mounted component and window.
     * @member {Map} #gestureRegistrations
     * @private
     */
    #gestureRegistrations = new Map()
    /** @member {Number} #nextGestureRegistrationId=0 */
    #nextGestureRegistrationId = 0

    /**
     * Registers a native ResizeObserver for a specific component listener.
     *
     * **Architectural Note on Delegation:**
     * Unlike standard DOM events (click, mouseenter) which support full CSS-selector delegation
     * (e.g., `delegate: '.my-class'`), `resize` event delegation is strictly limited to exact Node IDs
     * (e.g., `delegate: '#my-id'`).
     *
     * **The Intent:**
     * A native `ResizeObserver` must be attached to a specific, existing physical DOM node. If we allowed
     * CSS selectors, the manager would have to recursively scan the DOM on every mutation to find new
     * matching nodes and dynamically attach/detach observers. For highly permutable DOM structures
     * (like virtualized grids or dynamic lists), this continuous polling and observer thrashing
     * would destroy performance. Therefore, observing dynamic children requires manual iteration
     * and explicit ID registration by the parent component.
     *
     * @param {Neo.component.Base} component
     * @param {Object} event
     */
    async addResizeObserver(component, event) {
        let {windowId}     = component,
            targetId       = component.id,
            ResizeObserver = await Neo.currentWorker.getAddon('ResizeObserver', windowId);

        // ResizeObservers need to get registered to a specific target id
        if (event.delegate?.startsWith('#')) {
            targetId = event.delegate.substring(1)
        }

        ResizeObserver.register({componentId: component.id, id: targetId, windowId})
    }

    /**
     * Iterates the event path to find matching listeners on components.
     * It utilizes `ComponentManager.getParentPath()` to construct a logical component path,
     * ensuring events bubble to logical ancestors (like a Dashboard owning a DragProxy)
     * even if they are not physical ancestors in the DOM.
     *
     * @param {Object} event
     * @param {String} event.windowId Originating document from the Main-to-App message envelope
     * @protected
     */
    fire(event) {
        let me          = this,
            bubble      = true,
            data        = event.data || {},
            {eventName} = event;

        if (data.gestureOwner) {
            me.fireGesture(eventName, data, event.windowId);
            return
        }

        // Bypass standard bubbling for explicitly mapped resize events from the Main Thread registry
        if (eventName === 'resize' && Array.isArray(data.componentIds)) {
            data.componentIds.forEach(cmpId => {
                let component = Neo.getComponent(cmpId),
                    listeners = me.items[cmpId]?.[eventName];

                if (component && listeners) {
                    listeners.forEach(listener => {
                        let eventData = Neo.clone(data, true, true);
                        eventData.component = component;
                        eventData.currentTarget = data.id;

                        if (Neo.isString(listener.fn)) {
                            me.bindCallback(listener.fn, 'fn', listener.scope, listener)
                        }
                        listener.fn.apply(listener.scope || globalThis, [eventData]);
                    });
                }
            });
            return
        }

        let i           = 0,
            listeners   = null,
            pathIds     = data.path ? data.path.map(e => e.id) : [],
            path        = ComponentManager.getParentPath(pathIds),
            len         = path.length,
            component, id;

        for (; i < len; i++) {
            id        = path[i];
            component = Neo.getComponent(id);

            if (!component || (eventName !== 'resize' && component.disabled)) {
                break
            }

            if (eventName === 'scroll') {
                if (component.saveScrollPosition && typeof component.onScrollCapture === 'function') {
                    component.onScrollCapture(data)
                }
            }

            listeners = me.items[id]?.[eventName];

            if (listeners) {
                bubble = me.invokeListeners(component, listeners, data, path, eventName)
            }

            // we do want to trigger the FocusManager after normal domListeners on these events got executed
            if (eventName === 'focusin' || eventName === 'focusout') {
                FocusManager['on' + Neo.capitalize(eventName)]({
                    componentPath: path,
                    data,
                    windowId     : event.windowId
                });

                break
            }

            // Honor the Event cancelBubble property
            if (!bubble || data.cancelBubble) {
                break
            }
        }

        // Listeners registered with `vnodeId: 'document.body'` observe global events reaching `<body>` even when the
        // target sits outside their component subtree (e.g. `document.body` itself or a sibling toolbar). Components
        // already visited in `path` were invoked during the loop above and are skipped here to prevent double-firing.
        const bodyOwners = me.bodyListenerOwners.get(eventName);

        if (
            bodyOwners?.size > 0 &&
            bubble &&
            !data.cancelBubble &&
            data.path?.some(node => node.tagName === 'body' || node.id === 'document.body')
        ) {
            const pathSet = path.length > 0 ? new Set(path) : null;

            for (const cmpId of bodyOwners) {
                if (pathSet?.has(cmpId)) {
                    continue
                }

                const eventListeners = me.items[cmpId]?.[eventName];

                if (!eventListeners) {
                    continue
                }

                component = Neo.getComponent(cmpId);

                if (
                    !component ||
                    component.isDestroyed ||
                    (eventName !== 'resize' && component.disabled) ||
                    (event.windowId && component.windowId && component.windowId !== event.windowId)
                ) {
                    continue
                }

                bubble = me.invokeListeners(
                    component,
                    eventListeners,
                    data,
                    path,
                    eventName,
                    listener => listener.vnodeId === 'document.body'
                );

                if (!bubble || data.cancelBubble) {
                    break
                }
            }
        }

        if (eventName === 'contextmenu' && data.ctrlKey) {
            Neo.util?.Logger?.onContextMenu(data)
        } else if (eventName.startsWith('drag:') || eventName.startsWith('drop')) {
            let dragZone = data.dragZoneId && Neo.get(data.dragZoneId);

            if (dragZone) {
                if (eventName.startsWith('drag:')) {
                    dragZone[{
                        'drag:cancel': 'onDragCancel',
                        'drag:end'   : 'onDragEnd',
                        'drag:move'  : 'onDragMove'
                    }[eventName]]?.(data)
                } else {
                    dragZone.fire(eventName, data);
                    dragZone[{
                        'drop'      : 'onDrop',
                        'drop:enter': 'onDropEnter',
                        'drop:leave': 'onDropLeave',
                    }[eventName]].call(dragZone, data)
                }
            } else if (eventName === 'drag:cancel' && data.crossWindow) {
                // Escape in a window that owns no gesture: a cross-window drag may belong to another one
                Neo.manager.DragCoordinator?.cancelCrossWindowGesture({windowId: event.windowId})
            }
        }
    }

    /**
     * @summary Validates the single Main owner before delivering a semantic phase to App listeners.
     * @param {String} eventName
     * @param {Object} data
     * @param {String} windowId
     * @protected
     */
    fireGesture(eventName, data, windowId) {
        const {componentId, id, registrationId} = data.gestureOwner,
              state                             = this.#gestureRegistrations.get(JSON.stringify([componentId, windowId])),
              entry                             = state?.desired.get(id),
              {gestureId, phase}                = data;

        if (!gestureEvents.has(eventName) || !entry || entry.registrationId !== registrationId) {
            return
        }

        const {active, component} = state;
        let   delivery            = active.get(gestureId),
            isLive;

        if (phase === 'start') {
            if (delivery || component.disabled) {
                return
            }

            delivery = {data, eventName, recipients: new Set()};
            active.set(gestureId, delivery)
        } else if (phase) {
            if (!delivery) {
                return
            }

            if (phase === 'end' || phase === 'cancel') {
                active.delete(gestureId)
            } else {
                Object.assign(delivery, {data, eventName})
            }
        }

        if (phase === 'start' || phase === 'move') {
            isLive = () => active.get(gestureId) === delivery
        }

        try {
            this.invokeGestureListeners(component, eventName, data, delivery, isLive)
        } finally {
            if (phase === 'start') {
                delivery.recipients = null
            }
        }
    }

    /**
     * @summary Starts at the recognition owner and preserves logical delegation and bubbling.
     * @param {Neo.component.Base} component
     * @param {String} eventName
     * @param {Object} data
     * @param {Object} [delivery]
     * @param {Function} [isLive] Rechecked after each callback that can revoke the owner.
     * @protected
     */
    invokeGestureListeners(component, eventName, data, delivery, isLive) {
        if (component.isDestroyed) {
            return
        }

        const path       = ComponentManager.getParentPath(data.path.map(node => node.id)),
              ownerIndex = path.indexOf(component.id),
              owners     = ownerIndex === -1 ? [component.id, ...ComponentManager.getParentPath([component.id]).slice(1)] : path.slice(ownerIndex);

        for (const componentId of owners) {
            if (isLive?.() === false) {
                break
            }

            // Synchronous release inside start only cancels recipients reached so far.
            if (data.phase === 'cancel' && delivery?.recipients && !delivery.recipients.has(componentId)) {
                continue
            }

            const isOwner = componentId === component.id,
                  target  = isOwner ? component : Neo.getComponent(componentId);

            if (!target || (target.disabled && data.phase !== 'cancel')) {
                break
            }

            if (data.phase === 'start') {
                delivery.recipients.add(componentId)
            }

            const predicate = listener => {
                const filters = eventName === 'tap' ? listener.gestureOptions : undefined;

                return isLive?.() !== false && (!isOwner || listener.vnodeId === data.gestureOwner.id) && !filters?.invalid &&
                    (filters?.count === undefined || filters.count === data.count) &&
                    (filters?.contactCount === undefined || filters.contactCount === data.contactCount)
            };

            if (!this.invokeListeners(target, this.items[componentId]?.[eventName], data, path, eventName, predicate) || data.cancelBubble) {
                break
            }
        }
    }

    /**
     * @summary Cancels open gestures when their App registration or the owning window disappears.
     * @param {Object} state
     * @param {Map} desired
     * @protected
     */
    cancelReleasedGestures(state, desired) {
        for (const [gestureId, delivery] of state.active) {
            const {data, eventName}    = delivery,
                  {id, registrationId} = data.gestureOwner,
                  entry                = desired.get(id),
                  family               = eventName.split(':')[0];

            if (entry?.registrationId !== registrationId || ![...entry.events].some(name => name.startsWith(`${family}:`))) {
                const type = `${family}:cancel`;

                state.active.delete(gestureId);

                try {
                    this.invokeGestureListeners(state.component, type, {
                        ...data,
                        cancelBubble: false,
                        changed     : data.contacts.map(contact => contact.id),
                        contacts    : [],
                        phase       : 'cancel',
                        type
                    }, delivery)
                } catch (error) {
                    console.error('DomEvent: Gesture cancellation listener failed', error)
                }
            }
        }
    }

    /**
     * @summary Ends App-side gesture state when Main can no longer deliver a window's terminal phase.
     * @param {String} windowId
     */
    releaseWindowGestures(windowId) {
        for (const [key, state] of this.#gestureRegistrations) {
            if (state.windowId === windowId) {
                state.desired = new Map();
                this.#gestureRegistrations.delete(key);
                this.cancelReleasedGestures(state, state.desired)
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
     * @summary Invokes matching listeners for a component against the serialized DOM path and returns updated bubble state.
     * @param {Neo.component.Base} component
     * @param {Object[]} listeners
     * @param {Object} data
     * @param {String[]} path
     * @param {String} eventName
     * @param {Function} [predicate]
     * @returns {Boolean} false if a matching listener specified `bubble: false`
     * @protected
     */
    invokeListeners(component, listeners, data, path, eventName, predicate) {
        let bubble = true,
            delegationTargetId, preventFire;

        if (!Array.isArray(listeners)) {
            return bubble
        }

        // Stop iteration if a handler returns false
        listeners.every(listener => {
            let result;

            if (listener?.fn && (!predicate || predicate(listener))) {
                delegationTargetId = this.verifyDelegationPath(listener, data.path, path);

                if (delegationTargetId !== false) {
                    preventFire = false;

                    // we only want mouseenter & leave to fire on their top level nodes, not for children
                    if (eventName === 'mouseenter' || eventName === 'mouseleave') {
                        preventFire = !DomEvent.verifyMouseEnterLeave(component, data, delegationTargetId, eventName)
                    }

                    if (!preventFire) {
                        // multiple listeners would change the reference of data.component
                        const eventData = Neo.clone(data, true, true);

                        eventData.component = component;

                        // Handler needs to know which actual target matched the delegate
                        eventData.currentTarget = delegationTargetId;

                        if (Neo.isString(listener.fn)) {
                            this.bindCallback(listener.fn, 'fn', listener.scope, listener)
                        }

                        result = listener.fn.apply(listener.scope || globalThis, [eventData]);

                        if (eventData.cancelBubble) {
                            data.cancelBubble = true
                        }

                        if (listener.bubble === false) {
                            bubble = false
                        }
                    }
                }
            }

            // If a listener returns false, we stop iterating the listeners
            return result !== false
        });

        return bubble
    }

    /**
     * @summary Matches a bracketed attribute selector (`[attr=value]` or `[attr]`) against a serialized DOM path node.
     * Supports `data-*` (`node.data`), `aria-*` (`node.aria`), `role` (`node.role`), and `tabindex` (`node.tabIndex`).
     * @param {Object} node     Serialized event path node from `Neo.main.DomEvents#getTargetData`
     * @param {String} selector Bracketed attribute selector, e.g. `'[data-ref=foo]'` or `'[role=button]'`
     * @returns {Boolean}
     */
    matchesAttributeTarget(node, selector) {
        let content  = selector.slice(1, -1).trim(),
            eqIndex  = content.indexOf('='),
            hasValue = eqIndex !== -1,
            attrName = (hasValue ? content.slice(0, eqIndex) : content).trim(),
            expected = hasValue ? content.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '') : null,
            actual, camelKey, rawKey;

        if (!attrName || !node) {
            return false
        }

        if (attrName.startsWith('data-')) {
            rawKey   = attrName.substring(5);
            camelKey = Neo.camel(rawKey);
            actual   = node.data?.[camelKey] ?? node.data?.[rawKey] ?? node.data?.[attrName]
        } else if (attrName.startsWith('aria-')) {
            rawKey   = attrName.substring(5);
            camelKey = Neo.camel(rawKey);
            actual   = node.aria?.[rawKey] ?? node.aria?.[camelKey] ?? node.aria?.[attrName]
        } else if (attrName === 'role') {
            actual = node.role
        } else if (attrName === 'tabindex') {
            actual = node.tabIndex
        } else {
            return false
        }

        if (hasValue) {
            return actual !== undefined && actual !== null && String(actual) === expected
        }

        return actual !== undefined && actual !== null
    }

    /**
     * Mounts local domEvent listeners for a given component
     *
     * Every caller reaches this after a delay — `updateDomListeners()` defers 50ms, `mixin.DomEvents`
     * 150ms — so the window can close between the decision to mount and this. `component.mounted`
     * cannot report that: the App Worker's model outlives its window's port and stays `true`. The
     * check therefore belongs HERE, at the single point both schedulers funnel through, rather than
     * at each of them; a third scheduler inherits it instead of having to remember it.
     *
     * Failing toward mounting is deliberate. A worker without the predicate behaves exactly as it did
     * before this guard existed — absence must never silently skip a mount, which is the opposite
     * direction from a release guard, where absence must never skip the release.
     *
     * @param {Neo.component.Base} component
     * @protected
     */
    mountDomListeners(component) {
        let me          = this,
            listeners   = me.items[component.id],
            localEvents = [];

        if (Neo.currentWorker?.isWindowDeparted?.(component.windowId)) {
            return
        }

        if (listeners) {
            if (component.mounted && !component.isDestroying && !component.isDestroyed) {
                me.syncGestureRegistrations(component, listeners, true)
            }

            Object.entries(listeners).forEach(([eventName, value]) => {
                value.forEach(event => {
                    eventName = event.eventName;

                    if (eventName === 'resize') {
                        me.addResizeObserver(component, event)
                    } else if (eventName && !gestureEvents.has(eventName) && !event.mounted && (event.local || !globalDomEvents.includes(eventName))) {
                        event.mounted = true;

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
     * @summary Normalizes tap filters and press policy independently of callback identity.
     * Main supplies press defaults. Only an omitted tap filter acts as a wildcard.
     * @param {String} eventName
     * @param {Object|Function|String} opts
     * @returns {Object|undefined}
     * @protected
     */
    normalizeGestureOptions(eventName, opts) {
        if (Neo.isObject(opts)) {
            if (eventName === 'tap') {
                const {count, contactCount} = opts;

                if ((count !== undefined && (!Number.isSafeInteger(count) || count <= 0)) ||
                    (contactCount !== undefined && (!Number.isSafeInteger(contactCount) || contactCount <= 0))) {
                    return {invalid: true}
                }

                if (count !== undefined || contactCount !== undefined) {
                    return {count, contactCount}
                }
            } else if (eventName === 'press:start') {
                const {holdMs, moveTolerance} = opts,
                      hasHold                 = Number.isFinite(holdMs) && holdMs > 0 && holdMs <= maxPressHoldMs,
                      hasMoveTolerance        = Number.isFinite(moveTolerance) && moveTolerance >= 0;

                if (hasHold || hasMoveTolerance) {
                    return {
                        ...(hasHold && {holdMs}),
                        ...(hasMoveTolerance && {moveTolerance})
                    }
                }
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

        const
            optionedGesture = eventName === 'tap' || eventName === 'press:start',
            gestureOptions  = optionedGesture ? me.normalizeGestureOptions(eventName, opts) : undefined,
            vnodeId         = config.vnodeId || (Neo.isObject(opts) && opts.vnodeId) || config.id,
            delegate        = config.delegate || (Neo.isObject(opts) && opts.delegate) || (vnodeId === 'document.body' ? DomEvent.documentBodyDelegate : '#' + config.id),
            priority        = config.priority || (Neo.isObject(opts) && opts.priority) || 1;

        if (!listeners[id]) {
            listeners[id] = {}
        }

        if (listeners[id][eventName]) {
            listener = listeners[id][eventName];

            alreadyRegistered = listener.some(entry =>
                entry.fn.toString() === fn.toString() && // todo: add a better check
                entry.scope         === scope &&
                (optionedGesture
                    ? entry.delegate === delegate && entry.vnodeId === vnodeId &&
                      (eventName !== 'press:start' || entry.priority === priority) &&
                      Neo.isEqual(entry.gestureOptions, gestureOptions)
                    : entry.delegate === config.delegate)
            )
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
            bubble        : Object.hasOwn(config, 'bubble') ? config.bubble : (Neo.isObject(opts) && Object.hasOwn(opts, 'bubble')) ? opts.bubble : true,
            delegate,
            eventName,
            fn,
            id            : listenerId,
            local,
            mounted       : !local && globalDomEvents.includes(eventName),
            originalConfig: config.originalConfig,
            ownerId       : config.ownerId,
            priority,
            scope,
            vnodeId,
            ...(gestureOptions && {gestureOptions})
        };

        me.map[listenerId] = listenerConfig;

        listeners[id][eventName].push(listenerConfig);

        listeners[id][eventName].sort((a, b) => b.priority - a.priority);

        if (listenerConfig.vnodeId === 'document.body') {
            let owners = me.bodyListenerOwners.get(eventName);

            if (!owners) {
                owners = new Set();
                me.bodyListenerOwners.set(eventName, owners)
            }

            owners.add(id)
        }

        return true
    }

    /**
     * Resets the mounted flag for local domEvent listeners
     * @param {Neo.component.Base} component
     * @protected
     */
    resetMountedDomListeners(component) {
        let me        = this,
            listeners = me.items[component.id];

        me.syncGestureRegistrations(component);

        if (listeners) {
            Object.entries(listeners).forEach(([eventName, value]) => {
                value.forEach(event => {
                    eventName = event.eventName;

                    if (eventName !== 'resize' && eventName && (event.local || !globalDomEvents.includes(eventName))) {
                        event.mounted = false
                    }
                })
            })
        }
    }

    /**
     * @summary Removes a matching DOM event listener from `items`, `map`, and `bodyListenerOwners`.
     * @param {Object} config
     * @param {String} [config.delegate]
     * @param {String} [config.eventName]
     * @param {Function|String} [config.fn]
     * @param {String} [config.id]
     * @param {String} [config.listenerId]
     * @param {Function|Object|String} [config.opts]
     * @param {Object} [config.originalConfig]
     * @param {String} [config.ownerId]
     * @param {Object} [config.scope]
     * @param {String} [config.vnodeId]
     * @param {Object} [scope]
     * @returns {Boolean} true in case the listener did exist and got removed
     */
    unregister(config, scope) {
        if (!Neo.isObject(config)) {
            return false
        }

        let me          = this,
            eventName   = config.eventName || me.getEventName(config),
            ownerId     = config.ownerId || scope?.id || config.id,
            listeners   = ownerId && eventName ? me.items[ownerId]?.[eventName] : null,
            opts        = config.opts ?? (eventName ? config[eventName] : undefined),
            fn          = typeof opts === 'function' || typeof opts === 'string' ? opts : opts?.fn ?? config.fn,
            targetScope = (Neo.isObject(opts) && opts.scope) || config.scope || scope,
            vnodeId     = config.vnodeId || (Neo.isObject(opts) && opts.vnodeId),
            delegate    = config.delegate || (Neo.isObject(opts) && opts.delegate),
            index;

        if (!Array.isArray(listeners) || listeners.length === 0) {
            return false
        }

        index = listeners.findIndex(listener => {
            if (config.listenerId) {
                return listener.id === config.listenerId
            }

            if (config.originalConfig) {
                return listener.originalConfig === config.originalConfig
            }

            return (!fn || listener.fn === fn || listener.fn?.toString() === fn?.toString()) &&
                   (!targetScope || listener.scope === targetScope) &&
                   (!vnodeId || listener.vnodeId === vnodeId) &&
                   (!delegate || listener.delegate === delegate)
        });

        if (index === -1) {
            return false
        }

        const [removed] = listeners.splice(index, 1);

        delete me.map[removed.id];

        if (removed.vnodeId === 'document.body' && !listeners.some(item => item.vnodeId === 'document.body')) {
            const owners = me.bodyListenerOwners.get(eventName);

            if (owners) {
                owners.delete(ownerId);

                if (owners.size === 0) {
                    me.bodyListenerOwners.delete(eventName)
                }
            }
        }

        return true
    }

    /**
     * @param {Neo.component.Base} component
     * @param {Object[]} domListeners
     * @param {Object[]} oldDomListeners
     */
    updateDomListeners(component, domListeners, oldDomListeners) {
        let me = this;

        if (Array.isArray(domListeners)) {
            if (Array.isArray(oldDomListeners)) {
                oldDomListeners.forEach(oldDomListener => {
                    // find & remove no longer existing listeners
                    if (!domListeners.includes(oldDomListener)) {
                        Object.keys(oldDomListener).forEach(key => {
                            if (!eventConfigKeys.includes(key)) {
                                me.unregister({
                                    eventName     : key,
                                    originalConfig: oldDomListener,
                                    ownerId       : component.id
                                })
                            }
                        })
                    }
                })
            }

            // add new listeners
            domListeners.forEach(domListener => {
                Object.entries(domListener).forEach(([key, value]) => {
                    if (!eventConfigKeys.includes(key)) {
                        const vnodeId = domListener.vnodeId || value.vnodeId || component.vdom?.id || component.id;

                        me.register({
                            bubble        : Object.hasOwn(domListener, 'bubble') ? domListener.bubble : (value && Object.hasOwn(value, 'bubble')) ? value.bubble : true,
                            delegate      : domListener.delegate || value.delegate || (vnodeId === 'document.body' ? DomEvent.documentBodyDelegate : '#' + (component.vdom.id || component.id)),
                            eventName     : key,
                            id            : component.vdom.id || component.id, // honor wrapper nodes
                            opts          : value,
                            originalConfig: domListener,
                            ownerId       : component.id,
                            priority      : domListener.priority || value.priority || 1,
                            scope         : domListener.scope    || component,
                            vnodeId
                        })
                    }
                })
            });

            me.syncGestureRegistrations(component, me.items[component.id]);

            if (component.mounted && domListeners?.length > 0) {
                if (me.mountTimeouts[component.id]) {
                    clearTimeout(me.mountTimeouts[component.id])
                }

                me.mountTimeouts[component.id] = setTimeout(() => {
                    // Freed before the work, not after: the slot describes a PENDING mount, and a
                    // mount that declines to run still ends the pending state.
                    delete me.mountTimeouts[component.id];

                    me.mountDomListeners(component)
                }, 50)
            }
        } else {
            Logger.logError('Component.domListeners have to be an array', component)
        }
    }

    /**
     * @summary Reconciles gesture phase listeners with one registration per component and DOM node.
     * Removal takes effect on the current registrations immediately. Adding a node or phase waits for
     * the normal DOM mount path. A changed press policy retires the current registration.
     * @param {Neo.component.Base} component
     * @param {Object} [listeners] Omit to release the component's registrations.
     * @param {Boolean} [mount=false] Allow new registrations on the DOM mount path.
     * @protected
     */
    syncGestureRegistrations(component, listeners, mount=false) {
        const {id: componentId, windowId} = component,
              key                         = JSON.stringify([componentId, windowId]),
              previous                    = this.#gestureRegistrations.get(key),
              replacing                   = previous && previous.component !== component,
              desired                     = new Map();

        if (replacing && !mount) {
            return
        }

        if (listeners && (mount || previous)) {
            for (const [eventName, handlers] of Object.entries(listeners)) {
                if (!gestureEvents.has(eventName)) {
                    continue
                }

                for (const {gestureOptions, vnodeId} of handlers) {
                    if (mount || previous.desired.get(vnodeId)?.events.has(eventName)) {
                        let entry = desired.get(vnodeId);

                        if (!entry) {
                            entry = {events: new Set()};
                            desired.set(vnodeId, entry)
                        }

                        // Handlers are sorted by priority. The first press:start on this node owns the policy.
                        if (eventName === 'press:start' && !entry.events.has(eventName)) {
                            entry.pressOptions = gestureOptions
                        }

                        entry.events.add(eventName)
                    }
                }
            }
        }

        for (const [vnodeId, entry] of desired) {
            const prior = previous?.desired.get(vnodeId);

            entry.registrationId = !replacing && prior && Neo.isEqual(prior.pressOptions, entry.pressOptions)
                ? prior.registrationId
                : ++this.#nextGestureRegistrationId
        }

        if (!previous && desired.size === 0) {
            return
        }

        const state = previous ?? {active: new Map(), applied: new Map(), component, componentId, windowId};

        state.desired = desired;
        this.#gestureRegistrations.set(key, state);
        this.cancelReleasedGestures(state, desired);
        state.component = component;

        state.flight ??= this.flushGestureRegistrations(key, state)
    }

    /**
     * @summary Serializes registration and release across async addon loading and component remounts.
     * @param {String} key
     * @param {Object} state
     * @protected
     */
    async flushGestureRegistrations(key, state) {
        const {applied, componentId, windowId} = state,
              worker                           = Neo.currentWorker;

        // A listener can disappear before the lazy import starts or while it is pending.
        await Promise.resolve();

        try {
            let desired;

            do {
                if (this.#gestureRegistrations.get(key) !== state) {
                    return
                }

                if (worker?.isWindowDeparted?.(windowId)) {
                    this.#gestureRegistrations.delete(key);
                    return
                }

                if (!state.addon && state.desired.size > 0) {
                    state.addon = await worker.getAddon('Gesture', windowId);

                    if (!state.addon) {
                        throw new Error('Gesture addon was not registered in Main')
                    }

                    continue
                }

                desired = state.desired;

                for (const [id, existing] of applied) {
                    if (!desired.has(id)) {
                        await state.addon.unregister({componentId, id, registrationId: existing.registrationId, windowId});
                        applied.delete(id)
                    }
                }

                for (const [id, {events, pressOptions, registrationId}] of desired) {
                    const existing = applied.get(id);

                    if (desired !== state.desired) {
                        break
                    }

                    if (existing?.registrationId !== registrationId || existing.events.size !== events.size || [...events].some(name => !existing.events.has(name))) {
                        await state.addon.register({
                            componentId, events: [...events], id, registrationId, windowId,
                            ...(pressOptions && {gestureOptions: {press: pressOptions}})
                        });
                        applied.set(id, {events, registrationId})
                    }
                }
            } while (desired !== state.desired);

            if (applied.size === 0 && state.desired.size === 0) {
                this.#gestureRegistrations.delete(key)
            }
        } catch (error) {
            if (!worker?.isWindowDeparted?.(windowId)) {
                console.error('DomEvent: Could not reconcile gesture listeners', error)
            }
        } finally {
            state.flight = null
        }
    }

    /**
     * @summary Matches delegates within physical/logical ancestry; ID-only paths need no class data.
     * This check supports two modes:
     * 1. **DOM Ancestry (Standard):** Checks if the target is physically inside the listener's DOM node.
     * 2. **Logical Ancestry (Fallback):** If the DOM check fails, it checks the `componentPath` to see if the
     *    target belongs to a component that is logically a descendant of the listener component.
     *    This is crucial for handling events from detached components (Portals/Proxies).
     *
     * String `delegate` grammar: space-separated tokens, each one simple selector (`#id`, `.cls`, a bare class name,
     * `[attr]`, or `[attr=value]` with an optionally quoted value that may contain spaces but not `]`). Supported
     * attribute names are `data-*`, `aria-*`, `role`, and `tabindex`. Compound selectors on a single node (such as
     * `.btn[data-ref=foo]`) are not supported and will not match.
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

            if (j == null) {
                return false
            }

            targetId = path[j].id
        } else {
            let delegationArray = delegate.match(/\[[^\]]+\]|\S+/g) || [],
                len             = delegationArray.length,
                hasMatch, i, isAttribute, isId, item, matchNode;

            for (i=len-1; i >= 0; i--) {
                hasMatch    = false;
                item        = delegationArray[i];
                isAttribute = item.startsWith('[') && item.endsWith(']');
                isId        = !isAttribute && item.startsWith('#');

                if (isId || (!isAttribute && item.startsWith('.'))) {
                    item = item.substring(1)
                }

                for (; j < pathLen; j++) {
                    matchNode = isAttribute
                        ? this.matchesAttributeTarget(path[j], item)
                        : isId
                            ? path[j].id === item
                            : path[j].cls?.includes(item);

                    if (matchNode) {
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
            if (path[k].id === listener.vnodeId || (listener.vnodeId === 'document.body' && path[k].tagName === 'body')) {
                return targetId || (listener.vnodeId === 'document.body' ? 'document.body' : targetId)
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
     * @summary Matches the `<body>` node in serialized DOM event paths for listeners scoped to `vnodeId: 'document.body'`.
     * @param {Object[]} path
     * @returns {Number|null}
     */
    static documentBodyDelegate(path) {
        const index = path?.findIndex(node => node.tagName === 'body' || node.id === 'document.body') ?? -1;

        return index === -1 ? null : index
    }

    /**
     * @summary Returns `true` when a delegated `mouseenter` or `mouseleave` crosses the `delegationTargetId` boundary,
     * and `false` when `fromElementId` / `toElementId` stays on or inside `delegationTargetId` (including
     * child↔delegate crossings across `VDomUtil.find`-expanded `{componentId}` subtrees).
     * @param {Neo.component.Base} component
     * @param {Object} data
     * @param {String} delegationTargetId
     * @param {String} eventName
     * @returns {Boolean} `true` to fire the delegated listener; `false` to suppress an internal transition
     */
    static verifyMouseEnterLeave(component, data, delegationTargetId, eventName) {
        let targetId = eventName === 'mouseenter' ? data.fromElementId : data.toElementId,
            delegationVdom;

        if (targetId) {
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
