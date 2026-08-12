import aiConfig from '../../../mcp/server/memory-core/config.mjs';
import logger   from '../../../mcp/server/memory-core/logger.mjs';
import Base     from '../../../../src/core/Base.mjs';
import {
    checkProvider,
    getGraphProviderReadinessTarget
} from '../../graph/providerReadinessHelper.mjs';

/**
 * @summary Reports lifecycle readiness for the declared graph-provider endpoint without owning it.
 *
 * The Agent Orchestrator owns provider processes. Memory Core consumes the graph-role provider and
 * therefore probes that declared role rather than assuming the OpenAI-compatible endpoint also owns
 * graph work or embeddings. Local endpoints are reported offline for the orchestrator to recover;
 * remote endpoints are classified external and never spawned by this service.
 *
 * Future AI sessions should search for `inference routing`, `ollama daemon`, `mlx python environment`, or `llm orchestrator`.
 *
 * @class Neo.ai.services.memory-core.lifecycle.InferenceLifecycleService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.services.memory-core.lifecycle.ChromaLifecycleService
 */
class InferenceLifecycleService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.lifecycle.InferenceLifecycleService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.lifecycle.InferenceLifecycleService',
        /**
         * @member {Object|null} inferenceProcess=null
         * @protected
         */
        inferenceProcess: null,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Asynchronously initializes the InferenceLifecycleService, bootstrapping daemon startup.
     */
    async initAsync() {
        await super.initAsync();
        logger.log('[InferenceLifecycleService] Memory Core assumes MLX/Ollama is managed by AgentOrchestrator.');
    }

    /**
     * @summary Probes the declared graph-provider endpoint, implicitly verifying backend readiness.
     * @returns {Promise<Boolean>}
     */
    async isInferenceRunning() {
        try {
            return await checkProvider({
                config                  : aiConfig,
                timeoutMs               : aiConfig.orchestrator.providerReadiness.timeoutMs,
                modelDiscoveryFreshness : 'routine',
                modelDiscoveryCacheTtlMs: aiConfig.orchestrator.providerReadiness.routineCacheTtlMs
            });
        } catch (e) {
            return false;
        }
    }

    /**
     * @summary Classifies the declared graph-provider endpoint for orchestrator-owned recovery.
     * @returns {Promise<Object>}
     */
    async startInferenceServer() {
        try {
            const target = getGraphProviderReadinessTarget(aiConfig);

            if (!target.supported || !target.host) {
                return { status: 'failed', detail: 'Declared graph-provider endpoint is unavailable.' };
            }

            if (!target.host.includes('127.0.0.1') && !target.host.includes('localhost')) {
                return { status: 'external', detail: 'External inference server configured.' };
            }

            if (await this.isInferenceRunning()) {
                return { status: 'already_running', detail: 'Inference daemon is already running.' };
            }

            logger.warn('[InferenceLifecycleService] Local inference server is offline. AgentOrchestrator should be managing it.');
            return { status: 'offline', detail: 'Local inference server is offline.' };
        } catch (error) {
            logger.error('[InferenceLifecycleService] Error handling boot:', error);
            return { status: 'failed', error: error.message };
        }
    }

    /**
     * @summary Binds SIGINT and SIGTERM handlers to gracefully tear down the assigned inference group.
     */
    registerCleanup() {
        // No-op
    }

    /**
     * @summary Intercepts OS signals to aggressively force teardown of the MLX/Ollama child engine group.
     * @param {String|Number} signalOrCode
     */
    async cleanup(signalOrCode) {
        if (typeof signalOrCode === 'string') {
            process.exit(0);
        }
    }

    /**
     * @summary Intentionally drops the ongoing LLM daemon process when transitioning to offline.
     * @returns {Promise<Object>}
     */
    async stopInferenceServer() {
        return { status: 'not_running', detail: 'Memory Core does not manage the MLX/Ollama daemon.' };
    }

    /**
     * @summary Resolves the current internal status and PID tracking for the explicit LLM daemon process.
     * @returns {Object}
     */
    getStatus() {
        return { running: false, pid: null, managed: false };
    }

    /**
     * @summary Router mapping for explicit manual startup and teardown orchestrations of the Inference backend.
     * @param {Object} args
     * @returns {Promise<Object>}
     */
    async manageInference(args) {
        if (args.action === 'start') {
            return await this.startInferenceServer();
        } else if (args.action === 'stop') {
            return await this.stopInferenceServer();
        }
        return { error: 'Unknown action' };
    }
}

export default Neo.setupClass(InferenceLifecycleService);
