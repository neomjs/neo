import {ChromaClient}         from 'chromadb';
import aiConfig               from '../../../mcp/server/memory-core/config.mjs';
import logger                 from '../../../mcp/server/memory-core/logger.mjs';
import AbstractVectorManager  from './AbstractVectorManager.mjs';
import ChromaLifecycleService from '../lifecycle/ChromaLifecycleService.mjs';
import {
    chromaConnect,
    chromaDeleteCollection,
    createDynamicTextEmbeddingFunction,
    createSilentExecutor,
    isChromaCollectionNotFoundError,
    registerNeoChromaEmbeddingFunctions
} from '../../shared/vector/chromaClientPrimitives.mjs';
import {CHROMA_PRODUCTION_DATABASE, ensureChromaTestDatabase} from '../../shared/vector/chromaTestIsolation.mjs';

/**
 * Predicate suppression filter for MC: the four Chroma library messages that surface noisily
 * during routine `getOrCreateCollection` calls with the dynamic embedding function. Everything
 * else passes through to the real `console.warn`. The suppression now feeds the shared Chroma
 * client primitives instead of staying local to ChromaManager's silent executor.
 */
const MC_WARN_FILTER = msg =>
    msg.includes('No embedding function configuration found') ||
    msg.includes('Could not deserialize the collection metadata') ||
    msg.includes('dummy_embedding_function') ||
    msg.includes('dynamic_text_embedding_service');

registerNeoChromaEmbeddingFunctions({
    dummyEmbeddingFunction: aiConfig.dummyEmbeddingFunction
});

/**
 * @summary Simple manager around the Chroma client that lazily caches frequently used collections.
 *
 * This class abstracts the lower-level ChromaDB client interactions. It provides methods to connect to the database
 * and retrieve specific collections (memory and summary), ensuring that the connection is established and
 * collections are created if they don't exist. It handles the `dummyEmbeddingFunction` requirement for ChromaDB
 * to prevent warnings.
 *
 * @class Neo.ai.services.memory-core.managers.ChromaManager
 * @extends Neo.ai.services.memory-core.managers.AbstractVectorManager
 * @singleton
 */
class ChromaManager extends AbstractVectorManager {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.managers.ChromaManager'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.managers.ChromaManager',
        /**
         * @member {ChromaClient|null} client=null
         * @protected
         */
        client: null,
        /**
         * @member {Boolean} connected=false
         */
        connected: false,
        /**
         * @member {Object|null} memoryCollection=null
         * @protected
         */
        memoryCollection: null,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Object|null} summaryCollection=null
         * @protected
         */
        summaryCollection: null,
        /**
         * @member {Object|null} graphCollection=null
         * @protected
         */
        graphCollection: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        // The client is constructed here; heartbeat/connection is evaluated lazily by `connect()`.
        // Under UNIT_TEST_MODE `database` resolves to a dedicated, droppable test database, so test
        // collections never enter the production `default_database` by construction.
        const {host, port, database} = this.resolveChromaClientConfig(aiConfig);
        this.client                  = new ChromaClient({host, port, ssl: false, database});
    }

    /**
     * @summary Resolves and validates Memory Core's Chroma client coordinates before boot continues.
     * @param {Object} config aiConfig-shaped configuration object.
     * @returns {{host: String, port: Number, database: String}} `database` is read verbatim from
     *     config (the SSOT): `default_database` in production, the dedicated test database under
     *     `UNIT_TEST_MODE`. No fallback substitution — config owns the value.
     * @throws {Error} When `engines.chroma.{host, port}` is missing or malformed.
     */
    resolveChromaClientConfig(config) {
        const chroma = config?.engines?.chroma;
        const port   = Number(chroma?.port);

        if (!chroma?.host || !Number.isFinite(port) || port <= 0) {
            const message = 'ChromaManager: engines.chroma.{host, port} is required for Memory Core Chroma startup.';

            logger.error(`[ChromaManager] Boot-time config error: ${message}`);

            throw new Error(message);
        }

        // Select the test database via the config-owned `useTestDatabase` toggle. Current templates
        // compute it from unit-test or Playwright-harness inputs; existing overlays expose the same
        // stable effective key, so consumer behavior stays migration-compatible.
        const useTestDatabase = chroma.useTestDatabase === true;
        const database        = useTestDatabase ? chroma.databaseTest : chroma.database;

        // Fail-closed defense-in-depth: when the test toggle is on, the resolved DB must never equal the
        // production database (e.g. a misconfigured databaseTest) — refuse rather than risk a unit run
        // touching the production namespace.
        if (useTestDatabase && database === chroma.database) {
            const message = `ChromaManager: refusing the production database "${chroma.database}" under ` +
                `the test-database toggle — unit-test isolation must not resolve into the production namespace.`;

            logger.error(`[ChromaManager] Test-isolation guard: ${message}`);

            throw new Error(message);
        }

        return {
            host    : chroma.host,
            port,
            database
        }
    }

    /**
     * Collection-boundary test-bleed guard. A `test-`-prefixed collection name — the per-worker test
     * collection variants from config `collections.memoryTest` / `sessionTest` — resolved into the
     * PRODUCTION database is the test-bleed signature: test isolation routed the collection NAME to a
     * test variant while the DATABASE fell back to production (a stale config overlay, or a run that
     * never loaded the unit config). Unlike the coordinate resolver — which cannot tell this bleed apart
     * from a fresh-workspace / cloud daemon that legitimately uses production COORDINATES with production-
     * NAMED collections — the collection name is the discriminator: the bleed is `test-*`; a legitimate
     * prod-coordinate daemon is `neo-*`. Fails closed before the collection is created.
     * @param {Object} options
     * @param {String} options.name     The collection name about to be created.
     * @param {String} options.database The resolved Chroma database the client targets.
     * @returns {void}
     */
    assertCollectionNotProdBleed({name, database} = {}) {
        if (database === CHROMA_PRODUCTION_DATABASE && typeof name === 'string' && name.startsWith('test-')) {
            const message = `ChromaManager: refusing to create the test-named collection "${name}" in the ` +
                `production database "${CHROMA_PRODUCTION_DATABASE}" — collection-boundary test-write isolation ` +
                `guard: test isolation routed the collection name but the database resolved to production.`;

            logger.error(`[ChromaManager] Test-isolation guard: ${message}`);

            throw new Error(message);
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        await ChromaLifecycleService.ready();
        await this.connect();
    }

    /**
     * Establishes connection to ChromaDB via the shared `chromaConnect` primitive.
     * @returns {Promise<boolean>} True if connected, false otherwise
     */
    async connect() {
        this.connected = await chromaConnect({client: this.client, logger});

        // When the test-database toggle is on, the client targets a dedicated test database. chromadb 3.x
        // has no getOrCreateDatabase and the ChromaClient constructor does not create the database, so it
        // must be ensured-to-exist here — after the heartbeat proves the server is reachable, before the
        // first lazy getOrCreateCollection. Idempotent; the production path is untouched.
        if (this.connected && aiConfig.engines.chroma.useTestDatabase === true) {
            const {host, port, database} = this.resolveChromaClientConfig(aiConfig);
            await ensureChromaTestDatabase({host, port, database});
        }

        return this.connected
    }

    /**
     * Ensures the process can reach the Chroma server and both collections are available.
     * @returns {Promise<{heartbeat: number, memoryCollection: string, summaryCollection: string}>}
     */
    async checkConnectivity() {
        const heartbeat = await this.client.heartbeat();
        const memory    = await this.getMemoryCollection();
        const summaries = await this.getSummaryCollection();

        return {
            heartbeat,
            memoryCollection : memory.name,
            summaryCollection: summaries.name
        };
    }

    /**
     * Per-instance silent-execution function from the shared Chroma primitive.
     * Each consumer gets its own isolated sequential lock. MC's call sites pass
     * `{filter: MC_WARN_FILTER}` to suppress only the four specific Chroma library
     * messages while letting everything else through.
     * @member {Function} #executeSilently
     * @private
     */
    #executeSilently = createSilentExecutor()

    /**
     * Instantiates an IEmbeddingFunction wrapper for the chromadb client.
     * @returns {Object} A locally valid implementation of IEmbeddingFunction
     */
    #createEmbeddingFunction() {
        return createDynamicTextEmbeddingFunction({
            providerResolver: () => aiConfig.embeddingProvider,
            service         : 'memory-core'
        })
    }

    /**
     * @returns {Promise<Object>}
     */
    async getMemoryCollection() {
        if (!this._memoryCollectionPromise) {
            const collectionName = aiConfig.collections.memory;
            this.assertCollectionNotProdBleed({name: collectionName, database: this.resolveChromaClientConfig(aiConfig).database});
            this._memoryCollectionPromise = this.#executeSilently(async () => {
                return await this.client.getOrCreateCollection({
                    name             : collectionName,
                    embeddingFunction: this.#createEmbeddingFunction()
                });
            }, {filter: MC_WARN_FILTER});
        }

        this.memoryCollection = await this._memoryCollectionPromise;
        return this.memoryCollection;
    }

    /**
     * @returns {Promise<Object>}
     */
    async getSummaryCollection() {
        if (!this._summaryCollectionPromise) {
            const collectionName = aiConfig.collections.session;
            this.assertCollectionNotProdBleed({name: collectionName, database: this.resolveChromaClientConfig(aiConfig).database});
            this._summaryCollectionPromise = this.#executeSilently(async () => {
                return await this.client.getOrCreateCollection({
                    name             : collectionName,
                    embeddingFunction: this.#createEmbeddingFunction()
                });
            }, {filter: MC_WARN_FILTER});
        }

        this.summaryCollection = await this._summaryCollectionPromise;
        return this.summaryCollection;
    }

    /**
     * @returns {Promise<Object>}
     */
    async getTemporalSummaryCollection() {
        if (!this._temporalSummaryCollectionPromise) {
            const collectionName = aiConfig.collections.temporalSummary;
            this.assertCollectionNotProdBleed({name: collectionName, database: this.resolveChromaClientConfig(aiConfig).database});
            this._temporalSummaryCollectionPromise = this.#executeSilently(async () => {
                return await this.client.getOrCreateCollection({
                    name             : collectionName,
                    embeddingFunction: this.#createEmbeddingFunction()
                });
            }, {filter: MC_WARN_FILTER});
        }

        this.temporalSummaryCollection = await this._temporalSummaryCollectionPromise;
        return this.temporalSummaryCollection;
    }

    /**
     * @returns {Promise<Object>}
     */
    async getGraphCollection() {
        if (!this._graphCollectionPromise) {
            const collectionName = aiConfig.collections.graph;
            this.assertCollectionNotProdBleed({name: collectionName, database: this.resolveChromaClientConfig(aiConfig).database});
            this._graphCollectionPromise = this.#executeSilently(async () => {
                return await this.client.getOrCreateCollection({
                    name             : collectionName,
                    embeddingFunction: this.#createEmbeddingFunction()
                });
            }, {filter: MC_WARN_FILTER});
        }

        this.graphCollection = await this._graphCollectionPromise;
        return this.graphCollection;
    }

    /**
     * Public predicate for consumers operating on already-resolved collection handles.
     *
     * A long-lived MCP process can hold a collection object across an orchestrator-owned
     * Chroma recycle. Operation-level Chroma not-found failures should invalidate the
     * memoized handle and retry the canonical collection name once.
     *
     * @param {Error} error
     * @returns {Boolean}
     */
    isCollectionNotFoundError(error) {
        return isChromaCollectionNotFoundError(error)
    }

    /**
     * @summary Invalidates memoized Memory Core Chroma collection handles.
     *
     * This is the production-safe subset of the test-only lifecycle reset: it clears only
     * cached Chroma collection promises/objects, leaving service readiness and graph state
     * untouched so the next operation lazily re-resolves by canonical collection name.
     *
     * @param {'memory'|'summary'|'temporalSummary'|'graph'|'all'} [collectionType='all']
     * @returns {void}
     */
    invalidateCollectionCache(collectionType = 'all') {
        const types = collectionType === 'all' ? ['memory', 'summary', 'temporalSummary', 'graph'] : [collectionType];

        for (const type of types) {
            if (type === 'memory') {
                this._memoryCollectionPromise = null;
                this.memoryCollection         = null;
            } else if (type === 'summary') {
                this._summaryCollectionPromise = null;
                this.summaryCollection         = null;
            } else if (type === 'temporalSummary') {
                this._temporalSummaryCollectionPromise = null;
                this.temporalSummaryCollection         = null;
            } else if (type === 'graph') {
                this._graphCollectionPromise = null;
                this.graphCollection         = null;
            }
        }
    }

    /**
     * Guarded delete-collection wrapper. Refuses canonical production collection names
     * (`neo-agent-memory`, `neo-agent-sessions`, `neo-native-graph`, `neo-knowledge-base`)
     * unless `process.env.UNIT_TEST_MODE === 'true'` (test path) or a valid production
     * `confirmation` token is supplied.
     *
     * All Memory Core callers (tests, `CollectionProxy`, future restore wrappers) MUST
     * route through this method instead of `ChromaManager.client.deleteCollection` so the
     * substrate-level invariant fires regardless of harness or config state. The empirical
     * anchor is the 2026-05-17 wipe where `npx playwright` bypassed `playwright.config.unit.mjs`
     * (`UNIT_TEST_MODE` absent) → `aiConfig.collections.*` returned canonical names →
     * a destructive cleanup helper dropped the live collections.
     *
     * @param {Object}  options
     * @param {String}  options.name              Collection name to delete.
     * @param {String} [options.confirmation]     Production-recovery token; equals `CONFIRM_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE` for bypass.
     * @returns {Promise<*>} Forwarded chromadb-client response.
     * @throws {CanonicalCollectionGuardError} When `name` is canonical and neither bypass applies.
     * @see chromaDeleteCollection
     */
    async deleteCollection({name, confirmation} = {}) {
        return chromaDeleteCollection({client: this.client, name, subsystem: 'memory-core', confirmation})
    }

    /**
     * @summary Count sessions in the Chroma summary collection that do NOT have the
     * `graphDigested` metadata flag set to true. This is **Axis A (negative)** of the
     * 5-axis REM observability model: the count of sessions that summarization has
     * produced but graph extraction has not yet digested into the Semantic Graph.
     *
     * Uses the same in-memory filtering pattern as
     * {@link Neo.ai.daemons.services.DreamService#findUndigestedSessions} because
     * ChromaDB filtering on missing/false attributes is unreliable across
     * versions. The count is bounded by the same `summarizationBatchLimit` (default
     * 2000) as the production digest path, so the number is "undigested-among-recent"
     * not a strict global count — the count is operator-facing diagnostic, not a
     * scheduling input.
     *
     * Counterpart helper: {@link #getGraphDigestedCount}. Together they bracket the
     * digestion-progress axis; the divergence between this count and
     * {@link Neo.ai.services.memory-core.GraphService#getSessionNodeCount} (graph
     * SESSION node count) is the empirical signal the 5-axis model is designed to
     * surface. Large Chroma-vs-graph divergence points to graph-write or digest
     * failures that the Chroma flag alone cannot prove.
     *
     * @returns {Promise<Number>} Count of sessions without `graphDigested:true`
     *     metadata; 0 if the collection is empty
     * @see Neo.ai.services.memory-core.GraphService#getSessionNodeCount
     */
    async getUndigestedSessionCount() {
        const collection = await this.getSummaryCollection();
        const limit      = aiConfig.summarizationBatchLimit;
        const batch      = await collection.get({include: ['metadatas'], limit});

        if (!batch || !batch.ids?.length) return 0;

        let count = 0;
        for (let i = 0; i < batch.ids.length; i++) {
            const meta = batch.metadatas[i];
            if (meta && meta.graphDigested !== true && meta.graphDigested !== 'true') {
                count++;
            }
        }
        return count;
    }

    /**
     * @summary Count sessions in the Chroma summary collection that DO have the
     * `graphDigested` metadata flag set to true. This is **Axis A (positive)** of the
     * 5-axis REM observability model — the count of sessions where graph extraction
     * has reported successful digest into the Semantic Graph.
     *
     * Mirrors the in-memory filter shape of {@link #getUndigestedSessionCount} so
     * the pair shares semantics: `getUndigestedSessionCount() + getGraphDigestedCount()`
     * approximates the total session count within the `summarizationBatchLimit`
     * window. Per-call cost is one Chroma `get()` + in-memory iteration.
     *
     * **Important divergence semantic:** a positive value here does NOT prove the
     * downstream graph SESSION node exists — the flag is set when DreamService
     * believes the digest succeeded, but the actual graph mutation is a separate
     * substrate. Compare against
     * {@link Neo.ai.services.memory-core.GraphService#getSessionNodeCount} for the
     * Chroma-vs-graph divergence detection.
     *
     * @returns {Promise<Number>} Count of sessions with `graphDigested:true`
     *     metadata; 0 if the collection is empty
     * @see Neo.ai.services.memory-core.GraphService#getSessionNodeCount
     */
    async getGraphDigestedCount() {
        const collection = await this.getSummaryCollection();
        const limit      = aiConfig.summarizationBatchLimit;
        const batch      = await collection.get({include: ['metadatas'], limit});

        if (!batch || !batch.ids?.length) return 0;

        let count = 0;
        for (let i = 0; i < batch.ids.length; i++) {
            const meta = batch.metadatas[i];
            if (meta && (meta.graphDigested === true || meta.graphDigested === 'true')) {
                count++;
            }
        }
        return count;
    }
}

export default Neo.setupClass(ChromaManager);
