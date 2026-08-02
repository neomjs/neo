import {ChromaClient}           from 'chromadb';
import aiConfig                 from '../../mcp/server/knowledge-base/config.mjs';
import logger                   from '../../mcp/server/knowledge-base/logger.mjs';
import Base                     from '../../../src/core/Base.mjs';
import DatabaseLifecycleService from './DatabaseLifecycleService.mjs';
import {
    chromaConnect,
    chromaDeleteCollection,
    chromaListCollectionNames,
    createSilentExecutor,
    isChromaCollectionNotFoundError,
    registerNeoChromaEmbeddingFunctions
} from '../shared/vector/chromaClientPrimitives.mjs';

const COLLECTION_ALREADY_EXISTS_RE = /already exists|already contains|conflict/i;
const SWAP_ACTIVE_PHASES           = ['parking', 'shadow'];

/** @summary Waits for the configured collection-resolve retry backoff interval. */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

registerNeoChromaEmbeddingFunctions({
    dummyEmbeddingFunction: aiConfig.dummyEmbeddingFunction
});

/**
 * @summary Simple manager around the Chroma client that lazily caches the knowledge-base collection.
 *
 * This class provides a wrapper around the ChromaDB client, ensuring that the connection
 * and the specific knowledge-base collection are initialized and cached for subsequent use.
 *
 * @class Neo.ai.services.knowledge-base.ChromaManager
 * @extends Neo.core.Base
 * @singleton
 */
class ChromaManager extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.ChromaManager'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.ChromaManager',
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
         * @member {Object|null} knowledgeBaseCollection=null
         * @protected
         */
        knowledgeBaseCollection: null,
        /**
         * @member {Function} collectionResolveRetrySleepFn=sleep
         * @protected
         */
        collectionResolveRetrySleepFn: sleep,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        // The client is created here, but the connection is established in initAsync
        const {host, port} = aiConfig;
        this.client = new ChromaClient({host, port, ssl: false});
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        await DatabaseLifecycleService.ready();
        await this.connect();
    }

    /**
     * Establishes connection to ChromaDB via the shared `chromaConnect` primitive.
     * @returns {Promise<boolean>} True if connected, false otherwise
     */
    async connect() {
        this.connected = await chromaConnect({client: this.client, logger});
        return this.connected
    }

    /**
     * Ensures the process can reach the Chroma server and the collection is available.
     * @returns {Promise<{heartbeat: number, knowledgeBaseCollection: string}>}
     */
    async checkConnectivity() {
        const heartbeat  = await this.client.heartbeat();
        const collection = await this.getKnowledgeBaseCollection();

        return {
            heartbeat,
            knowledgeBaseCollection: collection.name
        };
    }

    /**
     * Per-instance silent-execution function from the shared primitive.
     * Each consumer gets its own isolated sequential lock. KB uses blanket suppression
     * (no `filter` passed at call sites); MC's per-message filter is unaffected.
     * @member {Function} #executeSilently
     * @private
     */
    #executeSilently = createSilentExecutor()

    /**
     * @returns {Promise<Object>}
     */
    async getKnowledgeBaseCollection() {
        if (!this._knowledgeBaseCollectionPromise) {
            this._knowledgeBaseCollectionPromise = this.#executeSilently(async () => {
                return await this.#resolveKnowledgeBaseCollection();
            });
        }

        try {
            this.knowledgeBaseCollection = await this._knowledgeBaseCollectionPromise;
            return this.knowledgeBaseCollection;
        } catch (error) {
            this.invalidateKnowledgeBaseCollectionCache();
            throw error;
        }
    }

    /**
     * @summary Resolves the canonical KB collection without creating it during a shadow-swap promote window.
     *
     * Shadow-swap promotion briefly renames the canonical collection to a parking
     * name before the shadow collection takes the canonical name. During that
     * interval, plain `getOrCreateCollection()` can create an empty canonical
     * collection and cause the promote rename to collide. This resolver first
     * attempts `getCollection()`, then checks for active swap artifacts before
     * creating the canonical collection for true first-run bootstrap only.
     *
     * @returns {Promise<Object>}
     * @throws {Error} `KB_COLLECTION_SWAP_IN_PROGRESS` when active swap artifacts exist.
     * @see https://github.com/neomjs/neo/issues/11685
     */
    async #resolveKnowledgeBaseCollection() {
        const options = this.#getKnowledgeBaseCollectionOptions();

        try {
            return await this.#getCollectionWithConnectionRetry(options);
        } catch (error) {
            if (!this.#isCollectionNotFoundError(error)) {
                throw error;
            }
        }

        const activeSwapCollections = await this.#getActiveKnowledgeBaseSwapCollections();
        if (activeSwapCollections.length > 0) {
            throw this.#createSwapInProgressError(activeSwapCollections);
        }

        try {
            return await this.client.createCollection(options);
        } catch (error) {
            if (!this.#isCollectionAlreadyExistsError(error)) {
                throw error;
            }

            const activeSwapCollections = await this.#getActiveKnowledgeBaseSwapCollections();
            if (activeSwapCollections.length > 0) {
                throw this.#createSwapInProgressError(activeSwapCollections);
            }

            return await this.client.getCollection(options);
        }
    }

    /**
     * @summary Resolves the canonical collection with bounded retries for transient Chroma restarts.
     * @param {Object} options Chroma getCollection options.
     * @returns {Promise<Object>}
     * @throws {Error}
     */
    async #getCollectionWithConnectionRetry(options) {
        const retry        = this.#getCollectionResolveRetryPolicy();
        let   totalDelayMs = 0;

        for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
            try {
                return await this.client.getCollection(options);
            } catch (error) {
                if (!this.#isChromaConnectionError(error) || attempt >= retry.maxAttempts) {
                    throw this.#createCollectionResolveError(error, {attempt, retry, totalDelayMs});
                }

                const delayMs = this.#getCollectionResolveRetryDelay({attempt, retry, totalDelayMs});

                if (delayMs <= 0 && totalDelayMs >= retry.maxTotalDelayMs) {
                    throw this.#createCollectionResolveError(error, {attempt, retry, totalDelayMs});
                }

                logger.debug?.(`[ChromaManager] Transient Chroma collection resolve failure; retrying in ${delayMs}ms (attempt ${attempt + 1}/${retry.maxAttempts}).`);
                await this.collectionResolveRetrySleepFn(delayMs);
                totalDelayMs += delayMs;
            }
        }
    }

    /**
     * @returns {{maxAttempts: Number, initialDelayMs: Number, maxDelayMs: Number, maxTotalDelayMs: Number}}
     */
    #getCollectionResolveRetryPolicy() {
        const policy  = aiConfig.collectionResolveRetry;
        const missing = ['maxAttempts', 'initialDelayMs', 'maxDelayMs', 'maxTotalDelayMs']
            .filter(key => !Number.isFinite(Number(policy?.[key])));

        if (missing.length > 0) {
            throw new Error(`collectionResolveRetry config leaves missing or invalid: ${missing.join(', ')}. Sync ai/mcp/server/knowledge-base/config.mjs from config.template.mjs (node ai/scripts/setup/initServerConfigs.mjs --migrate-config) and restart knowledge-base.`);
        }

        const retry = {
            maxAttempts    : Math.trunc(Number(policy.maxAttempts)),
            initialDelayMs : Number(policy.initialDelayMs),
            maxDelayMs     : Number(policy.maxDelayMs),
            maxTotalDelayMs: Number(policy.maxTotalDelayMs)
        };

        if (retry.maxAttempts < 1 || retry.initialDelayMs < 0 || retry.maxDelayMs < 0 || retry.maxTotalDelayMs < 0) {
            throw new Error('collectionResolveRetry config leaves are invalid: maxAttempts must be >= 1 and delay values must be >= 0.');
        }

        return retry
    }

    /**
     * @param {Object} options
     * @param {Number} options.attempt Completed attempt number.
     * @param {Object} options.retry Retry policy.
     * @param {Number} options.totalDelayMs Delay already spent.
     * @returns {Number}
     */
    #getCollectionResolveRetryDelay({attempt, retry, totalDelayMs}) {
        const exponentialDelayMs = retry.initialDelayMs * 2 ** (attempt - 1);
        const cappedDelayMs      = retry.maxDelayMs > 0 ? Math.min(exponentialDelayMs, retry.maxDelayMs) : exponentialDelayMs;
        const remainingDelayMs   = retry.maxTotalDelayMs - totalDelayMs;

        return Math.max(0, Math.min(cappedDelayMs, remainingDelayMs))
    }

    /**
     * @returns {{name: String, embeddingFunction: Object}}
     */
    #getKnowledgeBaseCollectionOptions() {
        return {
            name             : aiConfig.collectionName,
            embeddingFunction: aiConfig.dummyEmbeddingFunction
        };
    }

    /**
     * @param {Error} error
     * @returns {Boolean}
     */
    #isCollectionNotFoundError(error) {
        return isChromaCollectionNotFoundError(error)
    }

    /**
     * @param {Error} error
     * @returns {Boolean}
     */
    #isChromaConnectionError(error) {
        return error?.name === 'ChromaConnectionError' || error?.constructor?.name === 'ChromaConnectionError'
    }

    /**
     * @param {Error} error
     * @param {Object} context
     * @returns {Error}
     */
    #createCollectionResolveError(error, {attempt, retry, totalDelayMs}) {
        if (!this.#isChromaConnectionError(error)) {
            return error
        }

        const failure = new Error(
            `Knowledge base collection resolve failed after ${attempt}/${retry.maxAttempts} attempts ` +
            `and ${totalDelayMs}ms retry delay: ${error.message}`
        );

        failure.name         = error.name || 'ChromaConnectionError';
        failure.code         = error.code;
        failure.cause        = error;
        failure.retryContext = {attempt, maxAttempts: retry.maxAttempts, totalDelayMs};
        return failure
    }

    /**
     * Public predicate for consumers that operate on an already-resolved collection handle.
     *
     * `getKnowledgeBaseCollection()` invalidates resolution failures itself. Callers that
     * receive a later operation-level Chroma not-found need the same classifier to drop a
     * stale handle before retrying the canonical collection name.
     *
     * @param {Error} error
     * @returns {Boolean}
     */
    isCollectionNotFoundError(error) {
        return this.#isCollectionNotFoundError(error);
    }

    /**
     * @param {Error} error
     * @returns {Boolean}
     */
    #isCollectionAlreadyExistsError(error) {
        return COLLECTION_ALREADY_EXISTS_RE.test(error?.message || '');
    }

    /**
     * @summary Non-mutating enumeration of every collection this client can see.
     *
     * `#resolveKnowledgeBaseCollection` answers "does this collection exist?" by making it true — it
     * catches not-found and creates. A caller that needs the pre-read answer therefore cannot ask any
     * resolver for it, and must enumerate instead. Deliberately public and deliberately NOT wired into
     * resolution: the auto-create is load-bearing for first-run bootstrap and shared by every reader in
     * the system, so the backup lane's reporting need is served beside it, never inside it.
     *
     * Returns the whole list rather than a per-name predicate so a caller checking several collections
     * takes ONE snapshot — N predicates would each observe a different instant, and the verdict they
     * feed is a statement about a single moment before the export began.
     *
     * @returns {Promise<String[]>} Collection names, having created nothing.
     * @see https://github.com/neomjs/neo/issues/16348
     */
    async listCollectionNames() {
        return await chromaListCollectionNames({client: this.client})
    }

    /**
     * @returns {Promise<String[]>}
     */
    async #getActiveKnowledgeBaseSwapCollections() {
        const names = await chromaListCollectionNames({client: this.client});

        return names.filter(name => this.#isActiveKnowledgeBaseSwapName(name)).sort();
    }

    /**
     * @param {String} name
     * @returns {Boolean}
     */
    #isActiveKnowledgeBaseSwapName(name) {
        return SWAP_ACTIVE_PHASES.some(phase => name.startsWith(`${aiConfig.collectionName}-${phase}-`));
    }

    /**
     * @param {String[]} activeSwapCollections
     * @returns {Error}
     */
    #createSwapInProgressError(activeSwapCollections) {
        const error = new Error(
            `Knowledge base collection '${aiConfig.collectionName}' is temporarily unavailable during shadow-swap promotion. ` +
            `Active swap collections: ${activeSwapCollections.join(', ')}. Retry after promotion completes.`
        );
        error.code                  = 'KB_COLLECTION_SWAP_IN_PROGRESS';
        error.collection            = aiConfig.collectionName;
        error.activeSwapCollections = activeSwapCollections;
        return error;
    }

    /**
     * @summary Invalidates the memoized canonical knowledge-base collection handle.
     *
     * Shadow-swap re-embeds rename the canonical Chroma collection behind the stable
     * `aiConfig.collectionName`. Any cached collection object can point at the parked
     * pre-swap collection after that rename, so callers must force the next read to
     * lazily resolve the canonical name again.
     *
     * @returns {void}
     * @see https://github.com/neomjs/neo/issues/11683
     */
    invalidateKnowledgeBaseCollectionCache() {
        this._knowledgeBaseCollectionPromise = null;
        this.knowledgeBaseCollection         = null;
    }

    /**
     * Guarded delete-collection wrapper. Delegates to the shared `chromaDeleteCollection`
     * primitive which routes through `assertCanonicalCollectionDeleteAllowed` with
     * `subsystem: 'knowledge-base'`. Refuses canonical production collection names unless
     * `UNIT_TEST_MODE=true` or a valid production `confirmation` token is supplied.
     *
     * All Knowledge Base callers (`DatabaseService.truncateDatabase`, `VectorService.deleteCollection`,
     * future restore wrappers) MUST route through this method instead of bare
     * `ChromaManager.client.deleteCollection` so the substrate-level invariant fires
     * regardless of harness or config state.
     *
     * @param {Object}  options
     * @param {String}  options.name              Collection name to delete.
     * @param {String} [options.confirmation]     Production-recovery token; equals `CONFIRM_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE` for bypass.
     * @returns {Promise<*>} Forwarded chromadb-client response.
     * @throws {CanonicalCollectionGuardError} When `name` is canonical and neither bypass applies.
     * @see https://github.com/neomjs/neo/issues/11652
     */
    async deleteCollection({name, confirmation} = {}) {
        return chromaDeleteCollection({client: this.client, name, subsystem: 'knowledge-base', confirmation})
    }
}

export default Neo.setupClass(ChromaManager);
