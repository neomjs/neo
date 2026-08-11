import path             from 'path';
import AiConfig         from '../../../config.mjs';
import neuralLinkConfig from '../../../mcp/server/neural-link/config.mjs';
import {
    buildLmsPreloadConfig,
    buildOllamaReadinessConfig
} from '../../../services/graph/providerReadinessHelper.mjs';
import {
    buildOllamaServeEnv,
    buildTaskDefinitions,
    getMaxOllamaContextLength,
    resolveOllamaHostPort
} from '../taskDefinitions.mjs';
import {attachTaskAuthority} from '../taskAuthority.mjs';

/**
 * @summary Builds the orchestrator's config-backed child-process task table.
 *
 * `taskDefinitions.mjs` remains the pure descriptor/default layer. This service
 * is the daemon-side use site for config-backed task composition, so it reads
 * resolved `AiConfig` leaves directly instead of threading broad value objects
 * through `Orchestrator`.
 *
 * @param {Object} options
 * @param {String} options.scriptDir Script directory.
 * @param {String} options.nodeBin Node executable.
 * @param {Number} options.neuralLinkBridgeLivenessTimeoutMs Neural Link Bridge liveness timeout.
 * @returns {Object}
 */
export function buildConfiguredTaskDefinitions({
    scriptDir,
    nodeBin,
    neuralLinkBridgeLivenessTimeoutMs
}) {
    const tasks = buildTaskDefinitions({
        scriptDir,
        nodeBin,
        chromaDataDir             : AiConfig.engines.chroma.dataDir,
        chromaHost                : AiConfig.engines.chroma.host,
        chromaPort                : AiConfig.engines.chroma.port,
        devServerPort             : AiConfig.orchestrator.devServer.port,
        devServerLivenessTimeoutMs: AiConfig.orchestrator.devServer.livenessProbeTimeoutMs,
        neuralLinkBridgePort      : neuralLinkConfig.port,
        neuralLinkBridgeLivenessTimeoutMs
    });

    applyConfiguredGraphLogCompaction(tasks);
    applyConfiguredMlxTask(tasks, {scriptDir});
    applyConfiguredLmsTask(tasks);
    applyConfiguredOllamaTask(tasks);

    return attachTaskAuthority(tasks);
}

/**
 * @summary Applies the graph-log compaction flags owned by AiConfig.
 * @param {Object} tasks Task table.
 * @returns {void}
 */
function applyConfiguredGraphLogCompaction(tasks) {
    if (AiConfig.orchestrator.graphLogCompaction.vacuum) {
        tasks['graphlog-compaction'].args.push('--vacuum');
    }
}

/**
 * @summary Adds the orchestrator-owned MLX server task when enabled.
 * @param {Object} tasks Task table.
 * @param {Object} options
 * @param {String} options.scriptDir Script directory.
 * @returns {void}
 */
function applyConfiguredMlxTask(tasks, {scriptDir}) {
    if (!AiConfig.orchestrator.mlx.enabled) {
        return;
    }

    tasks.mlx = {
        label  : 'mlx inference',
        command: path.resolve(scriptDir, '../mcp/server/memory-core/.venv/bin/python'),
        args   : [
            '-m',
            'mlx_lm.server',
            '--model',
            AiConfig.orchestrator.mlx.model,
            '--port',
            String(AiConfig.orchestrator.mlx.port)
        ],
        pidFileName    : 'mlx.pid',
        expectedCommand: 'mlx_lm.server'
    };
}

/**
 * @summary Adds the orchestrator-owned LM Studio server task when enabled.
 * @param {Object} tasks Task table.
 * @returns {void}
 */
function applyConfiguredLmsTask(tasks) {
    if (!AiConfig.orchestrator.lms.enabled) {
        return;
    }

    const preloadConfig  = buildLmsPreloadConfig(AiConfig),
          requiredModels = Array.isArray(preloadConfig.models)
              ? [...new Set(preloadConfig.models.filter(Boolean))]
              : [AiConfig.orchestrator.lms.model].filter(Boolean);

    tasks.lms = {
        label          : 'lms server (LM Studio CLI)',
        command        : 'lms',
        args           : ['server', 'start', '--port', String(AiConfig.orchestrator.lms.port)],
        pidFileName    : 'lms.pid',
        expectedCommand: 'lms server',
        requiredModels,
        // `lms server start` is fire-and-exit: it wakes the LM Studio service and returns, so
        // the launched server never matches `expectedCommand` for the supervisor's
        // process-liveness check (`!state.running` stays permanently true). Liveness is the
        // HTTP endpoint instead — the supervisor gates the restart on this probe so a healthy
        // server is a silent no-op rather than a re-spawn loop.
        livenessProbe  : async () => {
            const {fetchOpenAiCompatibleModelIds} = await import('../../../services/graph/providerReadinessHelper.mjs');

            try {
                await fetchOpenAiCompatibleModelIds({
                    host      : AiConfig.openAiCompatible.host,
                    timeoutMs : AiConfig.orchestrator.providerReadiness.timeoutMs,
                    freshness : 'routine',
                    cacheTtlMs: AiConfig.orchestrator.providerReadiness.routineCacheTtlMs
                });
                return true;
            } catch {
                return false;
            }
        },
        postSpawn      : async () => {
            const {ensureLmsModelsLoaded} = await import('../../../services/graph/providerReadinessHelper.mjs');

            if (requiredModels.length === 0) {
                return {
                    ready          : true,
                    loadedModels   : [],
                    requiredModels,
                    availableModels: [],
                    attempts       : 0,
                    skipped        : true,
                    reason         : 'no-openai-compatible-local-roles'
                };
            }

            return ensureLmsModelsLoaded({
                host                    : AiConfig.openAiCompatible.host,
                models                  : requiredModels,
                contextLengths          : preloadConfig.contextLengths,
                parallels               : preloadConfig.parallels,
                allowPartial            : true,
                attempts                : AiConfig.orchestrator.providerReadiness.attempts,
                delayMs                 : AiConfig.orchestrator.providerReadiness.delayMs,
                timeoutMs               : AiConfig.orchestrator.providerReadiness.timeoutMs,
                modelDiscoveryFreshness : 'routine',
                modelDiscoveryCacheTtlMs: AiConfig.orchestrator.providerReadiness.routineCacheTtlMs
            });
        }
    };
}

/**
 * @summary Adds the orchestrator-owned native Ollama server task when enabled.
 * @param {Object} tasks Task table.
 * @returns {void}
 */
function applyConfiguredOllamaTask(tasks) {
    if (!AiConfig.orchestrator.ollama.enabled) {
        return;
    }

    const readinessConfig = buildOllamaReadinessConfig(AiConfig),
          roles           = Array.isArray(readinessConfig.roles)
              ? readinessConfig.roles.filter(role => role.model)
              : [],
          requiredModels  = [...new Set(roles.map(role => role.model))];

    if (requiredModels.length === 0) {
        return;
    }

    // Persisted across probe calls (the closure outlives this function): consecutive sustained
    // inference-canary failures before the stuck-runner recycle fires.
    let consecutiveStuckFailures = 0;

    tasks.ollama = {
        label                  : 'ollama server',
        command                : 'ollama',
        args                   : ['serve'],
        pidFileName            : 'ollama.pid',
        expectedCommand        : 'ollama serve',
        requiredModels,
        singletonPort          : resolveOllamaHostPort(readinessConfig.host),
        duplicateListenerPolicy: 'defer',
        env                    : buildOllamaServeEnv({
            host                 : readinessConfig.host,
            keepAlive            : readinessConfig.keepAlive,
            contextLength        : getMaxOllamaContextLength(roles),
            requireParallelModels: readinessConfig.requireParallelModels
        }),
        livenessProbe          : async () => {
            const {ensureOllamaModelsReady} = await import('../../../services/graph/providerReadinessHelper.mjs');

            try {
                const result = await ensureOllamaModelsReady({
                    host                 : readinessConfig.host,
                    roles,
                    keepAlive            : readinessConfig.keepAlive,
                    requireParallelModels: readinessConfig.requireParallelModels,
                    allowPartial         : true,
                    attempts             : AiConfig.orchestrator.providerReadiness.attempts,
                    delayMs              : AiConfig.orchestrator.providerReadiness.delayMs,
                    timeoutMs            : AiConfig.orchestrator.providerReadiness.timeoutMs
                });

                if (
                    result.error &&
                    result.availableModels?.length === 0 &&
                    result.attemptedModels?.length === 0
                ) {
                    return false;
                }

                return true;
            } catch {
                return false;
            }
        },
        healthProbe            : async () => {
            // Residency probes are not liveness. A runner can answer `/api/tags` while one
            // pathological inference grinds at ~100%×N-cores and serves nothing, because
            // OLLAMA_NUM_PARALLEL=1 queues everything behind it. Only a real inference canary
            // distinguishes stuck from busy, and without one a stranded runner has no path back:
            // it burns its full CPU allocation forever with no user work in flight.
            //
            // The canary is safe to time out now because its abort closes the connection rather
            // than returning a pooled socket, so the provider observes a peer disconnect and ends
            // the work instead of orphaning it. That was the objection that retired the previous
            // attempt, and it is answered at the transport rather than by removing detection.
            //
            // A single failure stays HEALTHY — a legitimately-long request must never be killed.
            // Only `consecutiveFailures` sustained failures recycle, and the supervisor's restart
            // cooldown bounds the cadence.
            const stuckCfg  = AiConfig.orchestrator.providerReadiness.stuckRunner,
                  chatModel = roles.find(role => role.role === 'chat')?.model;

            if (!stuckCfg.enabled || !chatModel) {
                return true;
            }

            const {classifyStuckRunner, probeOllamaServing} = await import('../../../services/graph/ollamaStuckRunnerLiveness.mjs');

            const served = await probeOllamaServing({
                host     : readinessConfig.host,
                model    : chatModel,
                timeoutMs: stuckCfg.canaryTimeoutMs
            });

            const verdict = classifyStuckRunner({
                served,
                consecutiveFailures: consecutiveStuckFailures,
                threshold          : stuckCfg.consecutiveFailures
            });

            consecutiveStuckFailures = verdict.consecutiveFailures;

            return verdict.alive;
        },
        postSpawn              : async () => {
            const {ensureOllamaModelsReady} = await import('../../../services/graph/providerReadinessHelper.mjs');

            return ensureOllamaModelsReady({
                host                 : readinessConfig.host,
                roles,
                keepAlive            : readinessConfig.keepAlive,
                requireParallelModels: readinessConfig.requireParallelModels,
                allowPartial         : true,
                attempts             : AiConfig.orchestrator.providerReadiness.attempts,
                delayMs              : AiConfig.orchestrator.providerReadiness.delayMs,
                timeoutMs            : AiConfig.orchestrator.providerReadiness.timeoutMs
            });
        }
    };
}
