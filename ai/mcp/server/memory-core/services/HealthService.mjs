import fs                       from 'fs/promises';
import path                     from 'path';
import {fileURLToPath}          from 'url';
import aiConfig                 from '../config.mjs';
import Base                     from '../../../../../src/core/Base.mjs';
import ChromaManager            from '../managers/ChromaManager.mjs';
import StorageRouter            from '../managers/StorageRouter.mjs';
import ChromaLifecycleService   from './lifecycle/ChromaLifecycleService.mjs';
import logger                   from '../logger.mjs';
import {readGateState}          from '../../../../scripts/wakeSafetyGate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Heartbeat-liveness file path resolution. Mirrors `wakeSafetyGate.gateFilePath()` env-override
 * pattern so parallel test specs can isolate from the canonical on-disk path. Production
 * deployments leave `NEO_HEARTBEAT_ALIVE_PATH` unset; the canonical path under `.neo-ai-data/wake-daemon/`
 * applies. Counterpart producer: `ai/scripts/swarm-heartbeat.sh` `touch` line in pulse loop (#10783).
 */
function heartbeatAlivePath() {
    return process.env.NEO_HEARTBEAT_ALIVE_PATH || path.resolve(__dirname, '../../../../../.neo-ai-data/wake-daemon/heartbeat.alive');
}

/**
 * Stale-threshold for `daemonRunning` heuristic. Matches `swarm-heartbeat.sh` POLL_INTERVAL
 * default × 2 (5 min × 2 = 10 min). If the liveness file mtime is older than this, the daemon
 * is considered stopped or stalled. The "× 2" buffer absorbs single missed pulses without
 * false-negative liveness signal.
 */
function heartbeatLivenessStaleMs() {
    const pollIntervalSec = parseInt(process.env.POLL_INTERVAL, 10) || 300;
    return pollIntervalSec * 1000 * 2;
}

/**
 * @summary Projects the stdio identity state into the healthcheck-payload shape (#10176).
 *
 * Pure function: takes the cached stdioIdentity context (or null) and returns the
 * observability block the healthcheck response exposes — `{source, bound, nodeId}`.
 * Extracted as a module-scope function so unit tests can exercise the projection
 * logic without bootstrapping the full Memory Core runtime.
 *
 * Three input shapes matter:
 * 1. `null` — stdioIdentity never populated (SSE transport, or resolver ran before the
 *    setter was invoked). Projects to `{source: 'unresolved', bound: false, nodeId: null}`.
 * 2. Resolved without graph node — `gh-cli` / `env-var` yielded a userId but no seeded
 *    AgentIdentity graph node matched. Projects to `{source: <resolved>, bound: false, nodeId: null}`.
 *    Diagnostic: agent needs seeding via `ai/scripts/seedAgentIdentities.mjs` OR the boot-time
 *    self-seed from #10232 wasn't triggered.
 * 3. Resolved with graph node — fully bound identity. Projects to `{source: <resolved>, bound: true, nodeId: '@login'}`.
 *    The success shape that A2A operation requires.
 *
 * `status` is NOT flipped by this projection. Unbound identity is a valid single-tenant
 * fallthrough per the MemoryCoreMcpAuth contract — this block is pure observability, not
 * a health gate. The architectural choice matches "surface, don't obscure" (PR #10227).
 *
 * @param {Object|null} stdioIdentityState Either `null` or `{userId, agentIdentityNodeId, source}`
 * @returns {{source: String, bound: Boolean, nodeId: String|null}}
 */
export function buildIdentityBlock(stdioIdentityState) {
    if (!stdioIdentityState) {
        return {source: 'unresolved', bound: false, nodeId: null};
    }

    const {agentIdentityNodeId, source} = stdioIdentityState;
    return {
        source: source || 'unresolved',
        bound : !!agentIdentityNodeId,
        nodeId: agentIdentityNodeId || null
    };
}

/**
 * @summary Projects the effective ChromaDB topology resolution into the healthcheck `database.topology`
 *          observability block (#10127).
 *
 * Pure function: takes an `aiConfig`-shaped input and returns the three-field projection operators
 * need to verify ChromaDB coordinate resolution — `{mode, coordinates, resolvedVia}`. Extracted as a
 * module-scope function so unit tests can exercise the projection without bootstrapping the full
 * Memory Core runtime, mirroring the {@link buildIdentityBlock} precedent for module-scope pure
 * projections.
 *
 * **Why this block exists:** Today's `{engines: {chroma: true}}` is a binary reachability flag. It
 * cannot distinguish a client pointed at the KB's ChromaDB (unified topology, per sub-epic #10015)
 * from one that silently spun up its own instance (federated topology). A forgotten `NEO_CHROMA_UNIFIED`
 * env flag would cause Memory Core to mount a distinct volume and populate a distinct collection set,
 * diverging from the KB state without any operator-visible signal until cross-tenant drift emerges.
 * This block closes that gap: `mode` surfaces which topology branch won, `coordinates` pins the
 * effective `{host, port}`, and `resolvedVia` names the exact config key path the resolver read —
 * giving operators a direct pointer to what to fix when coordinates look wrong.
 *
 * **Consumes {@link Neo.ai.mcp.server.memory-core.managers.ChromaManager#resolveChromaCoordinates}**
 * as the single source of truth for coordinate resolution. `resolveChromaCoordinates` was extracted
 * as a pure method in #10001 specifically to make this kind of observability aggregation possible
 * without singleton re-instantiation or config-resolution duplication.
 *
 * **Defensive error handling:** `resolveChromaCoordinates` throws when `chromaUnified=true` and
 * `engines.kb.chroma` is undefined (misconfig via custom config override clobbering the `engines.kb`
 * branch). Healthcheck must not explode under that condition — operators still need the remaining
 * observability surface (identity, mailbox, migration counts). We surface the misconfig as observable
 * data (`{coordinates: null, error: <message>}`) instead, aligning with the "surface, don't obscure"
 * principle codified in PR #10227.
 *
 * @param {Object} cfg aiConfig-shaped input. Reads `cfg.chromaUnified` plus the branch targets
 *     `engines.chroma.{host, port}` and `engines.kb.chroma.{host, port}` via `resolveChromaCoordinates`.
 * @returns {{mode: String, coordinates: Object|null, resolvedVia: String, error?: String}}
 *     `mode` is `'unified'` or `'federated'`. `coordinates` is `{host, port}` on success or `null` on
 *     resolver throw. `resolvedVia` is the exact config key path that won the resolution —
 *     `'engines.kb.chroma'` for unified mode, `'engines.chroma'` for federated. `error` is present
 *     only when the resolver threw.
 * @see Neo.ai.mcp.server.memory-core.managers.ChromaManager#resolveChromaCoordinates
 * @see learn/agentos/MemoryCore.md
 */
export function buildTopologyBlock(cfg) {
    const mode        = cfg.chromaUnified ? 'unified'           : 'federated';
    const resolvedVia = cfg.chromaUnified ? 'engines.kb.chroma' : 'engines.chroma';

    try {
        return {
            mode,
            coordinates: ChromaManager.resolveChromaCoordinates(cfg),
            resolvedVia
        };
    } catch (e) {
        return {mode, coordinates: null, resolvedVia, error: e.message};
    }
}

/**
 * @summary Projects the active embedding-provider configuration into the healthcheck `providers.embedding`
 *          observability block (#10723, #10773, #10804).
 *
 * Pure function: takes an `aiConfig`-shaped input and returns the active embedding provider with
 * their host, model, and configured vector dimension. Mirrors the {@link buildTopologyBlock} precedent
 * for module-scope pure projections.
 *
 * **Why this block exists:** Operators deploying the shared MC/KB topology against a local-model stack
 * (e.g., MLX-served Qwen3 embedding model) need an observable surface confirming WHICH Chroma-side
 * and SQLite-side embedding providers are currently active and WHICH model + endpoint is in use.
 * Without this, a misconfigured `NEO_EMBEDDING_PROVIDER` env var
 * (silently defaulting to Gemini cloud while the operator believes a local provider is wired) is
 * undetectable until cross-tenant retrieval drift emerges.
 *
 * **What this block reports:** single-provider projection for every embedding callsite after #10804
 * consolidated ChromaDB and SQLite Native Edge Graph provider selection into `embeddingProvider`.
 *
 * **Defensive fallback:** if the provider key isn't recognized, the block surfaces
 * `{active: <unknown-key>, host: null, model: null, dimensions: <vectorDimension>, error: <msg>}`
 * so operators see the misconfig directly. Aligns with "surface, don't obscure" (PR #10227).
 *
 * @param {Object} cfg aiConfig-shaped input. Reads `cfg.embeddingProvider`, `cfg.openAiCompatible.{host, embeddingModel}`,
 *     `cfg.ollama.{host, embeddingModel}`, `cfg.embeddingModel` (Gemini path), `cfg.vectorDimension`.
 * @returns {{active: String, host: String|null, model: String|null, dimensions: Number, error?: String}}
 * @see learn/agentos/SharedDeployment.md
 */
export function buildEmbeddingProviderBlock(cfg) {
    return buildSingleEmbeddingProviderBlock(cfg, cfg.embeddingProvider || 'gemini', 'embeddingProvider');
}

/**
 * Projects one embedding provider selector into the common healthcheck sub-block shape.
 * @param {Object} cfg aiConfig-shaped input.
 * @param {String} active The selected provider key.
 * @param {String} configName The aiConfig key name used in scoped error messages.
 * @returns {{active: String, host: String|null, model: String|null, dimensions: Number, error?: String}}
 */
function buildSingleEmbeddingProviderBlock(cfg, active, configName) {
    const dimensions = cfg.vectorDimension;

    switch (active) {
        case 'openAiCompatible':
            return {
                active,
                host      : cfg.openAiCompatible?.host || null,
                model     : cfg.openAiCompatible?.embeddingModel || null,
                dimensions
            };
        case 'ollama':
            return {
                active,
                host      : cfg.ollama?.host || null,
                model     : cfg.ollama?.embeddingModel || null,
                dimensions
            };
        case 'gemini':
            return {
                active,
                host      : null,
                model     : cfg.embeddingModel || null,
                dimensions
            };
        default:
            return {
                active,
                host      : null,
                model     : null,
                dimensions,
                error     : `Unrecognized ${configName}: '${active}'. Expected 'gemini' | 'openAiCompatible' | 'ollama'.`
            };
    }
}

/**
 * @summary Projects the active session-summary provider into the healthcheck `providers.summary`
 *          observability block (#10724).
 *
 * The shared-deployment local-model validation path (#10724) needs operators to confirm that
 * session summaries are routed to the intended chat API before waiting for a disconnect-triggered
 * summarization run. This pure projection names the active provider, host, model, endpoint, local
 * status, and credential env var without exposing secret values, mirroring the sibling
 * {@link buildEmbeddingProviderBlock} operator-facing `providers.*` observability strategy.
 *
 * @param {Object} cfg aiConfig-shaped input containing `modelProvider`, `modelName`, and
 *     `openAiCompatible.{host, model, apiKey}`.
 * @param {Object} [env=process.env] Environment source used to test Gemini key presence in unit tests.
 * @returns {{active: String, host: String|null, model: String|null, endpoint: String|null, local: Boolean, credential: Object}}
 */
export function buildSummaryProviderBlock(cfg, env = process.env) {
    const active = cfg.modelProvider || 'gemini';

    if (active === 'openAiCompatible') {
        const host = cfg.openAiCompatible?.host || null;

        return {
            active,
            host,
            model     : cfg.openAiCompatible?.model || null,
            endpoint  : host ? `${host}/v1/chat/completions` : null,
            local     : !!host && /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/|$)/.test(host),
            credential: {
                env       : 'NEO_OPENAI_COMPATIBLE_API_KEY',
                configured: !!cfg.openAiCompatible?.apiKey,
                required  : false
            }
        };
    }

    return {
        active,
        host      : null,
        model     : active === 'gemini' ? cfg.modelName || null : null,
        endpoint  : null,
        local     : false,
        credential: {
            env       : active === 'gemini' ? 'GEMINI_API_KEY' : null,
            configured: active === 'gemini' ? !!env.GEMINI_API_KEY : true,
            required  : active === 'gemini'
        }
    };
}

/**
 * @summary Projects the active authentication-provider configuration into the healthcheck
 *          `providers.auth` observability block (#10770).
 *
 * Operators deploying the shared MC/KB topology with multi-tenant identity isolation need an
 * observable surface confirming WHICH auth path is currently primary at boot — OIDC introspection
 * vs proxy-header injection vs single-tenant fallthrough. Without this, a misconfigured
 * `NEO_AUTH_TRUST_PROXY_IDENTITY=true` set without a fronting proxy actually being deployed is
 * undetectable until requests start failing in non-obvious ways. Mirrors the
 * {@link buildEmbeddingProviderBlock} + {@link buildSummaryProviderBlock} precedents for
 * module-scope pure projections of provider state.
 *
 * **Path precedence (matches `Server.mjs#buildRequestContext` runtime semantics):**
 * - `'oidc'` — `aiConfig.auth.host` AND `aiConfig.auth.issuerUrl` are both populated. The MC
 *   server runs its own OIDC introspection. Takes precedence over proxy-header even when
 *   `trustProxyIdentity` is also true (req.auth wins by design — see SharedDeployment.md).
 * - `'proxy-header'` — OIDC unconfigured AND `trustProxyIdentity=true`. The MC server reads
 *   `X-PREFERRED-USERNAME` (or the `oauth2-proxy`-specific `X-Auth-Request-Preferred-Username`)
 *   from the upstream request and trusts the fronting proxy's identity assertion. Per
 *   PR #10785, requests missing the proxy header in this mode are actively rejected with 401.
 * - `'unconfigured'` — neither path active. Single-tenant fallthrough (local development).
 *
 * **Security: clientSecret never leaks.** This block intentionally omits the OAuth `clientSecret`
 * field even when OIDC is configured. Healthcheck output is operator-readable and may surface in
 * logs / monitoring dashboards; the secret value belongs only in the gitignored `config.mjs`.
 *
 * @param {Object} cfg aiConfig-shaped input. Reads `cfg.auth.{host, issuerUrl, realm, trustProxyIdentity}`.
 * @returns {{configured: String, oidc: Object, proxyHeader: Object}}
 * @see learn/agentos/SharedDeployment.md
 * @see Neo.ai.mcp.server.memory-core.Server#buildRequestContext
 */
export function buildAuthProviderBlock(cfg) {
    const auth           = cfg.auth || {};
    const oidcConfigured = !!(auth.host && auth.issuerUrl);
    const proxyTrusted   = auth.trustProxyIdentity === true;

    let configured;

    if (oidcConfigured) {
        configured = 'oidc';
    } else if (proxyTrusted) {
        configured = 'proxy-header';
    } else {
        configured = 'unconfigured';
    }

    return {
        configured,
        oidc: {
            host      : auth.host || null,
            issuerUrl : auth.issuerUrl || null,
            realm     : auth.realm || null,
            configured: oidcConfigured
        },
        proxyHeader: {
            trusted       : proxyTrusted,
            headersChecked: ['x-preferred-username', 'x-auth-request-preferred-username']
        }
    };
}

/**
 * @summary Projects wake-substrate observable state into the healthcheck `features.wake` block (#10783).
 *
 * Async pure projection: reads the wake-safety-gate state (via `wakeSafetyGate.readGateState`)
 * and the heartbeat-liveness file mtime (touched once per pulse by `swarm-heartbeat.sh`),
 * returning the operator/agent-facing observability shape. Mirrors the
 * {@link buildAuthProviderBlock} + {@link buildSummaryProviderBlock} sibling-block precedent
 * for module-scope projection functions.
 *
 * **Why this block exists:** the wake substrate (gate-state + daemon-liveness + polling-activity)
 * was previously invisible from healthcheck. Operators verifying night-shift readiness had to
 * `grep` 3 separate filesystem locations and run `launchctl list`; agents detecting whether the
 * heartbeat substrate is healthy before relying on it had no MCP-tool-surface signal at all.
 * This block surfaces all three dimensions in one observable block, sibling to `features.summarization`.
 *
 * **Field semantics:**
 * - `gateState`: `'enabled'` | `'disabled'` | `'tripped'` | `'unknown'`. Read via
 *   `wakeSafetyGate.readGateState`. The deny-by-default sentinel (`trippedBy === 'default-on-missing-file'`)
 *   is mapped to `'unknown'` here — observability semantics differ from gate-enforcement semantics
 *   (we surface "I don't know" instead of conflating it with operator-tripped state).
 * - `gateReason` / `gateTrippedAt` / `gateTrippedBy`: pass-through from the gate state file when
 *   present (empty string / null otherwise).
 * - `daemonRunning`: boolean. `true` when the heartbeat-liveness file mtime is within
 *   `heartbeatLivenessStaleMs()` (2× POLL_INTERVAL). `false` when missing or stale.
 * - `lastPulseAt`: ISO timestamp of the liveness file mtime, or `null` if absent.
 * - `secondsSinceLastPulse`: derived seconds since last pulse. Surfaces "alive but stalled" when
 *   `daemonRunning` is `false` but a previous mtime exists.
 *
 * **Liveness signal substrate (#10783 design note):** the heartbeat concurrency lock at
 * `.neo-ai-data/heartbeat-concurrency.lock` is touched only when expensive Agent OS work runs
 * (per `heartbeatLock.mjs`), NOT on every pulse. So the lock cannot serve as the daemon-liveness
 * signal directly. This block consumes a dedicated `heartbeat.alive` file that `swarm-heartbeat.sh`
 * touches at the top of each pulse loop iteration — present-and-fresh means the daemon is polling.
 *
 * **Defensive defaults:** missing files / unreadable state surfaces sensible defaults
 * (`gateState: 'unknown'`, `daemonRunning: false`, `lastPulseAt: null`) WITHOUT throwing.
 * Aligns with the "surface, don't obscure" principle codified in PR #10227.
 *
 * @param {Number|Date} [now=Date.now()] Time source for deterministic tests
 * @returns {Promise<{gateState: String, gateReason: String, gateTrippedAt: String|null,
 *     gateTrippedBy: String|null, daemonRunning: Boolean, lastPulseAt: String|null,
 *     secondsSinceLastPulse: Number|null}>}
 * @see ai/scripts/wakeSafetyGate.mjs
 * @see ai/scripts/swarm-heartbeat.sh
 * @see learn/agentos/wake-substrate/PersistentProcessManagement.md
 */
export async function buildWakeFeaturesBlock(now = Date.now()) {
    const nowMs = typeof now === 'number' ? now : now.getTime();

    let gateBlock = {
        gateState    : 'unknown',
        gateReason   : '',
        gateTrippedAt: null,
        gateTrippedBy: null
    };

    try {
        const gate = await readGateState();
        if (gate.trippedBy !== 'default-on-missing-file') {
            gateBlock = {
                gateState    : gate.state,
                gateReason   : gate.reason || '',
                gateTrippedAt: gate.trippedAt || null,
                gateTrippedBy: gate.trippedBy || null
            };
        }
    } catch (e) {
        // Defensive: surface 'unknown' instead of throwing — preserves the rest of the
        // healthcheck observability surface even when the gate-state read path fails.
    }

    let livenessBlock = {
        daemonRunning        : false,
        lastPulseAt          : null,
        secondsSinceLastPulse: null
    };

    try {
        const stat       = await fs.stat(heartbeatAlivePath());
        const mtimeMs    = stat.mtime.getTime();
        const ageMs      = Math.max(0, nowMs - mtimeMs);
        livenessBlock = {
            daemonRunning        : ageMs < heartbeatLivenessStaleMs(),
            lastPulseAt          : stat.mtime.toISOString(),
            secondsSinceLastPulse: Math.floor(ageMs / 1000)
        };
    } catch (e) {
        // ENOENT is the expected case when the daemon hasn't been started locally.
        // Other errors (permission, etc.) also degrade gracefully to defaults.
    }

    return {...gateBlock, ...livenessBlock};
}

/**
 * @summary Monitors and validates the ChromaDB dependency for the Memory Core MCP server.
 *
 * This service acts as a gatekeeper, ensuring that ChromaDB is properly running,
 * accessible, and contains the expected collections before any memory operations proceed.
 *
 * Key responsibilities:
 * - Connectivity validation: Ensures ChromaDB is reachable via heartbeat
 * - Collection verification: Confirms both memory and summary collections exist
 * - Intelligent caching: Reduces overhead by caching health status for 5 minutes
 * - Graceful degradation: Provides clear, actionable error messages when dependencies are missing
 * - Recovery detection: Automatically detects when issues are resolved (e.g., after starting ChromaDB)
 *
 * The service is designed to be non-blocking at startup, allowing the server to run even
 * when ChromaDB is not available, while failing gracefully at the tool-call level with helpful
 * error messages to guide users toward resolution.
 *
 * @class Neo.ai.mcp.server.memory-core.services.HealthService
 * @extends Neo.core.Base
 * @singleton
 */

/**
 * @summary Projects the backup directory state into the observability block for the healthcheck (#10844).
 *
 * Checks the backup directory for the most recent successful backup bundle by iterating
 * over backup directories (sorted newest first) and looking for `bundle-meta.json` containing
 * a `completedAt` marker. If none is found, it returns `null` for `lastSuccessful`.
 *
 * @param {String} backupPath The path to the root backup directory.
 * @param {Object} fs The fs-extra module (dependency injected for testing).
 * @param {Object} path The path module (dependency injected for testing).
 * @returns {Promise<{lastSuccessful: String|null, count: Number, error?: String}>}
 */
export async function buildBackupStateBlock(backupPath, fs, path) {
    try {
        if (!await fs.pathExists(backupPath)) {
            return { lastSuccessful: null, count: 0 };
        }

        const entries = await fs.readdir(backupPath, { withFileTypes: true });
        
        const backupDirs = entries
            .filter(e => e.isDirectory() && e.name.startsWith('backup-'))
            .map(e => e.name);

        if (backupDirs.length === 0) {
            return { lastSuccessful: null, count: 0 };
        }

        backupDirs.sort((a, b) => b.localeCompare(a));
        
        let timestamp = null;

        for (const dir of backupDirs) {
            const metaPath = path.join(backupPath, dir, 'bundle-meta.json');
            if (await fs.pathExists(metaPath)) {
                try {
                    const meta = await fs.readJson(metaPath);
                    if (meta.completedAt) {
                        timestamp = meta.timestamp || null;
                        break;
                    }
                } catch (e) {}
            }
        }

        return {
            lastSuccessful: timestamp,
            count: backupDirs.length
        };
    } catch (e) {
        return {
            lastSuccessful: null,
            count: 0,
            error: e.message
        };
    }
}

class HealthService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.services.HealthService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.services.HealthService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Cached result of the most recent health check.
     * Used to avoid redundant ChromaDB calls within the cache TTL window.
     * @member {Object|null} #cachedHealth
     * @private
     */
    #cachedHealth = null;

    /**
     * Timestamp (in milliseconds) of when the health check cache was last populated.
     * @member {number|null} #lastCheckTime
     * @private
     */
    #lastCheckTime = null;

    /**
     * Promise of the currently executing health check.
     * Used for request deduplication to prevent "thundering herd" of health checks.
     * @member {Promise<Object>|null} #healthCheckPromise
     * @private
     */
    #healthCheckPromise = null;

    /**
     * Duration (in milliseconds) for which cached HEALTHY results remain valid.
     * Set to 5 minutes to balance freshness with performance.
     * Unhealthy results are never cached to allow immediate recovery detection.
     * @member {number} #cacheDuration
     * @private
     */
    #cacheDuration = 5 * 60 * 1000;

    /**
     * The status from the previous health check, used to detect state transitions
     * (e.g., recovery from 'unhealthy' to 'healthy') and log meaningful messages.
     * @member {string|null} #previousStatus
     * @private
     */
    #previousStatus = null;

    /**
     * Tracks whether startup summarization has been attempted.
     * This helps agents understand if they need to manually trigger summarization.
     * Values: 'pending', 'completed', 'failed', 'skipped', 'skipped-non-primary', null (if not yet attempted).
     * `'skipped-non-primary'` is emitted when `NEO_AUTO_SUMMARIZE=true` but `NEO_MC_PRIMARY=false`
     * on the current instance — single-writer enforcement per #10813. Distinct from the generic
     * `'skipped'` (which today covers missing-API-key and similar precondition failures) so agents
     * can grep the healthcheck for the specific topology condition.
     * @member {string|null} #startupSummarizationStatus
     * @private
     */
    #startupSummarizationStatus = null;

    /**
     * Details about the startup summarization attempt
     * @member {Object|null} #startupSummarizationDetails
     * @private
     */
    #startupSummarizationDetails = null;

    /**
     * Cached stdio identity state for the healthcheck `identity` observability block (#10176).
     * Populated by `Server.mjs` post-`resolveStdioIdentity()` via {@link HealthService#setStdioIdentityState}.
     * Null when the setter hasn't fired yet (SSE transport, pre-boot, or timing races — all of
     * which project to `source: 'unresolved'` via {@link buildIdentityBlock}).
     * @member {Object|null} #stdioIdentityState
     * @private
     */
    #stdioIdentityState = null;

    /**
     * Checks if the active vector and graph databases are running and accessible.
     * @returns {Promise<Object>} {running: boolean, error?: string, engines: Object}
     * @private
     */
    async #checkDatabaseConnections() {
        try {
            const engine = aiConfig.engine || 'hybrid';
            const engines = { chroma: false, sqlite: false };

            // 2. Vector Chroma DB (Hybrid & Standalone Chroma)
            if (engine === 'chroma' || engine === 'hybrid') {
                await ChromaManager.ready();
                if (!ChromaManager.connected && !(await ChromaManager.connect())) {
                    throw new Error("ChromaDB is not accessible");
                }
                engines.chroma = true;
            }

            return { running: true, engines };
        } catch (e) {
            return {
                running: false,
                error  : `Database engine not accessible: ${e.message}`,
                engines: { chroma: false, sqlite: false }
            };
        }
    }

    /**
     * Verifies that the required collections exist and are accessible.
     *
     * Intent: Confirms both memory and summary collections
     * are available for operations on the active StorageRouter.
     *
     * @returns {Promise<Object>} {memories: Object|null, summaries: Object|null, error?: string}
     * @private
     */
    async #checkCollections() {
        const result = {
            memories : null,
            summaries: null
        };

        try {
            // Check memory collection
            const memoryCollection = await StorageRouter.getMemoryCollection().catch(() => null);
            if (memoryCollection) {
                result.memories = {
                    name  : aiConfig.collections.memory,
                    exists: true,
                    count : await memoryCollection.count().catch(() => 0)
                };
            } else {
                result.memories = {
                    name  : aiConfig.collections.memory,
                    exists: false,
                    count : 0
                };
            }

            // Check summary collection
            const summaryCollection = await StorageRouter.getSummaryCollection().catch(() => null);
            if (summaryCollection) {
                result.summaries = {
                    name  : aiConfig.collections.session,
                    exists: true,
                    count : await summaryCollection.count().catch(() => 0)
                };
            } else {
                result.summaries = {
                    name  : aiConfig.collections.session,
                    exists: false,
                    count : 0
                };
            }

            return result;
        } catch (e) {
            return {
                ...result,
                error: `Failed to access collections: ${e.message}`
            };
        }
    }

    /**
     * Computes the untagged-legacy-node counts for the multi-tenant migration observability
     * surface (#10017). Operators scrape `healthcheck.migration.untaggedCount.total` to track
     * how much pre-tenant-aware-era data remains as natural query patterns move writes toward
     * 100% tagged coverage. A zero total is the signal that defaults can be flipped from
     * `'legacy'` to `'private'` for the deployment.
     *
     * Implementation is pure SQLite aggregation via `GraphService.db.storage.db`. Two
     * `COUNT(*)` queries (one per tracked node label), negligible cost per healthcheck.
     * Filters for `userId` absent OR empty in the node's `properties` JSON.
     *
     * Returns `{available: false, ...zeros}` when the SQLite graph is not yet mounted
     * (e.g., pre-#{GraphService.initAsync} healthchecks). `available: false` is a
     * substrate-readiness signal, not a migration error.
     *
     * @returns {Promise<{memory: Number, session: Number, total: Number, available: Boolean, error?: String}>}
     * @see learn/agentos/tooling/MultiTenantMigrationGuide.md §5
     * @private
     */
    async #checkMigrationState() {
        try {
            // Dynamic import to avoid circular dependency with GraphService (GraphService
            // itself imports HealthService indirectly via other service chains).
            const {default: GraphService} = await import('./GraphService.mjs');
            const sqliteDb = GraphService.db?.storage?.db;

            if (!sqliteDb) {
                return {memory: 0, session: 0, total: 0, available: false};
            }

            // COALESCE guard: treats both literal NULL and empty-string as "untagged".
            // json_extract returns NULL for missing keys, which COALESCE('') normalizes,
            // letting a single `= ''` comparison handle both shapes uniformly.
            const memoryQuery = sqliteDb.prepare(`
                SELECT COUNT(*) AS c FROM Nodes
                WHERE json_extract(data, '$.label') = 'MEMORY'
                  AND COALESCE(json_extract(data, '$.properties.userId'), '') = ''
            `);
            const sessionQuery = sqliteDb.prepare(`
                SELECT COUNT(*) AS c FROM Nodes
                WHERE json_extract(data, '$.label') = 'SESSION'
                  AND COALESCE(json_extract(data, '$.properties.userId'), '') = ''
            `);

            const memory  = memoryQuery.get().c;
            const session = sessionQuery.get().c;

            return {
                memory,
                session,
                total    : memory + session,
                available: true
            };
        } catch (e) {
            return {
                memory   : 0,
                session  : 0,
                total    : 0,
                available: false,
                error    : e.message
            };
        }
    }

    /**
     * Computes the chromadb-side untagged-record counts for the multi-tenant migration
     * observability surface (#10556 — companion to the SQLite graph-side counter at
     * {@link HealthService##checkMigrationState}).
     *
     * Pre-#10145 records lack the `userId` metadata key entirely. ChromaDB's where-vocabulary
     * has no `$exists` operator and its `$ne` operator skips records with missing keys, so
     * untagged records are unreachable via filtered reads — they're invisible to all stdio
     * agents until the backfill runner (`ai/scripts/backfillChromaSharedUserId.mjs`) tags
     * them with `userId: 'shared'`. This method exposes the remaining untagged volume so
     * operators can verify migration completeness.
     *
     * Returns `{available: false, ...zeros}` when the ChromaDB client is unreachable
     * (substrate-readiness signal, not a migration error).
     *
     * @returns {Promise<{memory: Number, session: Number, total: Number, available: Boolean, error?: String}>}
     * @see ai/scripts/backfillChromaSharedUserId.mjs — the runner that tags untagged records
     * @see #10556 — the Fat Ticket establishing the additive-tenant-isolation read shape
     * @private
     */
    async #checkChromaMigrationState() {
        try {
            if (!ChromaManager.connected) {
                return {memory: 0, session: 0, total: 0, available: false};
            }

            const memoryCollection  = await StorageRouter.getMemoryCollection();
            const summaryCollection = await StorageRouter.getSummaryCollection();

            // ChromaDB's `.count()` does not accept a `where` filter; only the unfiltered total
            // is available natively. To compute untagged-count, we use the `$ne` operator's
            // documented behavior of skipping records where the metadata key is absent — so
            // `where: {userId: {$ne: <unused-sentinel>}}` returns ALL tagged records (any
            // userId value), and `total - tagged = untagged`. Cheaper than scanning every
            // record's metadata to test `userId` presence in code.
            const sentinelValueNeverUsed = '__neomjs_migration_probe__';
            const taggedFilter = {userId: {$ne: sentinelValueNeverUsed}};

            const [memoryTotal, memoryTagged, sessionTotal, sessionTagged] = await Promise.all([
                memoryCollection.count(),
                this.#countWhere(memoryCollection, taggedFilter),
                summaryCollection.count(),
                this.#countWhere(summaryCollection, taggedFilter)
            ]);

            const memoryUntagged  = Math.max(0, memoryTotal  - memoryTagged);
            const sessionUntagged = Math.max(0, sessionTotal - sessionTagged);

            return {
                memory   : memoryUntagged,
                session  : sessionUntagged,
                total    : memoryUntagged + sessionUntagged,
                available: true
            };
        } catch (e) {
            return {
                memory   : 0,
                session  : 0,
                total    : 0,
                available: false,
                error    : e.message
            };
        }
    }

    /**
     * Counts records matching a `where` clause via paginated `.get()` sweeps. Used by
     * {@link HealthService##checkChromaMigrationState} because ChromaDB's `.count()` does
     * not accept a `where` filter — only the unfiltered total is available natively.
     *
     * @param {Object} collection ChromaDB collection wrapper
     * @param {Object} where      ChromaDB where-clause filter
     * @returns {Promise<Number>}
     * @private
     */
    async #countWhere(collection, where) {
        const batchSize = 2000;
        let total       = 0;
        let offset      = 0;

        while (true) {
            const batch = await collection.get({limit: batchSize, offset, where, include: []});
            const n     = batch.ids?.length || 0;
            total += n;
            if (n < batchSize) break;
            offset += batchSize;
        }
        return total;
    }



    #checkApiKeyConfigured() {
        const providers = [aiConfig.modelProvider];
        const engine = aiConfig.engine || 'hybrid';

        if (engine === 'chroma' || engine === 'hybrid') {
            providers.push(aiConfig.embeddingProvider);
        }

        const needsGemini = providers.some(p => p === 'gemini');

        if (!needsGemini) {
            return true; // Local generation and embedding does not require Gemini key
        }
        return !!process.env.GEMINI_API_KEY;
    }

    /**
     * Performs a comprehensive health check without using the cache.
     *
     * Intent: This is the core health check logic, separated from the caching layer
     * for clarity. It systematically verifies each dependency and builds a detailed
     * status payload that can be used for diagnostics, logging, and error messages.
     *
     * The checks are performed in order of criticality:
     * 1. ChromaDB connectivity (if it's not running, nothing else matters)
     * 2. Collection accessibility (ensures data structures are ready)
     * 3. API key presence (optional, but needed for summarization)
     *
     * Status levels:
     * - healthy: ChromaDB running, collections accessible, API key present
     * - degraded: ChromaDB running, collections accessible, but API key missing
     * - unhealthy: ChromaDB not running or collections not accessible
     *
     * @returns {Promise<object>} A comprehensive health status payload
     * @private
     */
    async #performHealthCheck() {
        // Dynamic import to avoid circular dependencies
        const { default: MailboxService } = await import('./MailboxService.mjs');

        const payload = {
            status   : 'healthy',
            timestamp: new Date().toISOString(),
            session  : {
                currentId: Neo.ns('Neo.ai.mcp.server.memory-core.services.SessionService', false)?.currentSessionId
            },
            database : {
                process   : ChromaLifecycleService.getDatabaseStatus(),
                connection: {
                    connected  : false,
                    collections: null
                },
                topology  : buildTopologyBlock(aiConfig)
            },
            features : {
                summarization: false,
                wake         : await buildWakeFeaturesBlock()
            },
            startup  : {
                summarizationStatus : this.#startupSummarizationStatus || 'not_attempted',
                summarizationDetails: this.#startupSummarizationDetails
            },
            mailboxPreview: await MailboxService.getHealthcheckPreview(),
            identity : buildIdentityBlock(this.#stdioIdentityState),
            migration: await this.#checkMigrationState(),
            providers: {
                embedding: buildEmbeddingProviderBlock(aiConfig),
                summary  : buildSummaryProviderBlock(aiConfig),
                auth     : buildAuthProviderBlock(aiConfig)
            },
            backup   : await buildBackupStateBlock(aiConfig.backupPath, await import('fs-extra'), await import('path')),
            details  : [],
            version  : process.env.npm_package_version || '1.0.0',
            uptime   : process.uptime()
        };

        // Step 1: Check Database connectivity
        const connectionCheck = await this.#checkDatabaseConnections();
        payload.database.connection.connected = connectionCheck.running;
        payload.database.connection.engines = connectionCheck.engines;

        if (!connectionCheck.running) {
            payload.status = 'unhealthy';
            payload.details.push(connectionCheck.error);
            return payload;
        }

        // Step 1.5: ChromaDB-side migration observability (#10556).
        // MUST run AFTER #checkDatabaseConnections so `ChromaManager.connected` is established.
        // Earlier ordering (initialized at payload-construction time) cached `available: false`
        // on cold-process healthchecks even when the same payload reported `database.connected: true`.
        // GPT review on PR #10567 caught this — empirical reproducer in PR comments.
        payload.migration.chromadb = await this.#checkChromaMigrationState();

        // Step 2: Check collections
        const collectionsCheck = await this.#checkCollections();
        payload.database.connection.collections = {
            memories : collectionsCheck.memories,
            summaries: collectionsCheck.summaries
        };

        if (collectionsCheck.error) {
            payload.status = 'unhealthy';
            payload.details.push(collectionsCheck.error);
            return payload;
        }

        if (!collectionsCheck.memories?.exists || !collectionsCheck.summaries?.exists) {
            payload.status = 'unhealthy';
            payload.details.push('One or more required collections are missing');
            return payload;
        }

        // Step 3: Check API key for summarization feature
        const apiKeyConfigured = this.#checkApiKeyConfigured();
        payload.features.summarization = apiKeyConfigured;

        if (!apiKeyConfigured) {
            payload.status = 'degraded';
            payload.details.push('GEMINI_API_KEY not set - summarization features unavailable');
        }

        // If we made it here with no errors, report success
        if (payload.status === 'healthy') {
            if (payload.database.process.managed) {
                payload.details.push('Connected to a server-managed ChromaDB instance');
            } else {
                payload.details.push('Connected to an externally managed ChromaDB instance');
            }
            payload.details.push('All features are operational');
        }

        // Add strategy for clarity
        payload.database.process.strategy = payload.database.process.managed ? 'managed' : 'external';

        return payload;
    }

    /**
     * Public API: Checks the health of the Memory Core with intelligent caching.
     *
     * Intent: This is the primary entry point for all health checks. It uses a
     * 5-minute cache to avoid hammering ChromaDB with redundant heartbeat calls,
     * which is especially important when:
     * - The MCP server is handling multiple concurrent tool requests
     * - Agents are debugging issues and repeatedly calling healthcheck
     * - The startup sequence is running automatic summarization
     *
     * IMPORTANT: Only 'healthy' results are cached. Unhealthy/degraded results are
     * always fresh, allowing immediate recovery detection when users fix issues
     * (e.g., by starting ChromaDB or setting GEMINI_API_KEY). This ensures good UX -
     * users don't have to wait 5 minutes to retry after fixing a problem.
     *
     * Recovery detection: If the status changes between checks (e.g., from 'unhealthy'
     * to 'healthy'), we log a clear message so users know their fix worked.
     *
     * @returns {Promise<object>} A health status payload with session information
     */
    async healthcheck() {
        try {
            const now = Date.now();

            // Only use cache if the previous result was healthy
            // Unhealthy/degraded results are never cached to allow immediate recovery
            if (this.#cachedHealth &&
                this.#cachedHealth.status === 'healthy' &&
                this.#lastCheckTime) {
                const age = now - this.#lastCheckTime;

                // If the cache is still fresh (< 5 minutes old), return it immediately
                if (age < this.#cacheDuration) {
                    logger.debug(`[HealthService] Using cached health status (age: ${Math.round(age / 1000)}s)`);
                    return this.#cachedHealth;
                }
            }

            // Check for in-flight request (deduplication)
            if (this.#healthCheckPromise) {
                logger.debug('[HealthService] Joining in-flight health check...');
                return await this.#healthCheckPromise;
            }

            // Cache is stale, was unhealthy, or doesn't exist - perform a fresh check
            logger.debug('[HealthService] Performing fresh health check');

            // Create the promise and store it
            this.#healthCheckPromise = this.#performHealthCheck().finally(() => {
                // Always clear the promise when done, success or fail
                this.#healthCheckPromise = null;
            });

            const health = await this.#healthCheckPromise;

            // Detect and log meaningful state transitions
            // This helps users understand when their fixes (like starting ChromaDB) succeed
            if (this.#previousStatus && this.#previousStatus !== health.status) {
                if (this.#previousStatus === 'unhealthy' && health.status === 'healthy') {
                    logger.info('🎉 [HealthService] System recovered! Memory Core is now fully operational.');
                } else if (this.#previousStatus === 'unhealthy' && health.status === 'degraded') {
                    logger.info('⚠️  [HealthService] System partially recovered. ChromaDB is running but some features unavailable.');
                } else if (this.#previousStatus === 'degraded' && health.status === 'healthy') {
                    logger.info('✅ [HealthService] System fully recovered! All features now operational.');
                } else if ((this.#previousStatus === 'healthy' || this.#previousStatus === 'degraded') && health.status === 'unhealthy') {
                    logger.warn('⚠️  [HealthService] System became unhealthy. Tools may fail until dependencies are resolved.');
                }
            }

            // Update the cache with this fresh result
            // Note: Even unhealthy results are stored, but won't be returned from cache
            this.#cachedHealth   = health;
            this.#lastCheckTime  = now;
            this.#previousStatus = health.status;

            return health;
        } catch (error) {
            logger.error('[HealthService] Unexpected error during health check:', error);
            return {
                status : 'unhealthy',
                details: [`Unexpected error: ${error.message}`],
                error  : 'Health check failed unexpectedly',
                message: error.message,
                code   : 'HEALTH_CHECK_ERROR'
            };
        }
    }

    /**
     * Ensures the Memory Core is healthy before allowing an operation to proceed.
     *
     * Intent: This is the "gatekeeper" method used by tool handlers to fail-fast
     * with a clear error message if dependencies are not available.
     *
     * By throwing an exception, we ensure that:
     * 1. The operation doesn't attempt to use ChromaDB/Gemini and get cryptic errors
     * 2. The agent receives a clear, actionable error message via the MCP protocol
     * 3. Users understand exactly what needs to be fixed
     *
     * This method leverages the cached health check, so calling it frequently
     * (e.g., before each tool invocation) has minimal performance impact.
     *
     * Note: Both ChromaDB and GEMINI_API_KEY are required for all memory operations,
     * since adding/querying memories requires text embeddings via the Gemini API.
     * Only database lifecycle operations (start/stop) can work in degraded state.
     *
     * @throws {Error} If the Memory Core is not fully healthy, with a detailed message
     * @returns {Promise<void>}
     */
    async ensureHealthy() {
        const health = await this.healthcheck();

        if (health.status !== 'healthy') {
            // Build a multi-line error message with all the issues detected
            const details   = health.details.join('\n  - ');
            const statusMsg = health.status === 'unhealthy' ? 'not available' : 'not fully operational';
            throw new Error(`Memory Core is ${statusMsg}:\n  - ${details}`);
        }
    }

    /**
     * Records the result of startup summarization attempt.
     * Called by the startup sequence in mcp-server.mjs
     * @param {string} status  One of: 'completed', 'failed', 'skipped', 'skipped-non-primary'.
     *     `'skipped-non-primary'` is emitted when `NEO_AUTO_SUMMARIZE=true` but `NEO_MC_PRIMARY=false`
     *     on the current instance (#10813 single-writer enforcement).
     * @param {Object} details Additional information about the summarization
     */
    recordStartupSummarization(status, details=null) {
        this.#startupSummarizationStatus  = status;
        this.#startupSummarizationDetails = details;

        // Clear the cache to ensure next healthcheck returns updated info
        this.clearCache();
    }

    /**
     * Caches the resolved stdio identity so the healthcheck `identity` block can surface
     * it (#10176). Called by `Server.mjs` after `resolveStdioIdentity()` completes in the
     * stdio boot path. SSE transport does not call this — per-request OIDC identity is
     * orthogonal to process-level stdio identity; observability for SSE per-request state
     * is a separate concern.
     *
     * Clears the healthcheck cache so the next call returns a fresh payload including
     * the new identity block.
     *
     * @param {Object|null} stdioIdentityState Either `null` (unresolved) or
     *     `{userId, agentIdentityNodeId, source}`. The projection to the observable
     *     `{source, bound, nodeId}` shape happens inside `buildIdentityBlock`.
     */
    setStdioIdentityState(stdioIdentityState) {
        this.#stdioIdentityState = stdioIdentityState;
        this.clearCache();
    }

    /**
     * Clears the health check cache, forcing the next call to perform a fresh check.
     *
     * Intent: This is primarily useful for testing and debugging scenarios where
     * you need to immediately verify a fix (e.g., after starting ChromaDB)
     * without waiting for the 5-minute cache to expire.
     */
    clearCache() {
        this.#cachedHealth  = null;
        this.#lastCheckTime = null;
        logger.debug('[HealthService] Cache cleared, next health check will be fresh');
    }
}

export default Neo.setupClass(HealthService);
