import os                     from 'os';
import path                   from 'path';
import ConfigProvider, {leaf} from '../../../ConfigProvider.mjs';
import {fileURLToPath}        from 'url';
import {resolvePlaneDataRoot} from '../../../planeConfig.mjs';
import {
    MEMORY_CORE_GRAPH_DB_ENV,
    TURN_PRESENCE_DEFAULTS,
    TURN_PRESENCE_ENV
} from './helpers/TurnPresenceConfig.mjs';

/**
 * @summary Parses a liveness-window override, refusing values a window cannot have.
 *
 * A window of `0`, a negative, or a non-number is not a calibration — it is a deployment silently
 * disabling or inverting a roster verdict. `0` would make every identity permanently stale and a
 * negative would make freshness unreachable, so both fail loud at config resolution rather than
 * producing an all-dark roster nobody can explain at 3am.
 * Mirrors the `parseMemorySharingPolicy` signature directly above: the parser receives the env var
 * NAME and reads the value itself, returning `undefined` when unset so the leaf default applies.
 * @param {String} envVarName Env var name.
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Environment source.
 * @returns {Number|undefined} Positive finite milliseconds, or undefined when unset.
 */
function parsePositiveWindowMs(envVarName, {env = process.env} = {}) {
    const rawValue = env[envVarName];

    if (rawValue === undefined || rawValue === null || rawValue === '') return;

    const parsed = Number(rawValue);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`[Config] Invalid ${envVarName} value: "${rawValue}". Must be a positive finite number of milliseconds.`);
    }

    return parsed;
}

function parseMemorySharingPolicy(envVarName, {env = process.env} = {}) {
    const rawValue = env[envVarName];
    if (rawValue === undefined || rawValue === null || rawValue === '') return;
    if (['legacy', 'private', 'team'].includes(rawValue)) {
        return rawValue;
    }
    throw new Error(`[Config] Invalid ${envVarName} value: "${rawValue}". Must be one of: legacy, private, team`);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const neoRootDir = path.resolve(__dirname, '../../../../');
const cwd        = neoRootDir;
// The single plane-member anchor (env-free twin resolution — the leaf machinery owns all env
// binding): every durable data-plane default below derives from it, replacing the per-leaf
// `path.resolve(cwd, '.neo-ai-data/…')` re-derivations and the prior module-scope
// `process.env.NEO_AI_DAEMON_DIR` inline read.
const planeDataRoot = resolvePlaneDataRoot({rootDir: neoRootDir});
const DAY_MS        = 24 * 60 * 60 * 1000;

// Per-worker-unique test collection names, generated at config-load. Each playwright worker is a
// separate process that re-evaluates this module → its own unique names, so fullyParallel workers
// never collide on a shared collection. Generated here (not inside a `process.env` leaf default) so
// the leaves stay declarative; selection is the `collections.useTestDatabase` toggle + formulas below.
const testMemoryCollection          = `test-memory-${Date.now()}-${Math.random().toString(36).substring(7)}`;
const testSessionCollection         = `test-session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
const testTemporalSummaryCollection = `test-temporal-summary-${Date.now()}-${Math.random().toString(36).substring(7)}`;

// Per-worker-unique WAL test directory under the OS temp root (same isolation rationale as the
// test collection names above): fullyParallel workers never share a write-ahead directory, and
// unit tests never touch the repo-local `.neo-ai-data/memory-wal` production path.
const testMemoryWalDir = path.join(os.tmpdir(), `neo-memory-wal-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);

// Per-worker-unique handoff test file under the OS temp root (same isolation rationale as the WAL
// test dir): fullyParallel workers never share the handoff write target, and unit runs never touch
// the tracked resources/content/sandman_handoff.md production file. The formula resolves this by
// construction under UNIT_TEST_MODE — specs must NOT mutate aiConfig.handoffFilePath (the B4
// singleton-mutation anti-pattern this isolation removes).
const testHandoffFile = path.join(os.tmpdir(), `neo-sandman-handoff-test-${Date.now()}-${Math.random().toString(36).substring(7)}.md`);

/**
 * @summary Extendable defaults and formulas for the Memory Core MCP server.
 *
 * Supports loading configuration from a custom file and merging with defaults.
 *
 * @class Neo.ai.mcp.server.memory-core.ConfigBase
 * @extends Neo.ai.ConfigProvider
 */
class ConfigBase extends ConfigProvider {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.ConfigBase'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.ConfigBase',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * Repo root, computed from this module's path. Exported for symmetry with the
             * KB and Neural Link config contracts so consumers can read `aiConfig.neoRootDir`
             * instead of recomputing the 4-level traversal locally. Module path is stable;
             * the resolution is deterministic at boot.
             * @type {string}
             */
            neoRootDir: leaf(neoRootDir),
            /**
             * Global debug flag for all MCP servers.
             * @type {boolean}
             */
            debug: leaf(false, 'NEO_DEBUG', 'boolean'),
            /**
             * Server transport protocol. Supported values are exactly `stdio` and `streamable-http`.
             * @type {string}
             */
            transport: leaf('stdio', 'NEO_TRANSPORT', 'string'),
            /**
             * Port the MCP server's Streamable HTTP transport listens on (only used when
             * `transport === 'streamable-http'`).
             *
             * Operator env var: `MCP_HTTP_PORT`.
             * @type {number}
             */
            mcpHttpPort: leaf(3001, 'MCP_HTTP_PORT', 'port'),
            /**
             * Optional public canonical URL for this MCP server.
             * When configured, this URL is explicitly used as the resource indicator
             * for OAuth 2.1 / OIDC audience claims and protected-resource advertising.
             * Required when deploying behind reverse proxies (Nginx/Caddy) where
             * the internal host:port bindings do not match the public-facing URL.
             * Example: 'https://mcp.neo.mjs.com/memory-core'
             * @type {string|null}
             */
            publicUrl: leaf(null, 'NEO_PUBLIC_URL', 'url'),
            /**
             * Comma-separated extra hostnames added to the MCP transport's Host-header allowlist
             * (the SDK's DNS-rebinding protection). localhost/127.0.0.1/[::1] and the `publicUrl`
             * hostname are always allowed; set this for multi-hostname deployments or where the
             * client `Host` differs from `publicUrl`. Empty/null → only the implicit localhost +
             * publicUrl hosts. Consumed by TransportService.computeAllowedHosts.
             * @type {string|null}
             */
            allowedHosts: leaf(null, 'NEO_MCP_ALLOWED_HOSTS', 'string'),
            /**
             * Optional Express middleware function for authentication (only used when
             * `transport === 'streamable-http'`).
             * @type {Function|null}
             */
            authMiddleware: leaf(null),
            /**
             * Pagination limit for fetching records during session summarization scans.
             * Controls the batch size for memory and summary retrieval.
             * @type {number}
             */
            summarizationBatchLimit: leaf(2000),
            /**
             * Maximum sessions one summary sweep drains before the child exits + releases the
             * heavy-maintenance lease, so the fair picker interleaves dream / golden-path / backfill
             * frequently instead of waiting out a whole drift batch. The drift sweep self-continues
             * (the next sweep re-derives the remainder), so this chunks the work, never drops it. A
             * small default keeps holds short.
             * @type {number}
             */
            maxSessionsPerSummarySweep: leaf(5, 'NEO_MC_MAX_SESSIONS_PER_SUMMARY_SWEEP', 'number'),
            /**
             * Maximum number of undigested sessions the REM pipeline processes per cycle.
             * Keeps each sleep pass bounded even when the query batch is larger.
             * @type {number}
             */
            remSleepBatchLimit: leaf(10, 'NEO_REM_SLEEP_BATCH_LIMIT', 'number'),
            /**
             * Maximum failed graph-digest attempts before the REM pipeline bounds a retry-exhausted
             * terminal schema failure out of the steady cadence. Provider-size parser failures bypass
             * this threshold and are excluded immediately; transient ingestion failures remain retryable.
             * @type {number}
             */
            maxDigestAttempts: leaf(3, 'NEO_REM_MAX_DIGEST_ATTEMPTS', 'number'),
            /**
             * Per-cycle reserve of the freshest (most-recent) undigested sessions the REM picker keeps
             * for first-pass digestion, so a backlog of retry-eligible aged sessions never fully starves
             * new work. The remainder of the per-cycle budget goes to the oldest aged sessions.
             * @type {number}
             */
            undigestedSessionFreshReserve: leaf(2, 'NEO_REM_UNDIGESTED_FRESH_RESERVE', 'number'),
            /**
             * Maximum number of concurrent session summarization requests.
             * Prevents hitting LLM/Embedding API rate limits during bulk operations.
             * @type {number}
             */
            summarizationConcurrency: leaf(5),
            /**
             * Wall-clock budget (ms) for a single session-summary synthesis call. Bounds
             * `SessionService.summarizeSession`'s LLM invocation so a slow local synthesis aborts and
             * degrades gracefully instead of grinding to the provider socket cap — the ~30-min stall that
             * leaves `SummarizationJobs` leases stuck `in_progress` past expiry. Mirrors the
             * `buildMiniSummary` timeout guard. Calibrated against the **300000ms `SummarizationJobs` lease
             * TTL** (`claimSummarizationJob` default): the raw synthesis must abort well under the lease so
             * it never expires the lease mid-run, AND the degraded (compact) fallback — a second, smaller
             * synthesis — still completes within the lease. 180s leaves ~120s of that headroom. A synthesis
             * approaching the lease TTL is already heading for the stuck-lease bug, so degrading it via the
             * fast compact retry is the correct outcome. On overshoot the synthesis aborts and the
             * provenance-labeled degraded fallback runs, so a too-slow session still gets a summary.
             * Env-overridable; refine against a worst-case session-synthesis measurement (stay below the lease TTL).
             * @type {number}
             */
            sessionSummaryTimeoutMs: leaf(180000, 'NEO_MEMORY_SESSION_SUMMARY_TIMEOUT_MS', 'number'),
            /**
             * The target Storage Architecture to use.
             * Note: Chroma is the only supported Vector DB.
             * Options: 'hybrid' (Chroma vectors + SQLite graph), 'chroma' (Chroma vectors only).
             * The default is explicitly 'hybrid' for the two-pillar RAG architecture.
             */
            engine: leaf('hybrid'),
            /**
             * Physical file paths for embedded/local datasets.
             *
             * `graph` (the active path consumers read) is a reactive formula (see `formulas` below) that
             * resolves `graphProd` / `graphTest` by construction from `useTestDatabase` — no inline
             * `process.env` in a leaf default. Test-mode is resolved in the config, so
             * the ~10 `storagePaths.graph` consumers (GraphService open, DatabaseService guard, Server
             * diagnostic, maintenance scripts) read one value unchanged.
             */
            storagePaths: {
                /**
                 * Production graph SQLite path. Declarative leaf; env override via `NEO_MEMORY_DB_PATH`.
                 * @type {string}
                 */
                graphProd      : leaf(path.resolve(planeDataRoot, 'sqlite/memory-core-graph.sqlite'), MEMORY_CORE_GRAPH_DB_ENV, 'string', {planeMember: true}),
                /**
                 * Unit-test graph path: in-memory SQLite (ephemeral, per-process). Declarative leaf.
                 * @type {string}
                 */
                graphTest      : leaf(':memory:', 'NEO_MEMORY_DB_PATH_TEST', 'string'),
                /**
                 * Test-mode toggle (env-driven via `UNIT_TEST_MODE`). The `storagePaths.graph` formula
                 * reads this to select `graphTest` (true) or `graphProd` (false) — safe-by-construction.
                 * @type {boolean}
                 */
                useUnitTestDatabase: leaf(false, 'UNIT_TEST_MODE', 'boolean'),
                /**
                 * @summary Extends disposable storage selection to every Playwright mode without
                 * changing application-level UNIT_TEST_MODE semantics.
                 * @type {boolean}
                 */
                useTestHarness : leaf(false, 'NEO_TEST_CONFIG_TEMPLATES', 'boolean')
            },
            /**
             * Durable wake-daemon watermarks consumed by GraphLog maintenance. `dataDir` derives
             * from the declared plane anchor; the two watermark paths consumers read
             * (`bridgeLastSyncIdPath` / `wakeSubscriptionLiveCursorPath`) are formulas (below)
             * deriving from the RESOLVED `dataDir` — relocating the daemon dir via
             * `NEO_AI_DAEMON_DIR` moves the watermarks with it (children of a relocatable parent
             * are genuinely computed values, so formulas, not static joins), while each watermark
             * keeps its explicit override leaf.
             */
            wakeDaemon: {
                dataDir                               : leaf(path.resolve(planeDataRoot, 'wake-daemon'), 'NEO_AI_DAEMON_DIR', 'string', {planeMember: true}),
                bridgeLastSyncIdPathOverride          : leaf(null, 'NEO_BRIDGE_LAST_SYNC_ID_PATH', 'string'),
                wakeSubscriptionLiveCursorPathOverride: leaf(null, 'NEO_AI_WAKE_SUBSCRIPTION_CURSOR_FILE', 'string')
            },
            /**
             * Turn-presence interval writer configuration.
             *
             * `AGENT_TURN_PRESENCE` records are liveness intervals, not point beacons:
             * `freshMs` is the online freshness window refreshed by start/progress writes,
             * `ttlMs` is the hard expiry backstop, and `noteMaxChars` bounds hook diagnostics.
             * Consumers read resolved leaves at use sites through the AiConfig Provider SSOT.
             */
            turnPresence: {
                freshMs           : leaf(TURN_PRESENCE_DEFAULTS.freshMs,            TURN_PRESENCE_ENV.freshMs,            'number'),
                ttlMs             : leaf(TURN_PRESENCE_DEFAULTS.ttlMs,              TURN_PRESENCE_ENV.ttlMs,              'number'),
                noteMaxChars      : leaf(TURN_PRESENCE_DEFAULTS.noteMaxChars,       TURN_PRESENCE_ENV.noteMaxChars,       'number'),
                hookWriteTimeoutMs: leaf(TURN_PRESENCE_DEFAULTS.hookWriteTimeoutMs, TURN_PRESENCE_ENV.hookWriteTimeoutMs, 'number')
            },
            /**
             * `who_is_online` roster-projection windows.
             *
             * The tool answers two different questions and needs two different windows, because a
             * single one cannot be right for both: LIVENESS ("acting right now") and MEMBERSHIP
             * ("seen on this deployment at all"). Both are deployment-calibratable rather than
             * constants, because the honest value depends on a deployment's own turn rhythm — a
             * swarm of long-turn maintainers and a many-seat tenant do not share one answer.
             *
             * `activityFreshMs` bounds ONLINE. `add_memory` lands at turn boundaries, so this must
             * exceed a typical turn or a mid-turn agent reads as absent; the turn-presence beacon
             * is the preferred liveness signal where a deployment emits one, and this window is the
             * fallback rather than the primary test.
             *
             * `idleCutoffMs` bounds IDLE, and its absence is what made the roster read as an
             * attendance list: with no cutoff, an identity last seen eight hours ago and an
             * identity that logged off at lunch occupy the same bucket. Beyond it an identity
             * reports `dark` — still rostered, no longer plausibly in this session.
             */
            whoIsOnline: {
                activityFreshMs: leaf(15 * 60 * 1000,     'NEO_WHO_IS_ONLINE_ACTIVITY_FRESH_MS', 'number', {parse: parsePositiveWindowMs}),
                idleCutoffMs   : leaf(4 * 60 * 60 * 1000, 'NEO_WHO_IS_ONLINE_IDLE_CUTOFF_MS',    'number', {parse: parsePositiveWindowMs})
            },
            /**
             * Redacted Memory Core MCP tool-call telemetry. The recorder reads these resolved
             * leaves at write/report time so deployments can tune observability without
             * re-deriving defaults outside the Provider SSOT.
             */
            toolTelemetry: {
                enabled          : leaf(true, 'NEO_MC_TOOL_TELEMETRY_ENABLED', 'boolean'),
                errorMaxChars    : leaf(512, 'NEO_MC_TOOL_TELEMETRY_ERROR_MAX_CHARS', 'number'),
                aggregateWindowMs: leaf(DAY_MS, 'NEO_MC_TOOL_TELEMETRY_WINDOW_MS', 'number'),
                aggregateLimit   : leaf(50, 'NEO_MC_TOOL_TELEMETRY_LIMIT', 'number'),
                slowAfterMs      : leaf(60_000, 'NEO_MC_TOOL_TELEMETRY_SLOW_AFTER_MS', 'number')
            },
            /**
             * Data Schema/Table Names
             * This defines WHAT the tables/collections are called logically.
             */
            collections: {
                /**
                 * `memory` / `session` / `temporalSummary` (the active names consumers read) are formulas
                 * (below) resolving `*Prod` / `*Test` by construction from `useTestDatabase` — no inline
                 * `process.env` in a leaf default. The test names are per-worker-unique (module consts above)
                 * for fullyParallel isolation; consumers (HealthService, ChromaManager, defragChromaDB) read
                 * `collections.memory` / `session` / `temporalSummary` unchanged.
                 * @type {string}
                 */
                memoryProd         : leaf('neo-agent-memory', 'NEO_MEMORY_COLLECTION_NAME', 'string'),
                memoryTest         : leaf(testMemoryCollection, 'NEO_MEMORY_COLLECTION_NAME_TEST', 'string'),
                sessionProd        : leaf('neo-agent-sessions', 'NEO_SESSION_COLLECTION_NAME', 'string'),
                sessionTest        : leaf(testSessionCollection, 'NEO_SESSION_COLLECTION_NAME_TEST', 'string'),
                temporalSummaryProd: leaf('neo-temporal-summary', 'NEO_TEMPORAL_SUMMARY_COLLECTION_NAME', 'string'),
                temporalSummaryTest: leaf(testTemporalSummaryCollection, 'NEO_TEMPORAL_SUMMARY_COLLECTION_NAME_TEST', 'string'),
                useTestDatabase    : leaf(false, 'UNIT_TEST_MODE', 'boolean'),
                graph              : leaf('neo-native-graph', 'NEO_GRAPH_COLLECTION_NAME', 'string')
            },
            /**
             * Datasets Schema/Paths
             * This defines WHERE autonomous curation exports data.
             */
            datasets: {
                rlaif: {
                    trajectories: leaf(path.resolve(planeDataRoot, 'datasets/rlaif/trajectories.jsonl'), 'NEO_RLAIF_PATH', 'string', {planeMember: true})
                }
            },
            /**
             * Directory for per-cycle REM run/stage JSONL state artifacts.
             * @type {string}
             */
            remRunStateDir: leaf(path.resolve(planeDataRoot, 'rem-runs'), 'NEO_REM_RUN_STATE_DIR', 'string', {planeMember: true}),
            /**
             * Stall threshold for the REM consolidation-liveness watchdog: max age (ms) since the last
             * successful REM cycle before the watchdog records/raises a consolidation stall. Default 6h
             * (generous vs the hourly/off-peak dream cadence to avoid false alarms).
             * @type {number}
             */
            remConsolidationStallThresholdMs: leaf(6 * 60 * 60 * 1000, 'NEO_REM_CONSOLIDATION_STALL_THRESHOLD_MS', 'number'),
            /**
             * Number of recent REM cycles projected by `get_rem_pipeline_state`.
             * @type {number}
             */
            remRunRecentLimit: leaf(5, 'NEO_REM_RUN_RECENT_LIMIT', 'number'),
            /**
             * Maximum per-cycle REM run/stage JSONL artifacts retained on disk. On each append the
             * store prunes older artifacts beyond this bound, capping both the directory file count
             * and the read-path stat fan-out so neither grows with deployment age.
             * @type {number}
             */
            remRunRetentionLimit: leaf(200, 'NEO_REM_RUN_RETENTION_LIMIT', 'number'),
            /**
             * Healthcheck probe budgets. These bound dependency probes so a stalled
             * Chroma client, embedding provider, or REM axis returns unhealthy/degraded
             * observability instead of keeping the MCP request open indefinitely.
             * @type {Object}
             */
            healthcheck: {
                /**
                 * Max time to wait for Chroma readiness, connection, and collection-count probes.
                 * @type {number}
                 */
                chromaProbeTimeoutMs: leaf(1500, 'NEO_MEMORY_HEALTHCHECK_CHROMA_PROBE_TIMEOUT_MS', 'number'),
                /**
                 * Max time to wait for the active embedding provider during the write canary.
                 * Must tolerate a cold embedder load: an 8b embedding model VRAM-evicted under chat-model
                 * pressure cold-reloads in ~11-19s, so a tighter bound false-negatives a healthy-but-slow
                 * provider and trips the embed-canary health gate. Still a bound, not removal — the embed
                 * operation itself budgets 300s, so this gate stays well under that while surviving a
                 * realistic cold-load.
                 * @type {number}
                 */
                embeddingWriteCanaryTimeoutMs: leaf(30000, 'NEO_MEMORY_HEALTHCHECK_EMBEDDING_WRITE_CANARY_TIMEOUT_MS', 'number'),
                /**
                 * Hard ceiling on the attempt budget in ms. The configured budget is clamped to this
                 * at arm time, and the clamp is reported.
                 *
                 * **Why a ceiling exists at all.** A consumer timeout stops US waiting; it does not
                 * stop the provider. Ollama runs an abandoned request to completion, and with one
                 * parallel slot that request holds the embedder until it finishes on its own. So the
                 * issued budget IS the worst-case time a single orphan can occupy the provider with
                 * nobody waiting for it. Every lever that acts on our waiting is powerless here,
                 * because the cost is entirely in the issuing — lowering the timeout does not shorten
                 * the orphan at all, it just makes us abandon sooner and orphan more.
                 *
                 * **An absolute duration, deliberately not a multiple of the cadence.** Cadence is how
                 * often we sample; orphan cost is how long one sample can hold the provider. Tying
                 * them together would shrink the budget of any deployment that samples frequently,
                 * which is a different question badly answered.
                 *
                 * The default sits above the shipped 30s budget, so it changes nothing by default and
                 * bites only a deployment that has raised its timeout past what an orphan is worth.
                 * `<= 0` disables the ceiling and restores pre-clamp behaviour, which is how a plane
                 * ends up issuing 15-minute requests it cannot cancel.
                 * @type {number}
                 */
                embeddingWriteCanaryMaxBudgetMs: leaf(60000, 'NEO_MEMORY_HEALTHCHECK_EMBEDDING_WRITE_CANARY_MAX_BUDGET_MS', 'number'),
                /**
                 * The canary producer's attempt period. A liveness probe NEVER triggers a canary
                 * run — healthcheck is a cheap pure read of the gate's current truth, so a
                 * container probe interval is free to differ from this cadence. Guidance: sample
                 * in MINUTES, not seconds. A seconds-order probe buys nothing (the probe performs
                 * no inference itself), while its consecutive failures can still restart the
                 * container — oversampling only adds restart-loop risk against a struggling
                 * dependency. `<= 0` disables the producer and disarms an existing schedule.
                 * @type {number}
                 */
                embeddingWriteCanaryCadenceMs: leaf(60000, 'NEO_MEMORY_HEALTHCHECK_EMBEDDING_WRITE_CANARY_CADENCE_MS', 'number'),
                /**
                 * Staleness floor for the last healthy canary result — NOT an attempt period.
                 * Attempts run at `embeddingWriteCanaryCadenceMs`; this only feeds the dead-loop
                 * guard: a healthy result older than `3 · max(cadence, this)` degrades with
                 * "canary loop not running". Failure backoff is intentional waiting, never stale.
                 * @type {number}
                 */
                embeddingWriteCanaryHealthyTtlMs: leaf(60000, 'NEO_MEMORY_HEALTHCHECK_EMBEDDING_WRITE_CANARY_HEALTHY_TTL_MS', 'number'),
                /**
                 * Base failure-backoff window for the canary retry gate; doubles per consecutive
                 * failure up to the ceiling. A struggling provider sees attempts DECREASE
                 * instead of retrying at probe frequency.
                 * @type {number}
                 */
                embeddingWriteCanaryFailureTtlMs: leaf(30000, 'NEO_MEMORY_HEALTHCHECK_EMBEDDING_WRITE_CANARY_FAILURE_TTL_MS', 'number'),
                /**
                 * Backoff ceiling for the canary retry gate. Liveness keeps probing at this capped
                 * interval, so a deployment recovers without operator intervention once the
                 * provider responds again.
                 * @type {number}
                 */
                embeddingWriteCanaryFailureTtlMaxMs: leaf(600000, 'NEO_MEMORY_HEALTHCHECK_EMBEDDING_WRITE_CANARY_FAILURE_TTL_MAX_MS', 'number'),
                /**
                 * Max time to wait for each REM pipeline-state axis.
                 * @type {number}
                 */
                remAxisTimeoutMs: leaf(1500, 'NEO_MEMORY_HEALTHCHECK_REM_AXIS_TIMEOUT_MS', 'number')
            },
            /**
             * Durable JSONL write-ahead store for `add_memory` payloads.
             *
             * The mandated per-turn save appends its full payload here BEFORE any model-dependent
             * work, so an embed/Chroma failure or stall never fails or loses the save. `dir` (the
             * active path consumers read) is a reactive formula (see `formulas` below) resolving
             * `dirProd` / `dirTest` by construction from `useTestDatabase` — unit tests can never
             * write into the production WAL.
             */
            memoryWal: {
                /**
                 * Production WAL segment directory. Declarative leaf; env override via `NEO_MEMORY_WAL_DIR`.
                 * @type {string}
                 */
                dirProd        : leaf(path.resolve(planeDataRoot, 'memory-wal'), 'NEO_MEMORY_WAL_DIR', 'string', {planeMember: true}),
                /**
                 * Unit-test WAL directory: per-worker-unique under the OS temp root (module const above).
                 * @type {string}
                 */
                dirTest        : leaf(testMemoryWalDir, 'NEO_MEMORY_WAL_DIR_TEST', 'string'),
                /**
                 * Test-mode toggle (env-driven via `UNIT_TEST_MODE`). The `memoryWal.dir` formula
                 * reads this to select `dirTest` (true) or `dirProd` (false) — safe-by-construction.
                 * @type {boolean}
                 */
                useTestDatabase: leaf(false, 'UNIT_TEST_MODE', 'boolean'),
                /**
                 * Maximum fully-reconciled (every record embed-marked) WAL day-segments retained on
                 * disk. Pruned on append; segments holding ANY pending record are never pruned —
                 * the WAL is a durability buffer first, a log second.
                 * @type {number}
                 */
                retentionLimit : leaf(30, 'NEO_MEMORY_WAL_RETENTION_LIMIT', 'number'),
                /**
                 * Minimum per-field length (after trim) for `prompt`/`thought`/`response` accepted
                 * by `add_memory`. Default 1 = reject only empty/whitespace-only fields — the
                 * unambiguous corrupted-memory class. Deliberately conservative: boot
                 * heartbeats (`resumeHarness.mjs` health-check) carry thin-but-real content and
                 * must keep passing until the planned boot-heartbeat liveness-marker carve-out
                 * routes them off this path. Raise only with a derived threshold.
                 * @type {number}
                 */
                minFieldLength : leaf(1, 'NEO_MEMORY_MIN_FIELD_LENGTH', 'number'),
                /**
                 * Data directory (PID file, rotating log) for the embed daemon —
                 * `ai/daemons/embed/daemon.mjs`, the durable WAL drainer. Declarative leaf;
                 * env override via `NEO_MEMORY_EMBED_DAEMON_DIR`.
                 * @type {string}
                 */
                daemonDataDir  : leaf(path.resolve(planeDataRoot, 'embed-daemon'), 'NEO_MEMORY_EMBED_DAEMON_DIR', 'string', {planeMember: true}),
                /**
                 * Embed-daemon drain cadence. Per-turn saves arrive minutes apart; 5s keeps
                 * semantic recall near-realtime without hot-looping the store. This cadence is
                 * also what bounds the pending-backlog scan cost (see `drainCycle.mjs` AC10 note).
                 * @type {number}
                 */
                pollIntervalMs : leaf(5000, 'NEO_MEMORY_WAL_POLL_INTERVAL_MS', 'number'),
                /**
                 * Maximum WAL records embedded per drain cycle.
                 * @type {number}
                 */
                batchSize      : leaf(20, 'NEO_MEMORY_WAL_BATCH_SIZE', 'number'),
                /**
                 * In-cycle whole-batch retry bound for transient embed failures; beyond it the
                 * cycle isolates failures per record (cross-cycle exponential cooldown).
                 * @type {number}
                 */
                maxRetries     : leaf(5, 'NEO_MEMORY_WAL_MAX_RETRIES', 'number'),
                /**
                 * Exponential-backoff base for embed retries (`base * 2^attempt`, capped at the
                 * drain module's `MAX_RECORD_COOLDOWN_MS`).
                 * @type {number}
                 */
                backoffBaseMs  : leaf(1000, 'NEO_MEMORY_WAL_BACKOFF_BASE_MS', 'number'),
                /**
                 * Stall threshold for the embed-drain liveness watchdog: when the OLDEST un-embedded
                 * WAL record is older than this, the (orchestrator-hosted, read-only) watchdog raises a
                 * one-shot alarm. Conservative default of 6h — hours, NOT days: the whole point is to
                 * catch a silently-stalled drain same-session, not after a week (the silent drain-death
                 * incident went ~8 days unnoticed). It must exceed the worst-case healthy drain latency
                 * (per-turn saves arrive minutes apart; the drain polls every `pollIntervalMs`) so a
                 * healthy backlog never false-alarms. `<= 0` disables alarming. The watchdog only READS
                 * the WAL — it never touches the never-fail `add_memory` write path.
                 * @type {number}
                 */
                embedDrainStallThresholdMs: leaf(6 * 60 * 60 * 1000, 'NEO_MEMORY_WAL_EMBED_DRAIN_STALL_THRESHOLD_MS', 'number'),
                /**
                 * Hosts the WAL drain loop INSIDE the memory-core server process — the
                 * containerized / single-process deployment shape (dockerized MC, npx-neo-app
                 * workspaces) where no orchestrator-supervised embed daemon exists.
                 *
                 * **Mutual exclusion (sole-drainer invariant):** exactly ONE drain loop per WAL
                 * directory. Enabling this where the embed daemon also runs is refused at startup
                 * by the per-directory `.drain-lock` guard (whichever host starts second fails
                 * loud), not merely discouraged. The local maintainer profile keeps this `false`
                 * and runs the daemon.
                 * @type {boolean}
                 */
                inProcessDrain : leaf(false, 'NEO_MEMORY_WAL_IN_PROCESS_DRAIN', 'boolean')
            },
            /**
             * Durable JSONL write-ahead store for accepted A2A mailbox messages.
             *
             * `dir` defaults by formula to `${memoryWal.dir}/messages`, so the message WAL follows
             * the same local/cloud volume reachability as the proven memory WAL unless a deployment
             * deliberately overrides it. The drain-host leaves mirror `memoryWal`: local setups can
             * run an orchestrator-supervised daemon, while containerized/single-process deployments
             * can host the loop inside Memory Core via `messageWal.inProcessDrain`.
             */
            messageWal: {
                /**
                 * Optional production message WAL directory override. Null means derive from
                 * `memoryWal.dir` by formula; deployments should override only when the alternate
                 * path is reachable by the configured drain host.
                 * @type {string|null}
                 */
                dirProd       : leaf(null, 'NEO_MESSAGE_WAL_DIR', 'string'),
                /**
                 * Optional unit-test message WAL directory override. Null means derive from the
                 * active test `memoryWal.dir`, preserving by-construction test isolation.
                 * @type {string|null}
                 */
                dirTest       : leaf(null, 'NEO_MESSAGE_WAL_DIR_TEST', 'string'),
                /**
                 * Test-mode toggle (env-driven via `UNIT_TEST_MODE`). The `messageWal.dir` formula
                 * reads this to select `dirTest`/`dirProd` override leaves before falling back to
                 * the active `memoryWal.dir` sibling.
                 * @type {boolean}
                 */
                useTestDatabase: leaf(false, 'UNIT_TEST_MODE', 'boolean'),
                /**
                 * Data directory (PID file, rotating log) for the local message WAL drain daemon.
                 * @type {string}
                 */
                daemonDataDir : leaf(path.resolve(planeDataRoot, 'message-daemon'), 'NEO_MESSAGE_WAL_DAEMON_DIR', 'string', {planeMember: true}),
                /**
                 * Message WAL drain cadence. Mirrors memory WAL cadence; the replay semantics are
                 * owned by the message drain processor, while this leaf owns host scheduling.
                 * @type {number}
                 */
                pollIntervalMs: leaf(5000, 'NEO_MESSAGE_WAL_POLL_INTERVAL_MS', 'number'),
                /**
                 * Maximum message WAL records observed by one drain cycle.
                 * @type {number}
                 */
                batchSize     : leaf(20, 'NEO_MESSAGE_WAL_BATCH_SIZE', 'number'),
                /**
                 * In-cycle whole-batch retry bound for transient message replay failures.
                 * @type {number}
                 */
                maxRetries    : leaf(5, 'NEO_MESSAGE_WAL_MAX_RETRIES', 'number'),
                /**
                 * Exponential-backoff base for message replay retries.
                 * @type {number}
                 */
                backoffBaseMs : leaf(1000, 'NEO_MESSAGE_WAL_BACKOFF_BASE_MS', 'number'),
                /**
                 * Hosts the message WAL drain loop INSIDE the memory-core server process. This is
                 * the containerized / single-process shape where no orchestrator-supervised message
                 * daemon exists. A per-directory drain lock enforces exactly one live message drain
                 * host per message WAL directory.
                 * @type {boolean}
                 */
                inProcessDrain: leaf(false, 'NEO_MESSAGE_WAL_IN_PROCESS_DRAIN', 'boolean')
            },
            /**
             * Production handoff markdown file — autonomous agent-to-user reporting (offline jobs).
             * The active `handoffFilePath` consumers read is a formula (below) resolving Prod/Test by
             * construction from `UNIT_TEST_MODE`, so test runs that WRITE the handoff (runSandman /
             * DreamService / TopologyInferenceEngine) never clobber the tracked production file.
             * @type {string}
             */
            handoffFilePathProd: leaf(path.resolve(cwd, 'resources/content/sandman_handoff.md'), 'NEO_HANDOFF_FILE_PATH', 'string'),
            /**
             * Unit-test handoff path — a per-worker-unique file under the OS temp root (see
             * `testHandoffFile`), so fullyParallel workers never share a write target and test-mode
             * writes stay off the tracked production file. Declarative leaf; test-mode by construction.
             * @type {string}
             */
            handoffFilePathTest: leaf(testHandoffFile, 'NEO_HANDOFF_FILE_PATH_TEST', 'string'),
            /**
             * Stale-assignment idle threshold used by `GoldenPathSynthesizer` when rendering
             * Sandman handoff candidates. Defaults to the ticket-intake 7-day reassignment rule.
             * @type {number}
             */
            goldenPathStaleAssignmentThresholdMs: leaf(7 * DAY_MS, 'NEO_GOLDEN_PATH_STALE_ASSIGNMENT_THRESHOLD_MS', 'number'),
            /**
             * Maximum stale-assignment candidates rendered into the Sandman handoff.
             * @type {number}
             */
            goldenPathStaleAssignmentRenderLimit: leaf(5, 'NEO_GOLDEN_PATH_STALE_ASSIGNMENT_RENDER_LIMIT', 'number'),
            /**
             * Idle threshold used by `GoldenPathSynthesizer` when rendering unassigned
             * Silent Threads. Defaults to 14 days so the section surfaces longer-running
             * atrophy than the 7-day stale-assignment lane.
             * @type {number}
             */
            goldenPathSilentThreadThresholdMs: leaf(14 * DAY_MS, 'NEO_GOLDEN_PATH_SILENT_THREAD_THRESHOLD_MS', 'number'),
            /**
             * How long one hook-projection publication may hold its target. Wave 1 is a bounded
             * single-publication lease with NO renewal: a render that cannot finish inside this window
             * aborts rather than extending it, so this ceiling is also the worst-case wait before a
             * crashed holder's target frees itself. Raising it slows takeover; lowering it aborts slow
             * renders. Adding renewal instead is a decision-record revalidation, not a config change.
             * @type {number}
             */
            hookProjectionLeaseTtlMs: leaf(15_000, 'NEO_HOOK_PROJECTION_LEASE_TTL_MS', 'number'),
            /**
             * Memory-Core-owned root for published hook projections. The writer derives every output
             * path beneath it from the server-derived target id; a producer submits an envelope for an
             * admitted target and never supplies a filesystem path.
             * @type {string}
             */
            hookProjectionRoot: leaf(path.resolve(planeDataRoot, 'hook-projections'), 'NEO_HOOK_PROJECTION_ROOT', 'string', {planeMember: true}),
            /**
             * Minimum `daysIdle * max(structuralWeight, 1)` score required for Silent Threads.
             * @type {number}
             */
            goldenPathSilentThreadMinScore: leaf(14, 'NEO_GOLDEN_PATH_SILENT_THREAD_MIN_SCORE', 'number'),
            /**
             * Maximum Silent Threads candidates rendered into the Sandman handoff.
             * @type {number}
             */
            goldenPathSilentThreadRenderLimit: leaf(5, 'NEO_GOLDEN_PATH_SILENT_THREAD_RENDER_LIMIT', 'number'),
            /**
             * Render switch for the visibility-only Work-Graph Stall Inference handoff section.
             * Detection remains data-only; disabling this leaf only removes the pull-surface.
             * @type {boolean}
             */
            goldenPathStallFindingRenderEnabled: leaf(true, 'NEO_GOLDEN_PATH_STALL_FINDING_RENDER_ENABLED', 'boolean'),
            /**
             * Maximum verified/advisory stall findings rendered into the Sandman handoff.
             * @type {number}
             */
            goldenPathStallFindingRenderLimit: leaf(5, 'NEO_GOLDEN_PATH_STALL_FINDING_RENDER_LIMIT', 'number'),
            /**
             * Maximum recent open PR rows rendered inside `Active PR Cycle State`.
             * @type {number}
             */
            goldenPathRecentOpenPrRenderLimit: leaf(10, 'NEO_GOLDEN_PATH_RECENT_OPEN_PR_RENDER_LIMIT', 'number'),
            /**
             * Freshness SLA for generated `Active PR Cycle State` data. Older PR-cycle snapshots
             * are rendered as stale instead of implied-current.
             * @type {number}
             */
            goldenPathActivePrStateFreshnessMs: leaf(60 * 60 * 1000, 'NEO_GOLDEN_PATH_ACTIVE_PR_STATE_FRESHNESS_MS', 'number'),
            /**
             * Freshness TTL (ms) stamped onto the typed computed-route result's `expiresAt`. A
             * route older than this is treated as stale rather than implied-current. Defaults to 1h.
             * @type {number}
             */
            goldenPathRouteTtlMs: leaf(60 * 60 * 1000, 'NEO_GOLDEN_PATH_ROUTE_TTL_MS', 'number'),
            /**
             * Maximum Golden Path priority nodes rendered into the Sandman handoff. The
             * Golden Path is the one section that earns more depth than the 5-row
             * convention applied to every other category; defaults to 10.
             * @type {number}
             */
            goldenPathTopNodeRenderLimit: leaf(10, 'NEO_GOLDEN_PATH_TOP_NODE_RENDER_LIMIT', 'number'),
            /**
             * Page size for the current-state lane-landscape census walk. The walk runs to exhaustion,
             * so this trades request count against page size and never bounds the answer — a smaller
             * page means more round trips, never a smaller landscape.
             * @type {number}
             */
            laneLandscapeCensusPageLimit: leaf(100, 'NEO_LANE_LANDSCAPE_CENSUS_PAGE_LIMIT', 'number'),
            /**
             * Hard page ceiling for the lane-landscape census walk, so a runaway cursor terminates.
             * This is a safety bound, not a coverage decision: hitting it makes the census report
             * `degraded` with the reason rather than stopping silently and passing a partial landscape
             * off as the whole one.
             * @type {number}
             */
            laneLandscapeCensusMaxPages: leaf(50, 'NEO_LANE_LANDSCAPE_CENSUS_MAX_PAGES', 'number'),
            /**
             * Record ceiling for the lane-landscape relation-edge read. Like the page ceiling, this is a
             * safety bound rather than a coverage decision: hitting it makes the landscape report
             * `degraded` with the reason, because a clipped relation set yields a dependency path that is
             * missing links it cannot name.
             * @type {number}
             */
            laneLandscapeRelationEdgeLimit: leaf(5000, 'NEO_LANE_LANDSCAPE_RELATION_EDGE_LIMIT', 'number'),
            /**
             * Route-attribution ledger directory — the runtime JSONL store recording which computed candidates
             * the routing contradiction guard filtered, under which arming reasons. The active
             * `goldenPathRouteAttributionLedgerDir` consumers read is a formula (below) resolving Prod/Test by
             * construction from `UNIT_TEST_MODE`, so synthesis specs that trigger the fail-open emit never write
             * the production `.neo-ai-data` ledger. Read at the synthesizer boundary + passed EXPLICITLY into the
             * pure `routeAttributionLedgerStore` helper. Co-located with the orchestrator-daemon ledgers (the
             * synthesizer runs in that daemon).
             * @type {string}
             */
            goldenPathRouteAttributionLedgerDirProd: leaf(path.resolve(planeDataRoot, 'orchestrator-daemon/route-attribution'), 'NEO_GOLDEN_PATH_ROUTE_ATTRIBUTION_LEDGER_DIR', 'string', {planeMember: true}),
            /**
             * Unit-test ledger directory — under the OS temp root so test-mode emits stay off the production
             * `.neo-ai-data` path. Declarative leaf; test-mode resolved by construction via the formula below.
             * @type {string}
             */
            goldenPathRouteAttributionLedgerDirTest: leaf(path.join(os.tmpdir(), 'neo-route-attribution-test'), 'NEO_GOLDEN_PATH_ROUTE_ATTRIBUTION_LEDGER_DIR_TEST', 'string'),
            /**
             * Keep-most-recent retention cap for the route-attribution ledger. Read at the boundary and passed
             * into the pure helper (which owns no default — a forgotten policy is visibly unbounded growth,
             * never a silent helper magic number).
             * @type {number}
             */
            goldenPathRouteAttributionLedgerMaxEvents: leaf(5000, 'NEO_GOLDEN_PATH_ROUTE_ATTRIBUTION_LEDGER_MAX_EVENTS', 'number'),
            /**
             * Byte threshold that arms the amortized keep-most-recent prune on append for the route-attribution ledger.
             * @type {number}
             */
            goldenPathRouteAttributionLedgerPruneTriggerBytes: leaf(2 * 1024 * 1024, 'NEO_GOLDEN_PATH_ROUTE_ATTRIBUTION_LEDGER_PRUNE_TRIGGER_BYTES', 'number'),
            /**
             * The Hebbian decay factor applied every 24 hours to the edge graph (e.g., 0.98 for ~79 day half-life).
             * @type {number}
             */
            decayFactor: leaf(0.98, 'NEO_GRAPH_DECAY_FACTOR', 'number'),
            /**
             * Minimum weight threshold for emitting `[GUIDE_GAP]`, `[EXAMPLE_GAP]`, and `[ORPHAN_CONCEPT]`
             * signals on CONCEPT nodes during `GapInferenceEngine.inferConceptGraphGaps`.
             *
             * **Derivation:** `ConceptService.calculateWeight` returns `tier_score + uniqueness + coverage_deficit`
             * where tier-1 gets `0.8`, tier-2 `0.5`, tier-3 `0.3`; uniqueness adds `0.2`; coverage deficit (no
             * EXPLAINED_BY) adds `0.3`. The minimum a tier-1 concept can score is `0.8` (covered, non-unique).
             * Setting threshold = `0.8` means *"at least tier-1 baseline priority"* — every tier-1 concept
             * without a guide qualifies; tier-2/3 concepts qualify only if uniqueness + deficit push them above.
             *
             * Tune up to silence tier-2/3 noise as ontology grows; tune down to surface
             * lower-priority concepts in the handoff.
             * @type {number}
             */
            guideGapWeightThreshold: leaf(0.8, 'NEO_GUIDE_GAP_WEIGHT_THRESHOLD', 'number'),
            /**
             * Cycle-scoped Neural Link action digest tuning. The digest reads recent
             * `nl_action_log` sequences and emits weak `NL_ACTION_SEQUENCE -> VALIDATES`
             * evidence without removing `[TEST_GAP]`. Leaves stay in AiConfig so the REM
             * pipeline can tune freshness, volume, success gate, and weak edge strength
             * without re-deriving constants in `GapInferenceEngine`.
             * @type {number}
             */
            nlActionDigestLookbackMs: leaf(14 * DAY_MS, 'NEO_NL_ACTION_DIGEST_LOOKBACK_MS', 'number'),
            /**
             * Maximum recent Neural Link action sequences inspected per digest pass.
             * @type {number}
             */
            nlActionDigestSequenceLimit: leaf(1000, 'NEO_NL_ACTION_DIGEST_SEQUENCE_LIMIT', 'number'),
            /**
             * Minimum successful-action ratio for a sequence to qualify as weak evidence.
             * @type {number}
             */
            nlActionDigestMinSuccessRate: leaf(0.8, 'NEO_NL_ACTION_DIGEST_MIN_SUCCESS_RATE', 'number'),
            /**
             * Decaying graph-edge weight for weak Neural Link runtime-interaction evidence.
             * Permanent Playwright evidence remains stronger (`1.0`).
             * @type {number}
             */
            nlActionDigestEvidenceWeight: leaf(0.35, 'NEO_NL_ACTION_DIGEST_EVIDENCE_WEIGHT', 'number'),
            /**
             * Operator-tuning knobs for `ConceptDiscoveryService`. Both values are read live
             * at method-call time (not captured at module load) so tests + runtime overrides are honored.
             *
             * - `prScanLimit`: how many pull-request markdown files to process per discovery cycle.
             *   PRs are sorted descending by PR number so the most-recent (freshest architectural
             *   discourse) process first. Capping bounds per-cycle LLM cost against the ~300+ PR corpus.
             * - `minSourceLength`: minimum source text length (chars) to trigger an LLM extraction call.
             *   Short bodies aren't worth the provider round-trip; 200 ≈ 30 words of coherent prose.
             * - `messageHarvestBatchLimit`: maximum unharvested A2A MESSAGE nodes scanned per scheduled
             *   process/MX concept-harvest cycle.
             * - `messageHarvestTopN`: maximum frequency-ranked message terms promoted to the LLM
             *   Teaching-Test source for the cycle.
             * - `messageHarvestMinFrequency`: minimum subject/tag frequency before a message term can
             *   spend LLM budget.
             *
             * Expected to migrate to SDK-layer config once daemon/service ownership is split:
             * these are daemon concerns, not memory-core concerns.
             * @type {Object}
             */
            conceptDiscovery: {
                prScanLimit               : leaf(20, 'NEO_CONCEPT_DISCOVERY_PR_SCAN_LIMIT', 'number'),
                minSourceLength           : leaf(200, 'NEO_CONCEPT_DISCOVERY_MIN_SOURCE_LENGTH', 'number'),
                messageHarvestBatchLimit  : leaf(500, 'NEO_CONCEPT_DISCOVERY_MESSAGE_HARVEST_BATCH_LIMIT', 'number'),
                messageHarvestTopN        : leaf(20, 'NEO_CONCEPT_DISCOVERY_MESSAGE_HARVEST_TOP_N', 'number'),
                messageHarvestMinFrequency: leaf(2, 'NEO_CONCEPT_DISCOVERY_MESSAGE_HARVEST_MIN_FREQUENCY', 'number')
            },
            /**
             * Directory for the always-on Memory Core diagnostic log files. The MC server's
             * `logger.mjs` writes daily-rotated entries here regardless of `debug`, so long-
             * running operations (summarization, ingestion sweeps, ChromaDB lifecycle) leave
             * a tail-able diagnostic trail observable from the host shell.
             * Default: `<neoRootDir>/.neo-ai-data/logs/` — shared with the KB and Neural
             * Link servers (each uses a distinct filename prefix: `mc-server-`, `kb-server-`,
             * `nl-server-`). Per-server file isolation, single tailable directory.
             * @type {string}
             */
            logPath: leaf(path.resolve(planeDataRoot, 'logs'), 'NEO_MEMORY_LOG_PATH', 'string', {planeMember: true}),
            /**
             * @summary Retention policy for Memory Core MCP diagnostic log files.
             *
             * The shared logger applies this policy only to files matching the `mc-server`
             * prefix in `logPath`. `maxFiles` and `maxTotalBytes` count historical files;
             * the active current-day file is always preserved. Set `enabled=false` to
             * delegate retention entirely to deployment infrastructure.
             * @type {Object}
             */
            loggerRetention: {
                enabled      : leaf(true, 'NEO_MEMORY_LOG_RETENTION_ENABLED', 'boolean'),
                maxAgeDays   : leaf(14, 'NEO_MEMORY_LOG_RETENTION_MAX_AGE_DAYS', 'number'),
                maxFiles     : leaf(30, 'NEO_MEMORY_LOG_RETENTION_MAX_FILES', 'number'),
                maxTotalBytes: leaf(100 * 1024 * 1024, 'NEO_MEMORY_LOG_RETENTION_MAX_TOTAL_BYTES', 'number')
            },
            /**
             * @summary Shared MCP logger policy for Memory Core.
             *
             * Always-on file sink plus debug-gated stderr. `flush: true` preserves the
             * short-lived script contract used by Sandman and other immediate-exit paths.
             * @type {Object}
             */
            logger: leaf({
                filePrefix    : 'mc-server',
                fileSink      : true,
                flush         : true,
                stderrMode    : 'debug',
                timestampStyle: 'plain'
            }),
            /**
             * Mailbox substrate behavior configuration.
             *
             * Deployment-tier selectors for the A2A mailbox service. The A2A primitives
             * themselves (Message nodes, SENT_BY / SENT_TO edges, CAN_REPLY_TO permission
             * edges, PermissionService.grantPermission / revokePermission / listPermissions)
             * remain unconditionally live regardless of these selectors — this block only
             * tunes default enforcement policy to match deployment reality.
             *
             * @type {Object}
             */
            mailbox: {
                /**
                 * Default reply policy for non-broadcast DMs. Controls whether `addMessage`
                 * to a specific AgentIdentity target requires a prior `CAN_REPLY_TO` grant
                 * or reachable-counterparty trust-lift, or accepts any authenticated sender
                 * as a peer.
                 *
                 * - `'blocked'` — strict-isolation default policy. Suited for multi-user /
                 *   multi-tenant Memory Core deployments and mixed-trust-tier installations
                 *   where cross-tenant boundaries must be enforced at the substrate.
                 *   Cross-tenant reach requires explicit `CAN_REPLY_TO` grants. Reachable-
                 *   counterparty trust-lift relaxes the bootstrap once any broadcast or
                 *   direct message has flowed between the pair.
                 *
                 * - `'open'` — peer-trust mode. Suited for homogeneous trusted-frontier
                 *   swarms where every authenticated identity is a peer owned by the same
                 *   operator (e.g. local development with Claude + Gemini + future frontier
                 *   models). Eliminates the first-message bootstrap tax. `CAN_REPLY_TO`
                 *   edges still queryable via `grant_permission` / `list_permissions`;
                 *   enforcement simply skips the check.
                 *
                 * Does NOT weaken read-path scoping — `CAN_READ_INBOX_OF`,
                 * `CAN_READ_MEMORIES_OF`, `CAN_READ_SESSIONS_OF` remain strict regardless
                 * of this setting. Reading someone's inbox is categorically different
                 * from sending them a message; asymmetric treatment is intentional.
                 *
                 * Library default is `'open'`; multi-user / multi-tenant deployments
                 * override to `'blocked'` in their `config.mjs` as part of installation,
                 * or via the `NEO_MAILBOX_DEFAULT_REPLY_POLICY` environment variable.
                 *
                 * @type {'blocked'|'open'}
                 */
                defaultReplyPolicy: leaf('open', 'NEO_MAILBOX_DEFAULT_REPLY_POLICY', 'string')
            },
            /**
             * Memory sharing policy for multi-tenant isolation.
             *
             * Defines the retrieval scope for query_raw_memories and query_summaries:
             * - 'private': strict tenant isolation. Only caller's owned rows.
             * - 'team': team-wide context sharing for tagged records.
             * - 'legacy': migration-window compatibility for pre-tenant-aware data.
             *
             * Invalid environment variables (NEO_MEMORY_SHARING_DEFAULT_POLICY) will
             * fail loudly on boot rather than silently weakening isolation.
             *
             * @type {Object}
             */
            memorySharing: {
                /**
                 * Default memory-sharing tenant policy.
                 * - `team` (default): deployment-wide read — every maintainer in this deployment
                 *   reads every maintainer's raw memories AND summaries (transparent swarm
                 *   introspection). The Chroma collection is the deployment boundary.
                 * - `legacy`: caller's own + untagged + `SHARED_USER_ID`-tagged records.
                 * - `private`: caller's own records only.
                 * Multi-tenant SaaS deployments that co-locate multiple orgs in one collection MUST
                 * override to `private` via `NEO_MEMORY_SHARING_DEFAULT_POLICY`.
                 * @type {'legacy'|'private'|'team'}
                 */
                defaultPolicy: leaf('team', 'NEO_MEMORY_SHARING_DEFAULT_POLICY', 'string', {parse: parseMemorySharingPolicy})
            },
            /**
             * Target file path for the lazy backfill queue of unresolved provenance edges.
             * @type {string}
             */
            lazyEdgesQueuePath: leaf(path.resolve(planeDataRoot, 'memory-core/lazy-edges.jsonl'), 'NEO_LAZY_EDGES_QUEUE_PATH', 'string', {planeMember: true})
        },
        /**
         * Reactive computed config values (`Neo.state.Provider` formulas — recompute when a dependency changes).
         */
        formulas: {
            // The active graph SQLite path + memory/session/temporal-summary collection names, resolved
            // BY CONSTRUCTION from the effective `useTestDatabase` formula. Consumers read `AiConfig.storagePaths.graph` /
            // `collections.memory` / `collections.session` / `collections.temporalSummary` unchanged —
            // the single resolution point. Replaces the prior inline-`process.env` leaf ternaries.
            'storagePaths.useTestDatabase': data => data.storagePaths.useUnitTestDatabase || data.storagePaths.useTestHarness,
            'storagePaths.graph'          : data => data.storagePaths.useTestDatabase ? data.storagePaths.graphTest          : data.storagePaths.graphProd,
            'collections.memory'          : data => data.collections.useTestDatabase || data.storagePaths.useTestHarness ? data.collections.memoryTest          : data.collections.memoryProd,
            'collections.session'         : data => data.collections.useTestDatabase || data.storagePaths.useTestHarness ? data.collections.sessionTest         : data.collections.sessionProd,
            'collections.temporalSummary' : data => data.collections.useTestDatabase || data.storagePaths.useTestHarness ? data.collections.temporalSummaryTest : data.collections.temporalSummaryProd,
            'memoryWal.dir'               : data => data.memoryWal.useTestDatabase || data.storagePaths.useTestHarness ? data.memoryWal.dirTest : data.memoryWal.dirProd,
            'messageWal.dir'              : data => {
                const configuredDir = data.messageWal.useTestDatabase || data.storagePaths.useTestHarness ?
                    data.messageWal.dirTest : data.messageWal.dirProd;
                if (configuredDir) return configuredDir;

                const memoryWalDir = data.memoryWal.useTestDatabase || data.storagePaths.useTestHarness ?
                    data.memoryWal.dirTest : data.memoryWal.dirProd;
                return path.join(memoryWalDir, 'messages');
            },
            // The active handoff path follows the effective unit-or-Playwright storage selector.
            'handoffFilePath': data => data.storagePaths.useTestDatabase ? data.handoffFilePathTest : data.handoffFilePathProd,
            // The active route-attribution ledger dir follows the same test-storage selector.
            'goldenPathRouteAttributionLedgerDir': data => data.storagePaths.useTestDatabase ? data.goldenPathRouteAttributionLedgerDirTest : data.goldenPathRouteAttributionLedgerDirProd,
            // Wake-daemon watermark paths: explicit override leaf when set, else derived from the
            // RESOLVED daemon dataDir — the cascade the prior module-scope env read provided at
            // load time, now reactive (relocating `wakeDaemon.dataDir` moves both watermarks).
            'wakeDaemon.bridgeLastSyncIdPath'          : data => data.wakeDaemon.bridgeLastSyncIdPathOverride ?? path.join(data.wakeDaemon.dataDir, 'lastSyncId'),
            'wakeDaemon.wakeSubscriptionLiveCursorPath': data => data.wakeDaemon.wakeSubscriptionLiveCursorPathOverride ?? path.join(data.wakeDaemon.dataDir, 'wakeSubscriptionLiveCursor')
        }
    }
}

/**
 * @summary The plane-member paths this server claims — the enumerable input for the
 * F-invariant's member-coherence clause (`assertPlaneMemberCoherence`), asserted at boot
 * by `Server.getPlaneMembers()`. Prod-side leaves on purpose: test-mode formulas select
 * disposable paths by construction and are not plane members.
 */
export const PLANE_MEMBER_PATHS = Object.freeze([
    'datasets.rlaif.trajectories',
    'remRunStateDir',
    // The plane's core durable artifact. Its default was previously cwd-anchored while every other member
    // derived from the plane anchor, so a different-cwd process (daemon, host CLI) resolved a path outside
    // the plane its siblings agreed on — and boot member-coherence never covered it.
    'storagePaths.graphProd',
    'memoryWal.dirProd',
    'memoryWal.daemonDataDir',
    'messageWal.daemonDataDir',
    'wakeDaemon.dataDir',
    'hookProjectionRoot',
    'goldenPathRouteAttributionLedgerDirProd',
    'logPath',
    'lazyEdgesQueuePath'
]);

export default Neo.setupClass(ConfigBase);
