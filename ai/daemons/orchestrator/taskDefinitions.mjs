import path                  from 'path';
import net                   from 'net';
import {fileURLToPath}       from 'url';
import {attachTaskAuthority} from './taskAuthority.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * Default maintenance-script directory, resolved relative to this module.
 *
 * The orchestrator's db path + runtime-state dir carry NO re-export here: consumers read the
 * `AiConfig.orchestrator.dbPath` / `AiConfig.orchestrator.dataDir` leaves inline at each use
 * site — exporting a resolved leaf freezes it at module load and hands consumers a
 * config-shaped constant, both forbidden by the config-is-SSOT contract.
 * @type {String}
 */
export const DEFAULT_SCRIPT_DIR = path.resolve(__dirname, '../../scripts');

const DEFAULT_CHROMA_HEALTH_ENDPOINT          = '/api/v2/heartbeat';
const DEFAULT_CHROMA_HEALTH_FAILURE_THRESHOLD = 3;
const DEFAULT_CHROMA_HEALTH_STARTUP_GRACE_MS  = 60000;
const DEFAULT_CHROMA_HEALTH_TIMEOUT_MS        = 5000;

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
        const socket  = net.connect({host: '127.0.0.1', port: normalizedPort});
        let   settled = false;

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
 * @summary Builds a Chroma HTTP health URL from the configured host/port.
 *
 * Chroma can bind IPv6-only in local development while the config host stays `localhost`.
 * Preserve the configured host instead of forcing `127.0.0.1`, and bracket literal IPv6
 * hosts so `fetch` receives a valid URL.
 * @param {Object} options
 * @param {String} [options.host='localhost'] Configured Chroma host.
 * @param {String|Number} options.port Configured Chroma port.
 * @param {String} [options.endpoint='/api/v2/heartbeat'] Chroma health endpoint.
 * @returns {String|null}
 */
export function buildChromaHealthUrl({
    host     = 'localhost',
    port,
    endpoint = DEFAULT_CHROMA_HEALTH_ENDPOINT
} = {}) {
    const normalizedPort = Number(port);

    if (!Number.isFinite(normalizedPort) || normalizedPort <= 0) {
        return null;
    }

    const rawHost = String(host || 'localhost').trim();

    if (!rawHost) {
        return null;
    }

    try {
        const hasScheme      = rawHost.includes('://'),
              colonCount     = rawHost.split(':').length - 1,
              isBareIpv6Host = colonCount > 1 && !rawHost.startsWith('['),
              normalizedHost = isBareIpv6Host ? `[${rawHost}]` : rawHost,
              url            = hasScheme ? new URL(rawHost) : new URL(`http://${normalizedHost}`);

        url.port     = String(normalizedPort);
        url.pathname = endpoint;
        url.search   = '';
        url.hash     = '';

        return url.toString();
    } catch {
        return null;
    }
}

/**
 * @summary Probes Chroma's HTTP API, not just PID or TCP liveness.
 * @param {Object} options
 * @param {String} [options.host='localhost'] Configured Chroma host.
 * @param {String|Number} options.port Configured Chroma port.
 * @param {Number} [options.timeoutMs=5000] Request timeout in milliseconds.
 * @param {String} [options.endpoint='/api/v2/heartbeat'] Chroma health endpoint.
 * @param {Function} [options.fetchFn=globalThis.fetch] Fetch implementation seam.
 * @returns {Promise<Boolean>}
 */
export async function probeChromaHttpHealth({
    host,
    port,
    timeoutMs = DEFAULT_CHROMA_HEALTH_TIMEOUT_MS,
    endpoint,
    fetchFn = globalThis.fetch
} = {}) {
    const url = buildChromaHealthUrl({host, port, endpoint});

    if (!url || typeof fetchFn !== 'function') {
        return false;
    }

    const controller = new AbortController(),
          timeout    = Number(timeoutMs);
    let timeoutId = null;

    if (Number.isFinite(timeout) && timeout > 0) {
        timeoutId = setTimeout(() => controller.abort(), timeout);
        timeoutId.unref?.();
    }

    try {
        const response = await fetchFn(url, {signal: controller.signal});
        return Boolean(response?.ok);
    } catch {
        return false;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * @summary Classifies a Chroma heartbeat result with a consecutive-failure budget.
 *
 * One failed heartbeat is advisory: a busy or freshly-started Chroma can exceed one
 * probe window while remaining recoverable. Only the configured sustained-failure
 * threshold authorizes the supervisor to recycle the process.
 *
 * @param {Object} options
 * @param {Boolean} options.healthy Latest heartbeat result.
 * @param {Number} [options.consecutiveFailures=0] Failures immediately preceding this result.
 * @param {Number} [options.threshold=3] Consecutive failures required for an unhealthy verdict.
 * @returns {{alive: Boolean, consecutiveFailures: Number, sustainedFailure: Boolean}}
 */
export function classifyChromaHealth({
    healthy,
    consecutiveFailures = 0,
    threshold           = DEFAULT_CHROMA_HEALTH_FAILURE_THRESHOLD
} = {}) {
    if (healthy) {
        return {
            alive              : true,
            consecutiveFailures: 0,
            sustainedFailure   : false
        };
    }

    const normalizedFailures = Number.isFinite(Number(consecutiveFailures))
              ? Math.max(0, Math.floor(Number(consecutiveFailures)))
              : 0,
          normalizedThreshold = Number.isFinite(Number(threshold))
              ? Math.max(1, Math.floor(Number(threshold)))
              : DEFAULT_CHROMA_HEALTH_FAILURE_THRESHOLD,
          nextFailures        = normalizedFailures + 1,
          sustainedFailure    = nextFailures >= normalizedThreshold;

    return {
        alive              : !sustainedFailure,
        consecutiveFailures: sustainedFailure ? 0 : nextFailures,
        sustainedFailure
    };
}

/**
 * @summary Converts an Ollama API host URL into the `OLLAMA_HOST` bind value.
 * @param {String} host Configured Ollama API host.
 * @returns {String|undefined}
 */
export function resolveOllamaHostEnv(host) {
    if (!host) {
        return undefined;
    }

    try {
        return new URL(host).host || undefined;
    } catch {
        return String(host).replace(/^https?:\/\//, '').replace(/\/.*$/, '') || undefined;
    }
}

/**
 * @summary Extracts a numeric port from an Ollama host config.
 * @param {String} host Configured Ollama API host.
 * @returns {Number|undefined}
 */
export function resolveOllamaHostPort(host) {
    const hostEnv = resolveOllamaHostEnv(host),
          match   = hostEnv?.match(/:(\d+)$/);

    return match ? Number(match[1]) : undefined;
}

/**
 * @summary Computes the largest requested Ollama role context window.
 * @param {Object[]} roles Native Ollama readiness roles.
 * @returns {Number|undefined}
 */
export function getMaxOllamaContextLength(roles) {
    const lengths = (Array.isArray(roles) ? roles : [])
        .map(role => Number(role?.contextLength))
        .filter(value => Number.isFinite(value) && value > 0);

    return lengths.length ? Math.max(...lengths) : undefined;
}

/**
 * @summary Builds the server environment for orchestrator-owned `ollama serve`.
 * @param {Object} options
 * @param {String} options.host Configured Ollama API host.
 * @param {String|Number} options.keepAlive Ollama keep-alive policy.
 * @param {Number} options.contextLength Largest configured local-model context.
 * @param {Number} options.requireParallelModels Minimum resident-model count.
 * @returns {Object}
 */
export function buildOllamaServeEnv({host, keepAlive, contextLength, requireParallelModels}) {
    const env     = {},
          hostEnv = resolveOllamaHostEnv(host);

    if (hostEnv) {
        env.OLLAMA_HOST = hostEnv;
    }
    if (keepAlive !== undefined && keepAlive !== null && keepAlive !== '') {
        env.OLLAMA_KEEP_ALIVE = String(keepAlive);
    }
    if (Number.isFinite(Number(contextLength)) && Number(contextLength) > 0) {
        env.OLLAMA_CONTEXT_LENGTH = String(Number(contextLength));
    }
    if (Number.isFinite(Number(requireParallelModels)) && Number(requireParallelModels) > 0) {
        env.OLLAMA_MAX_LOADED_MODELS = String(Number(requireParallelModels));
    }

    return env;
}

/**
 * @summary Builds child-process commands for orchestrator-owned maintenance tasks.
 *
 * Pure function: performs no env-var lookups and carries no embedded local-model
 * defaults. Config-backed local inference tasks are composed by `Orchestrator`, which
 * is the daemon entrypoint that may read the reactive AiConfig Provider SSOT.
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
 * @param {String} [options.chromaDataDir] Chroma persist dir for the `--path` arg — the configured builder passes the resolved `engines.chroma.dataDir` leaf so env-shifted profiles (`UNIT_TEST_MODE` isolation) move the DATA with the port; the literal default keeps direct callers launch-resilient.
 * @param {String} [options.chromaHost='localhost'] Chroma daemon host for HTTP service-health probes.
 * @param {Number} [options.chromaHealthProbeTimeoutMs=5000] Chroma HTTP health probe timeout.
 * @param {Number} [options.chromaHealthFailureThreshold=3] Consecutive failed probes required before recycle.
 * @param {Number} [options.chromaHealthStartupGraceMs=60000] Delay before probing a newly-started Chroma.
 * @param {Function} [options.chromaHealthFetchFn] Optional fetch implementation seam for tests.
 * @param {String|Number} [options.devServerPort] Local webpack dev-server port — used for the `--port` arg, singleton detection, and TCP liveness probe.
 * @param {Number} [options.devServerLivenessTimeoutMs] TCP liveness probe timeout.
 * @param {String|Number} [options.neuralLinkBridgePort] Neural Link Bridge port — sourced from the Neural Link config provider by the orchestrator entrypoint.
 * @param {Number} [options.neuralLinkBridgeLivenessTimeoutMs] TCP liveness probe timeout.
 * @returns {Object}
 */
export function buildTaskDefinitions({
    scriptDir  = DEFAULT_SCRIPT_DIR,
    nodeBin    = process.argv[0],
    chromaDataDir = '.neo-ai-data/chroma/unified',
    chromaHost    = 'localhost',
    chromaPort,
    chromaHealthProbeTimeoutMs    = DEFAULT_CHROMA_HEALTH_TIMEOUT_MS,
    chromaHealthFailureThreshold  = DEFAULT_CHROMA_HEALTH_FAILURE_THRESHOLD,
    chromaHealthStartupGraceMs    = DEFAULT_CHROMA_HEALTH_STARTUP_GRACE_MS,
    chromaHealthFetchFn,
    devServerPort,
    devServerLivenessTimeoutMs,
    neuralLinkBridgePort,
    neuralLinkBridgeLivenessTimeoutMs
} = {}) {
    const hasDevServerPort                = devServerPort !== undefined && devServerPort !== null;
    const hasNeuralLinkBridgePort         = neuralLinkBridgePort !== undefined && neuralLinkBridgePort !== null;
    let   consecutiveChromaHealthFailures = 0;

    const tasks = {
        chroma: {
            label  : 'chroma daemon',
            command: 'chroma',
            // The --path persist dir is the resolved engines.chroma.dataDir leaf when built through
            // the configured builder (the SSOT that KB/MC configs + defragChromaDB read) — an
            // env-shifted profile MUST move the data with the port, or a test-port launch serves the
            // production persist dir (empirically observed: a second server on the live store). The
            // parameter default keeps direct callers launch-resilient against a stale config.mjs.
            args                : ['run', '--path', chromaDataDir, '--port', String(chromaPort)],
            pidFileName         : 'chroma.pid',
            expectedCommand     : 'chroma',
            singletonPort       : chromaPort,
            healthStartupGraceMs: chromaHealthStartupGraceMs,
            healthProbe         : async () => {
                const healthy = await probeChromaHttpHealth({
                    host     : chromaHost,
                    port     : chromaPort,
                    timeoutMs: chromaHealthProbeTimeoutMs,
                    fetchFn  : chromaHealthFetchFn
                });
                const verdict = classifyChromaHealth({
                    healthy,
                    consecutiveFailures: consecutiveChromaHealthFailures,
                    threshold          : chromaHealthFailureThreshold
                });

                consecutiveChromaHealthFailures = verdict.consecutiveFailures;

                return verdict.alive;
            }
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
        messageDaemon: {
            label          : 'message daemon (A2A message WAL drain)',
            command        : nodeBin,
            args           : [path.resolve(scriptDir, '../daemons/message/daemon.mjs')],
            pidFileName    : 'message-daemon.pid',
            expectedCommand: 'daemons/message/daemon.mjs'
        },
        summary: {
            label          : 'session summarization',
            command        : nodeBin,
            args           : [path.join(scriptDir, 'lifecycle', 'summarize-sessions.mjs')],
            pidFileName    : 'summarization.pid',
            expectedCommand: 'summarize-sessions.mjs'
        },
        'memory-summary-backfill': {
            label            : 'memory miniSummary backfill',
            command          : nodeBin,
            args             : [path.join(scriptDir, 'lifecycle', 'backfill-memory-summaries.mjs')],
            pidFileName      : 'memory-summary-backfill.pid',
            expectedCommand  : 'backfill-memory-summaries.mjs',
            captureStdoutJson: true,
            // Watchdog backstop: a healthy 50-item backfill finishes in minutes. 15min bounds a
            // hang the per-call timeouts miss so one wedged child can't starve the maintenance loop.
            maxRuntimeMs     : 900000
        },
        kbSync: {
            label            : 'knowledge base sync',
            command          : nodeBin,
            args             : [path.join(scriptDir, 'maintenance', 'syncKnowledgeBase.mjs')],
            pidFileName      : 'kb-sync.pid',
            expectedCommand  : 'syncKnowledgeBase.mjs',
            captureStdoutJson: true
        },
        githubWorkflowSync: {
            label          : 'github workflow sync',
            command        : nodeBin,
            args           : [path.join(scriptDir, 'maintenance', 'syncGithubWorkflow.mjs')],
            pidFileName    : 'github-workflow-sync.pid',
            expectedCommand: 'syncGithubWorkflow.mjs'
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
                '--json'
            ],
            pidFileName      : 'graphlog-compaction.pid',
            expectedCommand  : 'compactGraphLog.mjs',
            captureStdoutJson: true
        },
        // Supervised one-shot: the orchestrator owns cadence + the heavy-maintenance lease and spawns this
        // child per due tick to run ONE temporal-pyramid aggregation cycle (L1 session + L2 daily) and exit.
        // No child poller — the entry has no timer and never self-reschedules.
        'temporal-summary': {
            label          : 'temporal-pyramid aggregation',
            command        : nodeBin,
            args           : [path.join(scriptDir, 'maintenance', 'aggregate-temporal-summary.mjs')],
            pidFileName    : 'temporal-summary.pid',
            expectedCommand: 'aggregate-temporal-summary.mjs'
        },
        // Supervised one-shot: the orchestrator owns the cadence; each due tick spawns this child
        // to evaluate the defect-ledger fold and send at most ONE digest broadcast, then exit.
        // The child self-limits — nothing newly qualifying means no A2A write at all (the read
        // side stays attention, never noise).
        'defect-ledger-digest': {
            label            : 'defect ledger digest',
            command          : nodeBin,
            args             : [path.join(scriptDir, 'diagnostics', 'defectObservations.mjs'), '--digest'],
            pidFileName      : 'defect-ledger-digest.pid',
            expectedCommand  : 'defectObservations.mjs',
            captureStdoutJson: true
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
        'message-concept-harvest': {
            label          : 'message concept harvest',
            pidFileName    : 'message-concept-harvest.pid',
            expectedCommand: 'ConceptDiscoveryService',
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
        },
        // In-process read-only health-check (consolidation-side analog of the embed-drain watchdog,
        // one subsystem over): the REM consolidation-liveness watchdog runs inside the scheduling
        // pipeline. The entry exists only so the task gets a persisted state envelope (cadence
        // `lastRunAt` + the one-shot stall-alarm latch `remConsolidationAlarm`). `pidFileName` /
        // `expectedCommand` are inert — no PID file is ever written.
        'rem-consolidation-liveness-watchdog': {
            label          : 'REM consolidation liveness watchdog',
            pidFileName    : 'rem-consolidation-liveness-watchdog.pid',
            expectedCommand: 'RemConsolidationLivenessWatchdog',
            serviceTask    : true
        },
        // In-process read-only health check dispatched by the scheduling pipeline — same posture as
        // its liveness-watchdog siblings above: the entry exists only for the persisted state
        // envelope (cadence `lastRunAt`); `pidFileName` / `expectedCommand` are inert.
        'heavy-maintenance-starvation-watchdog': {
            label          : 'Heavy-maintenance starvation watchdog',
            pidFileName    : 'heavy-maintenance-starvation-watchdog.pid',
            expectedCommand: 'HeavyMaintenanceStarvationWatchdog',
            serviceTask    : true
        }
    };

    return attachTaskAuthority(tasks);
}
