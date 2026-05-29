import path            from 'path';
import {fileURLToPath} from 'url';
import BaseConfig, {createConfigProxy} from './BaseConfig.mjs';
import Env             from '../src/util/Env.mjs';

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
         * Each leaf owns a `default` plus optional `env` (variable name) and `parse` (decoder).
         * @member {Object} metaTree
         */
        metaTree: {
            neoRootDir : {default: neoRootDir},
            projectRoot: {default: projectRoot},
            /**
             * Universal JSONL backup/export directory for Agent OS databases.
             * @type {string}
             */
            backupPath: {env: 'NEO_BACKUP_PATH', default: path.resolve(neoRootDir, '.neo-ai-data/backups'), parse: Env.parseString},
            /**
             * Path to the wake-daemon liveness sentinel touched on every swarm-heartbeat
             * pulse. Operators / tests can isolate the path via `NEO_HEARTBEAT_ALIVE_PATH`.
             * @type {string}
             */
            wakeDaemonHeartbeatAlivePath: {env: 'NEO_HEARTBEAT_ALIVE_PATH', default: path.resolve(neoRootDir, '.neo-ai-data/wake-daemon/heartbeat.alive'), parse: Env.parseString},
            /**
             * Global debug flag for all AI processes.
             * @type {boolean}
             */
            debug: {env: 'NEO_DEBUG', default: false, parse: Env.parseBool},
            /**
             * Transport protocol ('stdio' or 'sse').
             * @type {string}
             */
            transport: {env: 'NEO_TRANSPORT', default: 'stdio', parse: Env.parseString},
            /**
             * Optional public canonical URL.
             * @type {string|null}
             */
            publicUrl: {env: 'NEO_PUBLIC_URL', default: null, parse: Env.parseUrl},
            /**
             * Port the MCP server's HTTP/SSE transport listens on.
             * Sub-servers will typically override this with their own defaultPort.
             * @type {number}
             */
            mcpHttpPort: {env: 'MCP_HTTP_PORT', default: 3000, parse: Env.parsePort},
            /**
             * Optional Express middleware function for authentication.
             * @type {Function|null}
             */
            authMiddleware: {default: null},
            /**
             * Base authentication configuration.
             * @type {Object}
             */
            auth: {
                host              : {env: 'NEO_AUTH_HOST', default: null, parse: Env.parseString},
                port              : {env: 'NEO_AUTH_PORT', default: 8080, parse: Env.parsePort},
                realm             : {env: 'NEO_AUTH_REALM', default: 'master', parse: Env.parseString},
                issuerUrl         : {env: 'NEO_AUTH_ISSUER_URL', default: null, parse: Env.parseString},
                clientId          : {env: 'NEO_OAUTH_CLIENT_ID', default: null, parse: Env.parseString},
                clientSecret      : {env: 'NEO_OAUTH_CLIENT_SECRET', default: '', parse: Env.parseString},
                trustProxyIdentity: {env: 'NEO_AUTH_TRUST_PROXY_IDENTITY', default: false, parse: Env.parseBool}
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
            chatProvider: {env: 'NEO_MODEL_PROVIDER', default: 'gemini', parse: Env.parseString},
            /**
             * @summary Runtime alias for the active chat provider.
             *
             * Existing Memory Core consumers read `modelProvider`; keep the Tier-1
             * template aligned with `chatProvider` until provider routing converges on
             * one canonical key.
             * @type {String}
             */
            modelProvider: {env: 'NEO_MODEL_PROVIDER', default: 'gemini', parse: Env.parseString},
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
            graphProvider: {env: 'NEO_GRAPH_PROVIDER', default: 'openAiCompatible', parse: Env.parseString},
            /**
             * @summary Deployment-wide embedding provider selector.
             *
             * Shared by Memory Core embedding consumers and Knowledge Base ingestion
             * paths.
             * @type {String}
             */
            embeddingProvider: {env: 'NEO_EMBEDDING_PROVIDER', default: 'openAiCompatible', parse: Env.parseString},
            /**
             * @summary Deployment-wide Ollama provider defaults.
             *
             * These are configuration defaults only. Runtime dispatch support for native
             * `ollama` is owned by #10103 Sub-2.
             * @type {Object}
             */
            ollama: {
                host                 : {env: 'NEO_OLLAMA_HOST', default: 'http://127.0.0.1:11434', parse: Env.parseString},
                model                : {env: 'NEO_OLLAMA_MODEL', default: 'gemma4:31b', parse: Env.parseString},
                embeddingModel       : {env: 'NEO_OLLAMA_EMBEDDING_MODEL', default: 'qwen3-embedding', parse: Env.parseString},
                keep_alive           : {env: 'NEO_OLLAMA_KEEP_ALIVE', default: -1, parse: Env.parseKeepAlive},
                requireParallelModels: {env: 'NEO_OLLAMA_REQUIRE_PARALLEL_MODELS', default: 2, parse: Env.parseNumber}
            },
            /**
             * @summary Deployment-wide OpenAI-compatible provider defaults.
             *
             * Covers MLX, LM Studio, Ollama's OpenAI-compatible surface, llama.cpp, and
             * managed OpenAI-compatible endpoints.
             * @type {Object}
             */
            openAiCompatible: {
                host                 : {env: 'NEO_OPENAI_COMPATIBLE_HOST', default: 'http://127.0.0.1:11434', parse: Env.parseString},
                model                : {env: 'NEO_OPENAI_COMPATIBLE_MODEL', default: 'gemma-4-31b-it', parse: Env.parseString},
                embeddingModel       : {env: 'NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL', default: 'text-embedding-qwen3-embedding-8b', parse: Env.parseString},
                apiKey               : {env: 'NEO_OPENAI_COMPATIBLE_API_KEY', default: '', parse: Env.parseString},
                unloadRetryCount     : {env: 'NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_COUNT', default: 3, parse: Env.parseNumber},
                unloadRetryDelayMs   : {env: 'NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_DELAY_MS', default: 500, parse: Env.parseNumber},
                keep_alive           : {env: 'NEO_OPENAI_COMPATIBLE_KEEP_ALIVE', default: -1, parse: Env.parseKeepAlive},
                requireParallelModels: {env: 'NEO_OPENAI_COMPATIBLE_REQUIRE_PARALLEL_MODELS', default: 2, parse: Env.parseNumber}
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
                    contextLimitTokens      : {env: 'NEO_LOCAL_MODELS_CHAT_CONTEXT_LIMIT_TOKENS', default: 262144, parse: Env.parseNumber},
                    safeProcessingLimitTokens: {env: 'NEO_LOCAL_MODELS_CHAT_SAFE_PROCESSING_LIMIT_TOKENS', default: 200000, parse: Env.parseNumber}
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
                    contextLimitTokens      : {env: 'NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS', default: 8192, parse: Env.parseNumber},
                    safeProcessingLimitTokens: {env: 'NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS', default: 6144, parse: Env.parseNumber}
                }
            },
            /**
             * @summary Deployment-wide Gemini model defaults.
             *
             * Memory Core still exposes these historical field names for Gemini-backed
             * summary and embedding paths; Tier-1 owns the default tuple.
             * @type {String}
             */
            modelName: {default: 'gemini-2.5-flash'},
            /**
             * @summary Deployment-wide Gemini embedding model default.
             * @type {String}
             */
            embeddingModel: {default: 'gemini-embedding-001'},
            /**
             * @summary Enforced vector dimension across shared vector collections.
             *
             * Hard-configured to prevent schema wipes when operators change embedding
             * providers. Gemini deployments must explicitly pair provider and dimension
             * overrides.
             * @type {Number}
             */
            vectorDimension: {env: 'NEO_VECTOR_DIMENSION', default: 4096, parse: Env.parseNumber},
            /**
             * @summary Deployment-wide storage engine coordinates.
             *
             * `engines.chroma` is the unified Chroma topology from ADR 0003: ONE daemon, ONE persist
             * dir, shared by Knowledge Base + Memory Core. `dataDir` is the fixed canonical persist dir
             * read by both server configs + the `defragChromaDB` maintenance script; the local
             * orchestrator launches the daemon against the same fixed path. Collection NAMES remain
             * server-local; the persist DIR is unified.
             * @type {Object}
             */
            engines: {
                chroma: {
                    dataDir: {default: path.resolve(neoRootDir, '.neo-ai-data/chroma/knowledge-base')},
                    host   : {env: 'NEO_CHROMA_HOST', default: 'localhost', parse: Env.parseString},
                    port   : {env: 'NEO_CHROMA_PORT', default: 8000, parse: Env.parsePort}
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
                deploymentMode: {env: 'NEO_AI_DEPLOYMENT_MODE', default: 'local', parse: Env.parseString},
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
                tenantRepoMirrorRoot: {env: 'NEO_TENANT_REPO_MIRROR_ROOT', default: '/app/.neo-ai-data', parse: Env.parseString},
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
                    attempts : {env: 'NEO_ORCHESTRATOR_PROVIDER_READY_ATTEMPTS', default: 30, parse: Env.parseNumber},
                    delayMs  : {env: 'NEO_ORCHESTRATOR_PROVIDER_READY_DELAY_MS', default: 1000, parse: Env.parseNumber},
                    timeoutMs: {env: 'NEO_ORCHESTRATOR_PROVIDER_READY_TIMEOUT_MS', default: 3000, parse: Env.parseNumber}
                },
                /**
                 * Maintenance-loop intervals consumed by the orchestrator daemon.
                 * Env vars at the daemon boundary retain precedence over these defaults.
                 * @type {Object}
                 */
                intervals: {
                    pollMs           : {env: 'NEO_ORCHESTRATOR_POLL_INTERVAL_MS',              default: 3000, parse: Env.parseNumber},
                    summarySweepMs   : {env: 'NEO_ORCHESTRATOR_SUMMARY_SWEEP_INTERVAL_MS',     default: 10 * 60 * 1000, parse: Env.parseNumber},
                    kbSyncMs         : {env: 'NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS',           default: 30 * 60 * 1000, parse: Env.parseNumber},
                    backupMs         : {env: 'NEO_ORCHESTRATOR_BACKUP_INTERVAL_MS',            default: DAY_MS, parse: Env.parseNumber},
                    primaryDevSyncMs : {env: 'NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_INTERVAL_MS',  default: 10 * 60 * 1000, parse: Env.parseNumber},
                    tenantRepoSyncMs : {env: 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_INTERVAL_MS',  default: 30 * 60 * 1000, parse: Env.parseNumber},
                    dreamMs               : {env: 'NEO_ORCHESTRATOR_DREAM_INTERVAL_MS',             default: HOUR_MS, parse: Env.parseNumber},
                    dreamOverflowThreshold: {env: 'NEO_ORCHESTRATOR_DREAM_OVERFLOW_THRESHOLD', default: 0.8, parse: Env.parseNumber},
                    goldenPathMs          : {env: 'NEO_ORCHESTRATOR_GOLDEN_PATH_INTERVAL_MS',       default: HOUR_MS, parse: Env.parseNumber},
                    swarmHeartbeatMs      : {env: 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_INTERVAL_MS',   default: 15 * 60 * 1000, parse: Env.parseNumber}
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
                    maxRuntimeMs: {env: 'NEO_CHROMA_MAX_RUNTIME_MS', default: DAY_MS, parse: Env.parseNumber}
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
                    targetSource: {env: 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGET_SOURCE', default: 'active-a2a-participants', parse: Env.parseString},
                    /**
                     * Explicit comma-separated handle list override (highest resolver precedence).
                     * Raw string; the consumer (`Orchestrator.swarmHeartbeatExplicitTargets`) splits
                     * and trims. `null`/absent → resolver falls through to `targetSource` semantics.
                     * @type {String|null}
                     */
                    targets: {env: 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGETS', default: null, parse: Env.parseString}
                },
                /**
                 * Local-only maintenance lane switches. Cloud deployments can disable these
                 * without changing remote graph-backed A2A / Memory Core behavior.
                 * `null` means "use the deployment profile default" (`local` enables,
                 * `cloud` disables); set `true` only when explicitly opting a lane back in.
                 * @type {Object}
                 */
                localOnly: {
                    primaryDevSyncEnabled: {env: 'NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED', default: null, parse: Env.parseBool},
                    kbSyncEnabled        : {env: 'NEO_ORCHESTRATOR_KB_SYNC_ENABLED', default: null, parse: Env.parseBool},
                    // Local profile may supervise a child Chroma process; cloud profile
                    // reaches the compose-owned `chroma` peer container instead (#12019).
                    chromaDaemonEnabled  : {env: 'NEO_ORCHESTRATOR_CHROMA_DAEMON_ENABLED', default: null, parse: Env.parseBool},
                    bridgeDaemonEnabled  : {env: 'NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED', default: null, parse: Env.parseBool},
                    goldenPathRepoEnrichmentEnabled: {env: 'NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED', default: null, parse: Env.parseBool},
                    // `null` = use the deployment-profile default (local enables, cloud disables);
                    // the swarm-heartbeat lane is the folded-in wake-substrate pulse (#11766).
                    swarmHeartbeatEnabled: {env: 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED', default: null, parse: Env.parseBool},
                    // Reserved policy placeholder: no runtime consumer yet.
                    // `bridgeDaemonEnabled` is the active scheduler gate for desktop wake delivery.
                    wakeDispatchEnabled  : {default: null}
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
                    tenantRepoSyncEnabled: {env: 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_ENABLED', default: null, parse: Env.parseBool}
                },
                /**
                 * Optional local Neo repo roots for the primary-dev-sync lane.
                 * Keep the template machine-neutral; set real absolute paths in gitignored
                 * `ai/config.mjs` or via `NEO_ORCHESTRATOR_DEV_SYNC_ROOTS`.
                 * @type {String[]}
                 */
                devSyncRoots: {env: 'NEO_ORCHESTRATOR_DEV_SYNC_ROOTS', default: [], parse: Env.parseString},
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
                    jitterRatio   : {env: 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_JITTER_RATIO', default: 0.20, parse: Env.parseNumber},
                    sweepCadenceMs: {env: 'NEO_ORCHESTRATOR_TENANT_REPO_SYNC_SWEEP_CADENCE_MS', default: 60 * 1000, parse: Env.parseNumber}
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
                    enabled: {env: 'NEO_ORCHESTRATOR_MLX_ENABLED', default: false, parse: Env.parseBool},
                    model  : {env: 'NEO_ORCHESTRATOR_MLX_MODEL', default: 'mlx-community/gemma-4-31b-it-bf16', parse: Env.parseString},
                    port   : {env: 'NEO_ORCHESTRATOR_MLX_PORT', default: '11435', parse: Env.parseString}
                },
                /**
                 * Orchestrator-owned LM Studio CLI (`lms`) inference server config. Operators
                 * tune via gitignored `ai/config.mjs` or env vars (`NEO_ORCHESTRATOR_LMS_ENABLED`,
                 * `NEO_ORCHESTRATOR_LMS_MODEL`, `NEO_ORCHESTRATOR_LMS_PORT`).
                 *
                 * Parallel alternative to `orchestrator.mlx` — both serve OpenAI-compatible HTTP
                 * for local embedding workloads; pick at most one via the respective `enabled` flag.
                 *
                 * - `enabled`: whether the orchestrator should supervise an `lms server start`
                 *   child process. Disabled by default; **macOS-only** (LM Studio CLI is not
                 *   shipped for Linux containers, so this lane is local-dev substrate, not
                 *   cloud-deployment substrate).
                 * - `model`: legacy single-model field kept for existing operator overlays. The
                 *   orchestrator-managed `lms server start` lane pre-warms the configured
                 *   OpenAI-compatible chat + embedding models (`openAiCompatible.model` and
                 *   `openAiCompatible.embeddingModel`) via `lms load <model>` after server spawn.
                 *   Distinct from the OpenAI-compatible API payload label (`NEO_OPENAI_COMPATIBLE_MODEL`).
                 * - `port`: OpenAI-compatible local-inference port (LM Studio CLI default `1234`).
                 * @type {Object}
                 */
                lms: {
                    enabled: {env: 'NEO_ORCHESTRATOR_LMS_ENABLED', default: false, parse: Env.parseBool},
                    model  : {env: 'NEO_ORCHESTRATOR_LMS_MODEL', default: 'qwen3-embedding-8b', parse: Env.parseString},
                    port   : {env: 'NEO_ORCHESTRATOR_LMS_PORT', default: '1234', parse: Env.parseString}
                }
            },
            /**
             * Agent OS maintenance policy shared by operator scripts and daemons.
             * @type {Object}
             */
            maintenance: {default: {
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
            }},
            /**
             * Knowledge Base operations configuration (Cloud-Native KB Ingestion, Epic #11624).
             * @type {Object}
             */
            knowledgeBase: {default: {
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
            }},
            /**
             * A dummy embedding function to satisfy ChromaDB when embeddings are provided manually.
             * @returns {Object}
             */
            dummyEmbeddingFunction: {default: {
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
            }}
        }
    }
}

const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
