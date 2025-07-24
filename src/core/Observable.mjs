import Base              from './Base.mjs';
import NeoArray          from '../util/Array.mjs';
import {isDescriptor}    from '../core/ConfigSymbols.mjs';
import {resolveCallback} from '../util/Function.mjs';

/**
 * A unique, non-enumerable key for the internal event map.
 * Using a Symbol prevents property name collisions on the consuming class instance,
 * providing a robust way to manage private state within a mixin.
 * @type {Symbol}
 */
const eventMapSymbol = Symbol('eventMap');

/**
 * @class Neo.core.Observable
 * @extends Neo.core.Base
 */
class Observable extends Base {
    static config = {
        /**
         * @member {String} className='Neo.core.Observable'
         * @protected
         */
        className: 'Neo.core.Observable',
        /**
         * @member {String} ntype='mixin-observable'
         * @protected
         */
        ntype: 'mixin-observable',
        /**
         * A declarative way to assign event listeners to an instance upon creation.
         * The framework processes this config and calls `on()` to populate the
         * internal event registry. This config should not be manipulated directly after
         * instantiation; use `on()` and `un()` instead.
         * @member {Object|null} listeners_
         * @example
         * listeners: {
         *     myEvent: 'onMyEvent',
         *     otherEvent: {
         *         fn: 'onOtherEvent',
         *         delay: 100,
         *         once: true
         *     },
         *     scope: this
         * }
         * @reactive
         */
        listeners_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : {}
        }
    }

    /**
     * @member {Object} [eventMapSymbol]
     * @private
     */

    /**
     * @param {Object|String} name
     * @param {Object} [opts]
     * @param {Object} [scope]
     * @param {String} [eventId]
     * @param {Object} [data]
     * @param {Number|String} [order]
     * @returns {String|null} eventId null in case an object gets passed as the name (multiple ids)
     */
    addListener(name, opts, scope, eventId, data, order) {
        let me            = this,
            delay         = 0,
            eventIdObject = typeof eventId === 'object',
            nameObject    = typeof name    === 'object',
            once          = false,
            optsType      = typeof opts,
            listener, existing, eventConfig;

        /*
         * let us support the following format too:
         *
         * currentWorker.on('connected', () => {
         *     Base.sendRemotes(className, remote)
         * }, me, {once: true})
         */
        if (eventIdObject && optsType === 'function') {
            eventId.fn = opts;
            opts     = eventId;
            optsType = 'object';
            eventId  = null;
        }

        if (nameObject) {
            if (name.hasOwnProperty('delay')) {
                delay = name.delay;
                delete name.delay
            }

            if (name.hasOwnProperty('once')) {
                once = name.once;
                delete name.once
            }

            if (name.hasOwnProperty('order')) {
                order = name.order;
                delete name.order
            }

            if (name.hasOwnProperty('scope')) {
                scope = name.scope;
                delete name.scope
            }

            Object.entries(name).forEach(([key, value]) => {
                if (Neo.isObject(value)) {
                    me.addListener(key, {delay, once, order, scope, ...value})
                } else {
                    me.addListener(key, {delay, fn: value, once, order, scope})
                }
            })
        } else if (optsType === 'object') {
            delay    = delay   || opts.delay;
            eventId  = eventId || opts.eventId;
            listener = opts.fn;
            once     = once    || opts.once;
            order    = order   || opts.order;
            scope    = scope   || opts.scope
        } else if (optsType === 'function') {
            listener = opts
        } else if (optsType === 'string') {
            listener = opts // VC hook, can get parsed after onConstructed in case the view uses the parent VC
        } else {
            throw new Error('Invalid addListener call: ' + name)
        }

        if (!nameObject) {
            // LAZY INITIALIZATION: The key to a robust mixin.
            // This ensures the private internal listener store exists on the instance.
            // `eventMapSymbol` is the *actual* registry of handler arrays, and is
            // intentionally separate from the public `listeners_` config.
            me[eventMapSymbol] ??= {};

            eventConfig = {fn: listener, id: eventId || Neo.getId('event')};

            if (data)      {eventConfig.data   = data}
            if (delay > 0) {eventConfig.delay  = delay}
            if (once)      {eventConfig.once   = once}
            if (scope)     {eventConfig.scope  = scope}

            if ((existing = me[eventMapSymbol][name])) {
                existing.forEach(cfg => {
                    if (cfg.id === eventId || (cfg.fn === listener && cfg.scope === scope)) {
                        console.error('Duplicate event handler attached:', name, me)
                    }
                });

                if (typeof order === 'number') {
                    existing.splice(order, 0, eventConfig)
                } else if (order === 'before') {
                    existing.unshift(eventConfig)
                } else {
                    existing.push(eventConfig)
                }
            } else {
                me[eventMapSymbol][name] = [eventConfig] // Use the private eventMapSymbol registry
            }

            return eventConfig.id
        }

        return null
    }

    /**
     * This hook is the bridge between the declarative `listeners_` config and the
     * imperative `on()`/`un()` methods. It's called automatically by the framework
     * whenever the `listeners` config property is changed.
     * @param {Object} value The new listeners object
     * @param {Object} oldValue The old listeners object
     * @protected
     */
    afterSetListeners(value, oldValue) {
        // Unregister any listeners from the old config object
        if (oldValue && Object.keys(oldValue).length > 0) {
            this.un(oldValue)
        }
        // Register all listeners from the new config object
        if (value && Object.keys(value).length > 0) {
            this.on(value)
        }
    }

    /**
     * Call the passed function, or a function by *name* which exists in the passed scope's
     * or this component's ownership chain.
     * @param {Function|String} fn A function, or the name of a function to find in the passed scope object.
     * @param {Object} scope       The scope to find the function in if it is specified as a string.
     * @param {Array} args         Arguments to pass to the callback.
     */
    callback(fn, scope=this, args) {
        if (fn) {
            const handler = resolveCallback(fn, scope);
            handler.fn.apply(handler.scope, args)
        }
    }

    /**
     * Internal helper method for events which use the delay option
     * @param {Object} cb
     * @param {Array} args
     * @param {Number} delay
     */
    delayedCallback(cb, args, delay) {
        this.timeout(delay).then(() => {
            cb.fn.apply(cb.scope, args)
        })
    }

    /**
     * @param name
     */
    fire(name) {
        let me        = this,
            args      = [].slice.call(arguments, 1),
            listeners = me[eventMapSymbol], // Always use the private, structured registry for firing events.
            delay, handler, handlers, i, len;

        if (listeners && listeners[name]) {
            handlers = [...listeners[name]];
            len      = handlers.length;

            for (i = 0; i < len; i++) {
                handler = handlers[i];
                delay   = handler.delay;

                // Resolve function name on the scope (or me), or, if it starts with 'up.'
                // look in the ownership hierarchy from me.
                const cb = resolveCallback(handler.fn, handler.scope || me);

                // remove the listener if the scope no longer exists
                if (cb.scope && !cb.scope.id) {
                    NeoArray.remove(listeners[name], handler)
                } else {
                    if (!me.suspendEvents) {
                        // Object event format. Inject firer reference in as 'source'
                        if (args.length === 1 && Neo.isObject(args[0])) {
                            args[0].source = me.id
                        }

                        // remove the listener if it has the once flag
                        handler.once && NeoArray.remove(listeners[name], handler);

                        if (Neo.isNumber(delay) && delay > 0) {
                            me.delayedCallback(cb, handler.data ? args.concat(handler.data) : args, delay)
                        } else {
                            cb.fn.apply(cb.scope, handler.data ? args.concat(handler.data) : args)
                        }
                    }
                }
            }
        }
    }

    /**
     * Alias for addListener
     * @param {Object|String} name
     * @param {Object} [opts]
     * @param {Object} [scope]
     * @param {String} [eventId]
     * @param {Object} [data]
     * @param {Number} [order]
     * @returns {String} eventId
     */
    on(...args) {
        return this.addListener(...args)
    }

    /**
     * There are different syntax's how you can use this method.
     * Using the eventId:
     * ```
     * this.removeListener('change', 'neo-event-7');
     * ```
     * Passing the handler method:
     * ```
     * this.removeListener('change', this.onChange, this);
     * ```
     * Passing an object:
     * ```
     * me.field.un({
     *     change                    : me.onFieldChange,
     *     changeClearToOriginalValue: me.onFieldChange,
     *     scope                     : me
     * });
     * ```
     * @param {Object|String} name
     * @param {Function|String} [eventId]
     * @param {Neo.core.Base} [scope]
     */
    removeListener(name, eventId, scope) {
        let me = this,
            i, len, listener, listeners, match;

        // LAZY INITIALIZATION: Ensure the internal listener store exists.
        me[eventMapSymbol] ??= {};

        if (Neo.isFunction(eventId)) {
            me.removeListener({[name]: eventId, scope});
            return
        }

        if (Neo.isObject(name)) {
            if (name.scope) {
                scope = name.scope;
                delete name.scope;
            }

            Object.entries(name).forEach(([key, value]) => {
                listeners = me[eventMapSymbol][key] || [];
                i         = 0;
                len       = listeners.length;

                for (; i < len; i++) {
                    listener = listeners[i];

                    if (
                        listener.fn.name === (Neo.isString(value) ? value : value.name) &&
                        listener.scope   === scope
                    ) {
                        listeners.splice(i, 1);
                        break
                    }
                }
            })
        } else if (Neo.isString(eventId)) {
            listeners = me[eventMapSymbol][name];
            match     = false;

            listeners.forEach((eventConfig, idx) => {
                if (eventConfig.id === eventId) {
                    return match = idx
                }
            });

            if (match !== false) {
                listeners.splice(match, 1)
            }
        }
    }

    /**
     * Alias for removeListener
     * @param {Object|String} name
     * @param {String} [eventId]
     */
    un(...args) {
        this.removeListener(...args);
    }
}

export default Neo.setupClass(Observable);
