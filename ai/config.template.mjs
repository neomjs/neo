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
    /**
     * Top-level configuration object (Tier 1).
     * Defines the core immutable plain-data structures applied universally across all AI/MCP infrastructure.
     */
    static defaultConfig = {
        neoRootDir,
        projectRoot,
        /**
         * Universal JSONL backup/export directory for Agent OS databases.
         * @type {string}
         */
        backupPath: path.resolve(neoRootDir, '.neo-ai-data/backups'),
        /**
         * Global debug flag for all AI processes.
         * @type {boolean}
         */
        debug: false,
        /**
         * Transport protocol ('stdio' or 'sse').
         * @type {string}
         */
        transport: 'stdio',
        /**
         * Optional public canonical URL.
         * @type {string|null}
         */
        publicUrl: null,
        /**
         * Port the MCP server's HTTP/SSE transport listens on.
         * Sub-servers will typically override this with their own defaultPort.
         * @type {number}
         */
        mcpHttpPort: 3000,
        /**
         * Optional Express middleware function for authentication.
         * @type {Function|null}
         */
        authMiddleware: null,
        /**
         * Base authentication configuration.
         * @type {Object}
         */
        auth: {
            host              : null,
            port              : 8080,
            realm             : 'master',
            issuerUrl         : null,
            clientId          : null,
            clientSecret      : '',
            trustProxyIdentity: false
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
        chatProvider: 'gemini',
        /**
         * @summary Runtime alias for the active chat provider.
         *
         * Existing Memory Core consumers read `modelProvider`; keep the Tier-1
         * template aligned with `chatProvider` until provider routing converges on
         * one canonical key.
         * @type {String}
         */
        modelProvider: 'gemini',
        /**
         * @summary Deployment-wide embedding provider selector.
         *
         * Shared by Memory Core embedding consumers and Knowledge Base ingestion
         * paths.
         * @type {String}
         */
        embeddingProvider: 'openAiCompatible',
        /**
         * @summary Deployment-wide Ollama provider defaults.
         *
         * These are configuration defaults only. Runtime dispatch support for native
         * `ollama` is owned by #10103 Sub-2.
         * @type {Object}
         */
        ollama: {
            host          : 'http://127.0.0.1:11434',
            model         : 'gemma4:31b',
            embeddingModel: 'qwen3-embedding'
        },
        /**
         * @summary Deployment-wide OpenAI-compatible provider defaults.
         *
         * Covers MLX, LM Studio, Ollama's OpenAI-compatible surface, llama.cpp, and
         * managed OpenAI-compatible endpoints.
         * @type {Object}
         */
        openAiCompatible: {
            host                    : 'http://127.0.0.1:11434',
            model                   : 'gemma-4-31b-it',
            embeddingModel          : 'text-embedding-qwen3-embedding-8b',
            apiKey                  : '',
            unloadRetryCount        : 3,
            unloadRetryDelayMs      : 500,
            contextLimitTokens      : 32768,
            safeProcessingLimitTokens: undefined
        },
        /**
         * @summary Deployment-wide Gemini model defaults.
         *
         * Memory Core still exposes these historical field names for Gemini-backed
         * summary and embedding paths; Tier-1 owns the default tuple.
         * @type {String}
         */
        modelName: 'gemini-2.5-flash',
        /**
         * @summary Deployment-wide Gemini embedding model default.
         * @type {String}
         */
        embeddingModel: 'gemini-embedding-001',
        /**
         * @summary Enforced vector dimension across shared vector collections.
         *
         * Hard-configured to prevent schema wipes when operators change embedding
         * providers. Gemini deployments must explicitly pair provider and dimension
         * overrides.
         * @type {Number}
         */
        vectorDimension: 4096,
        /**
         * @summary Deployment-wide storage engine coordinates.
         *
         * `engines.chroma` is the unified Chroma topology from ADR 0003. Collection
         * names and local persistence directories remain server-local.
         * @type {Object}
         */
        engines: {
            chroma: {
                host: 'localhost',
                port: 8000
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
            deploymentMode: 'local',
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
            tenantRepoMirrorRoot: '/app/.neo-ai-data',
            /**
             * Maintenance-loop intervals consumed by the orchestrator daemon.
             * Env vars at the daemon boundary retain precedence over these defaults.
             * @type {Object}
             */
            intervals: {
                pollMs           : 3000,
                summarySweepMs   : 10 * 60 * 1000,
                kbSyncMs         : 30 * 60 * 1000,
                backupMs         : DAY_MS,
                primaryDevSyncMs : 10 * 60 * 1000,
                tenantRepoSyncMs : 30 * 60 * 1000,
                dreamMs          : HOUR_MS,
                goldenPathMs     : HOUR_MS,
                swarmHeartbeatMs : 15 * 60 * 1000
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
                targetSource: 'active-a2a-participants'
            },
            /**
             * Local-only maintenance lane switches. Cloud deployments can disable these
             * without changing remote graph-backed A2A / Memory Core behavior.
             * `null` means "use the deployment profile default" (`local` enables,
             * `cloud` disables); set `true` only when explicitly opting a lane back in.
             * @type {Object}
             */
            localOnly: {
                primaryDevSyncEnabled: null,
                kbSyncEnabled        : null,
                // Local profile may supervise a child Chroma process; cloud profile
                // reaches the compose-owned `chroma` peer container instead (#12019).
                chromaDaemonEnabled  : null,
                bridgeDaemonEnabled  : null,
                goldenPathRepoEnrichmentEnabled: null,
                // `null` = use the deployment-profile default (local enables, cloud disables);
                // the swarm-heartbeat lane is the folded-in wake-substrate pulse (#11766).
                swarmHeartbeatEnabled: null,
                // Reserved policy placeholder: no runtime consumer yet.
                // `bridgeDaemonEnabled` is the active scheduler gate for desktop wake delivery.
                wakeDispatchEnabled  : null
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
                tenantRepoSyncEnabled: null
            },
            /**
             * Optional local Neo repo roots for the primary-dev-sync lane.
             * Keep the template machine-neutral; set real absolute paths in gitignored
             * `ai/config.mjs` or via `NEO_ORCHESTRATOR_DEV_SYNC_ROOTS`.
             * @type {String[]}
             */
            devSyncRoots: [],
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
                jitterRatio   : 0.20,
                sweepCadenceMs: 60 * 1000
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
                enabled: false,
                model  : 'mlx-community/gemma-4-31b-it-bf16',
                port   : '11435'
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
             * - `model`: model identifier the operator intends LM Studio to serve. The
             *   orchestrator-managed `lms server start` lane currently brings the server up;
             *   ensuring this model is loaded (via `lms load <model>` or `/v1/models` probe)
             *   is tracked as #11986 AC5 residual and is NOT performed by this lane today.
             *   Distinct from the OpenAI-compatible API payload label (`NEO_OPENAI_COMPATIBLE_MODEL`).
             * - `port`: OpenAI-compatible local-inference port (LM Studio CLI default `1234`).
             * @type {Object}
             */
            lms: {
                enabled: false,
                model  : 'qwen3-embedding-8b',
                port   : '1234'
            }
        },
        /**
         * Agent OS maintenance policy shared by operator scripts and daemons.
         * @type {Object}
         */
        maintenance: {
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
             * Chroma defrag policy. V1 exposes cadence as operator policy only; no daemon
             * auto-spawns defrag from this value.
             * @type {Object}
             */
            defrag: {
                intervalMs: 7 * DAY_MS,
                snapshotRetention: {
                    keepMinimum: 3,
                    maxDays    : 7
                }
            }
        },
        /**
         * Knowledge Base operations configuration (Cloud-Native KB Ingestion, Epic #11624).
         * @type {Object}
         */
        knowledgeBase: {
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
        },
        /**
         * A dummy embedding function to satisfy ChromaDB when embeddings are provided manually.
         * @returns {Object}
         */
        dummyEmbeddingFunction: {
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
        }
    };

    /**
     * @summary Tier-1 environment-variable ledger.
     *
     * Binding shape mirrors `defaultConfig`; dotted binding keys are intentionally unsupported.
     */
    static envBindings = {
        debug        : {var: 'NEO_DEBUG', parse: Env.parseBool},
        transport    : 'NEO_TRANSPORT',
        publicUrl    : {var: 'NEO_PUBLIC_URL', parse: Env.parseUrl},
        mcpHttpPort  : {var: 'MCP_HTTP_PORT', parse: Env.parsePort},
        auth         : {
            host              : 'NEO_AUTH_HOST',
            port              : {var: 'NEO_AUTH_PORT', parse: Env.parsePort},
            realm             : 'NEO_AUTH_REALM',
            issuerUrl         : 'NEO_AUTH_ISSUER_URL',
            clientId          : 'NEO_OAUTH_CLIENT_ID',
            clientSecret      : 'NEO_OAUTH_CLIENT_SECRET',
            trustProxyIdentity: {var: 'NEO_AUTH_TRUST_PROXY_IDENTITY', parse: Env.parseBool}
        },
        chatProvider     : 'NEO_MODEL_PROVIDER',
        modelProvider    : 'NEO_MODEL_PROVIDER',
        embeddingProvider: 'NEO_EMBEDDING_PROVIDER',
        ollama           : {
            host          : 'NEO_OLLAMA_HOST',
            model         : 'NEO_OLLAMA_MODEL',
            embeddingModel: 'NEO_OLLAMA_EMBEDDING_MODEL'
        },
        openAiCompatible: {
            host                    : 'NEO_OPENAI_COMPATIBLE_HOST',
            model                   : 'NEO_OPENAI_COMPATIBLE_MODEL',
            embeddingModel          : 'NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL',
            apiKey                  : 'NEO_OPENAI_COMPATIBLE_API_KEY',
            unloadRetryCount        : {var: 'NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_COUNT', parse: Env.parseNumber},
            unloadRetryDelayMs      : {var: 'NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_DELAY_MS', parse: Env.parseNumber},
            contextLimitTokens      : {var: 'NEO_OPENAI_COMPATIBLE_CONTEXT_LIMIT_TOKENS', parse: Env.parseNumber},
            safeProcessingLimitTokens: {var: 'NEO_OPENAI_COMPATIBLE_SAFE_PROCESSING_LIMIT_TOKENS', parse: Env.parseNumber}
        },
        vectorDimension: {var: 'NEO_VECTOR_DIMENSION', parse: Env.parseNumber},
        backupPath     : 'NEO_BACKUP_PATH',
        engines        : {
            chroma: {
                host: 'NEO_CHROMA_HOST',
                port: {var: 'NEO_CHROMA_PORT', parse: Env.parsePort}
            }
        },
        orchestrator: {
            deploymentMode      : 'NEO_AI_DEPLOYMENT_MODE',
            tenantRepoMirrorRoot: 'NEO_TENANT_REPO_MIRROR_ROOT'
        }
    };
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
         * @member {Object} defaultConfig
         */
        defaultConfig: this.defaultConfig,
        /**
         * @member {Object} envBindings
         */
        envBindings: this.envBindings
    }
}

const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
