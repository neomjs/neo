// Loads the Tier-1 realm root (Neo.ai.Config) so getParent() inheritance resolves in this process;
// MC reads no AiConfig values directly — they resolve via the chain, not a binding.
import '../../../config.template.mjs';
import path                                  from 'path';
import BaseConfig, {createConfigProxy, leaf} from '../../../BaseConfig.mjs';
import {fileURLToPath}                       from 'url';

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

const neoRootDir        = path.resolve(__dirname, '../../../../');
const cwd               = neoRootDir;
const aiDataRoot        = path.join(cwd, '.neo-ai-data');
const wakeDaemonDataDir = path.resolve(process.env.NEO_AI_DAEMON_DIR || path.join(aiDataRoot, 'wake-daemon'));
const DAY_MS            = 24 * 60 * 60 * 1000;

function hasEnvValue(name) {
    return process.env[name] !== undefined && process.env[name] !== null && process.env[name] !== '';
}

/**
 * @summary Configuration manager for the Memory Core MCP server.
 *
 * Supports loading configuration from a custom file and merging with defaults.
 *
 * @class Neo.ai.mcp.server.memory-core.Config
 * @extends Neo.ai.BaseConfig
 * @singleton
 */
class Config extends BaseConfig {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.Config'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.Config',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
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
             * @summary Canonical Agent OS runtime data root for Memory Core-owned files.
             *
             * Defaults to `<neoRootDir>/.neo-ai-data`; setting `NEO_AI_DATA_ROOT` relocates
             * graph SQLite, wake-daemon watermarks, REM state, logs, and datasets together
             * without requiring each sibling path to be overridden separately.
             * @type {string}
             */
            aiDataRoot: leaf(aiDataRoot, 'NEO_AI_DATA_ROOT', 'string'),
            /**
             * Global debug flag for all MCP servers.
             * @type {boolean}
             */
            debug: leaf(false, 'NEO_DEBUG', 'boolean'),
            /**
             * Transport protocol for the MCP server ('stdio' or 'sse').
             * @type {string}
             */
            transport: leaf('stdio', 'NEO_TRANSPORT', 'string'),
            /**
             * Port the MCP server's HTTP/SSE transport listens on (only used when `transport === 'sse'`).
             *
             * Operator env var: `MCP_HTTP_PORT`.
             * @type {number}
             */
            mcpHttpPort: leaf(3001, 'MCP_HTTP_PORT', 'port'),
            /**
             * Optional public canonical URL for this MCP server.
             * When configured, this URL is explicitly used as the resource indicator
             * for OAuth 2.1 / OIDC audience claims and SSE callback advertising.
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
             * Optional Express middleware function for authentication (only used if transport is 'sse').
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
             * Maximum number of concurrent session summarization requests.
             * Prevents hitting LLM/Embedding API rate limits during bulk operations.
             * @type {number}
             */
            summarizationConcurrency: leaf(5),
            /**
             * The target Storage Architecture to use.
             * Note: Chroma is the only supported Vector DB.
             * Options: 'hybrid' (Chroma vectors + SQLite graph), 'chroma' (Chroma vectors only).
             * The default is explicitly 'hybrid' for the two-pillar RAG architecture.
             */
            engine: leaf('hybrid'),
            /**
             * Physical file paths for embedded/local datasets.
             */
            storagePaths: {
                graph: leaf(process.env.UNIT_TEST_MODE === 'true' ? ':memory:' : path.join(aiDataRoot, 'sqlite', 'memory-core-graph.sqlite'), 'NEO_MEMORY_DB_PATH', 'string')
            },
            /**
             * Durable wake-daemon watermarks consumed by GraphLog maintenance.
             */
            wakeDaemon: {
                dataDir: leaf(wakeDaemonDataDir, 'NEO_AI_DAEMON_DIR', 'string'),
                bridgeLastSyncIdPath: leaf(path.join(wakeDaemonDataDir, 'lastSyncId'), 'NEO_BRIDGE_LAST_SYNC_ID_PATH', 'string'),
                wakeSubscriptionLiveCursorPath: leaf(path.join(wakeDaemonDataDir, 'wakeSubscriptionLiveCursor'), 'NEO_AI_WAKE_SUBSCRIPTION_CURSOR_FILE', 'string')
            },
            /**
             * Data Schema/Table Names
             * This defines WHAT the tables/collections are called logically.
             */
            collections: {
                memory : leaf(process.env.UNIT_TEST_MODE === 'true' ? `test-memory-${Date.now()}-${Math.random().toString(36).substring(7)}` : 'neo-agent-memory', 'NEO_MEMORY_COLLECTION_NAME', 'string'),
                session: leaf(process.env.UNIT_TEST_MODE === 'true' ? `test-session-${Date.now()}-${Math.random().toString(36).substring(7)}` : 'neo-agent-sessions', 'NEO_SESSION_COLLECTION_NAME', 'string'),
                graph  : leaf('neo-native-graph', 'NEO_GRAPH_COLLECTION_NAME', 'string')
            },
            /**
             * Datasets Schema/Paths
             * This defines WHERE autonomous curation exports data.
             */
            datasets: {
                rlaif: {
                    trajectories: leaf(path.join(aiDataRoot, 'datasets', 'rlaif', 'trajectories.jsonl'), 'NEO_RLAIF_PATH', 'string')
                }
            },
            /**
             * Directory for per-cycle REM run/stage JSONL state artifacts.
             * @type {string}
             */
            remRunStateDir: leaf(path.join(aiDataRoot, 'rem-runs'), 'NEO_REM_RUN_STATE_DIR', 'string'),
            /**
             * Number of recent REM cycles projected by `get_rem_pipeline_state`.
             * @type {number}
             */
            remRunRecentLimit: leaf(5, 'NEO_REM_RUN_RECENT_LIMIT', 'number'),
            /**
             * Target markdown file used for autonomous agent-to-user reporting (offline jobs).
             * @type {string}
             */
            handoffFilePath: leaf(path.resolve(cwd, 'resources/content/sandman_handoff.md')),
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
            goldenPathStaleAssignmentRenderLimit: leaf(20, 'NEO_GOLDEN_PATH_STALE_ASSIGNMENT_RENDER_LIMIT', 'number'),
            /**
             * Maximum recent open PR rows rendered inside `Active PR Cycle State`.
             * @type {number}
             */
            goldenPathRecentOpenPrRenderLimit: leaf(5, 'NEO_GOLDEN_PATH_RECENT_OPEN_PR_RENDER_LIMIT', 'number'),
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
             * Operator-tuning knobs for `ConceptDiscoveryService`. Both values are read live
             * at method-call time (not captured at module load) so tests + runtime overrides are honored.
             *
             * - `prScanLimit`: how many pull-request markdown files to process per discovery cycle.
             *   PRs are sorted descending by PR number so the most-recent (freshest architectural
             *   discourse) process first. Capping bounds per-cycle LLM cost against the ~300+ PR corpus.
             * - `minSourceLength`: minimum source text length (chars) to trigger an LLM extraction call.
             *   Short bodies aren't worth the provider round-trip; 200 ≈ 30 words of coherent prose.
             *
             * Expected to migrate to SDK-layer config once daemon/service ownership is split:
             * these are daemon concerns, not memory-core concerns.
             * @type {Object}
             */
            conceptDiscovery: {
                prScanLimit    : leaf(20, 'NEO_CONCEPT_DISCOVERY_PR_SCAN_LIMIT', 'number'),
                minSourceLength: leaf(200, 'NEO_CONCEPT_DISCOVERY_MIN_SOURCE_LENGTH', 'number')
            },
            /**
             * Bundle retention policy for `ai/scripts/maintenance/backup.mjs`. Bundles older
             * than `maxDays` are eligible for deletion, but the newest `keepMinimum` bundles
             * are retained unconditionally regardless of age. Defaults preserve the historical
             * `K=3, N_DAYS=30` behavior so existing deployments are unaffected without
             * operator action.
             * @type {{keepMinimum: number, maxDays: number}}
             */
            backupRetention: leaf({
                keepMinimum: 3,
                maxDays    : 30
            }),
            /**
             * Directory for the always-on Memory Core diagnostic log files. The MC server's
             * `logger.mjs` writes daily-rotated entries here regardless of `debug`, so long-
             * running operations (summarization, ingestion sweeps, ChromaDB lifecycle) leave
             * a tail-able diagnostic trail observable from the host shell.
             * Default: `<aiDataRoot>/logs/` — shared with the KB and Neural
             * Link servers (each uses a distinct filename prefix: `mc-server-`, `kb-server-`,
             * `nl-server-`). Per-server file isolation, single tailable directory.
             * @type {string}
             */
            logPath: leaf(path.join(aiDataRoot, 'logs')),
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
                 * @type {'legacy'|'private'|'team'}
                 */
                defaultPolicy: {env: 'NEO_MEMORY_SHARING_DEFAULT_POLICY', default: 'legacy', parse: parseMemorySharingPolicy}
            },
            /**
             * Target file path for the lazy backfill queue of unresolved provenance edges.
             * @type {string}
             */
            lazyEdgesQueuePath: leaf(path.resolve(cwd, 'ai/data/memory-core/lazy-edges.jsonl'), 'NEO_LAZY_EDGES_QUEUE_PATH', 'string')
        }
    };

    /**
     * @summary Keeps Memory Core-owned path defaults aligned with the resolved
     * shared AI data root while preserving narrower env overrides.
     *
     * @param {String} leafPath Env-applied leaf path.
     * @param {String} value Resolved Agent OS data root.
     * @returns {void}
     */
    afterApplyEnvLeaf(leafPath, value) {
        if (leafPath !== 'aiDataRoot') return;
        if (!value) return;

        const wakeDataDir = path.resolve(hasEnvValue('NEO_AI_DAEMON_DIR')
            ? process.env.NEO_AI_DAEMON_DIR
            : path.join(value, 'wake-daemon'));

        if (!hasEnvValue('NEO_MEMORY_DB_PATH') && process.env.UNIT_TEST_MODE !== 'true') {
            this.setData('storagePaths.graph', path.join(value, 'sqlite', 'memory-core-graph.sqlite'));
        }
        if (!hasEnvValue('NEO_AI_DAEMON_DIR')) {
            this.setData('wakeDaemon.dataDir', wakeDataDir);
        }
        if (!hasEnvValue('NEO_BRIDGE_LAST_SYNC_ID_PATH')) {
            this.setData('wakeDaemon.bridgeLastSyncIdPath', path.join(wakeDataDir, 'lastSyncId'));
        }
        if (!hasEnvValue('NEO_AI_WAKE_SUBSCRIPTION_CURSOR_FILE')) {
            this.setData('wakeDaemon.wakeSubscriptionLiveCursorPath', path.join(wakeDataDir, 'wakeSubscriptionLiveCursor'));
        }
        if (!hasEnvValue('NEO_RLAIF_PATH')) {
            this.setData('datasets.rlaif.trajectories', path.join(value, 'datasets', 'rlaif', 'trajectories.jsonl'));
        }
        if (!hasEnvValue('NEO_REM_RUN_STATE_DIR')) {
            this.setData('remRunStateDir', path.join(value, 'rem-runs'));
        }

        this.setData('logPath', path.join(value, 'logs'));
    }
}
const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
