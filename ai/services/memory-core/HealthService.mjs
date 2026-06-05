import fs                       from 'fs/promises';
import fsExtra                  from 'fs-extra';
import path                     from 'path';
import {fileURLToPath}          from 'url';
import aiConfig                 from '../../mcp/server/memory-core/config.mjs';
import Base                     from '../../../src/core/Base.mjs';
import ChromaManager            from './managers/ChromaManager.mjs';
import StorageRouter            from './managers/StorageRouter.mjs';
import ChromaLifecycleService   from './lifecycle/ChromaLifecycleService.mjs';
import logger                   from '../../mcp/server/memory-core/logger.mjs';
import {readGateState}          from '../../scripts/lifecycle/wakeSafetyGate.mjs';
import {
    SHARED_USER_ID,
    hasCoreSwarmParticipant,
    normalizeUserId
} from '../../mcp/server/shared/services/RequestContextService.mjs';
import {readRecentRemRunStates} from './helpers/RemRunStateStore.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @summary Heartbeat-liveness file path resolution shared with `SwarmHeartbeatService`.
 *
 * The Tier-1 config leaf owns `NEO_HEARTBEAT_ALIVE_PATH` env resolution, keeping the
 * producer and consumer on one resolved path.
 *
 * @returns {String}
 */
export function heartbeatAlivePath() {
    return aiConfig.wakeDaemonHeartbeatAlivePath;
}

/**
 * @summary Resolves the stale-threshold for the `daemonRunning` heuristic at call-time.
 *
 * Coupling contract: stale threshold = 2× POLL_INTERVAL where POLL_INTERVAL is the substrate
 * convention read in `SwarmHeartbeatService.initAsync()` (default 300s = 5 min, env-overridable).
 * The "× 2" buffer absorbs single missed pulses without false-negative liveness signal.
 *
 * Function-call-time read (rather than module-load) preserves test-isolation behavior: specs
 * that override `POLL_INTERVAL` for stalled-daemon scenarios get the env value at the moment
 * `buildWakeFeaturesBlock` runs. Mirrors the env-overridable pattern of `heartbeatAlivePath()`
 * + `wakeSafetyGate.gateFilePath()`.
 *
 * Operator override: `POLL_INTERVAL=N` (seconds) propagates from the daemon to observability
 * — a 15-min cadence (`POLL_INTERVAL=900`) yields a 30-min stale threshold, preventing the
 * hardcoded-10-min observability gap for slower heartbeat deployments.
 *
 * @returns {Number} Stale-threshold in milliseconds (2× POLL_INTERVAL × 1000).
 * @see ai/daemons/SwarmHeartbeatService.mjs#initAsync — where the POLL_INTERVAL convention lives
 */
function heartbeatLivenessStaleMs() {
    const pollIntervalSec = parseInt(process.env.POLL_INTERVAL, 10) || 300;
    return pollIntervalSec * 1000 * 2;
}

/**
 * @summary Projects the stdio identity state into the healthcheck-payload shape.
 *
 * Pure function: takes the cached stdioIdentity context (or null) and returns the
 * observability block the healthcheck response exposes — `{source, bound, nodeId, warning}`.
 * Extracted as a module-scope function so unit tests can exercise the projection
 * logic without bootstrapping the full Memory Core runtime.
 *
 * Three input shapes matter:
 * 1. `null` — stdioIdentity never populated (SSE transport, or resolver ran before the
 *    setter was invoked). Projects to `{source: 'unresolved', bound: false, nodeId: null, warning: null}`.
 * 2. Resolved without graph node — a resolver yielded a userId but no seeded
 *    AgentIdentity graph node matched. Projects to `{source: <resolved>, bound: false, nodeId: null, warning}`.
 *    Diagnostic: only an env-pinned stdio identity is a harness/operator intent signal; surface
 *    that via `identity.warning` so healthcheck consumers do not need to mine boot logs.
 * 3. Resolved with graph node — fully bound identity. Projects to
 *    `{source: <resolved>, bound: true, nodeId: '@login', warning: null}`.
 *    The success shape that A2A operation requires.
 *
 * Cloud / multi-tenant request identities (`proxy-header`, `oidc`) intentionally do not warn:
 * tenant users are not expected to have AgentIdentity graph nodes, and SSE healthcheck boot state
 * normally remains unresolved because request identity flows through `RequestContextService`.
 *
 * The projection itself stays pure and does not assign top-level health. The healthcheck
 * caller treats env-pinned unbound identity as degraded readiness because a named harness
 * cannot safely receive A2A/wake routing while `bound:false`.
 *
 * @param {Object|null} stdioIdentityState Either `null` or `{userId, agentIdentityNodeId, source}`
 * @returns {{source: String, bound: Boolean, nodeId: String|null, warning: String|null}}
 */
export function buildIdentityBlock(stdioIdentityState) {
    if (!stdioIdentityState) {
        return {source: 'unresolved', bound: false, nodeId: null, warning: null};
    }

    const {agentIdentityNodeId, source, userId} = stdioIdentityState,
          resolvedSource = source || 'unresolved',
          isEnvPinnedUnbound = resolvedSource === 'env-var' && !agentIdentityNodeId,
          warning = isEnvPinnedUnbound
              ? `NEO_AGENT_IDENTITY is pinned to '${userId || 'unknown'}' but resolved to no ` +
                `AgentIdentity graph node (bound:false). Check for a stale checkout, run ` +
                `ai/scripts/setup/seedAgentIdentities.mjs, or confirm the identity exists in ` +
                `ai/graph/identityRoots.mjs.`
              : null;

    return {
        source : resolvedSource,
        bound  : !!agentIdentityNodeId,
        nodeId : agentIdentityNodeId || null,
        warning
    };
}

/**
 * @summary Projects orchestrator task outcomes into the healthcheck `orchestrator.tasks`
 *          observability block.
 *
 * The task outcome map is updated by `Neo.ai.daemons.Orchestrator` after each child-task
 * lifecycle event. Returning a shallow clone prevents healthcheck callers from mutating
 * the cached singleton state while keeping the payload direct enough for operators to
 * inspect `summary` and `kbSync` independently.
 *
 * @param {Object} taskOutcomes Last-known outcome by task name.
 * @returns {Object}
 * @see Neo.ai.daemons.Orchestrator#recordTaskOutcome
 */
export function buildTaskOutcomesBlock(taskOutcomes) {
    return Object.entries(taskOutcomes || {}).reduce((out, [taskName, outcome]) => {
        out[taskName] = {...outcome};
        return out;
    }, {});
}

/**
 * @summary Projects the effective ChromaDB topology resolution into the healthcheck `database.topology`
 *          observability block.
 *
 * Pure function: takes an `aiConfig`-shaped input and returns the three-field projection operators
 * need to verify ChromaDB coordinate resolution — `{mode, coordinates, resolvedVia}`.
 *
 * **Post-v13 topology:** The federated topology has been retired. The system operates
 * permanently in `unified` mode. Memory Core connects as a downstream client to the shared
 * ChromaDB instance via `cfg.engines.chroma`. The `mode` is statically `'unified'` and
 * `resolvedVia` is statically `'engines.chroma'`.
 *
 * @param {Object} cfg aiConfig-shaped input. Reads `cfg.engines.chroma.{host, port}`.
 * @returns {{mode: String, coordinates: Object|null, resolvedVia: String, error: String|undefined}}
 *     `mode` is statically `'unified'`. `coordinates` is `{host, port}` on success or `null` on
 *     resolver throw. `resolvedVia` is statically `'engines.chroma'`.
 * @see learn/agentos/MemoryCore.md
 */
export function buildTopologyBlock(cfg) {
    try {
        const coordinates = cfg.engines?.chroma || null;
        if (!coordinates || !coordinates.host || !coordinates.port) {
            throw new Error('engines.chroma.{host, port} is undefined or incomplete.');
        }
        return {
            mode: 'unified',
            coordinates,
            resolvedVia: 'engines.chroma'
        };
    } catch (e) {
        return {mode: 'unified', coordinates: null, resolvedVia: 'engines.chroma', error: e.message};
    }
}

/**
 * @summary Projects the active embedding-provider configuration into the healthcheck `providers.embedding`
 *          observability block.
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
 * **What this block reports:** single-provider projection for every embedding callsite after
 * ChromaDB and SQLite Native Edge Graph provider selection were consolidated into
 * `embeddingProvider`.
 *
 * **Defensive fallback:** if the provider key isn't recognized, the block surfaces
 * `{active: <unknown-key>, host: null, model: null, dimensions: <vectorDimension>, error: <msg>}`
 * so operators see the misconfig directly. Aligns with "surface, don't obscure".
 *
 * @param {Object} cfg aiConfig-shaped input. Reads `cfg.embeddingProvider`, `cfg.openAiCompatible.{host, embeddingModel}`,
 *     `cfg.ollama.{host, embeddingModel}`, `cfg.embeddingModel` (Gemini path), `cfg.vectorDimension`.
 * @returns {{active: String, host: String|null, model: String|null, dimensions: Number, error: String|undefined}}
 * @see learn/agentos/SharedDeployment.md
 */
export function buildEmbeddingProviderBlock(cfg) {
    return buildSingleEmbeddingProviderBlock(cfg, cfg.embeddingProvider || 'openAiCompatible', 'embeddingProvider');
}

/**
 * @summary Probes the active embedding write path used by Memory Core writes.
 *
 * Memory writes fail before ChromaDB insertion when the active embedding provider cannot return a
 * vector. The provider observability block confirms configured routing; this canary verifies the
 * write-side embedding call itself so healthcheck does not report `healthy` while `add_memory`
 * would starve or fail at the embedding step.
 *
 * @param {Object} options
 * @param {Object} [options.cfg=aiConfig] aiConfig-shaped input.
 * @param {Function} [options.embedText] Optional test seam matching `TextEmbeddingService.embedText`.
 * @param {String} [options.input='neo-healthcheck-embedding-write-canary'] Probe text.
 * @param {Function} [options.now=Date.now] Time source for deterministic tests.
 * @returns {Promise<{status: String, provider: String, dimensions: Number|null,
 *     expectedDimensions: Number|null, durationMs: Number, error: String|undefined}>}
 */
export async function buildEmbeddingWriteCanaryBlock({
    cfg       = aiConfig,
    embedText = null,
    input     = 'neo-healthcheck-embedding-write-canary',
    now       = Date.now
} = {}) {
    const readNow            = typeof now === 'function' ? now : () => (typeof now === 'number' ? now : now.getTime()),
          startedAt          = readNow(),
          provider           = cfg.embeddingProvider || 'openAiCompatible',
          expectedDimensions = cfg.vectorDimension ?? null;

    try {
        const probe = embedText || (async (text, explicitProvider) => {
            const {default: TextEmbeddingService} = await import('./TextEmbeddingService.mjs');
            return TextEmbeddingService.embedText(text, explicitProvider);
        });
        const embedding = await probe(input, provider),
              dimensions = Array.isArray(embedding) ? embedding.length : null,
              durationMs = Math.max(0, readNow() - startedAt);

        if (!Array.isArray(embedding) || embedding.length === 0) {
            return {
                status: 'failed',
                provider,
                dimensions,
                expectedDimensions,
                durationMs,
                error : 'Embedding write canary returned no vector.'
            };
        }

        if (expectedDimensions && dimensions !== expectedDimensions) {
            return {
                status: 'failed',
                provider,
                dimensions,
                expectedDimensions,
                durationMs,
                error : `Embedding write canary returned ${dimensions} dimensions; expected ${expectedDimensions}.`
            };
        }

        return {
            status: 'healthy',
            provider,
            dimensions,
            expectedDimensions,
            durationMs
        };
    } catch (error) {
        return {
            status    : 'failed',
            provider,
            dimensions: null,
            expectedDimensions,
            durationMs: Math.max(0, readNow() - startedAt),
            error     : error.message
        };
    }
}

/**
 * Projects one embedding provider selector into the common healthcheck sub-block shape.
 * @param {Object} cfg aiConfig-shaped input.
 * @param {String} active The selected provider key.
 * @param {String} configName The aiConfig key name used in scoped error messages.
 * @returns {{active: String, host: String|null, model: String|null, dimensions: Number, error: String|undefined}}
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
 *          observability block.
 *
 * The shared-deployment local-model validation path needs operators to confirm that session
 * summaries are routed to the intended chat API before waiting for a disconnect-triggered
 * summarization run. This pure projection names the active provider, host, model, endpoint,
 * local status, and credential env var without exposing secret values, mirroring the sibling
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
 *          `providers.auth` observability block.
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
 *   from the upstream request and trusts the fronting proxy's identity assertion. Requests
 *   missing the proxy header in this mode are actively rejected with 401.
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
 * @summary Projects wake-substrate observable state into the healthcheck `features.wake` block.
 *
 * Async pure projection: reads the wake-safety-gate state (via `wakeSafetyGate.readGateState`)
 * and the heartbeat-liveness file mtime (touched once per pulse by
 * `SwarmHeartbeatService.touchLivenessFile()`), returning the operator/agent-facing
 * observability shape. Mirrors the
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
 * **Liveness signal substrate:** the heartbeat concurrency lock at
 * `.neo-ai-data/heartbeat-concurrency.lock` is touched only when expensive Agent OS work runs
 * (per `heartbeatLock.mjs`), NOT on every pulse. So the lock cannot serve as the daemon-liveness
 * signal directly. This block consumes a dedicated `heartbeat.alive` file that
 * `SwarmHeartbeatService.touchLivenessFile()` touches at the top of each `pulse()`; the
 * producer is the Orchestrator's swarm-heartbeat lane. Present-and-fresh means the Orchestrator
 * daemon is polling.
 *
 * **Defensive defaults:** missing files / unreadable state surfaces sensible defaults
 * (`gateState: 'unknown'`, `daemonRunning: false`, `lastPulseAt: null`) WITHOUT throwing.
 * Aligns with the "surface, don't obscure" principle.
 *
 * @param {Number|Date} [now=Date.now()] Time source for deterministic tests
 * @returns {Promise<{gateState: String, gateReason: String, gateTrippedAt: String|null,
 *     gateTrippedBy: String|null, daemonRunning: Boolean, lastPulseAt: String|null,
 *     secondsSinceLastPulse: Number|null}>}
 * @see ai/scripts/lifecycle/wakeSafetyGate.mjs
 * @see ai/daemons/SwarmHeartbeatService.mjs — the swarm-heartbeat lane that touches the liveness file
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
 * @summary Projects the orchestrator's last dream / golden-path run timestamps into the
 *          healthcheck `features.dream` observability block.
 *
 * Timestamps (`lastDreamRun`, `lastGoldenPathRun`) are `null` until the orchestrator records
 * run history. Boot-time auto-* feature flags were retired — the orchestrator daemon is the
 * sole driver of dream / golden-path / summarize / ingest, so there are no server-side flags
 * left to project.
 *
 * @param {Object|Map<String, Object>} [taskOutcomes={}] The orchestrator task outcomes map or object.
 * @returns {{lastDreamRun: String|null, lastGoldenPathRun: String|null}}
 */
export function buildDreamFeaturesBlock(taskOutcomes = {}) {
    const isMap = taskOutcomes instanceof Map;
    const dreamState = isMap ? taskOutcomes.get('dream') : taskOutcomes['dream'];
    const goldenPathState = isMap ? taskOutcomes.get('golden-path') : taskOutcomes['golden-path'];

    return {
        lastDreamRun     : dreamState?.details?.completedAt || dreamState?.details?.failedAt || null,
        lastGoldenPathRun: goldenPathState?.details?.completedAt || goldenPathState?.details?.failedAt || null
    };
}

function measuredAtIso(now) {
    const value = typeof now === 'function' ? now() : now;
    return (value instanceof Date ? value : new Date(value)).toISOString();
}

function emptyGraphLifecycleBlock(measuredAt, error) {
    const block = {
        available           : false,
        memoryNodes         : 0,
        sessionNodes        : 0,
        memoryIncidentEdges : 0,
        sessionIncidentEdges: 0,
        sqliteBytes         : 0,
        sqliteWalBytes      : 0,
        sqliteShmBytes      : 0,
        measuredAt
    };

    if (error) {
        block.error = error;
    }

    return block;
}

/**
 * @summary Projects Memory/Session graph lifecycle telemetry into the healthcheck payload.
 *
 * The block is observational only: it counts durable `MEMORY` / `SESSION` provenance anchors and
 * their incident SQLite edges, then reports the graph database main/WAL/SHM file sizes. It does not
 * mutate graph rows, alter REM freshness telemetry, or participate in vector apoptosis. Missing graph
 * storage degrades to a typed `available:false` payload so healthcheck consumers can keep reading the
 * rest of the response.
 *
 * @param {Object} [options]
 * @param {Object} [options.graphService] Optional GraphService-shaped object for tests.
 * @param {Object} [options.fileSystem=fsExtra] Filesystem adapter exposing `stat(path)`.
 * @param {Function|Number|Date} [options.now=Date.now] Time source for deterministic `measuredAt`.
 * @returns {Promise<{available: Boolean, memoryNodes: Number, sessionNodes: Number,
 *     memoryIncidentEdges: Number, sessionIncidentEdges: Number, sqliteBytes: Number,
 *     sqliteWalBytes: Number, sqliteShmBytes: Number, measuredAt: String, error: String|undefined}>}
 */
export async function buildGraphLifecycleBlock({
    graphService = null,
    fileSystem   = fsExtra,
    now          = Date.now
} = {}) {
    const measuredAt = measuredAtIso(now);

    try {
        if (!graphService) {
            graphService = (await import('./GraphService.mjs')).default;
        }

        const storage  = graphService?.db?.storage,
              sqliteDb = storage?.db,
              dbPath   = storage?.dbPath;

        if (!sqliteDb || !dbPath) {
            return emptyGraphLifecycleBlock(measuredAt, 'Graph SQLite storage is unavailable.');
        }

        const countNodes = label => Number(sqliteDb.prepare(`
            SELECT COUNT(*) AS count
            FROM Nodes
            WHERE json_extract(data, '$.label') = ?
        `).get(label)?.count || 0);

        const countIncidentEdges = label => Number(sqliteDb.prepare(`
            SELECT COUNT(*) AS count
            FROM Edges e
            WHERE EXISTS (
                SELECT 1 FROM Nodes n
                WHERE n.id = e.source
                  AND json_extract(n.data, '$.label') = ?
            )
               OR EXISTS (
                SELECT 1 FROM Nodes n
                WHERE n.id = e.target
                  AND json_extract(n.data, '$.label') = ?
            )
        `).get(label, label)?.count || 0);

        const fileSize = async filePath => {
            try {
                return Number((await fileSystem.stat(filePath)).size || 0);
            } catch (e) {
                return 0;
            }
        };

        const [
            sqliteBytes,
            sqliteWalBytes,
            sqliteShmBytes
        ] = await Promise.all([
            fileSize(dbPath),
            fileSize(`${dbPath}-wal`),
            fileSize(`${dbPath}-shm`)
        ]);

        return {
            available           : true,
            memoryNodes         : countNodes('MEMORY'),
            sessionNodes        : countNodes('SESSION'),
            memoryIncidentEdges : countIncidentEdges('MEMORY'),
            sessionIncidentEdges: countIncidentEdges('SESSION'),
            sqliteBytes,
            sqliteWalBytes,
            sqliteShmBytes,
            measuredAt
        };
    } catch (e) {
        return emptyGraphLifecycleBlock(measuredAt, e?.message || String(e));
    }
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
 * @class Neo.ai.services.memory-core.HealthService
 * @extends Neo.core.Base
 * @singleton
 */

/**
 * @summary Projects the backup directory state into the observability block for the healthcheck.
 *
 * Checks the backup directory for the most recent successful backup bundle by iterating
 * over backup directories (sorted newest first) and looking for `bundle-meta.json` containing
 * a `completedAt` marker. If none is found, it returns `null` for `lastSuccessful`.
 *
 * @param {String} backupPath The path to the root backup directory.
 * @param {Object} fs The fs-extra module (dependency injected for testing).
 * @param {Object} path The path module (dependency injected for testing).
 * @returns {Promise<{lastSuccessful: String|null, count: Number, error: String|undefined}>}
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

/**
 * @summary Projects Chroma metadata into actionable tenant-migration counters.
 *
 * Chroma's where-filter vocabulary cannot ask for "metadata key is missing" reliably, so
 * healthcheck migration observability must inspect returned metadata, not infer from `$ne`.
 * For the summary collection, this also counts core-swarm participant summaries that are
 * tagged to one peer instead of the shared sentinel — the restored-data visibility failure
 * this healthcheck block is meant to surface.
 *
 * @param {Object[]} metadatas Chroma metadata records.
 * @param {Object} [options]
 * @param {Boolean} [options.summaryCollection=false] Whether to apply summary-specific checks.
 * @returns {Object}
 * @see ai/scripts/migrations/backfillChromaSharedUserId.mjs
 */
export function buildChromaMigrationStats(metadatas, {summaryCollection = false} = {}) {
    const stats = {
        totalRecords              : 0,
        tagged                    : 0,
        missingUserId             : 0,
        shared                    : 0,
        migrationDebt             : 0,
        coreSwarmParticipant      : 0,
        coreSwarmParticipantHidden: 0,
        perUserId                 : {}
    };

    (metadatas || []).forEach(metadata => {
        stats.totalRecords++;

        const rawUserId = metadata?.userId;
        const missingUserId = rawUserId === undefined || rawUserId === null || rawUserId === '';
        const userId = normalizeUserId(rawUserId);
        const hasCorePeer = summaryCollection && hasCoreSwarmParticipant(metadata?.participatingAgents);

        if (missingUserId) {
            stats.missingUserId++;
        } else {
            stats.tagged++;
            stats.perUserId[userId] = (stats.perUserId[userId] || 0) + 1;
        }

        if (userId === SHARED_USER_ID) {
            stats.shared++;
        }

        if (hasCorePeer) {
            stats.coreSwarmParticipant++;
            if (userId !== SHARED_USER_ID) {
                stats.coreSwarmParticipantHidden++;
            }
        }

        if (missingUserId || (hasCorePeer && userId !== SHARED_USER_ID)) {
            stats.migrationDebt++;
        }
    });

    return stats;
}

/**
 * @summary Runs one REM observability axis probe with zero-value fallback.
 *
 * The MCP surface is operator-facing diagnostics, not a scheduling input. A
 * single unavailable backing store must not hide every other axis, so failures
 * are logged and projected as `0` in line with the diagnostic fallback contract.
 *
 * @param {String} label Human-readable axis label for warning logs
 * @param {Function} fn Probe function returning the axis count
 * @returns {Promise<Number>} Axis count or `0` on failure
 */
async function resolveRemAxis(label, fn) {
    try {
        return await fn();
    } catch (e) {
        logger.warn(`[HealthService] get_rem_pipeline_state axis ${label} failed:`, e?.message ?? e);
        return 0;
    }
}

/**
 * @summary Runs one REM observability block probe with a typed fallback.
 *
 * @param {String} label Human-readable block label for warning logs
 * @param {Function} fn Probe function returning the block value
 * @param {*} fallback Fallback value when the probe throws
 * @returns {Promise<*>} Block value or fallback on failure
 */
async function resolveRemBlock(label, fn, fallback) {
    try {
        return await fn();
    } catch (e) {
        logger.warn(`[HealthService] get_rem_pipeline_state block ${label} failed:`, e?.message ?? e);
        return fallback;
    }
}

/**
 * @summary Builds the operator-facing REM pipeline state projection.
 *
 * This composes the REM observability axis helpers into a single MCP-safe read
 * envelope without mutating the Dream Pipeline. The helper remains
 * in the Memory Core service boundary because the MCP server layer maps
 * operationIds to existing services after the post-M6 service lift.
 *
 * @param {Object} [options]
 * @param {String} [options.sessionId] Optional session id for per-session entity yield
 * @returns {Promise<Object>} REM pipeline state projection
 * @see ChromaManager#getUndigestedSessionCount
 * @see ChromaManager#getGraphDigestedCount
 * @see Neo.ai.services.memory-core.GraphService#getSessionNodeCount
 * @see Neo.ai.daemons.services.TopologyInferenceEngine#getTopologyConflictCount
 */
export async function buildRemPipelineState({sessionId} = {}) {
    const [
        {default: GraphService},
        {default: TopologyInferenceEngine}
    ] = await Promise.all([
        import('./GraphService.mjs'),
        import('../graph/TopologyInferenceEngine.mjs')
    ]);

    const [
        undigested,
        digested,
        sessionNodes,
        topologyConflicts
    ] = await Promise.all([
        resolveRemAxis('undigested',        () => ChromaManager.getUndigestedSessionCount()),
        resolveRemAxis('digested',          () => ChromaManager.getGraphDigestedCount()),
        resolveRemAxis('sessionNodes',      () => GraphService.getSessionNodeCount()),
        resolveRemAxis('topologyConflicts', () => TopologyInferenceEngine.getTopologyConflictCount())
    ]);

    const recentCycles = await resolveRemBlock('recentCycles', async () => {
        const entries = await readRecentRemRunStates({
            dir  : aiConfig.remRunStateDir,
            limit: aiConfig.remRunRecentLimit
        });

        return entries.map(entry => ({
            runId              : entry.runId,
            wallClockMs        : entry.wallClockMs,
            cycleOverflowSignal: entry.cycleOverflowSignal,
            cycleOverflowRatio : entry.cycleOverflowRatio,
            outcome            : entry.outcome
        }));
    }, []);

    const state = {
        undigested,
        digested,
        sessionNodes,
        topologyConflicts,
        recentCycles
    };

    if (sessionId) {
        state.perSession = {
            sessionId,
            entityCount: await resolveRemAxis('perSession.entityCount', () => GraphService.getSessionEntityCount(sessionId))
        };
    }

    return state;
}

class HealthService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.HealthService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.HealthService',
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
     * Cached healthy embedding write-canary result.
     *
     * Direct healthcheck callers get request-fresh collection counts even when the broader
     * healthy cache is still valid. Without this narrower cache, that observability refresh
     * re-runs the live embedding probe on every poll. Cache only healthy canaries so degraded
     * probes still retry immediately, while a recent success avoids adding pressure to the
     * interactive embedding path during diagnostics.
     * @member {Object|null} #embeddingWriteCanaryCache
     * @private
     */
    #embeddingWriteCanaryCache = null;

    /**
     * Bounded TTL for the embedding write-canary cache.
     * Shorter than the broader health cache: enough to collapse frequent polling bursts without
     * hiding a real write-path failure for the full 5-minute healthcheck cache window.
     * @member {number} #embeddingWriteCanaryCacheDuration
     * @private
     */
    #embeddingWriteCanaryCacheDuration = 60 * 1000;

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
     * Values: 'pending', 'completed', 'failed', 'skipped', null (if not yet attempted).
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
     * Last-known outcomes for orchestrator-owned maintenance tasks.
     * @member {Object} #taskOutcomes
     * @private
     */
    #taskOutcomes = {};

    /**
     * Cached stdio identity state for the healthcheck `identity` observability block.
     * Populated by `Server.mjs` post-`resolveStdioIdentity()` via {@link HealthService#setStdioIdentityState}.
     * Null when the setter hasn't fired yet (SSE transport, pre-boot, or timing races — all of
     * which project to `source: 'unresolved'` via {@link buildIdentityBlock}).
     * @member {Object|null} #stdioIdentityState
     * @private
     */
    #stdioIdentityState = null;

    /**
     * Checks if the active vector and graph databases are running and accessible.
     * @returns {Promise<Object>} {running: boolean, error: string|undefined, engines: Object}
     * @private
     */
    async #checkDatabaseConnections() {
        try {
            const engine = aiConfig.engine;
            const engines = { chroma: false };

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
                engines: { chroma: false }
            };
        }
    }

    /**
     * Verifies that the required collections exist and are accessible.
     *
     * Intent: Confirms both memory and summary collections
     * are available for operations on the active StorageRouter.
     *
     * @returns {Promise<Object>} {memories: Object|null, summaries: Object|null, error: string|undefined}
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
     * Builds a request-fresh healthcheck snapshot from a cached healthy payload.
     *
     * The broader healthcheck cache intentionally preserves expensive dependency probes for the
     * `ensureHealthy()` gate. Direct operator healthcheck calls still need request-time observability:
     * a fresh `timestamp` and live collection counts. Keeping this logic inside the singleton avoids
     * exporting a one-off helper and lets the method use the existing private collection probe directly.
     *
     * @param {Object} cachedHealth Previously cached healthy healthcheck payload.
     * @param {Number|Date} now Request time used for the returned `timestamp`.
     * @returns {Promise<Object|null>} Fresh request snapshot or `null` when a full healthcheck is required.
     * @private
     */
    async #buildRequestFreshCachedHealth(cachedHealth, now) {
        if (!cachedHealth) {
            return null;
        }

        let collectionsCheck;

        try {
            collectionsCheck = await this.#checkCollections();
        } catch (e) {
            return null;
        }

        if (collectionsCheck?.error ||
            !collectionsCheck?.memories?.exists ||
            !collectionsCheck?.summaries?.exists) {
            return null;
        }

        const database   = cachedHealth.database || {};
        const connection = database.connection || {};

        const freshPayload = {
            ...cachedHealth,
            timestamp: new Date(now).toISOString(),
            database : {
                ...database,
                connection: {
                    ...connection,
                    collections: {
                        memories : {...collectionsCheck.memories},
                        summaries: {...collectionsCheck.summaries}
                    }
                }
            }
        };

        return this.#applyEmbeddingWriteCanary(freshPayload);
    }

    /**
     * Computes the untagged-legacy-node counts for the multi-tenant migration observability
     * surface. Operators scrape `healthcheck.migration.untaggedCount.total` to track
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
     * @returns {Promise<{memory: Number, session: Number, total: Number, available: Boolean, error: String|undefined}>}
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
     * Computes the ChromaDB-side actionable migration-debt counts for the multi-tenant
     * observability surface, companion to the SQLite graph-side counter at
     * {@link HealthService##checkMigrationState}.
     *
     * Legacy records can lack the `userId` metadata key entirely, and restored session summaries
     * can also be tagged to one summarizing peer while `participatingAgents` names a different
     * core-swarm peer. Both shapes are invisible to the intended tenant-aware reads until the
     * backfill runner (`ai/scripts/migrations/backfillChromaSharedUserId.mjs`) tags them with
     * `userId: 'shared'`. Chroma where-filters cannot reliably falsify absent metadata-key cases
     * across versions, so this method scans metadata directly instead of inferring from `$ne`.
     *
     * Returns `{available: false, ...zeros}` when the ChromaDB client is unreachable
     * (substrate-readiness signal, not a migration error).
     *
     * @returns {Promise<Object>} Actionable debt plus untagged and summary-visibility details.
     * @see ai/scripts/migrations/backfillChromaSharedUserId.mjs — the runner that tags untagged records
     * @private
     */
    async #checkChromaMigrationState() {
        try {
            if (!ChromaManager.connected) {
                return {memory: 0, session: 0, total: 0, available: false};
            }

            const memoryCollection  = await StorageRouter.getMemoryCollection();
            const summaryCollection = await StorageRouter.getSummaryCollection();

            const [memoryStats, sessionStats] = await Promise.all([
                this.#scanChromaMetadata(memoryCollection),
                this.#scanChromaMetadata(summaryCollection, {summaryCollection: true})
            ]);

            return {
                memory   : memoryStats.migrationDebt,
                session  : sessionStats.migrationDebt,
                total    : memoryStats.migrationDebt + sessionStats.migrationDebt,
                available: true,
                untagged : {
                    memory : memoryStats.missingUserId,
                    session: sessionStats.missingUserId,
                    total  : memoryStats.missingUserId + sessionStats.missingUserId
                },
                visibility: {
                    sessions: {
                        coreSwarmParticipant      : sessionStats.coreSwarmParticipant,
                        coreSwarmParticipantHidden: sessionStats.coreSwarmParticipantHidden
                    }
                },
                details: {
                    memory : memoryStats,
                    session: sessionStats
                }
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
     * Scans Chroma collection metadata in batches and projects migration counters.
     *
     * @param {Object} collection ChromaDB collection wrapper
     * @param {Object} [options]
     * @param {Boolean} [options.summaryCollection=false]
     * @returns {Promise<Object>}
     * @private
     */
    async #scanChromaMetadata(collection, options = {}) {
        const batchSize = 2000;
        let metadatas   = [];
        let offset      = 0;

        while (true) {
            const batch = await collection.get({limit: batchSize, offset, include: ['metadatas']});
            const n     = batch.ids?.length || 0;
            metadatas = metadatas.concat(batch.metadatas || []);
            if (n < batchSize) break;
            offset += batchSize;
        }

        return buildChromaMigrationStats(metadatas, options);
    }



    #checkApiKeyConfigured() {
        const providers = [aiConfig.modelProvider];
        const engine = aiConfig.engine;

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
     * @summary Adds the embedding write canary to a healthcheck payload and degrades on failure.
     * @param {Object} payload Mutable healthcheck payload under construction.
     * @returns {Promise<Object>}
     * @private
     */
    async #applyEmbeddingWriteCanary(payload) {
        const canary = await this.#getEmbeddingWriteCanary();

        payload.providers.embedding = {
            ...payload.providers.embedding,
            writeCanary: canary
        };

        if (canary.status !== 'healthy') {
            payload.status = payload.status === 'unhealthy' ? 'unhealthy' : 'degraded';
            payload.details = (payload.details || [])
                .filter(detail => detail !== 'All features are operational')
                .filter(detail => !detail.startsWith('Embedding write canary failed:'));
            payload.details.push(`Embedding write canary failed: ${canary.error || 'unknown error'}`);
        }

        return payload;
    }

    /**
     * Resolves the embedding write canary with a short healthy-result TTL.
     *
     * Cache key includes the active provider and expected vector dimension so config changes do
     * not reuse a canary from a different embedding route.
     *
     * @returns {Promise<Object>} Embedding write-canary block.
     * @private
     */
    async #getEmbeddingWriteCanary() {
        const now = Date.now(),
              key = `${aiConfig.embeddingProvider}:${aiConfig.vectorDimension}`,
              cached = this.#embeddingWriteCanaryCache;

        if (cached &&
            cached.key === key &&
            now - cached.checkedAt < this.#embeddingWriteCanaryCacheDuration) {
            return {...cached.result};
        }

        const result = await buildEmbeddingWriteCanaryBlock();

        if (result.status === 'healthy') {
            this.#embeddingWriteCanaryCache = {
                key,
                checkedAt: now,
                result   : {...result}
            };
        } else {
            this.#embeddingWriteCanaryCache = null;
        }

        return result;
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
                currentId: Neo.ns('Neo.ai.services.memory-core.SessionService', false)?.currentSessionId
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
                wake         : await buildWakeFeaturesBlock(),
                dream        : buildDreamFeaturesBlock(this.#taskOutcomes)
            },
            startup  : {
                summarizationStatus : this.#startupSummarizationStatus || 'not_attempted',
                summarizationDetails: this.#startupSummarizationDetails
            },
            orchestrator: {
                tasks: buildTaskOutcomesBlock(this.#taskOutcomes)
            },
            mailboxPreview: await MailboxService.getHealthcheckPreview(),
            identity : buildIdentityBlock(this.#stdioIdentityState),
            migration: await this.#checkMigrationState(),
            graphLifecycle: await buildGraphLifecycleBlock(),
            providers: {
                embedding: buildEmbeddingProviderBlock(aiConfig),
                summary  : buildSummaryProviderBlock(aiConfig),
                auth     : buildAuthProviderBlock(aiConfig)
            },
            backup   : await buildBackupStateBlock(aiConfig.backupPath, fsExtra, path),
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

        // Step 1.5: ChromaDB-side migration observability.
        // MUST run AFTER #checkDatabaseConnections so `ChromaManager.connected` is established.
        // Earlier ordering (initialized at payload-construction time) cached `available: false`
        // on cold-process healthchecks even when the same payload reported `database.connected: true`.
        // This ordering keeps the migration counters consistent with the connection status
        // surfaced in the same payload.
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

        await this.#applyEmbeddingWriteCanary(payload);

        // Step 3: Check API key for summarization feature
        const apiKeyConfigured = this.#checkApiKeyConfigured();
        payload.features.summarization = apiKeyConfigured;

        if (!apiKeyConfigured) {
            payload.status = 'degraded';
            payload.details.push('GEMINI_API_KEY not set - summarization features unavailable');
        }

        if (payload.identity.warning) {
            if (payload.status === 'healthy') {
                payload.status = 'degraded';
            }
            payload.details.push(`WARN: ${payload.identity.warning}`);
        }

        // If we made it here with no errors, report success
        if (payload.status === 'healthy') {
            // Unified topology: ChromaDB is orchestrator-owned; Memory Core is always an external client.
            payload.details.push('Connected to the orchestrator-managed ChromaDB instance');
            payload.details.push('All features are operational');
        }

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
     * @param {Object} [options]
     * @param {Boolean} [options.freshObservability=true] Refresh request-facing fields on cached healthy results.
     * @returns {Promise<object>} A health status payload with session information
     */
    async healthcheck({freshObservability = true} = {}) {
        try {
            const now = Date.now();

            // Only use cache if the previous result was healthy
            // Unhealthy/degraded results are never cached to allow immediate recovery
            if (this.#cachedHealth &&
                this.#cachedHealth.status === 'healthy' &&
                this.#lastCheckTime) {
                const age = now - this.#lastCheckTime;

                // If the cache is still fresh (< 5 minutes old), reuse it while keeping
                // direct healthcheck observability request-fresh when requested.
                if (age < this.#cacheDuration) {
                    logger.debug(`[HealthService] Using cached health status (age: ${Math.round(age / 1000)}s)`);

                    if (!freshObservability) {
                        return this.#cachedHealth;
                    }

                    const freshCachedHealth = await this.#buildRequestFreshCachedHealth(this.#cachedHealth, now);

                    if (freshCachedHealth) {
                        return freshCachedHealth;
                    }

                    this.clearCache();
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
     * Public API: returns the 5-axis REM pipeline observability state.
     *
     * This method backs the `get_rem_pipeline_state` MCP tool. It deliberately
     * avoids the broader healthcheck cache because the operator-facing axis
     * counts are cheap and should reflect the latest Chroma/SQLite/handoff state.
     *
     * @param {Object} [options]
     * @param {String} [options.sessionId] Optional session id for per-session entity yield
     * @returns {Promise<Object>} 5-axis REM pipeline state projection
     */
    async getRemPipelineState(options = {}) {
        return buildRemPipelineState(options);
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
        const health = await this.healthcheck({freshObservability: false});

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
     * @param {string} status  One of: 'completed', 'failed', 'skipped'.
     * @param {Object} details Additional information about the summarization
     */
    recordStartupSummarization(status, details=null) {
        this.#startupSummarizationStatus  = status;
        this.#startupSummarizationDetails = details;

        // Clear the cache to ensure next healthcheck returns updated info
        this.clearCache();
    }

    /**
     * Records the result of an orchestrator-owned maintenance task.
     * Called by `Neo.ai.daemons.Orchestrator` after each child-task lifecycle event.
     * @param {String} taskName Stable orchestrator task name.
     * @param {String} status One of: 'running', 'completed', 'failed', 'skipped'.
     * @param {Object|null} details Additional information about the task outcome.
     */
    recordTaskOutcome(taskName, status, details=null) {
        this.#taskOutcomes[taskName] = {
            status,
            details,
            recordedAt: new Date().toISOString()
        };

        // Clear the cache to ensure next healthcheck returns updated info
        this.clearCache();
    }

    /**
     * Caches the resolved stdio identity so the healthcheck `identity` block can surface
     * it. Called by `Server.mjs` after `resolveStdioIdentity()` completes in the
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
        this.#cachedHealth              = null;
        this.#lastCheckTime             = null;
        this.#embeddingWriteCanaryCache = null;
        logger.debug('[HealthService] Cache cleared, next health check will be fresh');
    }
}

export default Neo.setupClass(HealthService);
