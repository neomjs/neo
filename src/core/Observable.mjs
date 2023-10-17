import Base from './Base.mjs';

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
         * @member {Boolean} mixin=true
         * @protected
         */
        mixin: true
    }

    /**
     * @param {Object|String} name
     * @param {Object} [opts]
     * @param {Object} [scope]
     * @param {String} [eventId]
     * @param {Object} [data]
     * @param {Number} [order]
     * @returns {String|null} eventId null in case an object gets passed as the name (multiple ids)
     */
    addListener(name, opts, scope, eventId, data, order) {
        let me         = this,
            nameObject = typeof name === 'object',
            listener, existing, eventConfig;

        if (nameObject) {
            if (name.hasOwnProperty('scope')) {
                scope = name.scope;
                delete name.scope;
            }

            Object.entries(name).forEach(([key, value]) => {
                me.addListener(key, value, scope);
            });
        } else if (typeof opts === 'object') {
            scope    = scope || opts.scope;
            listener = opts.fn;
            order    = order || opts.order;
            eventId  = eventId || opts.eventId;
        } else if (typeof opts === 'function') {
            listener = opts;
        } else if (typeof opts === 'string') {
            listener = opts; // VC hook, can get parsed after onConstructed in case the view uses the parent VC
        } else {
            throw new Error('Invalid addListener call: ' + name);
        }

        if (!nameObject) {
            eventConfig = {
                fn: listener,
                scope,
                data,
                id: eventId || Neo.getId('event')
            };

            if (existing = me.listeners?.[name]) {
                existing.forEach(cfg => {
                    if (cfg.id === eventId || (cfg.fn === listener && cfg.scope === scope)) {
                        console.error('Duplicate event handler attached:', name, me);
                    }
                });

                if (typeof order === 'number') {
                    existing.splice(order, 0, eventConfig);
                } else if (order === 'before') {
                    existing.unshift(eventConfig);
                } else {
                    existing.push(eventConfig);
                }
            } else {
                me.listeners[name] = [eventConfig];
            }

            return eventConfig.id;
        }

        return null;
    }

    /**
     * @param name
     */
    fire(name) {
        let me        = this,
            args      = [].slice.call(arguments, 1),
            listeners = me.listeners,
            handler, handlers, i, len;

        if (listeners && listeners[name]) {
            handlers = [...listeners[name]];
            len    = handlers.length;

            for (i = 0; i < len; i++) {
                handler = handlers[i];

                // Resolve function name on the scope (oe me), or, if it starts with 'up.'
                // look in the ownership hierarchy from me.
                const cb = me.resolveCallback(handler.fn, handler.scope || me);

                // remove the listener, in case the scope no longer exists
                if (cb.scope && !cb.scope.id) {
                    listeners[name].splice(i, 1);
                } else {
                    if (!me.suspendEvents) {
                        // Object event format. Inject firer reference in as 'source'
                        if (args.length === 1 && typeof(args[0]) === 'object') {
                            args[0].source = me.id;
                        }
                        cb.fn.apply(cb.scope, handler.data ? args.concat(handler.data) : args);
                    }
                }
            }
        }
    }

    /**
     * Call the passed function, or a function by *name* which exists in the passed scope's
     * or this component's ownership chain.
     * @param {Function|String} fn A function, or the name of a function to find in the passed scope object/
     * @param {Object} scope The scope to find the function in if it is specified as a string.
     * @param {Array} args Arguments to pass to the callback.
     */
    callback(fn, scope=this, args) {
        if (fn) {
            const handler = this.resolveCallback(fn, scope);

            handler.fn.apply(handler.scope, args);
        }
    }

    /**
     * @param {Object} config
     */
    initObservable(config) {
        let me = this,
            proto = me.__proto__,
            ctor  = proto.constructor,
            listeners;

        if (config.listeners) {
            me.listeners = config.listeners;
            delete config.listeners;
        }

        listeners = me.listeners;

        me.listeners = {};

        if (listeners) {
            if (Neo.isObject(listeners)) {
                listeners = {...listeners};
            }

            me.addListener(listeners);
        }

        while (proto?.constructor.isClass) {
            ctor = proto.constructor;

            if (ctor.observable && !ctor.listeners) {
                Object.assign(ctor, {
                    addListener   : me.addListener,
                    fire          : me.fire,
                    listeners     : {},
                    on            : me.on,
                    removeListener: me.removeListener,
                    un            : me.un
                });
            }

            proto = proto.__proto__;
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
        return this.addListener(...args);
    }

    /**
     * @param {Object|String} name
     * @param {String} [eventId]
     */
    removeListener(name, eventId) {
        let me = this,
            i, len, listener, listeners, match, scope;

        if (Neo.isObject(name)) {
            if (name.scope) {
                scope = name.scope;
                delete name.scope;
            }

            Object.entries(name).forEach(([key, value]) => {
                listeners = me.listeners[key] || [];
                i         = 0;
                len       = listeners.length;

                for (; i < len; i++) {
                    listener = listeners[i];

                    if (
                        listener.fn.name === (Neo.isString(value) ? value : value.name) &&
                        listener.scope   === scope
                    ) {
                        listeners.splice(i, 1);
                        break;
                    }
                }
            });
        } else if (Neo.isString(eventId)) {
            listeners = me.listeners[name];
            match     = false;

            listeners.forEach((eventConfig, idx) => {
                if (eventConfig.id === eventId) {
                    return match = idx;
                }
            });

            if (match !== false) {
                listeners.splice(match, 1);
            }
        }
    }

    // removeAllListeners: function(name) {

    // },

    // suspendListeners: function(queue) {

    // },

    // resumeListeners: function() {

    // }

    /**
     * Locate a callable function by name in the passed scope.
     *
     * If the name starts with 'up.', the parent Component chain is searched.
     *
     * This is used by Observable.fire and by 'handler' function calls to resolve
     * string function names in the Component's own hierarchy.
     * @param {Function|String} fn A function, or the name of a function to find in the passed scope object/
     * @param {Object} scope The scope to find the function in if it is specified as a string.
     * @returns {Object}
     */
    resolveCallback(fn, scope=this) {
        if (typeof fn === 'string') {
            if (!scope[fn] && fn.startsWith('up.')) {
                fn = fn.slice(3);
                while (!scope[fn] && (scope = scope.parent));
            }
            fn = scope[fn];
        }
        return { scope,  fn };
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

Neo.applyClassConfig(Observable);

export default Observable;
