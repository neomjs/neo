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
            if (item.prototype?.constructor.isClass) {
                return 'NeoClass'
            }
        },
        object: item => {
            if (item.constructor.isClass && item instanceof Neo.core.Base) {
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
     *
     */
    emptyFn() {},

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

        // If target is null or undefined, and source is an object, initialize target to an empty object.
        // Otherwise, if target is null or undefined, just return source (replacement).
        if (target == null) {
            if (Neo.typeOf(source) === 'Object') {
                target = {}
            } else {
                return source
            }
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
     * Updates the global Neo.config object across all active workers and connected browser windows.
     *
     * This is the unified entry point for changing global framework configurations.
     * The framework automatically handles the complex multi-threaded and multi-window
     * synchronization (via App Workers and Shared Workers, if active), ensuring
     * consistency across the entire application without boilerplate.
     *
     * You can pass a partial config object to update specific keys.
     * For nested objects, Neo.mjs performs a deep merge to preserve existing properties.
     *
     * @memberOf module:Neo
     * @function setGlobalConfig
     * @param {Object} config The partial or full Neo.config object with changes to apply.
     */

    /**
     * Internally used at the end of each class / module definition
     * @memberOf module:Neo
     * @template T
     * @param {T} cls
     * @returns {T}
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
                    autoGenerateGetSet(element, baseKey)
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
                applyMixins(ctor, mixins);

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
        if (item === null || item === undefined) {
            return null
        }

        return typeDetector[typeof item]?.(item) || item.constructor.name
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
 * @private
 */
function applyMixins(cls, mixins) {
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

        Object.getOwnPropertyNames(mixinProto).forEach(mixinProperty(cls.prototype, mixinProto))
    }

    cls.prototype.mixins = mixinClasses // todo: we should do a deep merge
}

/**
 * Creates get / set methods for class configs ending with an underscore
 * @param {Neo.core.Base} proto
 * @param {String}        key
 * @private
 * @tutorial 02_ClassSystem
 */
function autoGenerateGetSet(proto, key) {
    if (Neo.hasPropertySetter(proto, key)) {
        throw('Config ' + key + '_ (' + proto.className + ') already has a set method, use beforeGet, beforeSet & afterSet instead')
    }

    const
        _key      = '_' + key,
        uKey      = key[0].toUpperCase() + key.slice(1),
        beforeGet = 'beforeGet' + uKey,
        beforeSet = 'beforeSet' + uKey,
        afterSet  = 'afterSet'  + uKey;

    if (!Neo[getSetCache]) {
        Neo[getSetCache] = {}
    }

    if (!Neo[getSetCache][key]) {
        // Public Descriptor
        Neo[getSetCache][key] = {
            get() {
                let me        = this,
                    hasNewKey = Object.hasOwn(me[configSymbol], key),
                    newKey    = me[configSymbol][key],
                    value     = hasNewKey ? newKey : me[_key];

                if (Array.isArray(value)) {
                    if (key !== 'items') {
                        value = [...value]
                    }
                } else if (value instanceof Date) {
                    value = new Date(value.valueOf())
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

                let me       = this,
                    oldValue = config.get(); // Get the old value from the Config instance

                // Every set call has to delete the matching symbol
                delete me[configSymbol][key];

                if (key !== 'items' && key !== 'vnode') {
                    value = Neo.clone(value, true, true)
                }

                if (typeof me[beforeSet] === 'function') {
                    value = me[beforeSet](value, oldValue);

                    // If they don't return a value, that means no change
                    if (value === undefined) return;
                }

                // Set the new value into the Config instance
                // The config.set() method will return true if the value actually changed.
                if (config.set(value)) {
                    me[afterSet]?.(value, oldValue);
                    me.afterSetConfig?.(key, value, oldValue)
                }
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

    Object.defineProperty(proto, key,  Neo[getSetCache][key]);
    Object.defineProperty(proto, _key, Neo[getSetCache][_key])
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
 * @returns {Function}
 * @private
 */
function mixinProperty(proto, mixinProto) {
    return function(key) {
        if (~ignoreMixin.indexOf(key)) {
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
