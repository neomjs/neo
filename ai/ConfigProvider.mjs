import fs       from 'fs/promises';
import path     from 'path';
import Provider from '../src/state/Provider.mjs';
import Env      from '../src/util/Env.mjs';

/**
 * Maps a {@link leaf} `type` token to the name-based `Neo.util.Env` parser that decodes its env
 * var. Reuses the Tier-1 Env primitive: extend the shared parser set, don't introduce a parallel
 * parser set.
 * @type {Object<String,Function>}
 */
const typeParsers = {
    boolean  : Env.parseBool,
    csv      : Env.parseCsv,
    keepAlive: Env.parseKeepAlive,
    // The PARSER is what enforces these domains, not the validator beside it: `#validateLeafValue`
    // only warns and keeps the value, so returning `undefined` here is the only thing that makes an
    // out-of-domain env value fall back to the leaf default. Same mechanism `port` relies on.
    nonNegativeInt: (name, opts) => Env.parseIntAtLeast(name, {...opts, min: 0}),
    number        : Env.parseNumber,
    port          : Env.parsePort,
    positiveInt   : (name, opts) => Env.parseIntAtLeast(name, {...opts, min: 1}),
    string        : Env.parseString,
    url           : Env.parseUrl
};

/**
 * Maps a {@link leaf} `type` token to a value validator used at the `internalSetData` write
 * choke point. A type without an entry here (e.g. `object`, `array`, or an unknown token)
 * validates as `true`, so non-scalar leaves pass through.
 * @type {Object<String,Function>}
 */
const typeValidators = {
    boolean: value => typeof value === 'boolean',
    csv    : value => Array.isArray(value) && value.every(item => typeof item === 'string'),
    // Counts an operator may tune where 0 is a legitimate setting (a delay, a grace window).
    nonNegativeInt: value => Number.isInteger(value) && value >= 0,
    number        : value => typeof value === 'number' && !Number.isNaN(value),
    port          : value => Number.isInteger(value) && value >= 0 && value <= 65535,
    // Counts where 0 or a negative is not a smaller setting but a BROKEN one — a loop stride, an
    // attempt budget. `number` would accept them and the damage surfaces far from the config: a
    // stride of 0 does not shrink a batch, it never advances the loop.
    //
    // WHERE THE DOMAIN IS ACTUALLY ENFORCED, because the two halves are not symmetric and an earlier
    // version of this comment claimed they were:
    //
    //   - the PARSER (`typeParsers` above, `Env.parseIntAtLeast`) is the enforcement. An
    //     out-of-domain env value returns `undefined`, so the leaf default stands and no consumer
    //     ever sees the bad number. This is the path an operator's typo takes.
    //   - the VALIDATOR here is ADVISORY. `#validateLeafValue` warns and KEEPS the value — its own
    //     JSDoc says so. It surfaces a programmatic write to a known leaf; it does not reject one.
    //
    // Both are worth having and they answer different questions. Describing the validator as
    // rejecting is the mistake to avoid: a reader who believes the write path is closed will skip
    // the parser, which is the half that actually protects the consumer.
    positiveInt: value => Number.isInteger(value) && value >= 1,
    string     : value => typeof value === 'string',
    url        : value => typeof value === 'string'
};

/**
 * @summary Declares a single configuration leaf with an explicit type.
 *
 * Replaces the raw `{env, default, parse}` literal. The `type` token selects both the name-based
 * `Env` parser (for env decoding) and the validator (at the write choke point). Unlike inferring
 * the type from the default value, an explicit `type` survives a `null`/`undefined` default —
 * e.g. `leaf(null, 'NEO_PUBLIC_URL', 'url')` stays validatable. Object/array leaves omit `env`
 * and may pass `type: 'object'` for documentation; they carry no parser.
 *
 * @param {*} defaultValue The default value.
 * @param {String|null} [env=null] Env var name, or null for a non-env leaf.
 * @param {String|null} [type=null] One of `typeParsers` / `typeValidators` keys. Inferred from
 *        `defaultValue` via `Neo.typeOf` (lower-cased) when omitted and the default is non-null.
 * @param {Object|null} [metadata=null] Additional declarative leaf metadata. Used for readiness
 *        contracts such as mode/entrypoint requiredness; never for parallel env defaults. A
 *        `parse` key here overrides the type-derived parser (the one way a leaf declares a custom
 *        env parser — without it, a custom parse forces a raw descriptor object the leaf grammar
 *        cannot see).
 * @returns {{default:*, env:(String|null), type:(String|null), parse:(Function|null)}}
 */
export function leaf(defaultValue, env = null, type = null, metadata = null) {
    // Neo.typeOf returns undefined for objects carrying an own `constructor` key (e.g. the
    // dummy embedding fn's anti-legacy duck-type), so guard the inference. Such object leaves
    // simply resolve to a null type (no validator) — pass an explicit `type` to override.
    const resolvedType = type ?? (defaultValue == null
        ? null
        : (Neo.typeOf(defaultValue)?.toLowerCase() ?? null));

    return {
        default: defaultValue,
        env,
        ...(metadata || {}),
        type : resolvedType,
        parse: env ? (metadata?.parse ?? typeParsers[resolvedType] ?? Env.parseString) : null
    }
}

function normalizeList(value) {
    if (value === undefined || value === null || value === '*') {
        return null
    }

    return Array.isArray(value) ? value : [value]
}

function matchesContext(value, actual) {
    const list = normalizeList(value);

    return !list || list.includes(actual)
}

function isEmptyRequiredValue(value) {
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}

/**
 * @summary Reactive configuration Provider for Neo MCP servers.
 *
 * Extends the Body-tier reactive state Provider. A subclass assigns its meta-leaf tree to the
 * inherited `data` config — each leaf is `{env?, default, parse?, type?}`, typically produced by
 * the {@link leaf} factory. The {@link afterSetData} override compiles that tree into the reactive
 * `data` tree (via the Provider's canonical `processDataObject` seam) plus a separate
 * leaf-metadata registry, then applies the env layer.
 *
 * Consumers read values directly (`config.namespace.leaf`) via the proxy returned by
 * {@link createConfigProxy}; the inherited hierarchical data proxy resolves nested paths and
 * routes assignments back through `setData`.
 *
 * Env precedence is **bounded** (re-resolved at construct / {@link setEnvOverride} / {@link load} /
 * {@link refreshEnv}), NOT live-per-read — see {@link #applyEnvLayer} for the rationale.
 *
 * Configs compose into a **hierarchical realm**: the Tier-1 singleton `Neo.ai.Config` is the root
 * and every per-server config is its child via the {@link getParent} override. Each layer declares
 * only the leaves it owns and inherits the rest up the chain — so an operator overlay is a *thin
 * child* of its template, never a clone, and bringing it up to a newer template is inheritance, not
 * a source-level merge.
 *
 * @class Neo.ai.ConfigProvider
 * @extends Neo.state.Provider
 * @see learn/agentos/AiConfigModel.md — the hierarchical-nested-data model + its rationale
 */
class ConfigProvider extends Provider {
    static config = {
        /**
         * @member {String} className='Neo.ai.ConfigProvider'
         * @protected
         */
        className: 'Neo.ai.ConfigProvider'
    }

    /**
     * Leaf metadata keyed by full dotted path (`{env, parse, type}`). Kept independent of the
     * Provider's reactive config map so set-time validation can resolve a leaf by path.
     * @member {Map<String,Object>} #leafMetadataRegistry
     */
    #leafMetadataRegistry = new Map()
    /**
     * Runtime env-layer overrides keyed by ENV VAR NAME (one var may feed multiple leaves);
     * re-asserted over `process.env` and overlay files so explicit overrides always win.
     * @member {Map<String,*>} #runtimeEnvOverrides
     */
    #runtimeEnvOverrides = new Map()
    /**
     * Monotonic counter for unique per-subscription ids in {@link observeData}.
     * @member {Number} #observerSeq=0
     */
    #observerSeq = 0
    /**
     * Cleanup fns for active {@link observeData} subscriptions, released on {@link destroy}.
     * Mirrors `core.Base#observeConfig`'s `#configSubscriptionCleanups` contract.
     * @member {Function[]} #dataObserveCleanups=[]
     */
    #dataObserveCleanups = []

    /**
     * Compiles a meta-leaf tree into plain data plus a leaf-metadata registry. A leaf is any
     * object owning a `default` key; every other object is a namespace, walked recursively.
     * Does not apply env values — see {@link #applyEnvLayer}.
     * @param {Object} tree
     * @returns {{plainData: Object, registry: Map<String,Object>}}
     */
    static compileMetaLeaves(tree) {
        const plainData = {},
              registry  = new Map();

        const walk = (node, pathParts) => {
            for (const [key, value] of Object.entries(node)) {
                const path = [...pathParts, key];

                if (Neo.isObject(value) && Object.prototype.hasOwnProperty.call(value, 'default')) {
                    // Capture the dotted path BEFORE assignToNs — it mutates its `path` arg via
                    // `path.pop()`, which would otherwise collapse a nested leaf onto its parent
                    // namespace key (dropping env metadata for every nested leaf).
                    const dotted = path.join('.');

                    Neo.assignToNs(path, value.default, plainData);
                    registry.set(dotted, {
                        env        : value.env         ?? null,
                        parse      : value.parse       ?? null,
                        requiredFor: value.requiredFor ?? null,
                        // Guard inference: Neo.typeOf is undefined for objects with an own `constructor` key.
                        type : value.type  ?? (value.default == null
                            ? null
                            : (Neo.typeOf(value.default)?.toLowerCase() ?? null))
                    })
                } else if (Neo.isObject(value)) {
                    walk(value, path)
                }
            }
        };

        walk(tree, []);
        return {plainData, registry}
    }

    /**
     * Classifies declarative required-env leaf state for one entrypoint/mode/consumer claim.
     * The contract reads the existing leaf metadata registry; it never re-reads env vars or keeps
     * a parallel required-var list. A required leaf whose value is invalid, absent, empty, or whose
     * state cannot be checked fails closed for readiness-certifying consumers.
     * @param {Object} [options]
     * @param {String} [options.entrypoint='unknown'] Entry point performing the check.
     * @param {String} [options.mode] Active deployment/auth mode. Defaults to the resolved
     *        `auth.mode` leaf so readiness checks do not carry a hidden fallback mode.
     * @param {String} [options.consumerClaim='readiness'] Claim made by the consumer.
     * @returns {{ok:Boolean, findings:Array<Object>}}
     */
    validateRequiredEnv({entrypoint = 'unknown', mode, consumerClaim = 'readiness'} = {}) {
        const
            findings             = [],
            activeMode           = mode ?? this.getData('auth.mode'),
            providers            = [],
            shadowedRequiredness = new Set();

        for (let provider = this; provider instanceof ConfigProvider; provider = provider.getParent()) {
            if (providers.includes(provider)) {
                break
            }

            providers.push(provider);
        }

        for (const provider of providers) {
            for (const [leafPath, meta] of provider.#leafMetadataRegistry) {
                if (shadowedRequiredness.has(leafPath)) {
                    continue
                }

                const requirements = Array.isArray(meta.requiredFor)
                    ? meta.requiredFor
                    : (meta.requiredFor ? [meta.requiredFor] : []);

                if (requirements.length > 0) {
                    shadowedRequiredness.add(leafPath)
                }

                for (const requirement of requirements) {
                    if (
                        !matchesContext(requirement.entrypoints, entrypoint)  ||
                        !matchesContext(requirement.modes,       activeMode)  ||
                        !matchesContext(requirement.consumerClaims, consumerClaim)
                    ) {
                        continue
                    }

                    const
                        value     = this.getData(leafPath),
                        validator = meta.type ? typeValidators[meta.type] : null;

                    let valueState = 'present-valid';

                    if (isEmptyRequiredValue(value)) {
                        valueState = 'absent'
                    } else if (validator && !validator(value)) {
                        valueState = 'present-invalid'
                    }

                    if (valueState !== 'present-valid') {
                        findings.push({
                            consumerClaim,
                            entrypoint,
                            env        : meta.env,
                            leafPath,
                            mode       : activeMode,
                            reason     : requirement.reason ?? null,
                            valueState,
                            disposition: requirement.disposition ?? 'fail-closed'
                        })
                    }
                }
            }
        }

        return {
            findings,
            ok: findings.length === 0
        }
    }

    /**
     * The compile seam. A subclass assigns its meta-leaf tree to `data`; this override compiles it
     * into plain data + the leaf-metadata registry, forwards the plain data to the Provider's
     * reactive pipeline (`processDataObject`), then applies the env layer. Fires at construction
     * (when the `data` config is applied) and on any later `data` reassignment.
     * @param {Object|null} value    The assigned meta-leaf tree.
     * @param {Object|null} oldValue
     */
    afterSetData(value, oldValue) {
        if (!value) {
            return
        }

        const {plainData, registry} = ConfigProvider.compileMetaLeaves(value);

        this.#leafMetadataRegistry = registry;
        super.afterSetData(plainData, oldValue);
        this.#applyEnvLayer()
    }

    /**
     * Re-asserts env precedence: for each registered env-bound leaf, the value is the runtime
     * override (keyed by env var name) if present, else the decoded `process.env` value; it is
     * written over the current value. Runtime overrides win. Idempotent.
     *
     * **Bounded, not live-per-read (deliberate).** Env is re-resolved only at construct (via
     * {@link afterSetData}), {@link setEnvOverride}, {@link load}, and {@link refreshEnv} — never on
     * every property read. A live env value decoupled from the running side it configures is
     * dangerous: e.g. a changed `NEO_CHROMA_PORT` would make new reads target a port the Chroma DB
     * is not actually listening on (the DB only moves on a coordinated restart). Live env that
     * drives coordinated restart/reconnection is a separate Body-tier concern, out of scope here.
     * @param {Object} [env=process.env]
     * @param {Function} [warn=console.warn]
     */
    #applyEnvLayer(env = process.env, warn = console.warn) {
        for (const [leafPath, meta] of this.#leafMetadataRegistry) {
            if (!meta.env) {
                continue
            }

            let value;

            if (this.#runtimeEnvOverrides.has(meta.env)) {
                value = this.#runtimeEnvOverrides.get(meta.env)
            } else {
                const decode = meta.parse ?? Env.parseString;
                value = decode(meta.env, {env, warn})
            }

            if (value !== undefined) {
                this.setData(leafPath, value)
            }
        }
    }

    /**
     * Re-reads env vars + re-applies runtime overrides on demand — the explicit bounded "refresh"
     * handle. Call after a deliberate env change the configured side can tolerate without a
     * coordinated restart (see {@link #applyEnvLayer} for why this is not automatic per read).
     */
    refreshEnv() {
        this.#applyEnvLayer()
    }

    /**
     * Validates a value against its leaf metadata at the write choke point. Metadata-path-first:
     * ANY value written to a known leaf path is validated (object/JSON leaves included); namespace
     * recursion intermediates have no registry entry and pass through. Lenient — warns on a type
     * mismatch but keeps the value.
     * @param {String} leafPath
     * @param {*} value
     * @returns {*}
     */
    #validateLeafValue(leafPath, value) {
        const meta = this.#leafMetadataRegistry.get(leafPath);

        if (meta?.type && value !== null && value !== undefined) {
            const validator = typeValidators[meta.type];

            if (validator && !validator(value)) {
                console.warn(`[Neo.ai.ConfigProvider] "${leafPath}" expected ${meta.type}, got ${Neo.typeOf(value)}; keeping value.`)
            }
        }

        return value
    }

    /**
     * Resolves the parent provider for hierarchical (chain) data resolution. The Brain has no
     * component tree, so the Provider's component-tree fallback never applies; instead the Tier-1
     * singleton `Neo.ai.Config` is the realm root and every other config is its child.
     *
     * Returns the **raw** Tier-1 instance (`globalThis.Neo.ai.Config`, placed by `applyToGlobalNs`)
     * — never the {@link createConfigProxy} export — because `getOwnerOfDataProperty` reads the
     * parent's private `#dataConfigs`, which a Proxy cannot expose. The `root !== this` identity
     * guard stops the root from parenting itself (infinite recursion); a not-yet-loaded root yields
     * `null`, so a child resolves locally until the root module is imported (lazy: the root need
     * only exist before the first realm-leaf *read*, not before a child constructs).
     * @returns {Neo.state.Provider|null}
     * @override
     */
    getParent() {
        const root = Neo.ai?.Config;

        return root && root !== this ? root : null
    }

    /**
     * Validates a value against the registry of whichever provider in the chain OWNS the leaf:
     * local first (fast path), else the owner resolved up the parent chain via
     * {@link Neo.state.Provider#getOwnerOfDataProperty}. A cross-tier write — a child writing a
     * Tier-1-owned leaf — is therefore validated against the parent's metadata instead of bypassing
     * validation on both tiers. The `#leafMetadataRegistry in owner` brand check guards
     * the cross-instance private access (every chain member is a ConfigProvider).
     * @param {String} key
     * @param {*} value
     * @returns {*}
     */
    #validateAgainstOwner(key, value) {
        if (this.#leafMetadataRegistry.has(key)) {
            return this.#validateLeafValue(key, value)
        }

        const owner = this.getOwnerOfDataProperty(key)?.owner;

        if (owner && owner !== this && #leafMetadataRegistry in owner && owner.#leafMetadataRegistry.has(key)) {
            return owner.#validateLeafValue(key, value)
        }

        return value
    }

    /**
     * The single write funnel. Validates any string-keyed write against the leaf registry of the
     * provider that OWNS the key — local or resolved up the parent chain (see
     * {@link #validateAgainstOwner}) — then delegates to the Provider pipeline (reactivity
     * bubbling, config-map updates).
     * @param {String|Object} key
     * @param {*} value
     * @param {Neo.state.Provider} [originStateProvider]
     */
    internalSetData(key, value, originStateProvider) {
        if (typeof key === 'string') {
            value = this.#validateAgainstOwner(key, value)
        }

        super.internalSetData(key, value, originStateProvider)
    }

    /**
     * Records and applies a runtime env-layer override, keyed by ENV VAR NAME (one var may feed
     * multiple leaves). The override wins over `process.env` and is re-asserted by
     * {@link #applyEnvLayer} so it survives subsequent overlay loads.
     * @param {String} envName
     * @param {*} value
     */
    setEnvOverride(envName, value) {
        for (const [leafPath, meta] of this.#leafMetadataRegistry) {
            if (meta.env === envName) {
                this.#validateLeafValue(leafPath, value)
            }
        }

        this.#runtimeEnvOverrides.set(envName, value);
        this.#applyEnvLayer()
    }

    /**
     * Path-scoped reactive subscription to a data leaf. Resolves the owning provider via
     * `getOwnerOfDataProperty` (the same hierarchy-aware resolution `Provider#getData` and the
     * hierarchical data proxy use), so a leaf owned by a parent provider is observed correctly.
     * The cleanup is tracked and released on {@link destroy}.
     *
     * Named `observeData` (NOT `observeConfig`) to avoid shadowing
     * `core.Base#observeConfig(publisher, configName, fn)`, which `Provider#createBinding` uses.
     * @param {String} leafPath
     * @param {Function} fn Invoked as `(value, oldValue)` when the leaf changes.
     * @returns {Function} Cleanup function that removes the subscription.
     */
    observeData(leafPath, fn) {
        const ownerDetails = this.getOwnerOfDataProperty(leafPath);

        if (!ownerDetails) {
            console.warn(`[Neo.ai.ConfigProvider] observeData: no data leaf at "${leafPath}".`);
            return () => {}
        }

        const
            {owner, propertyName} = ownerDetails,
            cleanup               = owner.getDataConfig(propertyName).subscribe({
                id: `${this.id}-observe-${++this.#observerSeq}`,
                fn
            });

        this.#dataObserveCleanups.push(cleanup);

        return cleanup
    }

    /**
     * Releases active {@link observeData} subscriptions, then runs the standard Provider/Base
     * teardown (formula + binding effects, config subscriptions, instance unregister).
     */
    destroy() {
        this.#dataObserveCleanups.forEach(cleanup => cleanup());
        this.#dataObserveCleanups = [];
        super.destroy()
    }

    /**
     * Loads an overlay configuration file, then re-asserts the env layer so env vars and runtime
     * overrides keep precedence.
     * @param {String} filePath
     * @returns {Promise<void>}
     */
    async load(filePath) {
        if (!filePath) {
            return
        }

        try {
            const absolutePath = path.resolve(filePath),
                  ext          = path.extname(absolutePath);

            // A `.mjs` overlay default-exports the already-compiled config singleton
            // (createConfigProxy); its data + env layer are applied at construction, so there is
            // nothing to merge here. The import validates the file exists. A JSON overlay carries
            // partial operator overrides that merge into reactive data.
            if (ext === '.mjs' || ext === '.js') {
                await import(absolutePath)
            } else {
                this.setData(JSON.parse(await fs.readFile(absolutePath, 'utf-8')))
            }

            this.#applyEnvLayer();

            console.error(`[Neo.ai.ConfigProvider] Loaded overlay configuration from ${absolutePath}`)
        } catch (error) {
            console.error(`[Neo.ai.ConfigProvider] Failed to load configuration from ${filePath}:`, error.message);
            throw error
        }
    }
}

/**
 * Wraps a ConfigProvider instance in a Proxy so consumers read leaf values directly
 * (`config.namespace.leaf`) and assign top-level keys (`config.key = value`). Instance members
 * win; unknown keys delegate to the reactive data tree, whose own hierarchical proxy resolves
 * nested paths and routes nested assignments through `setData`.
 * @param {Neo.ai.ConfigProvider} instance
 * @returns {Proxy}
 */
export function createConfigProxy(instance) {
    return new Proxy(instance, {
        get(target, prop) {
            // Unknown keys delegate to the reactive data tree (enables `config.namespace.leaf`).
            if (typeof prop !== 'symbol' && !Reflect.has(target, prop)) {
                return target.data?.[prop]
            }
            // Resolve via the target (NOT the outer proxy) so reactive-config getters and
            // private-field methods run with `this` bound to the real instance.
            const value = target[prop];
            return typeof value === 'function' ? value.bind(target) : value
        },
        set(target, prop, value) {
            if (typeof prop !== 'symbol' && !Reflect.has(target, prop)) {
                target.setData(prop, value)
            } else {
                target[prop] = value
            }
            return true
        }
    })
}

export default Neo.setupClass(ConfigProvider);
