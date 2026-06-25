import { spawn }                       from 'child_process';
import aiConfig                        from '../../../mcp/server/memory-core/config.mjs';
import logger                          from '../../../mcp/server/memory-core/logger.mjs';
import Base                            from '../../../../src/core/Base.mjs';
import path                            from 'path';
import fs                              from 'fs';
import { fileURLToPath }               from 'url';
import {fetchOpenAiCompatibleModelIds} from '../../graph/providerReadinessHelper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const memCoreDir = path.resolve(__dirname, '../../../mcp/server/memory-core');

/**
 * @summary Orchestrates the daemon lifecycle completely dedicated to local LLM Inference Backends (Ollama/MLX).
 *
 * Following the architectural decoupling of the monolithic database service, this class isolates the cross-platform
 * auto-startup resolution path for underlying machine learning daemons required by the Memory Core embeddings.
 * It natively identifies Apple Silicon contexts (`/opt/homebrew`), Intel architectures (`/usr/local/`), and
 * Microsoft Windows fallback locations (`%LOCALAPPDATA%`).
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
     * @summary Probes the active local LLM inference background port, implicitly verifying backend readiness.
     * @returns {Promise<Boolean>}
     */
    async isInferenceRunning() {
        try {
            await fetchOpenAiCompatibleModelIds({
                host      : aiConfig.openAiCompatible.host,
                timeoutMs : aiConfig.orchestrator.providerReadiness.timeoutMs,
                freshness : 'routine',
                cacheTtlMs: aiConfig.orchestrator.providerReadiness.routineCacheTtlMs
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * @summary Spawns the required standalone LLM inference process by mapping seamlessly to the correct binary paths.
     * @returns {Promise<Object>}
     */
    async startInferenceServer() {
        try {
            if (!aiConfig.openAiCompatible.host.includes('127.0.0.1') && !aiConfig.openAiCompatible.host.includes('localhost')) {
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
