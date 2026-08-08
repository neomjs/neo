import {ChromaClient}                  from 'chromadb';
import aiConfig                        from '../../mcp/server/knowledge-base/config.mjs';
import logger                          from '../../mcp/server/knowledge-base/logger.mjs';
import Base                            from '../../../src/core/Base.mjs';
import DatabaseLifecycleService        from './DatabaseLifecycleService.mjs';
import {assertDisposableRestoreTarget} from '../../mcp/server/shared/services/DestructiveOperationGuard.mjs';
import {ensureChromaTestDatabase}      from '../shared/vector/chromaTestIsolation.mjs';
import {
    chromaConnect,
    chromaDeleteCollection,
    chromaListCollectionNames,
    createSilentExecutor,
    isChromaCollectionNotFoundError,
    isChromaConnectionError,
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

        // The client is created here, but the connection is established in initAsync.
        //
        // `database` is passed EXPLICITLY. Omitting it landed every client on Chroma's default
        // database, which is why a `unit/` spec could reach the live canonical collection — the
        // isolation Memory Core has had all along was simply absent here. The value is resolved by
        // the config's `chromaDatabase` formula, so this reads one value and carries no env ternary.
        const {host, port, chromaDatabase: database} = aiConfig;

        this.client = new ChromaClient({host, port, ssl: false, database});
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

        // The test database must EXIST before the first lazy getOrCreateCollection, or the isolated
        // client connects to a database Chroma has never been told to create. Idempotent, and the
        // production path is untouched because the resolved database is the production one there.
        // Same call and same ordering Memory Core uses — one isolation authority, not a second
        // beside it.
        //
        // The condition asks what the formula RESOLVED, not which toggle drove it. `chromaDatabase`
        // selects the test database on `chromaUseTestDatabase || memoryCoreDbUseTestHarness`, so a
        // guard naming one toggle is narrower than the selector it guards: under the
        // template-resolver arm (`NEO_TEST_CONFIG_TEMPLATES` set, `UNIT_TEST_MODE` unset) the client
        // resolved the per-worker test database while the ensure never ran, and the first lazy
        // collection call targeted a database nothing had created. Comparing against
        // `chromaDatabaseTest` tracks the formula automatically, so a future third toggle cannot
        // reintroduce the drift.
        if (this.connected && aiConfig.chromaDatabase === aiConfig.chromaDatabaseTest) {
            await ensureChromaTestDatabase({
                host    : aiConfig.host,
                port    : aiConfig.port,
                database: aiConfig.chromaDatabase
            });
        }

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
     * @summary Resolves a DISPOSABLE (non-canonical) collection, creating it if absent.
     *
     * Exists so a restore can be exercised against something throwaway. Every property worth
     * testing about a restore requires performing one, and until this path existed the only
     * reachable target was the live canonical collection, which made the restore tool unusable
     * for diagnosing itself.
     *
     * Three deliberate differences from {@link ChromaManager#getKnowledgeBaseCollection}:
     *
     * 1. **Guarded.** The name is passed through `assertDisposableRestoreTarget`, so a canonical
     *    collection is unreachable through this method rather than merely discouraged.
     * 2. **Not cached.** `_knowledgeBaseCollectionPromise` memoizes the one canonical collection
     *    for the process; a disposable target is per-experiment and caching it would hand a later
     *    caller a handle to a collection named for an earlier run.
     * 3. **No swap-window resolver.** `#resolveKnowledgeBaseCollection`'s `KB_COLLECTION_SWAP_IN_PROGRESS`
     *    logic protects the canonical name while a shadow promotion holds it. A disposable name is
     *    never a promotion target, so that machinery would be dead weight here.
     *
     * Uses the same `dummyEmbeddingFunction` as the canonical collection, because a restore
     * carries its own vectors and must not trigger re-embedding — a disposable target that
     * re-embedded would measure a different write path than the one under investigation.
     *
     * **And one deliberate SAMENESS, which matters more than the differences.** It shares the
     * canonical path's bounded connection-retry rather than calling the client directly. Chroma
     * restarts — that is the event this whole investigation is about — so the one resolution path
     * used to diagnose a restore must tolerate exactly what the canonical path tolerates. Without
     * it a transient connection error surfaces as *"the restore failed"*, which is the worst failure
     * mode an instrument can have: harness noise read as a result. Flagged in review by
     * @neo-opus-ada, who noted the three differences above were each argued while this one was
     * silent — an unlisted difference reads as an omission rather than a decision.
     *
     * @param {Object} options
     * @param {String} options.name Disposable collection name; must not be canonical.
     * @returns {Promise<Object>} The Chroma collection handle.
     * @throws {DisposableRestoreTargetError} When `name` is a canonical collection.
     */
    async getDisposableCollection({name} = {}) {
        const targetName = assertDisposableRestoreTarget({name});

        return await this.#getCollectionWithConnectionRetry(
            {name: targetName, embeddingFunction: aiConfig.dummyEmbeddingFunction},
            options => this.client.getOrCreateCollection(options)
        )
    }

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
     * @summary Resolves a collection with bounded retries for transient Chroma restarts.
     *
     * The resolver is injectable so the disposable-target path shares this exact retry policy rather
     * than carrying a second copy of it. Those two callers need different Chroma verbs — the canonical
     * path must NOT create (an absent canonical collection is a swap-window signal, handled by
     * {@link ChromaManager##resolveKnowledgeBaseCollection}), while a disposable target must create on
     * first use — but the restart-tolerance question is identical for both, and duplicating the loop
     * would let the two drift apart on a property whose whole point is surviving the same event.
     * @param {Object} options Chroma collection options.
     * @param {Function} [resolveCollection] Verb to retry; defaults to a non-creating `getCollection`.
     * @returns {Promise<Object>}
     * @throws {Error}
     */
    async #getCollectionWithConnectionRetry(options, resolveCollection = opts => this.client.getCollection(opts)) {
        const retry        = this.#getCollectionResolveRetryPolicy();
        let   totalDelayMs = 0;

        for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
            try {
                return await resolveCollection(options);
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
        return isChromaConnectionError(error)
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
