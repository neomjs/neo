import aiConfig                 from '../config.mjs';
import Base                     from '../../../../../src/core/Base.mjs';
import ChromaManager            from './ChromaManager.mjs';
import DatabaseLifecycleService from './DatabaseLifecycleService.mjs';
import logger                   from '../logger.mjs';

/**
 * Monitors and validates the ChromaDB dependency for the Knowledge Base MCP server.
 *
 * This service acts as a gatekeeper, ensuring that ChromaDB is properly running,
 * accessible, and contains the expected collection before any knowledge base operations proceed.
 *
 * Key responsibilities:
 * - Connectivity validation: Ensures ChromaDB is reachable via heartbeat
 * - Collection verification: Confirms the knowledge base collection exists
 * - Intelligent caching: Reduces overhead by caching health status for 5 minutes
 * - Graceful degradation: Provides clear, actionable error messages when dependencies are missing
 * - Recovery detection: Automatically detects when issues are resolved (e.g., after starting ChromaDB)
 *
 * The service is designed to be non-blocking at startup, allowing the server to run even
 * when ChromaDB is not available, while failing gracefully at the tool-call level with helpful
 * error messages to guide users toward resolution.
 *
 * @class Neo.ai.mcp.server.knowledge-base.services.HealthService
 * @extends Neo.core.Base
 * @singleton
 */
class HealthService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.services.HealthService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.services.HealthService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Cached result of the most recent health check.
     * Used to avoid redundant ChromaDB calls within the cache TTL window.
     * @member {Object|null} #cachedHealth
     * @private
     */
    #cachedHealth = null;

    /**
     * Timestamp (in milliseconds) of when the health check cache was last populated.
     * @member {number|null} #lastCheckTime
     * @private
     */
    #lastCheckTime = null;

    /**
     * Duration (in milliseconds) for which cached HEALTHY results remain valid.
     * Set to 5 minutes to balance freshness with performance.
     * Unhealthy results are never cached to allow immediate recovery detection.
     * @member {number} #cacheDuration
     * @private
     */
    #cacheDuration = 5 * 60 * 1000;

    /**
     * The status from the previous health check, used to detect state transitions
     * (e.g., recovery from 'unhealthy' to 'healthy') and log meaningful messages.
     * @member {string|null} #previousStatus
     * @private
     */
    #previousStatus = null;

    /**
     * Checks if ChromaDB is running and accessible.
     *
     * Intent: This is the most critical check. Without ChromaDB running, no knowledge base
     * operations are possible. We use the heartbeat endpoint to verify connectivity.
     *
     * @returns {Promise<{running: boolean, error?: string}>}
     * @private
     */
    async #checkChromaConnection() {
        try {
            await ChromaManager.client.heartbeat();
            return { running: true };
        } catch (e) {
            return {
                running: false,
                error: `ChromaDB is not accessible at ${aiConfig.host}:${aiConfig.port}. Please start ChromaDB or use the start_database tool.`
            };
        }
    }

    /**
     * Verifies that the required collections exist and are accessible.
     *
     * Intent: Even if ChromaDB is running, we need to ensure our specific collection
     * is properly initialized. This check confirms the knowledge base collection
     * is available for operations.
     *
     * @returns {Promise<{knowledgeBase: Object|null, error?: string}>}
     * @private
     */
    async #checkCollections() {
        const result = {
            knowledgeBase: null
        };

        try {
            // Check knowledge base collection
            const knowledgeBaseCollection = await ChromaManager.getKnowledgeBaseCollection().catch(() => null);
            if (knowledgeBaseCollection) {
                const count = await knowledgeBaseCollection.count();
                result.knowledgeBase = {
                    name: aiConfig.collectionName,
                    exists: true,
                    count
                };
            } else {
                result.knowledgeBase = {
                    name: aiConfig.collectionName,
                    exists: false,
                    count: 0
                };
            }

            return result;
        } catch (e) {
            return {
                ...result,
                error: `Failed to access collections: ${e.message}`
            };
        }
    }

    /**
     * Checks if the GEMINI_API_KEY is configured (required for summarization).
     *
     * Intent: Session summarization requires the Gemini API. This check allows us
     * to report a 'degraded' state when the API key is missing, so users know
     * that memory operations work but summarization will fail.
     *
     * @returns {boolean}
     * @private
     */
    #checkApiKeyConfigured() {
        return !!process.env.GEMINI_API_KEY;
    }

    /**
     * Performs a comprehensive health check without using the cache.
     *
     * Intent: This is the core health check logic, separated from the caching layer
     * for clarity. It systematically verifies each dependency and builds a detailed
     * status payload that can be used for diagnostics, logging, and error messages.
     *
     * The checks are performed in order of criticality:
     * 1. ChromaDB connectivity (if it's not running, nothing else matters)
     * 2. Collection accessibility (ensures data structures are ready)
     * 3. API key presence (optional, but needed for summarization)
     *
     * Status levels:
     * - healthy: ChromaDB running, collections accessible, API key present
     * - degraded: ChromaDB running, collections accessible, but API key missing
     * - unhealthy: ChromaDB not running or collections not accessible
     *
     * @returns {Promise<object>} A comprehensive health status payload
     * @private
     */
    async #performHealthCheck() {
        const payload = {
            status   : 'healthy',
            timestamp: new Date().toISOString(),
            database : {
                process: DatabaseLifecycleService.getDatabaseStatus(),
                connection: {
                    connected  : false,
                    collections: null
                }
            },
            features: {
                embedding: false
            },
            details: [],
            version: '1.0.0',
            uptime : process.uptime()
        };

        // Step 1: Check ChromaDB connectivity
        const connectionCheck = await this.#checkChromaConnection();
        payload.database.connection.connected = connectionCheck.running;

        if (!connectionCheck.running) {
            payload.status = 'unhealthy';
            payload.details.push(connectionCheck.error);
            return payload;
        }

        // Step 2: Check collections
        const collectionsCheck = await this.#checkCollections();
        payload.database.connection.collections = {
            knowledgeBase: collectionsCheck.knowledgeBase
        };

        if (collectionsCheck.error) {
            payload.status = 'unhealthy';
            payload.details.push(collectionsCheck.error);
            return payload;
        }

        if (!collectionsCheck.knowledgeBase?.exists) {
            payload.status = 'unhealthy';
            payload.details.push('The required knowledge base collection is missing');
            return payload;
        }

        // Step 3: Check API key for summarization feature
        const apiKeyConfigured = this.#checkApiKeyConfigured();
        payload.features.embedding = apiKeyConfigured;

        if (!apiKeyConfigured) {
            payload.status = 'degraded';
            payload.details.push('GEMINI_API_KEY not set - embedding features unavailable');
        }

        // If we made it here with no errors, report success
        if (payload.status === 'healthy') {
            payload.details.push('ChromaDB is running and all collections are accessible');
            payload.details.push('All features are operational');
        }

        return payload;
    }

    /**
     * Public API: Checks the health of the Knowledge Base with intelligent caching.
     *
     * Intent: This is the primary entry point for all health checks. It uses a
     * 5-minute cache to avoid hammering ChromaDB with redundant heartbeat calls,
     * which is especially important when:
     * - The MCP server is handling multiple concurrent tool requests
     * - Agents are debugging issues and repeatedly calling healthcheck
     * - The startup sequence is running automatic summarization
     *
     * IMPORTANT: Only 'healthy' results are cached. Unhealthy/degraded results are
     * always fresh, allowing immediate recovery detection when users fix issues
     * (e.g., by starting ChromaDB or setting GEMINI_API_KEY). This ensures good UX -
     * users don't have to wait 5 minutes to retry after fixing a problem.
     *
     * Recovery detection: If the status changes between checks (e.g., from 'unhealthy'
     * to 'healthy'), we log a clear message so users know their fix worked.
     *
     * @returns {Promise<object>} A health status payload
     */
    async healthcheck() {
        const now = Date.now();

        // Only use cache if the previous result was healthy
        // Unhealthy/degraded results are never cached to allow immediate recovery
        if (this.#cachedHealth &&
            this.#cachedHealth.status === 'healthy' &&
            this.#lastCheckTime) {
            const age = now - this.#lastCheckTime;

            // If the cache is still fresh (< 5 minutes old), return it immediately
            if (age < this.#cacheDuration) {
                logger.debug(`[HealthService] Using cached health status (age: ${Math.round(age / 1000)}s)`);
                return this.#cachedHealth;
            }
        }

        // Cache is stale, was unhealthy, or doesn't exist - perform a fresh check
        logger.debug('[HealthService] Performing fresh health check');
        const health = await this.#performHealthCheck();

        // Detect and log meaningful state transitions
        // This helps users understand when their fixes (like starting ChromaDB) succeed
        if (this.#previousStatus && this.#previousStatus !== health.status) {
            if (this.#previousStatus === 'unhealthy' && health.status === 'healthy') {
                logger.info('🎉 [HealthService] System recovered! Knowledge Base is now fully operational.');
            } else if (this.#previousStatus === 'unhealthy' && health.status === 'degraded') {
                logger.info('⚠️  [HealthService] System partially recovered. ChromaDB is running but some features unavailable.');
            } else if (this.#previousStatus === 'degraded' && health.status === 'healthy') {
                logger.info('✅ [HealthService] System fully recovered! All features now operational.');
            } else if ((this.#previousStatus === 'healthy' || this.#previousStatus === 'degraded') && health.status === 'unhealthy') {
                logger.warn('⚠️  [HealthService] System became unhealthy. Tools may fail until dependencies are resolved.');
            }
        }

        // Update the cache with this fresh result
        // Note: Even unhealthy results are stored, but won't be returned from cache
        this.#cachedHealth   = health;
        this.#lastCheckTime  = now;
        this.#previousStatus = health.status;

        return health;
    }

    /**
     * Ensures the Knowledge Base is healthy before allowing an operation to proceed.
     *
     * Intent: This is the "gatekeeper" method used by tool handlers to fail-fast
     * with a clear error message if dependencies are not available.
     *
     * By throwing an exception, we ensure that:
     * 1. The operation doesn't attempt to use ChromaDB/Gemini and get cryptic errors
     * 2. The agent receives a clear, actionable error message via the MCP protocol
     * 3. Users understand exactly what needs to be fixed
     *
     * This method leverages the cached health check, so calling it frequently
     * (e.g., before each tool invocation) has minimal performance impact.
     *
     * Note: Both ChromaDB and GEMINI_API_KEY are required for all knowledge base operations,
     * since adding/querying knowledge requires text embeddings via the Gemini API.
     * Only database lifecycle operations (start/stop) can work in degraded state.
     *
     * @throws {Error} If the Knowledge Base is not fully healthy, with a detailed message
     * @returns {Promise<void>}
     */
    async ensureHealthy() {
        const health = await this.healthcheck();

        if (health.status !== 'healthy') {
            // Build a multi-line error message with all the issues detected
            const details = health.details.join('\n  - ');
            const statusMsg = health.status === 'unhealthy' ? 'not available' : 'not fully operational';
            throw new Error(`Knowledge Base is ${statusMsg}:\n  - ${details}`);
        }
    }

    /**
     * Clears the health check cache, forcing the next call to perform a fresh check.
     *
     * Intent: This is primarily useful for testing and debugging scenarios where
     * you need to immediately verify a fix (e.g., after starting ChromaDB)
     * without waiting for the 5-minute cache to expire.
     */
    clearCache() {
        this.#cachedHealth  = null;
        this.#lastCheckTime = null;
        logger.debug('[HealthService] Cache cleared, next health check will be fresh');
    }
}

export default Neo.setupClass(HealthService);
