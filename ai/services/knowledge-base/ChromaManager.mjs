import {ChromaClient}                       from 'chromadb';
import aiConfig                             from '../../mcp/server/knowledge-base/config.mjs';
import logger                               from '../../mcp/server/knowledge-base/logger.mjs';
import Base                                 from '../../../src/core/Base.mjs';
import DatabaseLifecycleService             from './DatabaseLifecycleService.mjs';
import {assertCanonicalCollectionDeleteAllowed} from '../../mcp/server/shared/services/DestructiveOperationGuard.mjs';

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
                return await this.client.getOrCreateCollection({
                    name             : aiConfig.collectionName,
                    embeddingFunction: aiConfig.dummyEmbeddingFunction
                });
            });
        }

        this.knowledgeBaseCollection = await this._knowledgeBaseCollectionPromise;
        return this.knowledgeBaseCollection;
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
