import DefaultConfig  from './DefaultConfig.mjs';
import {isDescriptor} from './core/ConfigSymbols.mjs';

const
    camelRegex   = /-./g,
    configSymbol = Symbol.for('configSymbol'),
    getSetCache  = Symbol('getSetCache'),
    cloneMap = {
        Array(obj, deep, ignoreNeoInstances) {
            return !deep ? [...obj] : [...obj.map(val => Neo.clone(val, deep, ignoreNeoInstances))]
        },
        Date(obj) {
            return new Date(obj.valueOf())
        },
        Map(obj) {
            return new Map(obj) // shallow copy
        },
        NeoInstance(obj, ignoreNeoInstances) {
            return ignoreNeoInstances ? obj : Neo.cloneNeoInstance(obj)
        },
        Set(obj) {
            return new Set(obj)
        },
        Object(obj, deep, ignoreNeoInstances) {
            const out = {};

            // Use Reflect.ownKeys() to include symbol properties (e.g., for config descriptors)
            Reflect.ownKeys(obj).forEach(key => {
                const value = obj[key];
                out[key] = !deep ? value : Neo.clone(value, deep, ignoreNeoInstances)
            });

            return out
        }
    },
    typeDetector = {
        function: item => {
            if (item.prototype?.constructor?.isClass) {
                return 'NeoClass'
            }
        },
        object: item => {
            if (item.constructor?.isClass && item instanceof Neo.core.Base) {
                return 'NeoInstance'
            }
        }
    };

/**
 * The base module to enhance classes, create instances and the Neo namespace
 * @module Neo
 * @singleton
 * @borrows Neo.core.Util.bindMethods       as bindMethods
 * @borrows Neo.core.Util.createStyleObject as createStyleObject
 * @borrows Neo.core.Util.createStyles      as createStyles
 * @borrows Neo.core.Util.decamel           as decamel
 * @borrows Neo.core.Util.isArray           as isArray
 * @borrows Neo.core.Util.isBoolean         as isBoolean
 * @borrows Neo.core.Util.isDefined         as isDefined
 * @borrows Neo.core.Compare.isEqual        as isEqual
 * @borrows Neo.core.Util.isNumber          as isNumber
 * @borrows Neo.core.Util.isObject          as isObject
 * @borrows Neo.core.Util.isString          as isString
 * @borrows Neo.core.Util.toArray           as toArray
 * @tutorial 01_Concept
 */
let Neo = globalThis.Neo || {};

Neo = globalThis.Neo = Object.assign({
    /**
     * A map containing ntypes as key and Neo classes or singletons as values
     * @memberOf! module:Neo
     * @protected
     * @type Object
     */
    ntypeMap: {},
    /**
     * Needed for Neo.create. False for the main thread, true for the App, Data & Vdom worker
     * @memberOf! module:Neo
     * @protected
     * @type Boolean
     */
    insideWorker: typeof DedicatedWorkerGlobalScope !== 'undefined' || typeof WorkerGlobalScope !== 'undefined',

    /**
     * Maps methods from one namespace to another one
     * @example
     * // aliases
     * Neo.applyFromNs(Neo, Util, {
     *     createStyleObject: 'createStyleObject',
     *     createStyles     : 'createStyles',
     *     capitalize       : 'capitalize'
     * }, true);
     *
     * // e.g. Neo.core.Util.isObject => Neo.isObject
     * @memberOf module:Neo
     * @param {Neo|Neo.core.Base} target    The target class or singleton Instance or Neo
     * @param {Neo.core.Base}     namespace The class containing the methods
     * @param {Object}            config
     * @param {Boolean}           [bind]    set this to true in case you want to bind methods to the "from" namespace
     * @returns {Object} target
     */
    applyFromNs(target, namespace, config, bind) {
        let fnName;

        if (target && Neo.typeOf(config) === 'Object') {
            Object.entries(config).forEach(([key, value]) => {
                fnName = namespace[value];
                target[key] = bind ? fnName.bind(namespace) : fnName
            })
        }

        return target
    },

    /**
     * Maps a class to the global Neo or App namespace.
     * Can get called for classes and singleton instances
     * @memberOf module:Neo
     * @param {Neo.core.Base} cls
     */
    applyToGlobalNs(cls) {
        let proto     = typeof cls === 'function' ? cls.prototype : cls,
            className = proto.isClass ? proto.config.className : proto.className,
            nsArray   = className.split('.'),
            key       = nsArray.pop(),
            ns        = Neo.ns(nsArray, true);

        ns[key] = cls
    },

    /**
     * Copies all keys of defaults into target, in case they don't already exist
     * @memberOf module:Neo
     * @param {Object} target   The target object
     * @param {Object} defaults The object containing the keys you want to copy
     * @returns {Object} target
     */
    assignDefaults(target, defaults) {
        if (target && Neo.typeOf(defaults) === 'Object') {
            Object.entries(defaults).forEach(([key, value]) => {
                if (!Object.hasOwn(target, key)) {
                    target[key] = value
                }
            })
        }

        return target
    },

    /**
     * Assigns a new value to a given nested objects path.
     * It will create the path structure or parts of it, in case it does not exist.
     * @example
     * Neo.assignToNs('annotations.selected', false, record)
     *
     * @memberOf module:Neo
     * @param {String[]|String} path             The path string containing dots or an Array of the string parts
     * @param {*}               value            The new value to assign to the leaf node
     * @param {Object}          scope=globalThis Set a different starting point as globalThis
     * @param {Boolean}         force=true       false will only assign default values (assign if old value === undefined)
     */
    assignToNs(path, value, scope=globalThis, force=true) {
        path = Array.isArray(path) ? path : path.split('.');

        let key;

        if (path.length > 1) {
            key   = path.pop();
            scope = Neo.ns(path, true, scope)
        } else {
            key = path
        }

        if (force || scope[key] === undefined) {
            scope[key] = value
        }
    },

    /**
     * Converts kebab-case strings into camel-case
     * @memberOf module:Neo
     * @param {String} value The target object
     * @returns {String}
     */
    camel(value) {
        return value.replace(camelRegex, match => match[1].toUpperCase())
    },

    /**
     * Makes the first character of a string uppercase
     * @memberOf module:Neo
     * @param {String} value
     * @returns {Boolean|String} Returns false for non string inputs
     */
    capitalize(value) {
        return value[0].toUpperCase() + value.slice(1)
    },

    /**
     * @memberOf module:Neo
     * @param {Object|Array|*} obj
     * @param {Boolean} deep=false               Set this to true in case you want to clone nested objects as well
     * @param {Boolean} ignoreNeoInstances=false returns existing instances if set to true
     * @returns {Object|Array|*} the cloned input
     */
    clone(obj, deep=false, ignoreNeoInstances=false) {
        return cloneMap[Neo.typeOf(obj)]?.(obj, deep, ignoreNeoInstances) || obj
    },

    /**
     * Creates a new instance using the originalConfig without the id
     * @memberOf module:Neo
     * @param {Neo.core.Base} instance
     * @returns {Neo.core.Base} the cloned instance
     */
    cloneNeoInstance(instance) {
        let config = {...instance.originalConfig};

        delete config._id;
        delete config.id;

        return Neo.create(instance.className, config)
    },

    /**
     * Use Neo.create() instead of "new" to create instances of all Neo classes
     * @example
     * import Button from '../button/Base.mjs';
     *
     * Neo.create(Button, {
     *     iconCls: 'fa fa-home',
     *     text   : 'Home'
     * });
     * @example
     * import Button from '../button/Base.mjs';
     *
     * Neo.create({
     *     module : Button,
     *     iconCls: 'fa fa-home',
     *     text   : 'Home'
     * });
     * @example
     * Neo.create('Neo.button.Base' {
     *     iconCls: 'fa fa-home',
     *     text   : 'Home'
     * });
     * @example
     * Neo.create({
     *     className: 'Neo.button.Base',
     *     iconCls  : 'fa fa-home',
     *     text     : 'Home'
     * });
     * @memberOf module:Neo
     * @param {String|Object|Neo.core.Base} className
     * @param {Object}                      [config]
     * @returns {Neo.core.Base|null} The new class instance
     * @tutorial 02_ClassSystem
     */
    create(className, config) {
        let type = Neo.typeOf(className),
            cls, instance;

        if (type === 'NeoClass') {
            cls = className
        } else {
            if (type === 'Object') {
                config = className;

                if (!config.className && !config.module) {
                    // using console.error instead of throw to show the config object
                    console.error('Class created with object configuration missing className or module property', config);
                    return null
                }

                className = config.className || config.module.prototype.className
            }

            if (!exists(className)) {
                throw new Error('Class ' + className + ' does not exist')
            }

            cls = Neo.ns(className)
        }

        instance = new cls();

        instance.construct(config);
        instance.onConstructed();
        instance.onAfterConstructed();
        instance.init();

        return instance
    },

    /**
     * Defines a reactive configuration property on a target object (prototype or instance).
     * This method creates getters and setters that fully participate in Neo.mjs's reactive config system,
     * including lifecycle hooks.
     *
     * @param {Neo.core.Base}  target        - The instance or prototype on which to define the config.
     * @param {String}         key           - The name of the config property (without the '_' suffix).
     * @param {*}             [initialValue] - The initial value for the config.
     */
    createConfig(target, key, initialValue) {
        if (Neo.hasPropertySetter(target, key)) {
            throw(
`Invalid config in ${target.className}: '${key}_'. The config '${key}' is already defined as reactive by a parent class.
To override the default value, use '${key}' (without the underscore) in your static config.
If you intended to create custom logic, use the 'beforeGet${Neo.capitalize(key)}()', 'beforeSet${Neo.capitalize(key)}()', and 'afterSet${Neo.capitalize(key)}()' hooks instead of redefining the config.`
            )
        }

        const
            _key      = '_' + key,
            uKey      = key[0].toUpperCase() + key.slice(1),
            beforeGet = 'beforeGet' + uKey,
            beforeSet = 'beforeSet' + uKey,
            afterSet  = 'afterSet'  + uKey;

        Neo[getSetCache] ??= {};

        if (!Neo[getSetCache][key]) {
            // Public Descriptor
            Neo[getSetCache][key] = {
                get() {
                    let me        = this,
                        config    = me.getConfig(key),
                        hasNewKey = Object.hasOwn(me[configSymbol], key),
                        newKey    = me[configSymbol][key],
                        value     = hasNewKey ? newKey : me[_key];

                    if (value instanceof Date) {
                        value = new Date(value.valueOf());
                    }
                    // new, explicit opt-in path
                    else if (config.cloneOnGet) {
                        const {cloneOnGet} = config;

                        if (cloneOnGet === 'deep') {
                            value = Neo.clone(value, true, true);
                        } else if (cloneOnGet === 'shallow') {
                            const type = Neo.typeOf(value);

                            if (type === 'Array') {
                                value = [...value];
                            } else if (type === 'Object') {
                                value = {...value};
                            }
                        }
                    }
                    // legacy behavior
                    else if (Array.isArray(value)) {
                        value = [...value];
                    }

                    if (hasNewKey) {
                        me[key] = value;  // We do want to trigger the setter => beforeSet, afterSet
                        value = me[_key]; // Return the value parsed by the setter
                        delete me[configSymbol][key]
                    }

                    if (typeof me[beforeGet] === 'function') {
                        value = me[beforeGet](value)
                    }

                    return value
                },
                set(value) {
                    if (value === undefined) return;

                    const config = this.getConfig(key);
                    if (!config) return;

                    let me                   = this,
                        oldValue             = config.get(), // Get the old value from the Config instance
                        {EffectBatchManager} = Neo.core,
                        isNewBatch           = !EffectBatchManager?.isBatchActive();

                    // If a config change is not triggered via `core.Base#set()`, honor changes inside hooks.
                    isNewBatch && EffectBatchManager?.startBatch();

                    // 1. Prevent infinite loops:
                    // Immediately remove the pending value from the configSymbol to prevent a getter from
                    // recursively re-triggering this setter.
                    delete me[configSymbol][key];

                    switch (config.clone) {
                        case 'deep':
                            value = Neo.clone(value, true, true);
                            break;
                        case 'shallow':
                            value = Neo.clone(value, false, true);
                            break;
                    }

                    // 2. Create a temporary state for beforeSet hooks:
                    // Set the new value directly on the private backing property. This allows any beforeSet
                    // hook to access the new value of this and other configs within the same `set()` call.
                    me[_key] = value;

                    if (typeof me[beforeSet] === 'function') {
                        value = me[beforeSet](value, oldValue);

                        // If they don't return a value, that means no change
                        if (value === undefined) {
                            // Restore the original value if the update is canceled.
                            me[_key] = oldValue;
                            isNewBatch && EffectBatchManager?.endBatch();
                            return
                        }
                    }

                    // 3. Restore state for change detection:
                    // Revert the private backing property to its original value. This is crucial for the
                    // `config.set()` method to correctly detect if the value has actually changed.
                    me[_key] = oldValue;

                    // 4. Finalize the change:
                    // The config.set() method performs the final check and, if the value changed,
                    // triggers afterSet hooks and notifies subscribers.
                    if (config.set(value)) {
                        me[afterSet]?.(value, oldValue);
                        me.afterSetConfig?.(key, value, oldValue)
                    }

                    isNewBatch && EffectBatchManager?.endBatch()
                }
            };

            // Private Descriptor
            Neo[getSetCache][_key] = {
                get() {
                    return this.getConfig(key)?.get()
                },
                set(value) {
                    this.getConfig(key)?.setRaw(value)
                }
            }
        }

        Object.defineProperty(target, key,  Neo[getSetCache][key]);
        Object.defineProperty(target, _key, Neo[getSetCache][_key]);

        if (initialValue !== undefined) {
            target[key] = initialValue
        }
    },

    /**
     *
     */
    emptyFn() {},

    /**
     * Ensures a class is assigned to the Neo namespace only once, preventing duplicates.
     * This is a lightweight version of `Neo.setupClass` for simple classes
     * that do not extend `Neo.core.Base`.
     * It follows a "first one wins" strategy.
     *
     * @param {Function|Object} module    - The class constructor or singleton object to register.
     * @param {String}          classPath - The fully qualified name (e.g., 'Neo.core.Config').
     * @param {Function}       [onFirst]  - An optional callback that runs only the first time the class is registered.
     * @returns {Function|Object} The class or singleton from the Neo namespace (either the existing one or the newly set one).
     */
    gatekeep(module, classPath, onFirst) {
        const existingClass = Neo.ns(classPath, false);

        if (existingClass) {
            return existingClass
        }

        const
            nsArray   = classPath.split('.'),
            className = nsArray.pop(),
            parentNs  = Neo.ns(nsArray, true);

        parentNs[className] = module;

        onFirst?.(module);

        return parentNs[className]
    },

    /**
     * Checks if there is a set method for a given property key inside the prototype chain
     * @memberOf module:Neo
     * @param {Neo.core.Base} proto The top level prototype of a class
     * @param {String}        key   The property key to test
     * @returns {Boolean}
     */
    hasPropertySetter(proto, key) {
        let descriptor;

        while (proto.__proto__) {
            descriptor = Object.getOwnPropertyDescriptor(proto, key);

            if (typeof descriptor === 'object' && typeof descriptor.set === 'function') {
                return true
            }

            proto = proto.__proto__
        }

        return false
    },

    /**
     * Deep-merges a source object into a target object
     * @memberOf module:Neo
     * @param {Object} target
     * @param {Object} source
     * @param {Object} defaults
     * @returns {Object} target
     */
    merge(target, source, defaults) {
        if (defaults) {
            return Neo.merge(Neo.merge(target, defaults), source)
        }

        if (!target) {
            return source
        }

        for (const key in source) {
            const value = source[key];

            if (Neo.typeOf(value) === 'Object') {
                target[key] = Neo.merge(target[key] || {}, value)
            } else {
                target[key] = value
            }
        }

        return target
    },

    /**
     * Merges a new value into an existing config value based on a specified strategy.
     * This method is used during instance creation to apply merge strategies defined in config descriptors.
     * @param {any} defaultValue - The default value of the config (from static config).
     * @param {any} instanceValue - The value provided during instance creation.
     * @param {string|Function} strategy - The merge strategy: 'shallow', 'deep', 'replace', or a custom function.
     * @returns {any} The merged value.
     */
    mergeConfig(defaultValue, instanceValue, strategy) {
        const
            defaultValueType  = Neo.typeOf(defaultValue),
            instanceValueType = Neo.typeOf(instanceValue);

        if (strategy === 'shallow') {
            if (defaultValueType === 'Object' && instanceValueType === 'Object') {
                return {...defaultValue, ...instanceValue}
            }
        } else if (strategy === 'deep') {
            if (defaultValueType === 'Object' && instanceValueType === 'Object') {
                return Neo.merge(Neo.clone(defaultValue, true), instanceValue)
            }
        } else if (typeof strategy === 'function') {
            return strategy(defaultValue, instanceValue)
        }

        // Default to 'replace' or if strategy is not recognized
        return instanceValue
    },

    /**
     * Maps a className string into a given or global namespace
     * @example
     * Neo.ns('Neo.button.Base', true);
     * // =>
     * // globalThis.Neo             = globalThis.Neo             || {};
     * // globalThis.Neo.button      = globalThis.Neo.button      || {};
     * // globalThis.Neo.button.Base = globalThis.Neo.button.Base || {};
     * // return globalThis.Neo.button.Base;
     *
     * @memberOf module:Neo
     * @param {String[]|String} names        The class name string containing dots or an Array of the string parts
     * @param {Boolean}         create=false Set create to true to create empty objects for non-existing parts
     * @param {Object}          [scope]      Set a different starting point as globalThis
     * @returns {Object} reference to the toplevel namespace
     */
    ns(names, create=false, scope) {
        names = Array.isArray(names) ? names : names.split('.');

        return names.reduce((prev, current) => {
            if (create && !prev[current]) {
                prev[current] = {}
            }

            if (prev) {
                return prev[current]
            }
        }, scope || globalThis)
    },

    /**
     * Extended version of Neo.ns() which supports mapping into arrays.
     * @memberOf module:Neo
     * @param {Array|String} names        The class name string containing dots or an Array of the string parts
     * @param {Boolean}      create=false Set create to true to create empty objects for non-existing parts
     * @param {Object}       [scope]      Set a different starting point as globalThis
     * @returns {Object} reference to the toplevel namespace
     */
    nsWithArrays(names, create=false, scope) {
        names = Array.isArray(names) ? names : names.split('.');

        return names.reduce((prev, current) => {
            if (create && !prev[current]) {
                if (current.endsWith(']')) {
                    return createArrayNs(true, current, prev)
                }

                prev[current] = {}
            }

            if (prev) {
                if (current.endsWith(']')) {
                    return createArrayNs(false, current, prev)
                }

                return prev[current]
            }
        }, scope || globalThis)
    },

    /**
     * Creates instances of Neo classes using their ntype instead of the class name
     * @example
     * Neo.ntype('button' {
     *     iconCls: 'fa fa-home',
     *     text   : 'Home'
     * });
     * @example
     * Neo.ntype({
     *     ntype  : 'button',
     *     iconCls: 'fa fa-home',
     *     text   : 'Home'
     * });
     * @memberOf module:Neo
     * @param {String|Object} ntype
     * @param {Object}        [config]
     * @returns {Neo.core.Base}
     * @see {@link module:Neo.create create}
     */
    ntype(ntype, config) {
        if (typeof ntype === 'object') {
            config = ntype;

            if (!config.ntype) {
                throw new Error('Class defined with object configuration missing ntype property. ' + config.ntype)
            }

            ntype = config.ntype
        }

        let className = Neo.ntypeMap[ntype];

        if (!className) {
            throw new Error('ntype ' + ntype + ' does not exist')
        }

        return Neo.create(className, config)
    },

    /**
     * This is the final and most critical step in the Neo.mjs class creation process.
     * It is called at the end of every class module definition.
     *
     * `setupClass` performs several key operations:
     * 1.  **Mixed-Environment Gatekeeper:** It first checks if the class's namespace already exists.
     *     If it does, it immediately returns the existing class. This is the crucial "first comes wins"
     *     strategy that enables Neo.mjs to safely combine environments. For example, a bundled
     *     `dist/production` app can dynamically load an unbundled module from `dist/esm` at runtime.
     *     If that module imports a class already present in the main bundle, this check ensures the
     *     original, bundled class is used, preventing conflicts and maintaining application integrity.
     * 1.  **Configuration Merging:** It traverses the prototype chain to merge `static config`
     *     objects from parent classes into the current class, creating a unified `config`.
     * 2.  **Applying Overwrites:** It calls the static `applyOverwrites()` method on the class,
     *     allowing the global `Neo.overwrites` object to modify the class's default prototype
     *     configs. This is a key mechanism for external theming and configuration.
     * 3.  **Reactive Getter/Setter Generation:** For any config ending with an underscore (e.g., `myConfig_`),
     *     it automatically generates the corresponding public getter and setter. This enables optional
     *     lifecycle hooks that are called automatically if implemented on the class:
     *     - `beforeGetMyConfig(value)`
     *     - `beforeSetMyConfig(newValue, oldValue)`
     *     - `afterSetMyConfig(newValue, oldValue)`
     * 4.  **Prototype-based Configs:** Non-reactive configs (without an underscore) are set
     *     directly on the prototype for memory efficiency.
     * 5.  **Mixin Application:** It processes the `mixins` config to blend in functionality from
     *     other classes.
     * 6.  **Namespace Registration:** It registers the class in the global `Neo` namespace.
     * 7.  **Singleton Instantiation:** If the class is configured as a singleton, it creates the
     *     single instance.
     *
     * @memberOf module:Neo
     * @template T
     * @param {T} cls The class constructor to process.
     * @returns {T} The processed and finalized class constructor or singleton instance.
     */
    setupClass(cls) {
        let baseConfig            = null,
            baseConfigDescriptors = null,
            ntypeChain            = [],
            {ntypeMap}            = Neo,
            proto                 = cls.prototype || cls,
            ns                    = Neo.ns(proto.constructor.config.className, false),
            protos                = [],
            cfg, config, configDescriptors, ctor, hierarchyInfo, ntype;

        /*
         * If the namespace already exists, directly return it.
         * This can happen when using different versions of Neo.mjs
         * => Especially singletons (IdGenerator) must stay unique.
         *
         * This can also happen when using different environments of neo.mjs in parallel.
         * Example: code.LivePreview running inside a dist/production app.
         */
        if (ns) {
            return ns
        }

        // Traverse the prototype chain to collect inherited configs and descriptors
        while (proto.__proto__) {
            ctor = proto.constructor;

            // If a class in the prototype chain has already had its config applied,
            // we can use its pre-processed config and descriptors as a base.
            if (Object.hasOwn(ctor, 'classConfigApplied')) {
                baseConfig            = Neo.clone(ctor.config, true);
                baseConfigDescriptors = Neo.clone(ctor.configDescriptors, true);
                ntypeChain            = [...ctor.ntypeChain];
                break
            }

            protos.unshift(proto);
            proto = proto.__proto__
        }

        // Initialize accumulated config and descriptors
        config            = baseConfig            || {};
        configDescriptors = baseConfigDescriptors || {};

        // Process each class in the prototype chain (from top to bottom)
        protos.forEach(element => {
            let mixins;

            ctor = element.constructor;
            cfg  = ctor.config || {};

            if (Neo.overwrites) {
                ctor.applyOverwrites?.(cfg)
            }

            // Process each config property defined in the current class's static config
            Object.entries(cfg).forEach(([key, value]) => {
                const
                    isReactive = key.slice(-1) === '_',
                    baseKey    = isReactive ? key.slice(0, -1) : key;

                // 1. Handle descriptors: If the value is a descriptor object, store it.
                //    The 'value' property of the descriptor is then used as the actual config value.
                if (Neo.isObject(value) && value[isDescriptor] === true) {
                    ctor.configDescriptors ??= {};
                    ctor.configDescriptors[baseKey] = Neo.clone(value, true); // Deep clone to prevent mutation
                    value = value.value // Use the descriptor's value as the config value
                }

                // 2. Handle reactive vs. non-reactive configs: Generate getters/setters for reactive configs.
                if (isReactive) {
                    delete cfg[key];      // Remove original key with underscore
                    cfg[baseKey] = value; // Use the potentially modified value
                    Neo.createConfig(element, baseKey)
                }
                // This part handles non-reactive configs (including those that were descriptors)
                // If no property setter exists, define it directly on the prototype.
                else if (!Neo.hasPropertySetter(element, key)) {
                    Object.defineProperty(element, key, {
                        enumerable: true,
                        value,
                        writable  : true
                    })
                }
            });

            // Merge configDescriptors: Apply "first-defined wins" strategy.
            // If a descriptor for a key already exists (from a parent class), it is not overwritten.
            if (ctor.configDescriptors) {
                for (const key in ctor.configDescriptors) {
                    if (!Object.hasOwn(configDescriptors, key)) {
                        configDescriptors[key] = Neo.clone(ctor.configDescriptors[key], true) // Deep clone for immutability
                    }
                }
            }

            // Process ntype and ntypeChain
            if (Object.hasOwn(cfg, 'ntype')) {
                ntype = cfg.ntype;

                ntypeChain.unshift(ntype);

                // Running the docs app inside a workspace can pull in the same classes from different roots,
                // so we want to check for different class names as well
                if (Object.hasOwn(ntypeMap, ntype) && cfg.className !== ntypeMap[ntype]) {
                    throw new Error(`ntype conflict for '${ntype}' inside the classes:\n${ntypeMap[ntype]}\n${cfg.className}`)
                }

                ntypeMap[ntype] = cfg.className
            }

            // Process mixins
            mixins = Object.hasOwn(config, 'mixins') && config.mixins || [];

            if (ctor.observable) {
                mixins.push('Neo.core.Observable')
            }

            if (Object.hasOwn(cfg, 'mixins') && Array.isArray(cfg.mixins) && cfg.mixins.length > 0) {
                mixins.push(...cfg.mixins)
            }

            if (mixins.length > 0) {
                applyMixins(ctor, mixins, cfg);

                if (Neo.ns('Neo.core.Observable', false, ctor.prototype.mixins)) {
                    ctor.observable = true
                }
            }

            delete cfg.mixins;
            delete config.mixins;

            // Hierarchical merging of static config values based on descriptors.
            // This ensures that values are merged (e.g., shallow/deep) instead of simply overwritten.
            Object.entries(cfg).forEach(([key, value]) => {
                const descriptor = configDescriptors[key];

                if (descriptor?.merge) {
                    config[key] = Neo.mergeConfig(config[key], value, descriptor.merge)
                } else {
                    config[key] = value
                }
            });

            // Assign final processed config and descriptors to the class constructor
            Object.assign(ctor, {
                classConfigApplied: true,
                config            : Neo.clone(config,            true), // Deep clone final config for immutability
                configDescriptors : Neo.clone(configDescriptors, true), // Deep clone final descriptors for immutability
                isClass           : true,
                ntypeChain
            });

            // Apply to global namespace if not a singleton
            !config.singleton && this.applyToGlobalNs(cls)
        });

        proto = cls.prototype || cls;

        // Add is<Ntype> flags to the prototype
        ntypeChain.forEach(ntype => {
            proto[`is${Neo.capitalize(Neo.camel(ntype))}`] = true
        });

        // If it's a singleton, create and apply the instance to the global namespace
        if (proto.singleton) {
            cls = Neo.create(cls);
            Neo.applyToGlobalNs(cls)
        }

        // Add class hierarchy information to the manager or a temporary map
        hierarchyInfo = {
            className      : proto.className,
            module         : cls,
            ntype          : Object.hasOwn(proto, 'ntype') ? proto.ntype : null,
            parentClassName: proto.__proto__?.className || null
        };

        if (Neo.manager?.ClassHierarchy) {
            Neo.manager.ClassHierarchy.add(hierarchyInfo)
        } else {
            Neo.classHierarchyMap ??= {};
            Neo.classHierarchyMap[proto.className] = hierarchyInfo
        }

        return cls
    },

    /**
     * @param {*} item
     * @returns {String|null}
     */
    typeOf(item) {
        // Return null for null or undefined
        if (item == null) {
            return null
        }

        return typeDetector[typeof item]?.(item) || item.constructor?.name
    }
}, Neo);

/**
 * List of class properties which are not supposed to get mixed into other classes
 * @type {string[]}
 * @private
 */
const ignoreMixin = [
    '_name',
    'classConfigApplied',
    'className',
    'constructor',
    'id',
    'isClass',
    'mixin',
    'ntype',
    'observable'
],

    charsRegex         = /\d+/g,
    extractArraysRegex = /^(\w+)\s*((?:\[\s*\d+\s*\]\s*)*)$/;

/**
 * @param {Neo.core.Base} cls
 * @param {Array}         mixins
 * @param {Object}        classConfig
 * @private
 */
function applyMixins(cls, mixins, classConfig) {
    if (!Array.isArray(mixins)) {
        mixins = [mixins];
    }

    let i            = 0,
        len          = mixins.length,
        mixinClasses = {},
        mixin, mixinCls, mixinProto;

    for (;i < len;i++) {
        mixin = mixins[i];

        if (mixin.isClass) {
            mixinProto = mixin.prototype;
            mixinCls   = Neo.ns(mixinProto.className)
        } else {
            if (!exists(mixin)) {
                throw new Error('Attempting to mixin an undefined class: ' + mixin + ', ' + cls.prototype.className)
            }

            mixinCls   = Neo.ns(mixin);
            mixinProto = mixinCls.prototype
        }

        mixinProto.className.split('.').reduce(mixReduce(mixinCls), mixinClasses);

        Object.entries(Object.getOwnPropertyDescriptors(mixinProto)).forEach(mixinProperty(cls.prototype, mixinProto, classConfig))
    }

    cls.prototype.mixins = mixinClasses // todo: we should do a deep merge
}

/**
 * @param {Boolean} create
 * @param {Object}  current
 * @param {Object}  prev
 * @returns {Object|undefined}
 */
function createArrayNs(create, current, prev) {
    let arrDetails = parseArrayFromString(current),
        i          = 1,
        len        = arrDetails.length,
        arrItem, arrRoot;

    if (create) {
        prev[arrDetails[0]] = arrRoot = prev[arrDetails[0]] || []
    } else {
        arrRoot = prev[arrDetails[0]]
    }

    if (!arrRoot) return;

    for (; i < len; i++) {
        arrItem = parseInt(arrDetails[i]);

        if (create) {
            arrRoot[arrItem] = arrRoot[arrItem] || {}
        }

        arrRoot = arrRoot[arrItem]
    }

    return arrRoot
}

/**
 * Checks if the class name exists inside the Neo or app namespace
 * @param {String} className
 * @returns {Boolean}
 * @private
 */
function exists(className) {
    try {
        return !!className.split('.').reduce((prev, current) => {
            return prev[current]
        }, globalThis)
    } catch(e) {
        return false
    }
}

/**
 * @param {Neo.core.Base} proto
 * @param {Neo.core.Base} mixinProto
 * @param {Object}        classConfig
 * @returns {Function}
 * @private
 */
function mixinProperty(proto, mixinProto, classConfig) {
    return function([key, descriptor]) {
        if (ignoreMixin.includes(key)) return;

        // Mixins must not override existing class properties with a setter
        if (Neo.hasPropertySetter(proto, key)) return;

        // Reactive neo configs, or public class fields defined via get() AND set()
        if (descriptor.get && descriptor.set) {
            Neo.createConfig(proto, key);

            const mixinClassConfig = mixinProto.constructor.config;

            if (Object.hasOwn(mixinClassConfig, key)) {
                classConfig[key] = mixinClassConfig[key];
            }

            return
        }

        if (proto[key]?._from) {
            if (mixinProto.className === proto[key]._from) {
                console.warn('Mixin set multiple times or already defined on a Base Class', proto.className, mixinProto.className, key);
                return
            }

            throw new Error(
                `${proto.className}: Multiple mixins defining same property (${mixinProto.className}, ${proto[key]._from}) => ${key}`
            )
        }

        proto[key] = mixinProto[key];

        Object.getOwnPropertyDescriptor(proto, key)._from = mixinProto.className;

        if (typeof proto[key] === 'function') {
            proto[key]._name = key
        }
    }
}

/**
 * @param mixinCls
 * @returns {Function}
 * @private
 */
function mixReduce(mixinCls) {
    return (prev, current, idx, arr) => {
        return prev[current] = idx !== arr.length -1 ? prev[current] || {} : mixinCls
    }
}

/**
 * @param {String} str
 * @returns {Function}
 * @private
 */
function parseArrayFromString(str) {
    return (extractArraysRegex.exec(str) || [null]).slice(1).reduce(
        (fun, args) => [fun].concat(args.match(charsRegex))
    )
}

Neo.config ??= {};

Neo.assignDefaults(Neo.config, DefaultConfig);

export default Neo;
