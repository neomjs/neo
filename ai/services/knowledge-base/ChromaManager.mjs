import {ChromaClient}                       from 'chromadb';
import aiConfig                             from '../../mcp/server/knowledge-base/config.mjs';
import logger                               from '../../mcp/server/knowledge-base/logger.mjs';
import Base                                 from '../../../src/core/Base.mjs';
import DatabaseLifecycleService             from './DatabaseLifecycleService.mjs';
import {assertCanonicalCollectionDeleteAllowed} from '../../mcp/server/shared/services/DestructiveOperationGuard.mjs';

const COLLECTION_ALREADY_EXISTS_RE = /already exists|already contains|conflict/i;
const COLLECTION_NOT_FOUND_RE      = /does not exist|not found|not be found|could not be found|404/i;
const SWAP_ACTIVE_PHASES           = ['parking', 'shadow'];

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
     * Establishes connection to ChromaDB.
     * @returns {Promise<boolean>} True if connected, false otherwise
     */
    async connect() {
        try {
            await this.client.heartbeat();
            this.connected = true;
            return true;
        } catch (e) {
            this.connected = false;
            logger.debug('[ChromaManager] ChromaDB not accessible:', e.message);
            return false;
        }
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

    #chromaLock = Promise.resolve();

    /**
     * Executes a ChromaDB client function sequentially, ensuring console.warn
     * is safely suppressed without overlapping race conditions.
     * @param {Function} fn Async function to execute
     * @returns {Promise<any>}
     */
    async #executeSilently(fn) {
        const nextLock = (async () => {
            // Await the completion of the previous silent execution
            await this.#chromaLock;

            const originalWarn = console.warn;
            console.warn = () => {}; // Suppress unwanted warnings from ChromaDB client

            try {
                return await fn();
            } finally {
                // Guaranteed sequential restore
                console.warn = originalWarn;
            }
        })();

        // Prevent chain crashing if an internal error occurs
        this.#chromaLock = nextLock.catch(() => {});
        return nextLock;
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
            return await this.client.getCollection(options);
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
        return error?.name === 'ChromaNotFoundError' || COLLECTION_NOT_FOUND_RE.test(error?.message || '');
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
        const names = [];
        const limit = 1000;
        let offset  = 0;

        do {
            const collections = await this.client.listCollections({limit, offset});
            names.push(...collections.map(collection => collection.name));

            if (collections.length < limit) {
                break;
            }

            offset += limit;
        } while (true);

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
     * Guarded delete-collection wrapper — peer of the Memory Core counterpart. Refuses
     * canonical production collection names unless `UNIT_TEST_MODE=true` or a valid
     * production `confirmation` token is supplied. See the Memory Core ChromaManager's
     * `deleteCollection` JSDoc for the empirical anchor (2026-05-17 wipe) and rationale.
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
        assertCanonicalCollectionDeleteAllowed({name, subsystem: 'knowledge-base', confirmation});
        return await this.client.deleteCollection({name});
    }
}

export default Neo.setupClass(ChromaManager);
