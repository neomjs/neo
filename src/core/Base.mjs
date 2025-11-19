import {buffer, debounce, intercept, resolveCallback, throttle} from '../util/Function.mjs';
import Compare                                                  from '../core/Compare.mjs';
import Util                                                     from '../core/Util.mjs';
import Config                                                   from './Config.mjs';
import {isDescriptor}                                           from './ConfigSymbols.mjs';
import IdGenerator                                              from './IdGenerator.mjs';
import EffectManager                                            from './EffectManager.mjs';

const configSymbol       = Symbol.for('configSymbol'),
      forceAssignConfigs = Symbol('forceAssignConfigs'),
      isInstance         = Symbol('isInstance');

/**
 * The base class for (almost) all classes inside the Neo namespace
 * Exceptions are e.g. core.IdGenerator, vdom.VNode
 * @class Neo.core.Base
 */
class Base {
    /**
     * You can define methods which should get delayed.
     * Types are buffer, debounce & throttle.
     * @example
     *  delayable: {
     *      fireChangeEvent: {
     *          type : 'debounce',
     *          timer: 300
     *      }
     *  }
     * @member {Object} delayable={}
     * @protected
     * @static
     */
    static delayable = {}
    /**
     * Flag which will get set to true once manager.Instance got created
     * @member {Boolean} instanceManagerAvailable=false
     * @static
     */
    static instanceManagerAvailable = false
    /**
     * Regex to grab the MethodName from an error
     * which is a second generation function
     * @member {RegExp} methodNameRegex
     * @static
     */
    static methodNameRegex = /\n.*\n\s+at\s+.*\.(\w+)\s+.*/
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=false
     * @static
     */
    static observable = false
    /**
     * Keep the overwritten methods
     * @member {Object} overwrittenMethods={}
     * @protected
     * @static
     */
    static overwrittenMethods = {}
    /**
     * Defines the default configuration properties for the class. These configurations are
     * merged throughout the class hierarchy and can be overridden at the instance level.
     *
     * There are two main types of configs:
     *
     * 1.  **Reactive Configs:** Property names ending with a trailing underscore (e.g., `myConfig_`).
     *     The framework automatically generates a public getter and setter, removing the underscore
     *     from the property name (e.g., `this.myConfig`). This system enables powerful, optional
     *     lifecycle hooks that are called automatically if they are implemented on the class:
     *     - `beforeGetMyConfig(value)`: Executed before the getter returns. Can be used to dynamically modify the returned value.
     *     - `beforeSetMyConfig(newValue, oldValue)`: Executed before a new value is set. Can be used for validation or transformation. Returning `undefined` from this hook will cancel the update.
     *     - `afterSetMyConfig(newValue, oldValue)`: Executed after a new value has been successfully set. Ideal for triggering side effects.
     *
     * 2.  **Non-Reactive (Prototype-based) Configs:** Property names without a trailing underscore.
     *     These are applied directly to the class's **prototype** during the `Neo.setupClass`
     *     process. This is highly memory-efficient as the value is shared across all instances.
     *     It also allows for powerful, application-wide modifications of default behaviors
     *     by using the `Neo.overwrites` mechanism, which modifies these prototype values at
     *     load time.
     *
     * @returns {Object} config
     */
    static config = {
        /**
         * The class name which will get mapped into the Neo or app namespace
         * @member {String} className='Neo.core.Base'
         * @protected
         */
        className: 'Neo.core.Base',
        /**
         * The class shortcut-name to use for e.g. creating child components inside a JSON-format
         * @member {String} ntype='base'
         * @protected
         */
        ntype: 'base',
        /**
         * While it is recommended to change the static delayable configs on class level,
         * you can change it on instance level too. If not null, we will do a deep merge.
         * @member {Object} delayable=null
         */
        delayable: null,
        /**
         * The unique component id
         * @member {String|null} id_=null
         * @reactive
         */
        id_: null,
        /**
         * An array of remote method names that should be intercepted.
         * Names used here must be present inside the `remote_` config.
         * If a remote call for one of these methods arrives, `onInterceptRemotes()` will be called.
         * @member {String[]|null} interceptRemotes=null
         * @protected
         */
        interceptRemotes: null,
        /**
         * Neo.create() will change this flag to true after the onConstructed() chain is done.
         * @member {Boolean} isConstructed=false
         * @protected
         */
        isConstructed: false,
        /**
         * This config will be set to `true` as the very first action within the `destroy()` method.
         * Effects can observe this config to clean themselves up.
         * @member {Boolean} isDestroying_=false
         * @protected
         * @reactive
         */
        isDestroying_: false,
        /**
         * The config will get set to `true` once the Promise of `async initAsync()` is resolved.
         * You can use `afterSetIsReady()` to get notified once the ready state is reached.
         * For observable classes, this will also fire a `ready` event.
         * @member {Boolean} isReady_=false
         * @reactive
         */
        isReady_: false,
        /**
         * Add mixins as an array of classNames, imported modules or a mixed version
         * @member {String[]|Neo.core.Base[]|null} mixins=null
         */
        mixins: null,
        /**
         * You can create a new instance by passing an imported class (JS module default export)
         * @member {Class} module=null
         * @protected
         */
        module: null,
        /**
         * Remote method access for other threads. Example use case:
         * remote: {app: ['myRemoteMethod']}
         *
         * ONLY supported for singletons.
         *
         * @member {Object|null} remote_=null
         * @protected
         * @reactive
         */
        remote_: null
    }

    /**
     * A private field to store the Config controller instances.
     * @member {Object} #configs={}
     * @private
     */
    #configs = {};
    /**
     * A promise that resolves when the instance is fully initialized (after initAsync() completes).
     * @member {Promise<void>|null} #readyPromise
     * @private
     */
    #readyPromise = null;
    /**
     * A resolver function for the ready promise.
     * @member {Function|null} #readyResolver
     * @private
     */
    #readyResolver = null;
    /**
     * Internal cache for all config subscription cleanup functions.
     * @member {Function[]} #configSubscriptionCleanups=[]
     * @private
     */
    #configSubscriptionCleanups = []
    /**
     * Internal cache for all timeout ids when using this.timeout()
     * @member {Number[]} timeoutIds=[]
     * @private
     */
    #timeoutIds = []

    /**
     * The main initializer for all Neo.mjs classes, invoked by `Neo.create()`.
     * NOTE: This is not the native `constructor()`, which is called without arguments by `Neo.create()` first.
     *
     * This method orchestrates the entire instance initialization process, including
     * the setup of the powerful and flexible config system.
     *
     * The `config` parameter is a single object that can contain different types of properties,
     * which are processed in a specific order to ensure consistency and predictability:
     *
     * 1.  **Public Class Fields & Other Properties:** Any key in the `config` object that is NOT
     *     defined in the class's `static config` hierarchy is considered a public field or a
     *     dynamic property. These are assigned directly to the instance (`this.myField = value`)
     *     at the very beginning. This is crucial so that subsequent config hooks (like `afterSet*`)
     *     can access their latest values.
     *
     * 2.  **Reactive Configs:** A property is considered reactive if it is defined with a trailing
     *     underscore (e.g., `myValue_`) in the `static config` of **any class in the inheritance
     *     chain**. Subclasses can provide new default values for these configs without the
     *     underscore, and they will still be reactive. Their values are applied via generated
     *     setters, triggering `beforeSet*` and `afterSet*` hooks, and they are wrapped in a
     *     `Neo.core.Config` instance to enable subscription-based reactivity.
     *
     * 3.  **Non-Reactive Configs:** Properties defined in `static config` without a trailing
     *     underscore in their entire inheritance chain. Their default values are applied directly
     *     to the class **prototype**, making them shared across all instances and allowing for
     *     run-time modifications (prototypal inheritance). When a new value is passed to this
     *     method, it creates an instance-specific property that shadows the prototype value.
     *
     * This method also initializes the observable mixin (if applicable) and schedules asynchronous
     * logic like `initAsync()` (which handles remote method access) to run after the synchronous
     * construction chain is complete.
     *
     * @param {Object} config={} The initial configuration object for the instance.
     */
    construct(config={}) {
        let me = this;

        Object.defineProperties(me, {
            [configSymbol]: {
                configurable: true,
                enumerable  : false,
                value       : {},
                writable    : true
            },
            [isInstance]: {
                enumerable: false,
                value     : true
            }
        });

        me.id = config.id || IdGenerator.getId(this.getIdKey());
        delete config.id;

        // Assign class field values prior to configs
        config = me.setFields(config);

        me.initConfig(config);

        Object.defineProperty(me, 'configsApplied', {
            enumerable: false,
            value     : true
        });

        me.applyDelayable();

        /*
         * We do not want to force devs to check for the `isDestroyed` flag in every possible class extension.
         * So, we are intercepting the top-most `destroy()` call to check for the flag there.
         * Rationale: `destroy()` must only get called once.
         */
        intercept(me, 'destroy', me.#preDestroyHook, me);

        // Storing a resolver to execute inside `afterSetIsReady`.
        me.#readyPromise = new Promise(resolve => {
            me.#readyResolver = resolve
        });

        // Triggers async logic after the construction chain is done.
        Promise.resolve().then(async () => {
            await me.initAsync();
            me.isReady = true
        })
    }

    /**
     * Triggered after the id config got changed.
     * You can dynamically change instance ids if needed. They need to stay unique at any given point.
     * Use case: e.g. component based lists, where you want to re-use item instances.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetId(value, oldValue) {
        let me         = this,
            hasManager = Base.instanceManagerAvailable === true;

        if (oldValue) {
            if (hasManager) {
                Neo.manager.Instance.unregister(oldValue)
            } else if (Neo.idMap) {
                delete Neo.idMap[oldValue]
            }
        }

        if (value) {
            if (hasManager) {
                Neo.manager.Instance.register(me)
            } else {
                Neo.idMap ??= {};
                Neo.idMap[value] = me
            }
        }
    }

    /**
     * Triggered after the isReady config gets changed.
     * Resolves the ready() promise and fires the ready event for observable classes.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsReady(value, oldValue) {
        if (value) {
            let me = this;

            me.#readyResolver?.();

            // We can only fire the event in case the Observable mixin is included.
            me.getStaticConfig('observable') && me.fire('ready')
        }
    }

    /**
     * Adjusts all methods inside static delayable
     */
    applyDelayable() {
        let me            = this,
            ctorDelayable = me.constructor.delayable,
            delayable     = me.delayable ? Neo.merge({}, me.delayable, ctorDelayable) : ctorDelayable;

        Object.entries(delayable).forEach(([key, value]) => {
            if (value) {
                let map = {
                    buffer()   {me[key] = new buffer(me[key],   me, value.timer)},
                    debounce() {me[key] = new debounce(me[key], me, value.timer)},
                    throttle() {me[key] = new throttle(me[key], me, value.timer)}
                };

                map[value.type]?.()
            }
        })
    }

    /**
     * This static method is called by `Neo.setupClass()` during the class creation process.
     * It allows for modifying a class's default prototype-based configs from outside the
     * class hierarchy, which is a powerful way to avoid boilerplate code.
     *
     * It looks for a matching entry in the global `Neo.overwrites` object based on the
     * class's `className`. If found, it merges the properties from the overwrite object
     * into the class's static `config`. This provides a powerful mechanism for theming
     * or applying application-wide customizations to framework or library classes without
     * needing to extend them.
     *
     * @example
     * // Imagine you have hundreds of buttons in your app, and you want all of them
     * // to have `labelPosition: 'top'` instead of the default `'left'`.
     * // Instead of configuring each instance, you can define an overwrite.
     *
     * // inside an Overwrites.mjs file loaded by your app:
     * Neo.overwrites = {
     *     Neo: {
     *         button: {
     *             Base: {
     *                 labelPosition: 'top'
     *             }
     *         }
     *     }
     * };
     *
     * // Now, every `Neo.button.Base` (and any class that extends it) will have this
     * // new default value on its prototype.
     *
     * @param {Object} cfg The static `config` object of the class being processed.
     * @protected
     * @static
     */
    static applyOverwrites(cfg) {
        let overwrites = Neo.ns(cfg.className, false, Neo.overwrites),
            cls, item;

        if (overwrites) {
            // Apply all methods
            for (item in overwrites) {
                if (Neo.isFunction(overwrites[item])) {
                    // Already existing ones
                    cls = this.prototype;

                    if (cls[item]) {
                        // Add to overwrittenMethods
                        cls.constructor.overwrittenMethods[item] = cls[item]
                    }
                }
            }

            // Apply configs to prototype
            Object.assign(cfg, overwrites)
        }
    }

    /**
     * Convenience method for beforeSet functions which test if a given value is inside a static array
     * @param {String|Number} value
     * @param {String|Number} oldValue
     * @param {String} name config name
     * @param {Array|String} [staticName=name + 's'] name of the static config array
     * @returns {String|Number} value or oldValue
     */
    beforeSetEnumValue(value, oldValue, name, staticName = name + 's') {
        let values = Array.isArray(staticName) ? staticName : this.getStaticConfig(staticName);

        if (!values.includes(value)) {
            console.error(`Supported values for ${name} are:`, ...values, this);
            return oldValue
        }

        return value
    }

    /**
     * Triggered before the remote config gets changed
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @returns {Object|null}
     * @protected
     */
    beforeSetRemote(value, oldValue) {
        let me = this;

        // Only allow remote access for singletons or main thread addons
        if (value && !me.singleton && !me.isMainThreadAddon) {
            throw new Error('Remote method access is only functional for Singleton classes ' + me.className)
        }

        return value
    }

    /**
     * @param {String} fn               The name of a function to find in the passed scope object.
     * @param {Object} originName       The name of the method inside the originScope.
     * @param {Object} scope            The scope to find the function in if it is specified as a string.
     * @param {Object} originScope=this The scope where the function is located.
     */
    bindCallback(fn, originName, scope=this, originScope=this) {
        if (fn && Neo.isString(fn)) {
            const handler = resolveCallback(fn, scope);
            originScope[originName] = handler.fn.bind(handler.scope)
        }
    }

    /**
     * From within an overwrite, a method can call a parent method, by using callOverwritten.
     *
     * @example
     *    afterSetHeight(value, oldValue) {
     *        // do the standard
     *        this.callOverwritten(...arguments);
     *        // do you own stuff
     *    }
     *
     * We create an error to get the caller.name and then run that method on the constructor.
     * This is based on the following error structure, e.g. afterSetHeight.
     *
     *     Error
     *         at Base.callOverwritten (Base.mjs:176:21)
     *         at Base.afterSetHeight (Overrides.mjs:19:26)
     *
     * @param args
     */
    callOverwritten(...args) {
        let stack      = new Error().stack,
            methodName = stack.match(Base.methodNameRegex)[1];

        this.__proto__.constructor.overwrittenMethods[methodName].call(this, ...args)
    }

    /**
     * Unregisters this instance from Neo.manager.Instance
     * and removes all object entries from this instance
     */
    destroy() {
        let me = this;

        me.#timeoutIds.forEach(id => {
            clearTimeout(id)
        });

        me.#configSubscriptionCleanups.forEach(cleanup => {
            cleanup()
        });

        if (Base.instanceManagerAvailable === true) {
            Neo.manager.Instance.unregister(me)
        } else if (Neo.idMap) {
            delete Neo.idMap[me.id]
        }

        Object.keys(me).forEach(key => {
            if (Object.getOwnPropertyDescriptor(me, key).writable) {
                // We must not delete the custom destroy() interceptor
                if (key !== 'destroy' && key !== '_id') {
                    delete me[key]
                }
            }
        });

        // We do want to prevent delayed event calls after an observable instance got destroyed.
        if (Neo.isFunction(me.fire)) {
            me.fire = Neo.emptyFn
        }

        me.isDestroyed = true
    }

    /**
     * A public method to access the underlying Config controller.
     * This enables advanced interactions like subscriptions.
     * @param {String} key The name of the config property (e.g., 'items').
     * @returns {Config|undefined} The Config instance, or undefined if not found.
     */
    getConfig(key) {
        let me = this;

        if (!me.#configs[key] && me.isConfig(key)) {
            me.#configs[key] = new Config(me.constructor.configDescriptors?.[key])
        }

        return me.#configs[key]
    }

    /**
     * Used inside createId() as the default value passed to the IdGenerator.
     * Override this method as needed.
     * @returns {String}
     */
    getIdKey() {
        return this.ntype
    }

    /**
     * Returns the value of a static config key or the staticConfig object itself in case no value is set
     * @param {String} key The key of a staticConfig defined inside static getStaticConfig
     * @returns {*}
     */
    getStaticConfig(key) {
        return this.constructor[key]
    }

    /**
     * Check if a given ntype exists inside the proto chain, including the top level class
     * @param {String} ntype
     * @returns {Boolean}
     */
    hasNtype(ntype) {
        return this.constructor.ntypeChain.includes(ntype)
    }

    /**
     * Gets triggered after onConstructed() is done
     */
    init() {}

    /**
     * You can use this method in subclasses to perform asynchronous initialization logic.
     * Make sure to use the parent call `await super.initAsync()` at the beginning of their implementations,
     * or the registration of remote methods will get delayed.
     *
     * A common use case is requiring conditional or optional dynamic imports or fetching initial data.
     *
     * Once the promise returned by this method is fulfilled, the `isReady` config will be set to `true`.
     * @returns {Promise<void>} A promise that resolves when the asynchronous initialization is complete.
     */
    async initAsync() {
        this.remote && this.initRemote()
    }

    /**
     * Applies all class configs to this instance
     * @param {Object} config
     * @param {Boolean} [preventOriginalConfig] True prevents the instance from getting an originalConfig property
     * @protected
     */
    initConfig(config, preventOriginalConfig) {
        let me = this;

        me.isConfiguring = true;
        Object.assign(me[configSymbol], me.mergeConfig(config, preventOriginalConfig));
        delete me[configSymbol].id;
        me.processConfigs();
        me.isConfiguring = false
    }

    /**
     * Does get triggered with a delay to ensure that Neo.workerId & Neo.worker.Manager are defined
     * Remote method access via promises
     * @protected
     */
    initRemote() {
        let {className, remote} = this,
            {currentWorker}     = Neo;

        if (!Neo.config.isMiddleware && !Neo.config.unitTestMode) {
            if (Neo.workerId !== 'main' && currentWorker.isSharedWorker && !currentWorker.isConnected) {
                currentWorker.on('connected', () => {
                    Base.sendRemotes(className, remote)
                }, this, {once: true})
            } else {
                Base.sendRemotes(className, remote)
            }
        }
    }

    /**
     * @param {String} key
     * @returns {Boolean}
     */
    isConfig(key) {
        let me = this;
        // If a `core.Config` controller is already created, return true (fastest possible check).
        // If not, a config is considered "reactive" if it has a generated property setter
        // AND it is present as a defined config in the merged static config hierarchy.
        // Neo.setupClass() removes the underscore from the static config keys.
        return me.#configs[key] || (Neo.hasPropertySetter(me, key) && (key in me.constructor.config))
    }

    /**
     * Override this method to change the order configs are applied to this instance.
     * @param {Object} config
     * @param {Boolean} [preventOriginalConfig] True prevents the instance from getting an originalConfig property
     * @returns {Object} config
     * @protected
     */
    mergeConfig(config, preventOriginalConfig) {
        let me   = this,
            ctor = me.constructor,
            configDescriptors, staticConfig;

        if (!ctor.config) {
            throw new Error('Neo.applyClassConfig has not been run on ' + me.className)
        }

        if (!preventOriginalConfig) {
            me.originalConfig = Neo.clone(config, true, true)
        }

        configDescriptors = ctor.configDescriptors;
        staticConfig      = ctor.config;

        if (configDescriptors) {
            Object.entries(config).forEach(([key, instanceValue]) => {
                const descriptor = configDescriptors[key];

                if (descriptor?.merge) {
                    config[key] = Neo.mergeConfig(staticConfig[key], instanceValue, descriptor.merge)
                }
            })
        }

        return {...staticConfig, ...config}
    }

    /**
     * Subscribes *this* instance (the subscriber) to changes of a specific config property on another instance (the publisher).
     * Ensures automatic cleanup when *this* instance (the subscriber) is destroyed.
     *
     * @param {String|Neo.core.Base} publisher  - The ID of the publisher instance or the instance reference itself.
     * @param {String}               configName - The name of the config property on the publisher to subscribe to (e.g., 'myConfig').
     * @param {Function}             fn         - The callback function to execute when the config changes.
     * @returns {Function} A cleanup function to manually unsubscribe if needed before this instance's destruction.
     *
     * @example
     * // Subscribing to a config on another instance
     * this.observeConfig(someOtherInstance, 'myConfig', (newValue, oldValue) => {
     *     console.log('myConfig changed:', newValue);
     * });
     *
     * // Discouraged: Self-observation. Use afterSet<ConfigName>() hooks instead.
     * this.observeConfig(this, 'myOwnConfig', (newValue, oldValue) => {
     *     console.log('myOwnConfig changed:', newValue);
     * });
     */
    observeConfig(publisher, configName, fn) {
        let publisherInstance = publisher;

        if (Neo.isString(publisher)) {
            publisherInstance = Neo.get(publisher);
            if (!publisherInstance) {
                console.warn(`Publisher instance with ID '${publisher}' not found. Cannot subscribe.`);
                return Neo.emptyFn
            }
        }

        if (!(publisherInstance instanceof Neo.core.Base)) {
            console.warn(`Invalid publisher provided. Must be a Neo.core.Base instance or its ID.`);
            return Neo.emptyFn
        }

        const configController = publisherInstance.getConfig(configName);

        if (!configController) {
            console.warn(`Config '${configName}' not found on publisher instance ${publisherInstance.id}. Cannot subscribe.`);
            return Neo.emptyFn
        }

        const cleanup = configController.subscribe({id: this.id, fn});

        this.#configSubscriptionCleanups.push(cleanup);

        return cleanup
    }

    /**
     *
     */
    onAfterConstructed() {
        let me = this;

        me.isConstructed = true;

        // We can only fire the event in case the Observable mixin is included.
        me.getStaticConfig('observable') && me.fire('constructed', me)
    }

    /**
     * Gets triggered after all constructors are done
     */
    onConstructed() {}

    /**
     * Placeholder method for intercepting remote calls.
     * Subclasses can override this method to implement custom interception logic.
     * @param {Object} msg The remote message object.
     */
    onInterceptRemotes(msg) {
        // No-op in base class
    }

    /**
     * Helper method to replace string-based values containing "@config:" with the matching config value
     * of this instance.
     * @param {Object|Object[]} items
     */
    parseItemConfigs(items) {
        let me = this,
            ns, nsArray, nsKey, symbolNs;

        if (items) {
            if (!Array.isArray(items)) {
                items = [items]
            }

            items.forEach(item => {
                item && Object.entries(item).forEach(([key, value]) => {
                    if (Array.isArray(value)) {
                        me.parseItemConfigs(value);
                    } else if (typeof value === 'string' && value.startsWith('@config:')) {
                        nsArray = value.substring(8).trim().split('.');
                        nsKey   = nsArray.pop();
                        ns      = Neo.ns(nsArray, false, me);

                        if (ns[nsKey] === undefined) {
                            console.error('The used @config does not exist:', nsKey, nsArray.join('.'))
                        } else {
                            symbolNs = Neo.ns(nsArray, false, me[configSymbol]);

                            // The config might not be processed yet, especially for configs
                            // not ending with an underscore, so we need to check the configSymbol first.
                            if (symbolNs && Object.hasOwn(symbolNs, nsKey)) {
                                item[key] = symbolNs[nsKey]
                            } else {
                                item[key] = ns[nsKey]
                            }
                        }
                    }
                })
            })
        }
    }

    /**
     * Intercepts destroy() calls to ensure they will only get called once
     * @returns {Boolean}
     * @private
     */
    #preDestroyHook() {
        this.isDestroying = true;
        return !this.isDestroyed
    }

    /**
     * When using set(), configs without a trailing underscore can already be assigned,
     * so the hasOwnProperty() check will return true
     * @param {Boolean} [forceAssign=false]
     * @protected
     */
    processConfigs(forceAssign=false) {
        let me   = this,
            keys = Object.keys(me[configSymbol]);

        me[forceAssignConfigs] = forceAssign;

        // We do not want to iterate over the keys, since 1 config can remove more than 1 key (beforeSetX, afterSetX)
        if (keys.length > 0) {
            // The hasOwnProperty check is intended for configs without a trailing underscore
            // => they could already have been assigned inside an afterSet-method
            if (forceAssign || !me.hasOwnProperty(keys[0])) {
                me[keys[0]] = me[configSymbol][keys[0]]
            }

            // there is a delete-call inside the config getter as well (Neo.mjs => autoGenerateGetSet())
            // we need to keep this one for configs, which do not use getters (no trailing underscore)
            delete me[configSymbol][keys[0]];

            me.processConfigs(forceAssign)
        }
    }

    /**
     * Returns a promise that resolves when the instance is fully initialized (after initAsync).
     * Use case: alternative way to subscribe to the ready state, especially for classes which are not observable.
     * @example: await ChromaManager.ready();
     * @returns {Promise<void>}
     */
    ready() {
        return this.#readyPromise;
    }

    /**
     * Sends remote method registration messages to other threads (workers or main-threads).
     * This method is crucial for enabling cross-worker communication and remote method invocation
     * for singleton instances. It ensures that methods defined in the `remote` config
     * are properly registered in the target realm.
     * @param {String} className - The class name of the instance sending the remote messages.
     * @param {Object} remote    - The remote config object, specifying target threads and methods.
     * @protected
     * @static
     */
    static sendRemotes(className, remote) {
        let origin;

        Object.entries(remote).forEach(([worker, methods]) => {
            if (Neo.workerId !== worker) {
                origin = Neo.workerId === 'main' ? Neo.worker.Manager : Neo.currentWorker;
                origin.sendMessage(worker, {action: 'registerRemote', className, methods})
            }
        })
    }

    /**
     * set() accepts the following input as keys:
     * 1. Non-reactive configs
     * 2. Reactive configs
     * 3. Class fields defined via value
     * 4. Class fields defined via get() & set()
     * 5. "Anything else" will get directly get assigned to the instance
     *
     * The logic resolves circular dependencies as good as possible and ensures that config related hooks:
     * - beforeGet<Config>
     * - beforeSet<Config>
     * - afterSet<Config>
     * can access all new values from the batch operation.
     * @param {Object} values={}
     */
    set(values={}) {
        let me                = this,
            classFieldsViaSet = {};

        // Prevent Effects from running for bulk changes
        EffectManager.pause();

        try {
            values = me.setFields(values);

            // If the initial config processing is still running,
            // finish this one first before dropping new values into the configSymbol.
            // See: https://github.com/neomjs/neo/issues/2201
            if (me[forceAssignConfigs] !== true && Object.keys(me[configSymbol]).length > 0) {
                me.processConfigs()
            }

            // Store class fields which are defined via get() & set() and ensure they won't get added to the config symbol.
            Object.entries(values).forEach(([key, value]) => {
                if (!me.isConfig(key)) {
                    classFieldsViaSet[key] = value;
                    delete values[key]
                }
            })

            // Add reactive configs to the configSymbol
            Object.assign(me[configSymbol], values);

            // Process class fields which are defined via get() & set() => now they can access the latest values
            // for reactive and non-reactive configs, as well as class fields defined with values.
            Object.entries(classFieldsViaSet).forEach(([key, value]) => {
                me[key] = value
            })

            // Process reactive configs
            me.processConfigs(true);
        } finally {
            // Trigger the skipped Effect, if needed
            EffectManager.resume()
        }
    }

    /**
     * We want to assign class fields first and remove them from the config object,
     * so that afterSet(), beforeGet() and beforeSet() methods can get the new values right away
     * @param {Object} config
     * @returns {Object}
     * @protected
     */
    setFields(config) {
        let me = this;

        Object.entries(config).forEach(([key, value]) => {
            if (!me.isConfig(key) && !Neo.hasPropertySetter(me, key)) {
                me[key] = value;
                delete config[key]
            }
        });

        return config
    }

    /**
     * Sets the value of a static config by a given key
     * @param {String} key The key of a staticConfig defined inside static getStaticConfig
     * @param {*} value
     * @returns {Boolean} true in case the config exists and got changed
     */
    setStaticConfig(key, value) {
        let staticConfig = this.constructor.staticConfig;

        if (staticConfig.hasOwnProperty(key)) {
            staticConfig[key] = value;
            return true
        }

        return false
    }

    /**
     * Stores timeoutIds internally, so that destroy() can clear them if needed
     * @param {Number} time in milliseconds
     * @returns {Promise<any>}
     */
    timeout(time) {
        return new Promise(resolve => {
            let timeoutIds = this.#timeoutIds,
                timeoutId  = setTimeout(() => {timeoutIds.splice(timeoutIds.indexOf(timeoutId), 1); resolve()}, time);

            timeoutIds.push(timeoutId)
        })
    }

    /**
     * <p>Enhancing the toString() method, e.g.</p>
     * `Neo.create('Neo.button.Base').toString() => "[object Neo.button.Base]"`
     * @returns {String}
     */
    get [Symbol.toStringTag]() {
        return this.className
    }

    /**
     * <p>Enhancing the instanceof method. Without this change:</p>
     * `Neo.collection.Base.prototype instanceof Neo.core.Base => true`
     * <p>With this change:</p>
     * `Neo.collection.Base.prototype instanceof Neo.core.Base => false`<br>
     * `Neo.create(Neo.collection.Base) instanceof Neo.core.Base => true`
     * @returns {Boolean}
     */
    static [Symbol.hasInstance](instance) {
        if (!instance) {
            return false
        }

        return instance[isInstance] === true ? super[Symbol.hasInstance](instance) : false
    }
}

export default Neo.setupClass(Base);
