import path            from 'path';
import net             from 'net';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const DEFAULT_DB_PATH    = process.env.NEO_AI_DB_PATH || '.neo-ai-data/sqlite/memory-core-graph.sqlite';
export const DEFAULT_DATA_DIR   = process.env.NEO_AI_ORCHESTRATOR_DIR || '.neo-ai-data/orchestrator-daemon';
export const DEFAULT_SCRIPT_DIR = path.resolve(__dirname, '../../scripts');

/**
 * @summary Probes whether a local TCP port is accepting connections.
 * @param {Object} options
 * @param {String|Number} options.port Port to probe.
 * @param {Number} [options.timeoutMs] Optional timeout in milliseconds.
 * @returns {Promise<Boolean>}
 */
function probeTcpPort({port, timeoutMs}) {
    const normalizedPort = Number(port);

    if (!Number.isFinite(normalizedPort) || normalizedPort <= 0) {
        return Promise.resolve(false);
    }

    return new Promise(resolve => {
        const socket = net.connect({host: '127.0.0.1', port: normalizedPort});
        let settled  = false;

        const finish = result => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(result);
        };

        if (Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0) {
            socket.setTimeout(Number(timeoutMs));
        }

        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error',   () => finish(false));
    });
}

/**
 * @summary Builds child-process commands for orchestrator-owned maintenance tasks.
 *
 * Pure function: receives concrete `mlxEnabled` / `mlxModel` / `mlxPort` and
 * `lmsEnabled` / `lmsModel` / `lmsPort` values from the caller; performs no env-var
 * lookups and carries no embedded MLX or LM Studio defaults. The canonical defaults
 * live in `ai/config.template.mjs` under `orchestrator.mlx` and `orchestrator.lms`;
 * `Orchestrator` exposes them via env-overrideable getters
 * (`mlxEnabled`/`mlxModel`/`mlxPort`/`lmsEnabled`/`lmsModel`/`lmsPort`) and forwards
 * the resolved values via `Orchestrator.start()`.
 *
 * The orchestrator intentionally shells out to existing manual maintenance scripts for
 * Piece C instead of reimplementing their internals. This keeps orchestration separate
 * from summarization / KB-sync business logic and gives operators the same scripts for
 * manual recovery.
 *
 * @param {Object} [options]
 * @param {String} [options.scriptDir] Script directory.
 * @param {String} [options.nodeBin] Node executable.
 * @param {String|Number} [options.chromaPort] Chroma daemon port — used for the `--port` arg and as the chroma task's `singletonPort` (the port the orchestrator reaps duplicate listeners on).
 * @param {String|Number} [options.devServerPort] Local webpack dev-server port — used for the `--port` arg, singleton detection, and TCP liveness probe.
 * @param {Number} [options.devServerLivenessTimeoutMs] TCP liveness probe timeout.
 * @param {String|Number} [options.neuralLinkBridgePort] Neural Link Bridge port — sourced from the Neural Link config provider by the orchestrator entrypoint.
 * @param {Number} [options.neuralLinkBridgeLivenessTimeoutMs] TCP liveness probe timeout.
 * @param {Boolean} [options.mlxEnabled=false] Whether to launch an orchestrator-owned mlx_lm.server.
 * @param {String} [options.mlxModel] MLX launch model: a Hugging Face repo id or local path.
 * @param {String|Number} [options.mlxPort] MLX OpenAI-compatible local inference port.
 * @param {Boolean} [options.lmsEnabled=false] Whether to launch an orchestrator-owned LM Studio CLI server.
 * @param {String} [options.lmsModel] Legacy single LM Studio model identifier.
 * @param {String[]} [options.lmsModels] LM Studio model identifiers that must be resident after spawn.
 * @param {String} [options.lmsHost] OpenAI-compatible host exposed by the LM Studio server.
 * @param {String|Number} [options.lmsPort] LM Studio OpenAI-compatible local inference port (CLI default `1234`).
 * @param {Object} [options.lmsContextLengths] Per-model `--context-length` override map keyed by model id (chat + embedding from `aiConfig.localModels.{chat,embedding}.contextLimitTokens`).
 * @param {Object} [options.providerReadiness] Provider-readiness retry / timeout config.
 * @param {Boolean} [options.graphLogCompactionVacuum] Whether scheduled GraphLog compaction also runs SQLite VACUUM.
 * @returns {Object}
 */
export function buildTaskDefinitions({
    scriptDir  = DEFAULT_SCRIPT_DIR,
    nodeBin    = process.argv[0],
    chromaPort,
    devServerPort,
    devServerLivenessTimeoutMs,
    neuralLinkBridgePort,
    neuralLinkBridgeLivenessTimeoutMs,
    mlxEnabled = false,
    mlxModel,
    mlxPort,
    lmsEnabled = false,
    lmsModel,
    lmsModels,
    lmsHost,
    lmsPort,
    lmsContextLengths,
    providerReadiness,
    graphLogCompactionVacuum
} = {}) {
    const hasDevServerPort = devServerPort !== undefined && devServerPort !== null;
    const hasNeuralLinkBridgePort = neuralLinkBridgePort !== undefined && neuralLinkBridgePort !== null;

    const tasks = {
        chroma: {
            label  : 'chroma daemon',
            command: 'chroma',
            // The --path persist dir resolves to the same dir as AiConfig.engines.chroma.dataDir
            // — the SSOT that KB/MC configs + defragChromaDB read — under the standard
            // cwd==repoRoot. Kept as a relative literal here (not SSOT-sourced) for daemon-launch
            // resilience: a stale config.mjs lacking the SSOT key would otherwise launch the daemon
            // with `--path undefined`. Keep this value in sync with engines.chroma.dataDir.
            args           : ['run', '--path', '.neo-ai-data/chroma/unified', '--port', String(chromaPort)],
            pidFileName    : 'chroma.pid',
            expectedCommand: 'chroma',
            singletonPort  : chromaPort
        },
        // `bridgeDaemon` lane id is a frozen lane-taxonomy / continuousTasks wire constant —
        // kept verbatim on the wake-daemon rename so the orchestrator keeps scheduling the lane.
        bridgeDaemon: {
            label          : 'wake daemon',
            command        : nodeBin,
            args           : [path.resolve(scriptDir, '../daemons/wake/daemon.mjs')],
            pidFileName    : 'wake-daemon.pid',
            expectedCommand: 'daemons/wake/daemon.mjs'
        },
        ...(hasDevServerPort ? {
            devServer: {
                label  : 'local dev-server',
                command: nodeBin,
                args   : [
                    path.resolve(scriptDir, '../../node_modules/webpack/bin/webpack.js'),
                    'serve',
                    '-c',
                    './buildScripts/webpack/webpack.server.config.mjs',
                    '--port',
                    String(devServerPort)
                ],
                pidFileName            : 'dev-server.pid',
                expectedCommand        : 'node_modules/webpack/bin/webpack.js',
                singletonPort          : Number(devServerPort),
                duplicateListenerPolicy: 'defer',
                livenessProbe          : () => probeTcpPort({
                    port     : devServerPort,
                    timeoutMs: devServerLivenessTimeoutMs
                })
            }
        } : {}),
        ...(hasNeuralLinkBridgePort ? {
            neuralLinkBridge: {
                label                  : 'Neural Link Bridge',
                command                : nodeBin,
                args                   : [path.resolve(scriptDir, '../mcp/server/neural-link/run-bridge.mjs')],
                pidFileName            : 'neural-link-bridge.pid',
                expectedCommand        : 'mcp/server/neural-link/run-bridge.mjs',
                env                    : {NEO_NL_PORT: String(neuralLinkBridgePort)},
                singletonPort          : Number(neuralLinkBridgePort),
                duplicateListenerPolicy: 'defer',
                livenessProbe          : () => probeTcpPort({
                    port     : neuralLinkBridgePort,
                    timeoutMs: neuralLinkBridgeLivenessTimeoutMs
                })
            }
        } : {}),
        embedDaemon: {
            label          : 'embed daemon (add_memory WAL drain)',
            command        : nodeBin,
            args           : [path.resolve(scriptDir, '../daemons/embed/daemon.mjs')],
            pidFileName    : 'embed-daemon.pid',
            expectedCommand: 'daemons/embed/daemon.mjs'
        },
        summary: {
            label          : 'session summarization',
            command        : nodeBin,
            args           : [path.join(scriptDir, 'lifecycle', 'summarize-sessions.mjs')],
            pidFileName    : 'summarization.pid',
            expectedCommand: 'summarize-sessions.mjs'
        },
        'memory-summary-backfill': {
            label          : 'memory miniSummary backfill',
            command        : nodeBin,
            args           : [path.join(scriptDir, 'lifecycle', 'backfill-memory-summaries.mjs')],
            pidFileName    : 'memory-summary-backfill.pid',
            expectedCommand: 'backfill-memory-summaries.mjs',
            // Watchdog backstop: a healthy 50-item backfill finishes in minutes. 15min bounds a
            // hang the per-call timeouts miss so one wedged child can't starve the maintenance loop.
            maxRuntimeMs   : 900000
        },
        kbSync: {
            label          : 'knowledge base sync',
            command        : nodeBin,
            args           : [path.join(scriptDir, 'maintenance', 'syncKnowledgeBase.mjs')],
            pidFileName    : 'kb-sync.pid',
            expectedCommand: 'syncKnowledgeBase.mjs'
        },
        backup: {
            label          : 'agent OS backup',
            command        : nodeBin,
            args           : [path.join(scriptDir, 'maintenance', 'backup.mjs')],
            pidFileName    : 'backup.pid',
            expectedCommand: 'backup.mjs'
        },
        'graphlog-compaction': {
            label  : 'GraphLog compaction',
            command: nodeBin,
            args   : [
                path.join(scriptDir, 'maintenance', 'compactGraphLog.mjs'),
                '--apply',
                ...(graphLogCompactionVacuum ? ['--vacuum'] : [])
            ],
            pidFileName    : 'graphlog-compaction.pid',
            expectedCommand: 'compactGraphLog.mjs'
        },
        // One-shot KB defrag spawned by the chroma max-runtime recycle once the
        // freshly-restarted daemon is connection-ready. Unified-store-safe (rebuilds the KB
        // collection, preserves Memory Core segment dirs). NOT a continuousTask.
        chromaDefrag: {
            label          : 'chroma defrag (knowledge-base)',
            command        : nodeBin,
            args           : [path.join(scriptDir, 'maintenance', 'defragChromaDB.mjs'), '--target', 'knowledge-base'],
            pidFileName    : 'chroma-defrag.pid',
            expectedCommand: 'defragChromaDB.mjs'
        },
        'primary-dev-sync': {
            label          : 'primary checkout dev sync',
            pidFileName    : 'primary-dev-sync.pid',
            expectedCommand: 'PrimaryRepoSyncService',
            serviceTask    : true
        },
        'tenant-repo-sync': {
            label          : 'tenant repo sync (cloud)',
            pidFileName    : 'tenant-repo-sync.pid',
            expectedCommand: 'TenantRepoSyncService',
            serviceTask    : true
        },
        dream: {
            label          : 'REM sleep graph extraction',
            pidFileName    : 'dream.pid',
            expectedCommand: 'DreamService',
            serviceTask    : true
        },
        'golden-path': {
            label          : 'golden path synthesis',
            pidFileName    : 'golden-path.pid',
            expectedCommand: 'GoldenPathSynthesizer',
            serviceTask    : true
        },
        'swarm-heartbeat': {
            label          : 'swarm heartbeat pulse',
            pidFileName    : 'swarm-heartbeat.pid',
            expectedCommand: 'SwarmHeartbeatService',
            serviceTask    : true
        },
        // In-process read-only health-check (no child process is ever spawned): the embed-drain
        // liveness watchdog runs entirely inside the orchestrator's scheduling pipeline. The entry
        // exists only so the task gets a persisted state envelope (cadence `lastRunAt` + the
        // one-shot stall-alarm latch). `pidFileName`/`expectedCommand` are inert — no PID file is
        // ever written, so process recovery/supervision short-circuits on the missing file.
        'embed-drain-liveness-watchdog': {
            label          : 'embed-drain liveness watchdog',
            pidFileName    : 'embed-drain-liveness-watchdog.pid',
            expectedCommand: 'EmbedDrainLivenessWatchdog',
            serviceTask    : true
        }
    };

    if (mlxEnabled) {
        tasks.mlx = {
            label          : 'mlx inference',
            command        : path.resolve(scriptDir, '../mcp/server/memory-core/.venv/bin/python'),
            args           : ['-m', 'mlx_lm.server', '--model', mlxModel, '--port', String(mlxPort)],
            pidFileName    : 'mlx.pid',
            expectedCommand: 'mlx_lm.server'
        };
    }

    if (lmsEnabled) {
        const requiredModels = Array.isArray(lmsModels)
            ? [...new Set(lmsModels.filter(Boolean))]
            : [lmsModel].filter(Boolean);

        tasks.lms = {
            label          : 'lms server (LM Studio CLI)',
            command        : 'lms',
            args           : ['server', 'start', '--port', String(lmsPort)],
            pidFileName    : 'lms.pid',
            expectedCommand: 'lms server',
            requiredModels,
            // `lms server start` is fire-and-exit: it wakes the LM Studio service and returns, so
            // the launched server never matches `expectedCommand` for the supervisor's
            // process-liveness check (`!state.running` stays permanently true). Liveness is the
            // HTTP endpoint instead — the supervisor gates the restart on this probe so a healthy
            // server is a silent no-op rather than a re-spawn loop.
            livenessProbe  : async () => {
                const {fetchOpenAiCompatibleModelIds} = await import('../../services/graph/providerReadinessHelper.mjs');

                try {
                    await fetchOpenAiCompatibleModelIds({host: lmsHost, timeoutMs: providerReadiness?.timeoutMs ?? 2000});
                    return true;
                } catch {
                    return false;
                }
            },
            postSpawn      : async () => {
                const {ensureLmsModelsLoaded} = await import('../../services/graph/providerReadinessHelper.mjs');

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
                    host          : lmsHost,
                    models        : requiredModels,
                    contextLengths: lmsContextLengths,
                    allowPartial  : true,
                    attempts      : providerReadiness?.attempts,
                    delayMs       : providerReadiness?.delayMs,
                    timeoutMs     : providerReadiness?.timeoutMs
                });
            }
        };
    }

    return tasks;
}
