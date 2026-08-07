import path                     from 'path';
import {fileURLToPath}          from 'url';
import aiConfig                 from '../../mcp/server/knowledge-base/config.mjs';
import Base                     from '../../../src/core/Base.mjs';
import ChromaManager            from './ChromaManager.mjs';
import DatabaseLifecycleService from './DatabaseLifecycleService.mjs';
import logger                   from '../../mcp/server/knowledge-base/logger.mjs';
import RuntimeFreshnessService  from '../../mcp/server/shared/services/RuntimeFreshnessService.mjs';

const
    serviceDir              = path.dirname(fileURLToPath(import.meta.url)),
    configPath              = path.resolve(serviceDir, '../../config.mjs'),
    openApiPath             = path.resolve(serviceDir, '../../mcp/server/knowledge-base/openapi.yaml'),
    runtimeFreshnessTracker = RuntimeFreshnessService.createTracker({
        files  : [{
            key       : 'configDigest',
            path      : configPath,
            errorLabel: 'config digest'
        }, {
            key       : 'openApiDigest',
            path      : openApiPath,
            errorLabel: 'OpenAPI digest'
        }],
        serviceName       : 'Knowledge Base MCP server',
        identityLabel     : 'config/schema identity',
        assertionFacts    : 'tool-schema/source facts',
        restartScope      : 'cached source, config, and tool definitions',
        statusFields      : ['configDigest', 'openApiDigest'],
        unavailableSummary: 'config digest and OpenAPI digest'
    });

/**
 * @summary Monitors and validates the ChromaDB dependency for the Knowledge Base MCP server.
 *
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
 * @class Neo.ai.services.knowledge-base.HealthService
 * @extends Neo.core.Base
 * @singleton
 */
class HealthService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.HealthService'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.HealthService',
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
     * Promise of the currently executing health check.
     * Used for request deduplication to prevent "thundering herd" of health checks.
     * @member {Promise<Object>|null} #healthCheckPromise
     * @private
     */
    #healthCheckPromise = null;

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
     * Shared runtime freshness tracker.
     * @member {RuntimeFreshnessTracker} #runtimeFreshnessTracker
     * @private
     */
    #runtimeFreshnessTracker = runtimeFreshnessTracker;

    /**
     * Boot-time runtime identity captured before long-lived MCP clients can go stale.
     * @member {Object} bootRuntimeIdentity
     */
    get bootRuntimeIdentity() {
        return this.#runtimeFreshnessTracker.bootRuntimeIdentity;
    }

    set bootRuntimeIdentity(value) {
        this.#runtimeFreshnessTracker.bootRuntimeIdentity = value || {};
    }

    /**
     * Boot-time runtime identity read errors.
     * @member {String[]} bootRuntimeFreshnessErrors
     */
    get bootRuntimeFreshnessErrors() {
        return this.#runtimeFreshnessTracker.bootRuntimeFreshnessErrors;
    }

    set bootRuntimeFreshnessErrors(value) {
        this.#runtimeFreshnessTracker.bootRuntimeFreshnessErrors = Array.isArray(value) ? value : [];
    }

    /**
     * Optional unit-test seam for injecting boot/current runtime identity reads.
     * @member {Function|null} runtimeFreshnessReader
     */
    runtimeFreshnessReader = null;

    /**
     * ISO timestamp captured when this server module was loaded.
     * @member {String} runtimeStartedAt
     */
    get runtimeStartedAt() {
        return this.#runtimeFreshnessTracker.startedAt;
    }

    set runtimeStartedAt(value) {
        this.#runtimeFreshnessTracker.startedAt = value;
    }

    /**
     * Duration (in milliseconds) for which runtime freshness remains cached.
     * @member {Number} runtimeFreshnessCacheDuration
     */
    runtimeFreshnessCacheDuration = 30 * 1000;

    /**
     * Checks if ChromaDB is running and accessible.
     *
     * Intent: This is the most critical check. Without ChromaDB running, no knowledge base
     * operations are possible. We use the heartbeat endpoint to verify connectivity.
     *
     * @returns {Promise<Object>} {running: boolean, error?: string}
     * @private
     */
    async #checkChromaConnection() {
        try {
            // Resolves Chroma on demand. A healthcheck is a legitimate first toucher, and this is
            // where an absent Brain-tier package surfaces as a named failure rather than as a
            // TypeError naming the wrong thing.
            await ChromaManager.ensureChromaReady();

            await ChromaManager.client.heartbeat();
            return {running: true};
        } catch (e) {
            return {
                running: false,
                error  : `ChromaDB is not accessible at ${aiConfig.host}:${aiConfig.port}. Please start ChromaDB externally or update the configured host/port.`
            };
        }
    }

    /**
     * Counts the canonical KB collection, invalidating a stale resolved handle once
     * when Chroma reports the handle no longer points at a live collection.
     *
     * @returns {Promise<Object>} {name, exists, count, error?}
     * @private
     */
    async #checkKnowledgeBaseCollection() {
        const base = {
            name  : aiConfig.collectionName,
            exists: false,
            count : 0
        };

        let collection;

        try {
            collection = await ChromaManager.getKnowledgeBaseCollection();
        } catch (error) {
            return {
                ...base,
                error: error.message
            };
        }

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                return {
                    ...base,
                    exists: true,
                    count : await collection.count()
                };
            } catch (error) {
                if (attempt > 0 || !ChromaManager.isCollectionNotFoundError(error)) {
                    return {
                        ...base,
                        error: error.message
                    };
                }

                ChromaManager.invalidateKnowledgeBaseCollectionCache();

                try {
                    collection = await ChromaManager.getKnowledgeBaseCollection();
                } catch (retryError) {
                    return {
                        ...base,
                        error: retryError.message
                    };
                }
            }
        }

        return base;
    }

    /**
     * Verifies that the required collections exist and are accessible.
     *
     * Intent: Even if ChromaDB is running, we need to ensure our specific collection
     * is properly initialized. This check confirms the knowledge base collection
     * is available for operations.
     *
     * @returns {Promise<Object>} {knowledgeBase: Object|null, error?: string}
     * @private
     */
    async #checkCollections() {
        try {
            const knowledgeBase = await this.#checkKnowledgeBaseCollection(),
                  result        = {knowledgeBase};

            if (knowledgeBase.error) {
                result.error = `Failed to access collections: ${knowledgeBase.error}`;
            }

            return result;
        } catch (e) {
            return {
                knowledgeBase: {
                    name  : aiConfig.collectionName,
                    exists: false,
                    count : 0,
                    error : e.message
                },
                error: `Failed to access collections: ${e.message}`
            };
        }
    }

    /**
     * Pure predicate: is the configured embedding provider ready to serve KB retrieval?
     *
     * Knowledge Base `ask`/`query` must embed the query before retrieval, so a usable
     * embedding provider is a hard health requirement (answer synthesis itself is
     * degradeable — see `SearchService.ask()`). Local providers (`openAiCompatible`/
     * `ollama`) and the `mock` test provider serve embeddings from their own host /
     * in-process; only the remote `gemini` provider needs a `GEMINI_API_KEY`.
     *
     * @param {String}  embeddingProvider Resolved `aiConfig.embeddingProvider`.
     * @param {Boolean} hasGeminiKey      Whether `GEMINI_API_KEY` is set.
     * @returns {Boolean}
     */
    isEmbeddingProviderReady(embeddingProvider, hasGeminiKey) {
        return embeddingProvider !== 'gemini' || hasGeminiKey;
    }

    /**
     * Checks whether the resolved embedding provider is ready (provider-aware).
     *
     * Reads the resolved `aiConfig.embeddingProvider` leaf (the reactive Provider SSOT) rather
     * than probing raw env vars, so it honors the provider the deployment actually configured —
     * including the local-by-default `openAiCompatible` — instead of falling through to a
     * `GEMINI_API_KEY` check whenever the host env vars happen to be unset.
     *
     * @returns {boolean}
     * @private
     */
    #checkEmbeddingProviderReady() {
        return this.isEmbeddingProviderReady(aiConfig.embeddingProvider, !!process.env.GEMINI_API_KEY);
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
     * 3. Embedding provider readiness (needed for retrieval; only `gemini` needs a key)
     *
     * Status levels:
     * - healthy: ChromaDB connected, KB corpus accessible, embedding provider ready
     * - degraded: ChromaDB connected, but KB corpus or embedding provider unavailable
     * - unhealthy: ChromaDB not reachable
     *
     * @returns {Promise<object>} A comprehensive health status payload
     * @private
     */
    async #performHealthCheck() {
        const payload = {
            status   : 'healthy',
            timestamp: new Date().toISOString(),
            database : {
                process   : DatabaseLifecycleService.getDatabaseStatus(),
                connection: {
                    connected  : false,
                    collections: null
                }
            },
            features: {
                embedding: false
            },
            details         : [],
            version         : process.env.npm_package_version || '1.0.0',
            uptime          : process.uptime(),
            runtimeFreshness: await this.resolveRuntimeFreshness()
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

        if (collectionsCheck.error || !collectionsCheck.knowledgeBase?.exists) {
            payload.status = 'degraded';
            payload.details.push(collectionsCheck.error || 'The required knowledge base collection is missing');
        }

        // Step 3: Check embedding provider readiness (provider-aware; only 'gemini' needs a key)
        const embeddingReady = this.#checkEmbeddingProviderReady();
        payload.features.embedding = embeddingReady;

        if (!embeddingReady) {
            payload.status = 'degraded';
            payload.details.push(`Embedding provider '${aiConfig.embeddingProvider}' requires GEMINI_API_KEY - retrieval unavailable`);
        }

        // If we made it here with no errors, report success
        if (payload.status === 'healthy') {
            payload.details.push('Connected to the orchestrator-managed ChromaDB instance');
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
     * (e.g., by starting ChromaDB or configuring the embedding provider). This ensures good UX -
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
                return {
                    ...this.#cachedHealth,
                    runtimeFreshness: await this.resolveRuntimeFreshness()
                };
            }
        }

        // Check for in-flight request (deduplication)
        if (this.#healthCheckPromise) {
            logger.debug('[HealthService] Joining in-flight health check...');
            return this.#healthCheckPromise;
        }

        // Cache is stale, was unhealthy, or doesn't exist - perform a fresh check
        logger.debug('[HealthService] Performing fresh health check');

        // Create the promise and store it
        this.#healthCheckPromise = this.#performHealthCheck().finally(() => {
            // Always clear the promise when done, success or fail
            this.#healthCheckPromise = null;
        });

        const health = await this.#healthCheckPromise;

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
     * Note: ChromaDB and the configured embedding provider are required for retrieval, since
     * adding/querying knowledge requires text embeddings. Only the remote 'gemini' embedding
     * provider needs a GEMINI_API_KEY; local providers (openAiCompatible/ollama) serve embeddings
     * from their own host. Database lifecycle is managed outside the MCP tool surface; degraded
     * state only permits health/introspection helpers that do not touch the vector store.
     *
     * @throws {Error} If the Knowledge Base is not fully healthy, with a detailed message
     * @returns {Promise<void>}
     */
    async ensureHealthy() {
        const health = await this.healthcheck();

        if (health.status !== 'healthy') {
            // Build a multi-line error message with all the issues detected
            const details   = health.details.join('\n  - ');
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
        this.#cachedHealth    = null;
        this.#lastCheckTime   = null;
        this.#runtimeFreshnessTracker.clearCache();
        logger.debug('[HealthService] Cache cleared, next health check will be fresh');
    }

    /**
     * Resolves the live runtime freshness diagnostic for the attached KB MCP process.
     *
     * Intent: a process can be dependency-healthy while stale relative to the checkout/config an
     * agent is inspecting. Keeping this lightweight warning in healthcheck avoids duplicate source
     * tickets when the right action is restart/reconnect.
     *
     * @returns {Promise<Object>} Runtime freshness diagnostic payload.
     */
    async resolveRuntimeFreshness() {
        return this.#runtimeFreshnessTracker.resolve({
            reader       : this.runtimeFreshnessReader,
            cacheDuration: this.runtimeFreshnessCacheDuration
        });
    }
}

export default Neo.setupClass(HealthService);
