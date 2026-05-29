import fs       from 'fs/promises';
import path     from 'path';
import Provider from '../src/state/Provider.mjs';
import Env      from '../src/util/Env.mjs';

/**
 * @summary Reactive base configuration manager for Neo MCP servers.
 *
 * Extends the Body-tier reactive state Provider. A subclass supplies a single
 * meta-leaf `metaTree` config — each leaf is `{env?, default, parse?}` — which is
 * compiled at construction into the reactive `data` tree plus a separate
 * leaf-metadata registry. Consumers read values directly (`config.namespace.leaf`)
 * via the proxy returned by {@link createConfigProxy}; the inherited hierarchical
 * data proxy resolves nested paths and routes assignments back through `setData`.
 *
 * Environment variables and runtime overrides take precedence over leaf defaults
 * and are re-asserted after any overlay file load. Per-leaf parser metadata is kept
 * in a registry independent of the Provider's reactive config map, so set-time
 * validation can resolve a leaf by its full dotted path.
 *
 * @class Neo.ai.BaseConfig
 * @extends Neo.state.Provider
 */
class BaseConfig extends Provider {
    static config = {
        /**
         * @member {String} className='Neo.ai.BaseConfig'
         * @protected
         */
        className: 'Neo.ai.BaseConfig',
        /**
         * The meta-leaf source tree; subclasses override it. Each leaf is an object
         * owning a `default` value plus optional `env` (variable name) and `parse`
         * (decoder). Compiled into reactive `data` + the leaf-metadata registry at
         * construction. The reactive `data` config is inherited from the Provider.
         * @member {Object} metaTree={}
         */
        metaTree: {}
    }

    /**
     * Leaf metadata keyed by full dotted path (`{env, parse, type}`). Kept independent
     * of the Provider's reactive config map so set-time validation can resolve a leaf
     * by path without coupling to reactivity state.
     * @member {Map<String,Object>} #leafMetadataRegistry
     */
    #leafMetadataRegistry = new Map()
    /**
     * Runtime env-layer overrides keyed by full dotted path; re-asserted over defaults
     * and overlay files so explicit overrides always win.
     * @member {Map<String,*>} #runtimeEnvOverrides
     */
    #runtimeEnvOverrides = new Map()
    /**
     * Monotonic counter for unique per-subscription ids in {@link observeConfig}.
     * @member {Number} #observerSeq=0
     */
    #observerSeq = 0

    /**
     * Compiles a meta-leaf tree into a plain defaults object and a leaf-metadata
     * registry. A leaf is any object owning a `default` key; every other object is a
     * namespace and is walked recursively. Does not apply env values — see
     * `#applyEnvLayer`.
     * @param {Object} tree
     * @returns {{defaults: Object, registry: Map<String,Object>}}
     */
    static compileMetaLeaves(tree) {
        const defaults = {},
              registry = new Map();

        const walk = (node, pathParts) => {
            for (const [key, value] of Object.entries(node)) {
                const path = [...pathParts, key];

                if (Neo.isObject(value) && Object.prototype.hasOwnProperty.call(value, 'default')) {
                    const dotted     = path.join('.'),
                          defaultVal = value.default;

                    Neo.assignToNs(path, defaultVal, defaults);
                    registry.set(dotted, {
                        env  : value.env   ?? null,
                        parse: value.parse ?? null,
                        type : defaultVal === null || defaultVal === undefined ? null : Neo.typeOf(defaultVal)
                    });
                } else if (Neo.isObject(value)) {
                    walk(value, path);
                }
            }
        };

        walk(tree, []);
        return {defaults, registry};
    }

    /**
     * Seeds the reactive data tree from the compiled meta-leaf tree, then applies the
     * env layer. Runs through the canonical Provider pipeline; data is reactive and
     * readable synchronously afterwards.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const {defaults, registry} = BaseConfig.compileMetaLeaves(this.metaTree);

        this.#leafMetadataRegistry = registry;
        this.setData(defaults);
        this.#applyEnvLayer();
    }

    /**
     * Re-asserts env precedence: for each registered leaf with an env binding, decodes
     * the env var and writes it over the current value, then re-applies any runtime
     * overrides. Idempotent — safe to call after construction and after each overlay load.
     * @param {Object} [env=process.env]
     * @param {Function} [warn=console.warn]
     */
    #applyEnvLayer(env = process.env, warn = console.warn) {
        for (const [leafPath, meta] of this.#leafMetadataRegistry) {
            if (!meta.env) {
                continue;
            }

            const decode = meta.parse ?? Env.parseString,
                  value  = decode(meta.env, {env, warn});

            if (value !== undefined) {
                this.setData(leafPath, value);
            }
        }

        for (const [leafPath, value] of this.#runtimeEnvOverrides) {
            this.setData(leafPath, value);
        }
    }

    /**
     * Validates a value against its leaf metadata. Metadata-path-first: only values
     * written to a known leaf path are checked; namespace-recursion intermediates pass
     * through. Lenient — warns on a type mismatch but keeps the value (coercion is
     * deferred; see the Stage 1 PR notes).
     * @param {String} leafPath Full dotted leaf path.
     * @param {*} value
     * @returns {*}
     */
    #validateLeafValue(leafPath, value) {
        const meta = this.#leafMetadataRegistry.get(leafPath);

        if (meta?.type && value !== null && value !== undefined) {
            const actual = Neo.typeOf(value);

            if (actual !== meta.type) {
                console.warn(`[Neo.ai.BaseConfig] "${leafPath}" expected ${meta.type}, got ${actual}; keeping value.`);
            }
        }

        return value;
    }

    /**
     * The single write funnel. Applies leaf validation for non-object values written to
     * a known leaf path, then delegates to the Provider pipeline (reactivity bubbling,
     * config-map updates).
     * @param {String|Object} key
     * @param {*} value
     * @param {Neo.state.Provider} [originStateProvider]
     */
    internalSetData(key, value, originStateProvider) {
        if (typeof key === 'string' && Neo.typeOf(value) !== 'Object' && this.#leafMetadataRegistry.has(key)) {
            value = this.#validateLeafValue(key, value);
        }

        super.internalSetData(key, value, originStateProvider);
    }

    /**
     * Explicit mutation API — writes a value at a dotted path through the reactive pipeline.
     * @param {String} leafPath
     * @param {*} value
     */
    set(leafPath, value) {
        this.setData(leafPath, value);
    }

    /**
     * Records and applies a runtime env-layer override. The override is re-asserted by
     * `#applyEnvLayer` so it survives subsequent overlay loads.
     * @param {String} leafPath
     * @param {*} value
     */
    setEnvOverride(leafPath, value) {
        this.#runtimeEnvOverrides.set(leafPath, value);
        this.setData(leafPath, value);
    }

    /**
     * Path-scoped reactive subscription. Invokes `fn` on changes to the leaf at `leafPath`.
     * @param {String} leafPath Full dotted leaf path.
     * @param {Function} fn
     * @returns {Function} Cleanup function that removes the subscription.
     */
    observeConfig(leafPath, fn) {
        const config = this.getDataConfig(leafPath);

        if (!config) {
            console.warn(`[Neo.ai.BaseConfig] observeConfig: no leaf at "${leafPath}".`);
            return () => {};
        }

        return config.subscribe({id: `${this.id}-observe-${++this.#observerSeq}`, fn});
    }

    /**
     * Loads an overlay configuration file, deep-merges it into the reactive data tree,
     * then re-asserts the env layer so env vars and runtime overrides keep precedence.
     * @param {String} filePath
     * @returns {Promise<void>}
     */
    async load(filePath) {
        if (!filePath) {
            return;
        }

        try {
            const absolutePath = path.resolve(filePath),
                  ext          = path.extname(absolutePath);
            let overlay;

            if (ext === '.mjs' || ext === '.js') {
                overlay = (await import(absolutePath)).default;
            } else {
                overlay = JSON.parse(await fs.readFile(absolutePath, 'utf-8'));
            }

            this.setData(overlay);
            this.#applyEnvLayer();

            console.error(`[Neo.ai.BaseConfig] Loaded overlay configuration from ${absolutePath}`);
        } catch (error) {
            console.error(`[Neo.ai.BaseConfig] Failed to load configuration from ${filePath}:`, error.message);
            throw error;
        }
    }
}

/**
 * Wraps a BaseConfig instance in a Proxy so consumers read leaf values directly
 * (`config.namespace.leaf`) and assign top-level keys (`config.key = value`). Instance
 * members win; unknown keys delegate to the reactive data tree, whose own hierarchical
 * proxy resolves nested paths and routes nested assignments through `setData`.
 * @param {Neo.ai.BaseConfig} instance
 * @returns {Proxy}
 */
export function createConfigProxy(instance) {
    return new Proxy(instance, {
        get(target, prop) {
            // Unknown keys delegate to the reactive data tree (enables `config.namespace.leaf`).
            if (typeof prop !== 'symbol' && !Reflect.has(target, prop)) {
                return target.data?.[prop];
            }
            // Resolve via the target (NOT the outer proxy) so reactive-config getters and
            // private-field methods run with `this` bound to the real instance.
            const value = target[prop];
            return typeof value === 'function' ? value.bind(target) : value;
        },
        set(target, prop, value) {
            if (typeof prop !== 'symbol' && !Reflect.has(target, prop)) {
                target.setData(prop, value);
            } else {
                target[prop] = value;
            }
            return true;
        }
    });
}

export default Neo.setupClass(BaseConfig);
