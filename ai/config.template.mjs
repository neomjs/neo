import path                                  from 'path';
import {fileURLToPath}                       from 'url';
import BaseConfig, {createConfigProxy, leaf} from './BaseConfig.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../');
// Fallback to neoRootDir if cwd is root (e.g., container/daemon edge cases)
const projectRoot = process.cwd() === '/' ? neoRootDir : process.cwd();

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS  = 24 * HOUR_MS;

/**
 * @class Neo.ai.Config
 * @extends Neo.ai.BaseConfig
 * @singleton
 */
class Config extends BaseConfig {
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
             * Base authentication configuration.
             * @type {Object}
             */
            auth: {
                host              : leaf(null, 'NEO_AUTH_HOST', 'string'),
                port              : leaf(8080, 'NEO_AUTH_PORT', 'port'),
                realm             : leaf('master', 'NEO_AUTH_REALM', 'string'),
                issuerUrl         : leaf(null, 'NEO_AUTH_ISSUER_URL', 'string'),
                clientId          : leaf(null, 'NEO_OAUTH_CLIENT_ID', 'string'),
                clientSecret      : leaf('', 'NEO_OAUTH_CLIENT_SECRET', 'string'),
                trustProxyIdentity: leaf(false, 'NEO_AUTH_TRUST_PROXY_IDENTITY', 'boolean')
            },
            /**
             * @summary Deployment-wide chat / generation model provider.
             *
             * Tier-1 source of truth for model-consuming Agent OS lanes. Memory Core maps
             * this into its historical `modelProvider` key until runtime provider routing
             * graduates from #10103 Sub-2. Supported values today: `gemini`,
             * `openAiCompatible`.
             * @type {String}
             */
            chatProvider: leaf('gemini', 'NEO_MODEL_PROVIDER', 'string'),
            /**
             * @summary Runtime alias for the active chat provider.
             *
             * Existing Memory Core consumers read `modelProvider`; keep the Tier-1
             * template aligned with `chatProvider` until provider routing converges on
             * one canonical key.
             * @type {String}
             */
            modelProvider: leaf('gemini', 'NEO_MODEL_PROVIDER', 'string'),
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
             * These are configuration defaults only. Runtime dispatch support for native
             * `ollama` is owned by #10103 Sub-2.
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
                host                 : leaf('http://127.0.0.1:11434', 'NEO_OPENAI_COMPATIBLE_HOST', 'string'),
                model                : leaf('gemma-4-31b-it', 'NEO_OPENAI_COMPATIBLE_MODEL', 'string'),
                embeddingModel       : leaf('text-embedding-qwen3-embedding-8b', 'NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL', 'string'),
                apiKey               : leaf('', 'NEO_OPENAI_COMPATIBLE_API_KEY', 'string'),
                unloadRetryCount     : leaf(3, 'NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_COUNT', 'number'),
                unloadRetryDelayMs   : leaf(500, 'NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_DELAY_MS', 'number'),
                keep_alive           : leaf(-1, 'NEO_OPENAI_COMPATIBLE_KEEP_ALIVE', 'keepAlive'),
                requireParallelModels: leaf(2, 'NEO_OPENAI_COMPATIBLE_REQUIRE_PARALLEL_MODELS', 'number')
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
                 * Conservative placeholder defaults. Operators must pin to their loaded
                 * embedding model's actual capability before operational reliance — for
                 * instance Qwen3-8B-embedding typically supports 32K context, but this
                 * default holds an 8K conservative floor until V-B-A confirms the value
                 * against the configured embedding model.
                 *
                 * No active consumer reads these yet; pre-positioned for the embedding
                 * consumer surface (TextEmbeddingService + KB ingestion retry-on-unload
                 * telemetry paths).
                 *
                 * Env overrides: `NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS`,
                 * `NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS`.
                 *
                 * @type {Object}
                 */
                embedding: {
                    contextLimitTokens       : leaf(8192, 'NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS', 'number'),
                    safeProcessingLimitTokens: leaf(6144, 'NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS', 'number')
                }
            },
            /**
             * @summary Deployment-wide Gemini model defaults.
             *
             * Memory Core still exposes these historical field names for Gemini-backed
             * summary and embedding paths; Tier-1 owns the default tuple.
             * @type {String}
             */
            modelName: leaf('gemini-2.5-flash'),
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
             * `engines.chroma` is the unified Chroma topology from ADR 0003: ONE daemon, ONE persist
             * dir, shared by Knowledge Base + Memory Core. `dataDir` is the fixed canonical persist dir
             * read by both server configs + the `defragChromaDB` maintenance script; the local
             * orchestrator launches the daemon against the same fixed path. The leaf is named `unified`
             * (identical local + cloud) — it holds every realm (KB + MC + graph + sessions), so a
             * realm-specific name would misrepresent the store. Collection NAMES remain server-local;
             * the persist DIR is unified.
             * @type {Object}
             */
            engines: {
                chroma: {
                    dataDir: leaf(path.resolve(neoRootDir, '.neo-ai-data/chroma/unified')),
                    host   : leaf('localhost', 'NEO_CHROMA_HOST', 'string'),
                    port   : leaf(8000, 'NEO_CHROMA_PORT', 'port')
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
                    primaryDevSyncMs      : leaf(10 * 60 * 1000, 'NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_INTERVAL_MS', 'number'),
                    tenantRepoSyncMs      : leaf(30 * 60 * 1000, 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_INTERVAL_MS', 'number'),
                    dreamMs               : leaf(HOUR_MS, 'NEO_ORCHESTRATOR_DREAM_INTERVAL_MS', 'number'),
                    dreamOverflowThreshold: leaf(0.8, 'NEO_ORCHESTRATOR_DREAM_OVERFLOW_THRESHOLD', 'number'),
                    goldenPathMs          : leaf(HOUR_MS, 'NEO_ORCHESTRATOR_GOLDEN_PATH_INTERVAL_MS', 'number'),
                    swarmHeartbeatMs      : leaf(15 * 60 * 1000, 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_INTERVAL_MS', 'number')
                },
                /**
                 * Chroma daemon recycle policy (#12138). The orchestrator kills and respawns the
                 * supervised Chroma daemon once its uptime exceeds `maxRuntimeMs`, then runs a
                 * unified-store-safe defrag against the fresh daemon. `0` disables recycling.
                 * Env override: `NEO_CHROMA_MAX_RUNTIME_MS`. The lane is gated by
                 * `localOnly.chromaDaemonEnabled` — a no-op when Chroma is externally managed.
                 * @type {Object}
                 */
                chroma: {
                    maxRuntimeMs: leaf(DAY_MS, 'NEO_CHROMA_MAX_RUNTIME_MS', 'number')
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
                     * Resolver source enum. Tracked default is `'active-a2a-participants'`
                     * per Discussion #11992 §5.1.1 "activity-derived signals" framing — the
                     * pulse candidate set is auto-discovered from A2A `MESSAGE` activity
                     * within the last 3h (sibling to the per-identity `active` signal). This
                     * is per-MC-instance derived (no team-registry coupling), so external
                     * workspaces only ever see their own MC's activity — tenant-safe.
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
                    targets: leaf(null, 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGETS', 'string')
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
                    // reaches the compose-owned `chroma` peer container instead (#12019).
                    chromaDaemonEnabled            : leaf(null, 'NEO_ORCHESTRATOR_CHROMA_DAEMON_ENABLED', 'boolean'),
                    bridgeDaemonEnabled            : leaf(null, 'NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED', 'boolean'),
                    goldenPathRepoEnrichmentEnabled: leaf(null, 'NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED', 'boolean'),
                    // `null` = use the deployment-profile default (local enables, cloud disables);
                    // the swarm-heartbeat lane is the folded-in wake-substrate pulse (#11766).
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
                    // tenant-repo-sync: cloud-deployable per ADR 0014 + #11740. Cloud
                    // profile defaults enabled when tenant repos are configured; local
                    // Neo-maintainer profile defaults disabled unless explicitly opted in.
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
                 * Tenant-repo-sync per-repo scheduling parameters (#11942 AC1).
                 *
                 * The cadence floor lives in `intervals.tenantRepoSyncMs` above (30min default).
                 * Per-repo cadence in `tenantRepos[].cadenceMs` (operator-set) overrides global.
                 *
                 * - `jitterRatio` caps the deterministic per-repo jitter offset as a fraction
                 *   of the base cadence. Default `0.20` (≤20% of cadence per AC1 prescription).
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
                 * `NEO_ORCHESTRATOR_LMS_MODEL`, `NEO_ORCHESTRATOR_LMS_PORT`,
                 * `NEO_ORCHESTRATOR_LMS_PRELOAD_MAX_CONTEXT_LENGTH`).
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
                 *   OpenAI-compatible chat + embedding models (`openAiCompatible.model` and
                 *   `openAiCompatible.embeddingModel`) via `lms load <model>` after server spawn.
                 *   Distinct from the OpenAI-compatible API payload label (`NEO_OPENAI_COMPATIBLE_MODEL`).
                 * - `port`: OpenAI-compatible local-inference port (LM Studio CLI default `1234`).
                 * - `preloadMaxContextLength`: guardrail for orchestrator-owned `lms load`
                 *   calls. Configured chat + embedding roles remain required; a role whose
                 *   requested context is above this cap is skipped with WARN and reported as
                 *   degraded instead of killing the lane or starving the other role.
                 * @type {Object}
                 */
                lms: {
                    enabled                : leaf(true, 'NEO_ORCHESTRATOR_LMS_ENABLED', 'boolean'),
                    model                  : leaf('qwen3-embedding-8b', 'NEO_ORCHESTRATOR_LMS_MODEL', 'string'),
                    port                   : leaf('1234', 'NEO_ORCHESTRATOR_LMS_PORT', 'string'),
                    preloadMaxContextLength: leaf(32768, 'NEO_ORCHESTRATOR_LMS_PRELOAD_MAX_CONTEXT_LENGTH', 'number')
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
                 * auto-spawns defrag from THIS value. (The one orchestrator path that auto-spawns
                 * `ai:defrag-kb` is the #12138 max-runtime recycle, driven by
                 * `orchestrator.chroma.maxRuntimeMs` — a distinct config, not this cadence.)
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
             * Knowledge Base operations configuration (Cloud-Native KB Ingestion, Epic #11624).
             * @type {Object}
             */
            knowledgeBase: leaf({
                /**
                 * Phase 4D (#11642) — operator alert rules. Each entry is
                 * `{metric, threshold, severity, channels, deliveryMode?}`; see the #11642
                 * Contract Ledger. Empty by default — the alerting daemon no-ops with no rules.
                 * @type {Object[]}
                 */
                alertRules: [],
                /**
                 * Phase 4D (#11642) — master opt-in for the KB operator-alerting daemon.
                 * Disabled by default; the daemon exits early when false.
                 * @type {Boolean}
                 */
                alertingEnabled: false,
                /**
                 * Phase 4D (#11642) — alerting daemon poll interval in ms (default 15 min).
                 * @type {Number}
                 */
                alertingIntervalMs: 15 * 60 * 1000,
                /**
                 * Phase 4D (#11642) — per-`(tenant, metric, severity, channel)` hysteresis
                 * cooldown window in ms (default 1 h).
                 * @type {Number}
                 */
                alertingCooldownMs: 60 * 60 * 1000,
                /**
                 * Phase 4D (#11642) — rolling look-back window in ms for the per-tenant
                 * telemetry rollup the rule engine evaluates (default 1 h).
                 * @type {Number}
                 */
                alertWindowMs: 60 * 60 * 1000,
                /**
                 * Phase 4B (#11640) — master opt-in for the KB reconciliation daemon.
                 * Disabled by default; the daemon exits early when false.
                 * @type {Boolean}
                 */
                reconciliationEnabled: false,
                /**
                 * Phase 4B (#11640) — reconciliation daemon poll interval in ms (default 1 h).
                 * @type {Number}
                 */
                reconciliationIntervalMs: 60 * 60 * 1000,
                /**
                 * Phase 4B (#11640) — opt-in for the destructive auto-tombstone reconciliation
                 * action. Disabled by default — the daemon then detects config-stale chunks and
                 * emits Phase 4A telemetry only, issuing no `collection.delete`.
                 * @type {Boolean}
                 */
                reconciliationAutoTombstone: false,
                /**
                 * Phase 4B (#11640) — config-version-gap threshold above which a config-stale
                 * chunk becomes auto-tombstone-eligible: a chunk is actioned when
                 * `currentConfigVersion - chunk.tenantConfigVersion >= this`. Default `2` gives
                 * one full config epoch of grace. Consulted only when `reconciliationAutoTombstone`.
                 * @type {Number}
                 */
                reconciliationOrphanVersionGap: 2,
                /**
                 * Phase 4C (#11641) — master opt-in for the KB garbage-collection daemon.
                 * Disabled by default; the daemon exits early when false.
                 * @type {Boolean}
                 */
                gcEnabled: false,
                /**
                 * Phase 4C (#11641) — GC daemon poll interval in ms (default 24 h).
                 * @type {Number}
                 */
                gcIntervalMs: 24 * 60 * 60 * 1000,
                /**
                 * Phase 4C (#11641) — retention policy: `{maxAgeMs?, maxCount?}`. A chunk is
                 * retention-expired if it is older than `maxAgeMs` (by its `ingestedAt` stamp) OR
                 * ranks beyond the `maxCount` most-recent of its `{tenantId, repoSlug}` bucket.
                 * Empty `{}` (the default) expires nothing — conservative.
                 * @type {Object}
                 */
                gcRetention: {},
                /**
                 * Phase 4C (#11641) — opt-in for the destructive GC delete. Disabled by default —
                 * the daemon then detects retention-expired chunks and emits telemetry only,
                 * issuing no `collection.delete`.
                 * @type {Boolean}
                 */
                gcAutoDelete: false,
                /**
                 * Phase 4C (#11641) — cumulative-deletion fraction above which a GC tick emits a
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
