import Base from '../../../../src/core/Base.mjs';

/**
 * @summary Data-driven registry for Knowledge Base Source + Parser classes.
 *
 * Phase 0/1B substrate of Epic [#11624](https://github.com/neomjs/neo/issues/11624) (Cloud-Native KB Ingestion).
 * Replaces the hardcoded source-list at [`DatabaseService.createKnowledgeBase`](../DatabaseService.mjs)
 * with a registry that supports:
 *
 * - **Neo defaults** auto-registered via the sibling [`_export.mjs`](./_export.mjs) when
 *   `aiConfig.useDefaultSources !== false`. Same defaults always present unless a cloud
 *   deployment explicitly opts out.
 * - **Tenant-supplied custom sources/parsers** registered either declaratively via
 *   `aiConfig.customSources` / `aiConfig.customParsers` (loaded once at boot) or
 *   programmatically via {@link registerSource} / {@link registerParser} (runtime-extensible).
 * - **Idempotent re-registration** — re-registering the same source by name overwrites
 *   the prior class; useful for hot-reload during development without registry drift.
 *
 * The registry is a Neo singleton; consumers call e.g. `SourceRegistry.getSources()` to
 * receive the current list of Source classes in registration order. Order matters only
 * for determinism of byte-equivalence fixtures, not for correctness of KB content.
 *
 * **Parser registry shape:** Parsers register by `parserId` (the stable string consumers
 * thread through `parsed-chunk-v1.parserId`). Phase 0/1B ships the API surface + config
 * pipeline; runtime parser-execution wiring lands in Phase 2 / Phase 3 (per
 * [#11626](https://github.com/neomjs/neo/issues/11626) / [#11627](https://github.com/neomjs/neo/issues/11627)).
 *
 * @class Neo.ai.services.knowledge-base.source.SourceRegistry
 * @extends Neo.core.Base
 * @singleton
 */
class SourceRegistry extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.source.SourceRegistry'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.source.SourceRegistry',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {Map<String,Object>} _sources Map of sourceName → Source class
     * @private
     */
    _sources = new Map();

    /**
     * @member {Map<String,Object>} _parsers Map of parserId → Parser class
     * @private
     */
    _parsers = new Map();

    /**
     * Registers a Source class under the given name. Re-registering the same name
     * overwrites the prior class — idempotent for hot-reload scenarios.
     *
     * @param {Object}  SourceClass            Source class (typically extends `Neo.ai.services.knowledge-base.source.Base`).
     * @param {Object} [options]
     * @param {String} [options.sourceName]    Stable registry name. Defaults to the class's `className` final segment (e.g., `Neo.ai.services.knowledge-base.source.AdrSource` → `AdrSource`).
     * @returns {String} The resolved `sourceName` used as the registry key.
     */
    registerSource(SourceClass, {sourceName} = {}) {
        const name = sourceName ?? this._deriveDefaultName(SourceClass);
        if (!name) {
            throw new Error('[SourceRegistry] registerSource requires either a `sourceName` option or a SourceClass with a derivable className final segment.');
        }
        this._sources.set(name, SourceClass);
        return name;
    }

    /**
     * Registers a Parser class under the given `parserId`. Re-registering the same id
     * overwrites the prior class.
     *
     * **Dispatch is static.** The registry stores the class itself and never instantiates it, so
     * `parseIngestionFile` / `parse` must be declared `static` — an instance method on the prototype
     * is unreachable. An object literal carrying those methods is equally valid; "class" here names
     * the convention, not a requirement. See `TENANT_PARSER_ERROR_CODES.notDispatchable`, which
     * refuses the unreachable shape for tenant-declared parsers.
     *
     * @param {Object}  ParserClass            Parser class, or any object carrying static-side `parseIngestionFile`/`parse`.
     * @param {Object} [options]
     * @param {String} [options.parserId]      Stable registry id. Defaults to the class's `className` final segment.
     * @returns {String} The resolved `parserId` used as the registry key.
     */
    registerParser(ParserClass, {parserId} = {}) {
        const id = parserId ?? this._deriveDefaultName(ParserClass);
        if (!id) {
            throw new Error('[SourceRegistry] registerParser requires either a `parserId` option or a ParserClass with a derivable className final segment.');
        }
        this._parsers.set(id, ParserClass);
        return id;
    }

    /**
     * Removes a Source registration by name. Returns `true` if the name was registered, `false` otherwise.
     * @param {String} sourceName
     * @returns {Boolean}
     */
    unregisterSource(sourceName) {
        return this._sources.delete(sourceName);
    }

    /**
     * Removes a Parser registration by id. Returns `true` if the id was registered, `false` otherwise.
     * @param {String} parserId
     * @returns {Boolean}
     */
    unregisterParser(parserId) {
        return this._parsers.delete(parserId);
    }

    /**
     * @returns {Array<Object>} Registered Source classes in insertion order.
     */
    getSources() {
        return Array.from(this._sources.values());
    }

    /**
     * @returns {Array<Object>} Registered Parser classes in insertion order.
     */
    getParsers() {
        return Array.from(this._parsers.values());
    }

    /**
     * @returns {Array<String>} Registered source names in insertion order.
     */
    getSourceNames() {
        return Array.from(this._sources.keys());
    }

    /**
     * @returns {Array<String>} Registered parser ids in insertion order.
     */
    getParserIds() {
        return Array.from(this._parsers.keys());
    }

    /**
     * @param {String} sourceName
     * @returns {Boolean}
     */
    hasSource(sourceName) {
        return this._sources.has(sourceName);
    }

    /**
     * @param {String} parserId
     * @returns {Boolean}
     */
    hasParser(parserId) {
        return this._parsers.has(parserId);
    }

    /**
     * Clears all registrations. Intended for test fixtures where each test starts from
     * an empty registry; production code paths should NOT call this.
     */
    clear() {
        this._sources.clear();
        this._parsers.clear();
    }

    /**
     * @param {Object} cls
     * @returns {String|null}
     * @private
     */
    _deriveDefaultName(cls) {
        const cn = cls?.config?.className ?? cls?.className;
        if (typeof cn !== 'string') return null;
        const parts = cn.split('.');
        return parts[parts.length - 1] || null;
    }
}

export default Neo.setupClass(SourceRegistry);
