import path                                  from 'path';
import {fileURLToPath}                       from 'url';
import ConfigProvider, {createConfigProxy, leaf} from './ConfigProvider.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../');
// Fallback to neoRootDir if cwd is root (e.g., container/daemon edge cases)
const projectRoot = process.cwd() === '/' ? neoRootDir : process.cwd();

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS  = 24 * HOUR_MS;

/**
 * @class Neo.ai.Config
 * @extends Neo.ai.ConfigProvider
 * @singleton
 */
class Config extends ConfigProvider {
    static config = {
        /**
         * @member {String} className='Neo.ai.Config'
         * @protected
         */
        className: 'Neo.ai.Config',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * Top-level meta-leaf configuration tree (Tier 1).
         * Defines the core immutable plain-data structures applied universally across all AI/MCP infrastructure.
         * Each leaf owns a `default` plus optional `env` (variable name) and `type` (selecting the env decoder + validator).
         * @member {Object} data
         */
        data: {
            neoRootDir : leaf(neoRootDir),
            projectRoot: leaf(projectRoot),
            /**
             * Universal JSONL backup/export directory for Agent OS databases.
             * @type {string}
             */
            backupPath: leaf(path.resolve(neoRootDir, '.neo-ai-data/backups'), 'NEO_BACKUP_PATH', 'string'),
            /**
             * Path to the wake-daemon liveness sentinel touched on every swarm-heartbeat
             * pulse. Operators / tests can isolate the path via `NEO_HEARTBEAT_ALIVE_PATH`.
             * @type {string}
             */
            wakeDaemonHeartbeatAlivePath: leaf(path.resolve(neoRootDir, '.neo-ai-data/wake-daemon/heartbeat.alive'), 'NEO_HEARTBEAT_ALIVE_PATH', 'string'),
            /**
             * Global debug flag for all AI processes.
             * @type {boolean}
             */
            debug: leaf(false, 'NEO_DEBUG', 'boolean'),
            /**
             * Transport protocol ('stdio' or 'sse').
             * @type {string}
             */
            transport: leaf('stdio', 'NEO_TRANSPORT', 'string'),
            /**
             * Optional public canonical URL.
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
             * Port the MCP server's HTTP/SSE transport listens on.
             * Sub-servers will typically override this with their own defaultPort.
             * @type {number}
             */
            mcpHttpPort: leaf(3000, 'MCP_HTTP_PORT', 'port'),
            /**
             * Optional Express middleware function for authentication.
             * @type {Function|null}
             */
            authMiddleware: leaf(null),
            /**
             * Base authentication configuration for the SSE / HTTP transport.
             *
             * `mode` selects the authorization strategy:
             * - `'oidc'` (default, production): OAuth 2.1 / OIDC bearer tokens validated via
             *   RFC 7662 introspection, with `aud` audience enforcement and Protected-Resource-
             *   Metadata advertisement.
             * - `'gitlab-pat'`: a GitLab Personal Access Token (`read_user` scope) presented as the
             *   bearer token, validated against `{gitlabApiBaseUrl}/api/v4/user`. No `aud` claim and
             *   no PRM advertisement (a naked `401` on failure) — the lighter path for clients that
             *   authenticate with a long-lived PAT from an env var instead of an OAuth dance.
             * @type {Object}
             */
            auth: {
                host              : leaf(null, 'NEO_AUTH_HOST', 'string'),
                port              : leaf(8080, 'NEO_AUTH_PORT', 'port'),
                realm             : leaf('master', 'NEO_AUTH_REALM', 'string'),
                issuerUrl         : leaf(null, 'NEO_AUTH_ISSUER_URL', 'string'),
                clientId          : leaf(null, 'NEO_OAUTH_CLIENT_ID', 'string'),
                clientSecret      : leaf('', 'NEO_OAUTH_CLIENT_SECRET', 'string'),
                trustProxyIdentity: leaf(false, 'NEO_AUTH_TRUST_PROXY_IDENTITY', 'boolean'),
                // Authorization strategy selector: 'oidc' (default) | 'gitlab-pat'. See block doc above.
                mode              : leaf('oidc', 'NEO_AUTH_MODE', 'string'),
                // GitLab API base URL used by 'gitlab-pat' mode for token validation (self-managed configurable).
                gitlabApiBaseUrl  : leaf('https://gitlab.com', 'NEO_AUTH_GITLAB_API_BASE_URL', 'string'),
                // Bounded TTL (seconds) for the per-token PAT validation cache → a revoked PAT clears within this window.
                patCacheTtlSeconds: leaf(300, 'NEO_AUTH_PAT_CACHE_TTL_SECONDS', 'number'),
                // Optional GitLab OAuth app binding for 'gitlab-pat' mode. Empty means no app gate.
                allowedClientIds  : leaf([], 'NEO_AUTH_ALLOWED_CLIENT_IDS', 'csv'),
                // Optional GitLab username allowlist for 'gitlab-pat' mode. Empty means any resolved GitLab user.
                allowedUsers      : leaf([], 'NEO_AUTH_ALLOWED_USERS', 'csv')
            },
            /**
             * @summary Deployment-wide chat / generation model provider.
             *
             * Tier-1 source of truth for model-consuming Agent OS lanes. Memory Core maps
             * this into its historical `modelProvider` key until runtime provider routing
             * converges on one canonical key. Supported values today: `gemini`,
             * `openAiCompatible`.
             * @type {String}
             */
            chatProvider: leaf('openAiCompatible', 'NEO_MODEL_PROVIDER', 'string'),
            /**
             * @summary Runtime alias for the active chat provider.
             *
             * Existing Memory Core consumers read `modelProvider`; keep the Tier-1
             * template aligned with `chatProvider` until provider routing converges on
             * one canonical key.
             * @type {String}
             */
            modelProvider: leaf('openAiCompatible', 'NEO_MODEL_PROVIDER', 'string'),
            /**
             * @summary Provider selector for Dream/Sandman graph-generation work.
             *
             * Graph extraction deliberately does not use the generic chat provider axis:
             * chat/summarization may use Gemini, while graph-generation dispatch only
             * supports native Ollama or OpenAI-compatible endpoints. Defaults to the
             * OpenAI-compatible graph route; set `NEO_GRAPH_PROVIDER=ollama` for
             * deployments that run graph extraction against native Ollama.
             * @type {'ollama'|'openAiCompatible'}
             */
            graphProvider: leaf('openAiCompatible', 'NEO_GRAPH_PROVIDER', 'string'),
            /**
             * @summary Deployment-wide embedding provider selector.
             *
             * Shared by Memory Core embedding consumers and Knowledge Base ingestion
             * paths.
             * @type {String}
             */
            embeddingProvider: leaf('openAiCompatible', 'NEO_EMBEDDING_PROVIDER', 'string'),
            /**
             * @summary Deployment-wide Ollama provider defaults.
             *
             * These are configuration defaults only. Native Ollama dispatch is enabled by
             * runtime provider adapters that explicitly select the `ollama` provider.
             * @type {Object}
             */
            ollama: {
                host                 : leaf('http://127.0.0.1:11434', 'NEO_OLLAMA_HOST', 'string'),
                model                : leaf('gemma4:31b', 'NEO_OLLAMA_MODEL', 'string'),
                embeddingModel       : leaf('qwen3-embedding', 'NEO_OLLAMA_EMBEDDING_MODEL', 'string'),
                keep_alive           : leaf(-1, 'NEO_OLLAMA_KEEP_ALIVE', 'keepAlive'),
                requireParallelModels: leaf(2, 'NEO_OLLAMA_REQUIRE_PARALLEL_MODELS', 'number')
            },
            /**
             * @summary Deployment-wide OpenAI-compatible provider defaults.
             *
             * Covers MLX, LM Studio, Ollama's OpenAI-compatible surface, llama.cpp, and
             * managed OpenAI-compatible endpoints.
             * @type {Object}
             */
            openAiCompatible: {
                host                    : leaf('http://127.0.0.1:11434', 'NEO_OPENAI_COMPATIBLE_HOST', 'string'),
                model                   : leaf('gemma-4-31b-it', 'NEO_OPENAI_COMPATIBLE_MODEL', 'string'),
                embeddingModel          : leaf('text-embedding-qwen3-embedding-8b', 'NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL', 'string'),
                apiKey                  : leaf('', 'NEO_OPENAI_COMPATIBLE_API_KEY', 'string'),
                unloadRetryCount        : leaf(3, 'NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_COUNT', 'number'),
                unloadRetryDelayMs      : leaf(500, 'NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_DELAY_MS', 'number'),
                contentionRetryCount    : leaf(2, 'NEO_OPENAI_COMPATIBLE_CONTENTION_RETRY_COUNT', 'number'),
                contentionRetryDelayMs  : leaf(1000, 'NEO_OPENAI_COMPATIBLE_CONTENTION_RETRY_DELAY_MS', 'number'),
                contentionTimeoutMs     : leaf(15000, 'NEO_OPENAI_COMPATIBLE_CONTENTION_TIMEOUT_MS', 'number'),
                batchEmbeddingChunkSize: leaf(5, 'NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_CHUNK_SIZE', 'number'),
                batchEmbeddingYieldMs   : leaf(0, 'NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_YIELD_MS', 'number'),
                keep_alive              : leaf(-1, 'NEO_OPENAI_COMPATIBLE_KEEP_ALIVE', 'keepAlive'),
                requireParallelModels   : leaf(2, 'NEO_OPENAI_COMPATIBLE_REQUIRE_PARALLEL_MODELS', 'number')
            },
            /**
             * @summary Local-model role-keyed context limits.
             *
             * The context-window axis for local-inference consumers is **model-role**
             * (chat vs embedding), not provider-namespace. Remote providers (Gemini and
             * future API-only endpoints) are API-bound — operators have no control over
             * their context cap, so these knobs do not apply. Local providers
             * (`openAiCompatible`, `ollama`) share these caps regardless of which serves
             * the role, because the practical limit comes from the loaded model, not
             * from the provider transport.
             *
             * Consumers read by model-role:
             * - Chat-path consumers (graph extraction, session summary) → `localModels.chat.*`
             * - Embedding-path consumers (Memory Core embedding, KB ingestion) → `localModels.embedding.*`
             *
             * @type {Object}
             */
            localModels: {
                /**
                 * @summary Chat-model context limits in tokens.
                 *
                 * Tuned for `gemma-4-31b-it` (native 256K context). Operators serving
                 * smaller chat models should pin this to the actual loaded-model capacity;
                 * `ConsumerFrictionHelper.invokeWithGuardrail` uses these values to fire
                 * the upstream pre-check skip (emits `'context-overflow'` /
                 * `'size-precheck-skip'` friction) when composed input exceeds the safe
                 * processing band.
                 *
                 * `safeProcessingLimitTokens` is the explicit ~76% headroom band — leaves
                 * ~62K tokens for system-prompt envelope + LLM response generation. Explicit
                 * value avoids implicit `0.75 × cap` derivation drift if the cap moves.
                 *
                 * Env overrides: `NEO_LOCAL_MODELS_CHAT_CONTEXT_LIMIT_TOKENS`,
                 * `NEO_LOCAL_MODELS_CHAT_SAFE_PROCESSING_LIMIT_TOKENS`.
                 *
                 * @type {Object}
                 */
                chat: {
                    contextLimitTokens       : leaf(262144, 'NEO_LOCAL_MODELS_CHAT_CONTEXT_LIMIT_TOKENS', 'number'),
                    safeProcessingLimitTokens: leaf(200000, 'NEO_LOCAL_MODELS_CHAT_SAFE_PROCESSING_LIMIT_TOKENS', 'number')
                },
                /**
                 * @summary Embedding-model context limits in tokens.
                 *
                 * Tuned for the default OpenAI-compatible embedding model
                 * `text-embedding-qwen3-embedding-8b`, whose upstream Qwen model card
                 * advertises a 32K context window. Operators serving smaller embedding
                 * models must pin this to the actual loaded-model capacity.
                 *
                 * `safeProcessingLimitTokens` is the explicit 28K operational band —
                 * large enough for file-scale KB / Memory Core ingestion while leaving a
                 * 4K-token margin below the advertised model maximum.
                 *
                 * Env overrides: `NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS`,
                 * `NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS`.
                 *
                 * @type {Object}
                 */
                embedding: {
                    contextLimitTokens       : leaf(32768, 'NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS', 'number'),
                    safeProcessingLimitTokens: leaf(28672, 'NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS', 'number')
                }
            },
            /**
             * @summary Deployment-wide Gemini model defaults.
             *
             * Memory Core still exposes these historical field names for Gemini-backed
             * summary and embedding paths; Tier-1 owns the default tuple.
             * @type {String}
             */
            modelName: leaf('gemini-3.5-flash'),
            /**
             * @summary Deployment-wide Gemini embedding model default.
             * @type {String}
             */
            embeddingModel: leaf('gemini-embedding-001'),
            /**
             * @summary Enforced vector dimension across shared vector collections.
             *
             * Hard-configured to prevent schema wipes when operators change embedding
             * providers. Gemini deployments must explicitly pair provider and dimension
             * overrides.
             * @type {Number}
             */
            vectorDimension: leaf(4096, 'NEO_VECTOR_DIMENSION', 'number'),
            /**
             * @summary Deployment-wide storage engine coordinates.
             *
             * `engines.chroma` is the unified Chroma topology: ONE daemon, ONE persist dir,
             * shared by Knowledge Base + Memory Core. `dataDir` is the fixed canonical persist dir
             * read by both server configs + the `defragChromaDB` maintenance script; the local
             * orchestrator launches the daemon against the same fixed path. The leaf is named `unified`
             * (identical local + cloud) — it holds every realm (KB + MC + graph + sessions), so a
             * realm-specific name would misrepresent the store. Collection NAMES remain server-local;
             * the persist DIR is unified.
             * @type {Object}
             */
            engines: {
                chroma: {
                    dataDir : leaf(path.resolve(neoRootDir, '.neo-ai-data/chroma/unified')),
                    host    : leaf('localhost', 'NEO_CHROMA_HOST', 'string'),
                    port    : leaf(8000, 'NEO_CHROMA_PORT', 'port'),
                    /**
                     * Chroma database selection — three declarative leaves, all SSOT-inline (config.template
                     * imports no config values):
                     *   - `database`        — the production DB name (literal).
                     *   - `databaseTest`    — the dedicated, droppable unit-test DB name (literal).
                     *   - `useTestDatabase` — the toggle, resolved from `UNIT_TEST_MODE` via the leaf's
                     *                         env-var argument (declarative — NOT an inline `process.env` read).
                     * The consumer (`ChromaManager`) reads the resolved toggle and picks `databaseTest` when
                     * true, else `database`. Both NAMES live in config, so the test path needs no env var the
                     * runner must remember to set — `npx playwright` without `npm run test-unit` still toggles
                     * to the test DB and CANNOT bleed unit collections into production by construction.
                     * `ChromaManager` additionally fails loud if the resolved DB equals `database` while the
                     * toggle is on (independent defense-in-depth). KB ChromaManager reads only host/port.
                     */
                    database       : leaf('default_database', 'NEO_CHROMA_DATABASE', 'string'),
                    databaseTest   : leaf('neo-unit-test', 'NEO_CHROMA_DATABASE_TEST', 'string'),
                    useTestDatabase: leaf(false, 'UNIT_TEST_MODE', 'boolean')
                }
            },
            /**
             * Agent OS maintenance orchestrator configuration.
             * @type {Object}
             */
            orchestrator: {
                /**
                 * Deployment profile for Agent OS maintenance ownership.
                 * `local` preserves maintainer-checkout behavior; `cloud` disables local-only
                 * maintenance lanes unless a narrower localOnly override opts them back in.
                 * @type {'local'|'cloud'}
                 */
                deploymentMode: leaf('local', 'NEO_AI_DEPLOYMENT_MODE', 'string'),
                /**
                 * Filesystem root under which tenant-repo mirrors are stored. The
                 * `deriveTenantRepoMirrorPath` helper appends `tenant-repos/<tenant>/<repo>`,
                 * so this value names the PARENT of that directory — typically
                 * `/app/.neo-ai-data` in containerized cloud deployments. Per-repo
                 * `tenantRepos[].mirrorRoot` overrides this value when present; absent
                 * per-repo overrides fall back through this Tier-1 default. Env override:
                 * `NEO_TENANT_REPO_MIRROR_ROOT`.
                 * @type {String}
                 */
                tenantRepoMirrorRoot: leaf('/app/.neo-ai-data', 'NEO_TENANT_REPO_MIRROR_ROOT', 'string'),
                /**
                 * Provider-readiness probe parameters consumed by the orchestrator dream task
                 * and the standalone Sandman CLI runner. The probe issues an HTTP GET against
                 * the resolved graph provider's `/api/tags` (Ollama) or `/v1/models`
                 * (OpenAI-compatible) endpoint, retrying `attempts` times with `delayMs`
                 * between retries, abandoning each probe after `timeoutMs`.
                 *
                 * Defaults are sized for a developer-laptop cold start (30 × 1s + 3s timeout
                 * per probe ≈ 2 min absolute ceiling). Cloud-deployment operators tune these
                 * via gitignored `ai/config.mjs` or the env vars below.
                 * @type {Object}
                 */
                providerReadiness: {
                    attempts : leaf(30, 'NEO_ORCHESTRATOR_PROVIDER_READY_ATTEMPTS', 'number'),
                    delayMs  : leaf(1000, 'NEO_ORCHESTRATOR_PROVIDER_READY_DELAY_MS', 'number'),
                    timeoutMs: leaf(3000, 'NEO_ORCHESTRATOR_PROVIDER_READY_TIMEOUT_MS', 'number')
                },
                /**
                 * Maintenance-loop intervals consumed by the orchestrator daemon.
                 * Env vars at the daemon boundary retain precedence over these defaults.
                 * @type {Object}
                 */
                intervals: {
                    pollMs                : leaf(3000, 'NEO_ORCHESTRATOR_POLL_INTERVAL_MS', 'number'),
                    summarySweepMs        : leaf(10 * 60 * 1000, 'NEO_ORCHESTRATOR_SUMMARY_SWEEP_INTERVAL_MS', 'number'),
                    kbSyncMs              : leaf(30 * 60 * 1000, 'NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS', 'number'),
                    backupMs              : leaf(DAY_MS, 'NEO_ORCHESTRATOR_BACKUP_INTERVAL_MS', 'number'),
                    graphLogCompactionMs  : leaf(DAY_MS, 'NEO_ORCHESTRATOR_GRAPHLOG_COMPACTION_INTERVAL_MS', 'number'),
                    primaryDevSyncMs      : leaf(10 * 60 * 1000, 'NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_INTERVAL_MS', 'number'),
                    tenantRepoSyncMs      : leaf(30 * 60 * 1000, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_INTERVAL_MS', 'number'),
                    dreamMs               : leaf(HOUR_MS, 'NEO_ORCHESTRATOR_DREAM_INTERVAL_MS', 'number'),
                    /**
                     * Fraction of `dreamMs` runtime that triggers completion-time cooldown for the
                     * next dream cycle. This is intentionally below the cycle-overflow telemetry
                     * signal: it prevents tight reacquire windows before a cycle exceeds the full
                     * cadence.
                     */
                    dreamOverflowThreshold: leaf(0.8, 'NEO_ORCHESTRATOR_DREAM_OVERFLOW_THRESHOLD', 'number'),
                    goldenPathMs          : leaf(HOUR_MS, 'NEO_ORCHESTRATOR_GOLDEN_PATH_INTERVAL_MS', 'number'),
                    /**
                     * Generic swarm-heartbeat / watchdog nudge cadence — the periodic pulse that fires a
                     * wake digest even with no new messages. Set to 20 min so the generic watchdog nudge
                     * sits in the operator's 20-30 min target, cutting wake noise. DIRECT actionable A2A
                     * wakes (review-request / REQUEST_CHANGES / task-state) stay event-driven and are NOT
                     * affected by this cadence — this slot is only the periodic pulse. The pulse cadence is
                     * a layer ABOVE the wake-coalescing window (the 300s digest-batching cap, an orthogonal
                     * mechanism), so widening it does not change coalescing semantics.
                     */
                    swarmHeartbeatMs      : leaf(20 * 60 * 1000, 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_INTERVAL_MS', 'number')
                },
                /**
                 * Chroma daemon recycle policy. The orchestrator kills and respawns the supervised
                 * Chroma daemon once its uptime exceeds `maxRuntimeMs`, then runs a unified-store-safe
                 * defrag against the fresh daemon. `0` disables recycling.
                 * Env override: `NEO_CHROMA_MAX_RUNTIME_MS`. The lane is gated by
                 * `localOnly.chromaDaemonEnabled` — a no-op when Chroma is externally managed.
                 * @type {Object}
                 */
                chroma: {
                    maxRuntimeMs: leaf(DAY_MS, 'NEO_CHROMA_MAX_RUNTIME_MS', 'number')
                },
                /**
                 * GraphLog compaction policy. The scheduled lane invokes the existing
                 * `compactGraphLog.mjs --apply` maintenance script; the script owns retention
                 * safety and cursor handling. `vacuum` stays explicit because SQLite VACUUM is
                 * heavier than logical GraphLog compaction and physically rewrites the DB file.
                 * @type {Object}
                 */
                graphLogCompaction: {
                    enabled: leaf(true, 'NEO_ORCHESTRATOR_GRAPHLOG_COMPACTION_ENABLED', 'boolean'),
                    vacuum : leaf(false, 'NEO_ORCHESTRATOR_GRAPHLOG_COMPACTION_VACUUM', 'boolean')
                },
                /**
                 * Swarm-heartbeat target-resolver config. Controls which identity set
                 * `SwarmHeartbeatService.pulse()` targets per cycle via the resolver
                 * precedence chain. Env override: `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGET_SOURCE`.
                 * Explicit list override (highest precedence):
                 * `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGETS` (comma-separated handles).
                 * @type {Object}
                 */
                swarmHeartbeat: {
                    /**
                     * Resolver source enum. Tracked default is `'active-a2a-participants'`:
                     * the pulse candidate set is auto-discovered from A2A `MESSAGE` activity
                     * within the last 3h (sibling to the per-identity `active` signal). This is
                     * per-MC-instance derived (no team-registry coupling), so external workspaces
                     * only ever see their own MC's activity — tenant-safe.
                     *
                     * Valid values: `'self'`, `'active-local-team'`, `'active-subscribers'`,
                     * `'active-a2a-participants'`, `'disabled'`. `null` falls through to
                     * `'self'` (deployment-portable code-side safety net).
                     *
                     * - `'self'` — pulse only the harness owner (`NEO_AGENT_IDENTITY`)
                     * - `'active-local-team'` — reads `identityRoots.mjs` Neo-team registry
                     * - `'active-subscribers'` — unions self with `WAKE_SUBSCRIPTION` nodes
                     * - `'active-a2a-participants'` — unions self with identities active in
                     *   A2A graph within last 3h (the default)
                     * - `'disabled'` — no pulse targets
                     *
                     * @type {'self'|'active-local-team'|'active-subscribers'|'active-a2a-participants'|'disabled'|null}
                     */
                    targetSource: leaf('active-a2a-participants', 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGET_SOURCE', 'string'),
                    /**
                     * Explicit comma-separated handle list override (highest resolver precedence).
                     * Raw string; the consumer (`Orchestrator.swarmHeartbeatExplicitTargets`) splits
                     * and trims. `null`/absent → resolver falls through to `targetSource` semantics.
                     * @type {String|null}
                     */
                    targets: leaf(null, 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGETS', 'string'),
                    /**
                     * Idle-out threshold (ms): a `WAKE_SUBSCRIPTION`-active agent whose latest
                     * `AGENT_MEMORY` is older than this is an `idle_out_candidate` for the bounded
                     * in-place heartbeat nudge. Read at the use site by the lifecycle detectors
                     * (`checkSunsetted.mjs`, `checkAllAgentIdle.mjs`). Bound to the
                     * `NEO_IDLE_THRESHOLD_MS` env name (NEO_ prefix convention).
                     * @type {Number}
                     */
                    idleThresholdMs: leaf(10 * 60 * 1000, 'NEO_IDLE_THRESHOLD_MS', 'number'),
                    /**
                     * Swarm wake cooldown TTL (seconds): minimum gap between swarm-wide
                     * all-agent-idle WAKE dispatches, enforced by `swarmWakeCooldown.mjs` to keep
                     * the heartbeat idempotent. Bound to the `NEO_SWARM_WAKE_COOLDOWN_SECONDS`
                     * env name (NEO_ prefix convention).
                     * @type {Number}
                     */
                    swarmWakeCooldownSeconds: leaf(600, 'NEO_SWARM_WAKE_COOLDOWN_SECONDS', 'number'),
                    /**
                     * Explicit override for the all-agent-idle CHECK set (`checkAllAgentIdle.mjs`) —
                     * the identities whose collective idleness triggers a swarm-wide wake. Distinct
                     * from `targets`/`targetSource` above (those choose pulse RECIPIENTS via the
                     * resolver): idle detection needs the registered active team, not the recently-
                     * A2A-active subset, so `null` resolves via `resolveTargets({targetSource:
                     * 'active-local-team'})` (deployment-portable `identityRoots` active maintainers,
                     * never a hardcoded roster). Bound to the `NEO_SWARM_IDENTITIES` env name.
                     * @type {String[]|null}
                     */
                    allIdleIdentities: leaf(null, 'NEO_SWARM_IDENTITIES', 'csv')
                },
                /**
                 * Local-only maintenance lane switches. Cloud deployments can disable these
                 * without changing remote graph-backed A2A / Memory Core behavior.
                 * `null` means "use the deployment profile default" (`local` enables,
                 * `cloud` disables); set `true` only when explicitly opting a lane back in.
                 * @type {Object}
                 */
                localOnly: {
                    primaryDevSyncEnabled          : leaf(null, 'NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED', 'boolean'),
                    kbSyncEnabled                  : leaf(null, 'NEO_ORCHESTRATOR_KB_SYNC_ENABLED', 'boolean'),
                    // Local profile may supervise a child Chroma process; cloud profile
                    // reaches the compose-owned `chroma` peer container instead.
                    chromaDaemonEnabled            : leaf(null, 'NEO_ORCHESTRATOR_CHROMA_DAEMON_ENABLED', 'boolean'),
                    bridgeDaemonEnabled            : leaf(null, 'NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED', 'boolean'),
                    // The embed daemon durably drains the add_memory WAL into the content store
                    // (ai/daemons/embed/daemon.mjs). Local profile supervises it as a child
                    // process; cloud deployments own their drain story per-container (mirror of
                    // the chromaDaemonEnabled split).
                    embedDaemonEnabled             : leaf(null, 'NEO_ORCHESTRATOR_EMBED_DAEMON_ENABLED', 'boolean'),
                    goldenPathRepoEnrichmentEnabled: leaf(null, 'NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED', 'boolean'),
                    // `null` = use the deployment-profile default (local enables, cloud disables);
                    // the swarm-heartbeat lane emits wake-substrate pulses through bridge delivery.
                    swarmHeartbeatEnabled          : leaf(null, 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED', 'boolean'),
                    // Reserved policy placeholder: no runtime consumer yet.
                    // `bridgeDaemonEnabled` is the active scheduler gate for desktop wake delivery.
                    wakeDispatchEnabled            : leaf(null)
                },
                /**
                 * Cloud-only maintenance lane switches (mirror of `localOnly` with inverted
                 * deployment-default: `null` means "use the deployment-profile default" —
                 * cloud enables, local disables. Set `true` only when explicitly opting a
                 * lane back in for the LOCAL profile (e.g. operator-side smoke testing of
                 * tenant-repo-sync without a cloud-profile container).
                 * @type {Object}
                 */
                cloudOnly: {
                    // Tenant-repo-sync is a cloud-deployable lane: cloud profile defaults enabled
                    // when tenant repos are configured; local Neo-maintainer profile defaults
                    // disabled unless explicitly opted in.
                    tenantRepoSyncEnabled: leaf(null, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_ENABLED', 'boolean')
                },
                /**
                 * Optional local Neo repo roots for the primary-dev-sync lane.
                 * Keep the template machine-neutral; set real absolute paths in gitignored
                 * `ai/config.mjs` or via `NEO_ORCHESTRATOR_DEV_SYNC_ROOTS`.
                 * @type {String[]}
                 */
                devSyncRoots: leaf([], 'NEO_ORCHESTRATOR_DEV_SYNC_ROOTS', 'string'),
                /**
                 * Tenant-repo-sync per-repo scheduling parameters.
                 *
                 * The cadence floor lives in `intervals.tenantRepoSyncMs` above (30min default).
                 * Per-repo cadence in `tenantRepos[].cadenceMs` (operator-set) overrides global.
                 *
                 * - `jitterRatio` caps the deterministic per-repo jitter offset as a fraction
                 *   of the base cadence. Default `0.20` keeps jitter within the operator-visible
                 *   cadence window.
                 *   Set `0` to disable jitter entirely (deterministic-cadence-only, no anti-
                 *   thundering-herd protection — only safe for low-tenant deployments).
                 * - `sweepCadenceMs` is the frequency at which the orchestrator wakes the
                 *   tenant-repo-sync task. Decoupled from per-repo cadence (`intervals.tenantRepoSyncMs`)
                 *   so deterministic jitter can actually spread per-repo sync attempts across
                 *   the jitter window. A short sweep cadence + a long per-repo cadence means
                 *   each sweep checks all repos against their individual due-times; repos
                 *   become due at different sweeps based on their deterministic jitter offset.
                 *
                 * @type {Object}
                 */
                tenantRepoSync: {
                    jitterRatio   : leaf(0.20, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_JITTER_RATIO', 'number'),
                    sweepCadenceMs: leaf(60 * 1000, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_SWEEP_CADENCE_MS', 'number')
                },
                /**
                 * Orchestrator-owned MLX inference server config. Operators tune via gitignored
                 * `ai/config.mjs` or env vars (`NEO_ORCHESTRATOR_MLX_ENABLED`,
                 * `NEO_ORCHESTRATOR_MLX_MODEL`, `NEO_ORCHESTRATOR_MLX_PORT`).
                 *
                 * - `enabled`: whether the orchestrator should supervise an `mlx_lm.server` child
                 *   process. Disabled by default because LM Studio / other OpenAI-compatible
                 *   providers already own the normal inference endpoint; enable only when this
                 *   orchestrator should own MLX directly.
                 * - `model`: Hugging Face repo id or local path for `mlx_lm.server --model`.
                 *   Distinct from the OpenAI-compatible API payload model label (`NEO_OPENAI_COMPATIBLE_MODEL`).
                 * - `port`: OpenAI-compatible local-inference port.
                 * @type {Object}
                 */
                mlx: {
                    enabled: leaf(false, 'NEO_ORCHESTRATOR_MLX_ENABLED', 'boolean'),
                    model  : leaf('mlx-community/gemma-4-31b-it-bf16', 'NEO_ORCHESTRATOR_MLX_MODEL', 'string'),
                    port   : leaf('11435', 'NEO_ORCHESTRATOR_MLX_PORT', 'string')
                },
                /**
                 * Orchestrator-owned LM Studio CLI (`lms`) inference server config. Operators
                 * tune via gitignored `ai/config.mjs` or env vars (`NEO_ORCHESTRATOR_LMS_ENABLED`,
                 * `NEO_ORCHESTRATOR_LMS_MODEL`, `NEO_ORCHESTRATOR_LMS_PORT`).
                 *
                 * Parallel alternative to `orchestrator.mlx` — both serve OpenAI-compatible HTTP
                 * for local chat + embedding workloads; pick at most one via the respective `enabled` flag.
                 *
                 * - `enabled`: whether the orchestrator should supervise an `lms server start`
                 *   child process. Enabled by default for local Agent OS chat + embedding roles;
                 *   **macOS-only** (LM Studio CLI is not
                 *   shipped for Linux containers, so this lane is local-dev substrate, not
                 *   cloud-deployment substrate).
                 * - `model`: legacy single-model field kept for existing operator overlays. The
                 *   orchestrator-managed `lms server start` lane pre-warms the configured
                 *   OpenAI-compatible models for roles actively routed through the
                 *   `openAiCompatible` provider via `lms load <model>` after server spawn.
                 *   Distinct from the OpenAI-compatible API payload label (`NEO_OPENAI_COMPATIBLE_MODEL`).
                 * - `port`: OpenAI-compatible local-inference port (LM Studio CLI default `1234`).
                 * @type {Object}
                 */
                lms: {
                    enabled: leaf(true, 'NEO_ORCHESTRATOR_LMS_ENABLED', 'boolean'),
                    model  : leaf('qwen3-embedding-8b', 'NEO_ORCHESTRATOR_LMS_MODEL', 'string'),
                    port   : leaf('1234', 'NEO_ORCHESTRATOR_LMS_PORT', 'string')
                }
            },
            /**
             * Agent OS maintenance policy shared by operator scripts and daemons.
             * @type {Object}
             */
            maintenance: leaf({
                /**
                 * Canonical atomic-bundle backup policy. Bundles remain atomic; per-substrate
                 * retention is intentionally not represented here.
                 * @type {Object}
                 */
                backup: {
                    intervalMs: DAY_MS,
                    retention: {
                        keepMinimum: 3,
                        maxDays    : 30
                    }
                },
                /**
                 * Chroma defrag policy. Cadence here is operator policy only — no daemon
                 * auto-spawns defrag from THIS value. The orchestrator's max-runtime recycle
                 * path can auto-spawn `ai:defrag-kb`, driven by `orchestrator.chroma.maxRuntimeMs`;
                 * that is a distinct config, not this cadence.
                 * @type {Object}
                 */
                defrag: {
                    intervalMs: 7 * DAY_MS,
                    snapshotRetention: {
                        keepMinimum: 3,
                        maxDays    : 7
                    }
                }
            }),
            /**
             * Knowledge Base operations configuration for cloud-native ingestion, reconciliation,
             * alerting, and garbage-collection policy.
             * @type {Object}
             */
            knowledgeBase: leaf({
                /**
                 * Operator alert rules. Each entry is
                 * `{metric, threshold, severity, channels, deliveryMode?}`. Empty by default —
                 * the alerting daemon no-ops with no rules.
                 * @type {Object[]}
                 */
                alertRules: [],
                /**
                 * Master opt-in for the KB operator-alerting daemon.
                 * Disabled by default; the daemon exits early when false.
                 * @type {Boolean}
                 */
                alertingEnabled: false,
                /**
                 * Alerting daemon poll interval in ms (default 15 min).
                 * @type {Number}
                 */
                alertingIntervalMs: 15 * 60 * 1000,
                /**
                 * Per-`(tenant, metric, severity, channel)` hysteresis
                 * cooldown window in ms (default 1 h).
                 * @type {Number}
                 */
                alertingCooldownMs: 60 * 60 * 1000,
                /**
                 * Rolling look-back window in ms for the per-tenant
                 * telemetry rollup the rule engine evaluates (default 1 h).
                 * @type {Number}
                 */
                alertWindowMs: 60 * 60 * 1000,
                /**
                 * Master opt-in for the KB reconciliation daemon.
                 * Disabled by default; the daemon exits early when false.
                 * @type {Boolean}
                 */
                reconciliationEnabled: false,
                /**
                 * Reconciliation daemon poll interval in ms (default 1 h).
                 * @type {Number}
                 */
                reconciliationIntervalMs: 60 * 60 * 1000,
                /**
                 * Opt-in for the destructive auto-tombstone reconciliation
                 * action. Disabled by default — the daemon then detects config-stale chunks and
                 * emits config-stale telemetry only, issuing no `collection.delete`.
                 * @type {Boolean}
                 */
                reconciliationAutoTombstone: false,
                /**
                 * Config-version-gap threshold above which a config-stale
                 * chunk becomes auto-tombstone-eligible: a chunk is actioned when
                 * `currentConfigVersion - chunk.tenantConfigVersion >= this`. Default `2` gives
                 * one full config epoch of grace. Consulted only when `reconciliationAutoTombstone`.
                 * @type {Number}
                 */
                reconciliationOrphanVersionGap: 2,
                /**
                 * Master opt-in for the KB garbage-collection daemon.
                 * Disabled by default; the daemon exits early when false.
                 * @type {Boolean}
                 */
                gcEnabled: false,
                /**
                 * GC daemon poll interval in ms (default 24 h).
                 * @type {Number}
                 */
                gcIntervalMs: 24 * 60 * 60 * 1000,
                /**
                 * Retention policy: `{maxAgeMs?, maxCount?}`. A chunk is
                 * retention-expired if it is older than `maxAgeMs` (by its `ingestedAt` stamp) OR
                 * ranks beyond the `maxCount` most-recent of its `{tenantId, repoSlug}` bucket.
                 * Empty `{}` (the default) expires nothing — conservative.
                 * @type {Object}
                 */
                gcRetention: {},
                /**
                 * Opt-in for the destructive GC delete. Disabled by default —
                 * the daemon then detects retention-expired chunks and emits telemetry only,
                 * issuing no `collection.delete`.
                 * @type {Boolean}
                 */
                gcAutoDelete: false,
                /**
                 * Cumulative-deletion fraction above which a GC tick emits a
                 * `defrag-recommended` signal (operators should then run `ai:defrag-kb`). `0`
                 * disables the signal. V1 emits the signal only — it does not spawn defrag.
                 * @type {Number}
                 */
                gcDefragThreshold: 0.10
            }),
            /**
             * A dummy embedding function to satisfy ChromaDB when embeddings are provided manually.
             * @returns {Object}
             */
            dummyEmbeddingFunction: leaf({
                generate   : () => null,
                name       : 'dummy_embedding_function',
                getConfig  : () => ({}),
                constructor: {
                    buildFromConfig: () => ({
                        generate : () => null,
                        name     : 'dummy_embedding_function',
                        getConfig: () => ({})
                    })
                }
            })
        }
    }
}

const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
