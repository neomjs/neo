import fs              from 'fs/promises';
import path            from 'path';
import {fileURLToPath} from 'url';
import Base            from '../src/core/Base.mjs';
import {resolveMcpHttpPort, resolvePublicUrl} from './mcp/server/shared/helpers/DeploymentConfig.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../');
// Fallback to neoRootDir if cwd is root (e.g., container/daemon edge cases)
const projectRoot = process.cwd() === '/' ? neoRootDir : process.cwd();

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS  = 24 * HOUR_MS;

/**
 * Top-level configuration object (Tier 1).
 * Defines the core immutable plain-data structures applied universally across all AI/MCP infrastructure.
 */
const defaultConfig = {
    neoRootDir,
    projectRoot,
    /**
     * Global debug flag for all AI processes.
     * @type {boolean}
     */
    debug: false,
    /**
     * Transport protocol ('stdio' or 'sse').
     * @type {string}
     */
    transport: process.env.NEO_TRANSPORT || 'stdio',
    /**
     * Optional public canonical URL.
     * @type {string|null}
     */
    publicUrl: resolvePublicUrl(),
    /**
     * Port the MCP server's HTTP/SSE transport listens on.
     * Sub-servers will typically override this with their own defaultPort.
     * @type {number}
     */
    mcpHttpPort: resolveMcpHttpPort({defaultPort: 3000}),
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
        host              : process.env.NEO_AUTH_HOST || null,
        port              : Number(process.env.NEO_AUTH_PORT) || 8080,
        realm             : process.env.NEO_AUTH_REALM || 'master',
        issuerUrl         : process.env.NEO_AUTH_ISSUER_URL || null,
        clientId          : process.env.NEO_OAUTH_CLIENT_ID || null,
        clientSecret      : process.env.NEO_OAUTH_CLIENT_SECRET || '',
        trustProxyIdentity: process.env.NEO_AUTH_TRUST_PROXY_IDENTITY === 'true'
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
        deploymentMode: process.env.NEO_AI_DEPLOYMENT_MODE || 'local',
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
             * Resolver source enum. `null` falls through to `'self'` — the
             * deployment-portable default. Valid values: `'self'`,
             * `'active-local-team'`, `'active-subscribers'`, `'disabled'`. External
             * workspaces with no config default to `'self'`; the lane never silently
             * fans out to maintainer identities unless the operator explicitly opts
             * in via `'active-local-team'`.
             * @type {'self'|'active-local-team'|'active-subscribers'|'disabled'|null}
             */
            targetSource: null
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
 * @class Neo.ai.Config
 * @extends Neo.core.Base
 * @singleton
 */
class Config extends Base {
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
        singleton: true
    }

    /**
     * The configuration data object.
     * @member {Object} data
     */
    data = null;

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.data = Neo.clone(defaultConfig, true);
    }

    /**
     * Loads a JSON or MJS configuration file and merges it into the current data.
     * @param {String} filePath
     */
    async load(filePath) {
        if (!filePath) return;

        try {
            const absolutePath = path.resolve(filePath);
            const ext          = path.extname(absolutePath);
            let   customConfig;

            if (ext === '.mjs' || ext === '.js') {
                const module = await import(absolutePath);
                customConfig = module.default;
            } else {
                const content = await fs.readFile(absolutePath, 'utf-8');
                customConfig  = JSON.parse(content);
            }

            // Deep merge custom config into the data object
            Neo.merge(this.data, customConfig);

            console.error(`[Config] Loaded custom configuration from ${absolutePath}`);

        } catch (error) {
            console.error(`[Config] Failed to load configuration from ${filePath}:`, error.message);
            throw error;
        }
    }
}

const instance = Neo.setupClass(Config);

export default new Proxy(instance, {
    get(target, prop, receiver) {
        if (Reflect.has(target, prop)) {
            return Reflect.get(target, prop, receiver);
        }
        return target.data[prop];
    }
});
