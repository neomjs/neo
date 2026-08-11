import fs                       from 'fs/promises';
import fsExtra                  from 'fs-extra';
import path                     from 'path';
import {fileURLToPath}          from 'url';
import aiConfig                 from '../../mcp/server/memory-core/config.mjs';
import Base                     from '../../../src/core/Base.mjs';
import {isBundleRestorable}     from './helpers/bundleIntegrity.mjs';
import {readDeployedRevision}   from '../shared/deployedRevision.mjs';
import RuntimeFreshnessService  from '../../mcp/server/shared/services/RuntimeFreshnessService.mjs';
import ChromaManager            from './managers/ChromaManager.mjs';
import StorageRouter            from './managers/StorageRouter.mjs';
import ChromaLifecycleService   from './lifecycle/ChromaLifecycleService.mjs';
import logger                   from '../../mcp/server/memory-core/logger.mjs';
import {readGateState}          from '../../scripts/lifecycle/wakeSafetyGate.mjs';
import {createBoundedRetryGate} from '../shared/boundedRetryGate.mjs';
import {
    buildEmbeddingProbeBlock,
    createEmbeddingProbeTimeoutError
}                               from '../shared/embeddingProbe.mjs';
import RequestContextService   from '../../mcp/server/shared/services/RequestContextService.mjs';
import WakeSubscriptionService from './WakeSubscriptionService.mjs';
import {
    DELIVERABLE_HARNESS_TARGET,
    isServerIssuedSigningKey
} from '../../daemons/wake/buildReceiverManifest.mjs';
import {
    SHARED_USER_ID,
    hasCoreSwarmParticipant,
    normalizeUserId
} from '../../mcp/server/shared/services/RequestContextService.mjs';
import {buildSqliteHolderDiagnostics}   from './helpers/harnessClassifier.mjs';
import {readRecentRemRunStates}         from './helpers/remRunStateStore.mjs';
import {withTimeout}                    from './helpers/withTimeout.mjs';
import {isActiveWakeSubscriptionStatus} from './wakeSubscriptionStatusPolicy.mjs';
import MemoryCoreRecorderService        from './MemoryCoreRecorderService.mjs';
import {
    LOOPBACK_PROBE_HEALTH_KEY,
    LOOPBACK_PROBE_TIMEOUT_MS,
    classifyLoopbackObservation,
    probeLoopbackFamilies,
    tcpConnectProbe
} from './helpers/loopbackFamilyProbe.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const
    configPath              = path.resolve(__dirname, '../../config.mjs'),
    openApiPath             = path.resolve(__dirname, '../../mcp/server/memory-core/openapi.yaml'),
    runtimeFreshnessTracker = RuntimeFreshnessService.createTracker({
        files  : [{
            key       : 'configDigest',
            path      : configPath,
            errorLabel: 'config digest'
        }, {
            key       : 'openApiDigest',
            path      : openApiPath,
            errorLabel: 'OpenAPI digest'
        }],
        serviceName       : 'Memory Core MCP server',
        identityLabel     : 'config/schema identity',
        assertionFacts    : 'provider, config, or tool-schema facts',
        restartScope      : 'cached provider/config state',
        statusFields      : ['configDigest', 'openApiDigest'],
        unavailableSummary: 'config digest and OpenAPI digest'
    });

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
 * 1. `null` — stdioIdentity never populated (Streamable HTTP transport, or resolver ran before the
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
 * tenant users are not expected to have AgentIdentity graph nodes, and Streamable HTTP healthcheck boot state
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
          resolvedSource                        = source || 'unresolved',
          isEnvPinnedUnbound                    = resolvedSource === 'env-var' && !agentIdentityNodeId,
          warning                               = isEnvPinnedUnbound
              ? `NEO_AGENT_IDENTITY is pinned to '${userId || 'unknown'}' but resolved to no ` +
                `AgentIdentity graph node (bound:false). Check for a stale checkout, run ` +
                `ai/scripts/setup/seedAgentIdentities.mjs, or confirm the identity exists in ` +
                `ai/graph/identityRoots.mjs.`
              : null;

    return {
        source: resolvedSource,
        bound : !!agentIdentityNodeId,
        nodeId: agentIdentityNodeId || null,
        warning
    };
}

/**
 * @summary Projects the active embedding-provider configuration into the healthcheck `providers.embedding`
 *          observability block.
 *
 * Pure function: takes an `aiConfig`-shaped input and returns the active embedding provider with
 * their host, model, and configured vector dimension. Mirrors the module-scope pure-projection precedent.
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
 * @summary Creates the structural caller-owned deadline error shared by embedding-probe consumers.
 * @param {String} operationLabel Bounded diagnostic label.
 * @param {Number} timeoutMs Consumer-owned deadline in milliseconds.
 * @returns {Error}
 */
export {createEmbeddingProbeTimeoutError};

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
 * @param {Number} [options.timeoutMs=aiConfig.healthcheck.embeddingWriteCanaryTimeoutMs] Max time to wait for the provider.
 * @returns {Promise<{status: String, provider: String, dimensions: Number|null,
 *     expectedDimensions: Number|null, durationMs: Number, error: String|undefined,
 *     errorClassification: String|undefined, errorCode: String|undefined}>}
 */
export async function buildEmbeddingWriteCanaryBlock({
    cfg       = aiConfig,
    embedText = null,
    input     = 'neo-healthcheck-embedding-write-canary',
    now       = Date.now,
    timeoutMs = aiConfig.healthcheck.embeddingWriteCanaryTimeoutMs
} = {}) {
    const probe = embedText || (async (text, explicitProvider, options) => {
        const {default: TextEmbeddingService} = await import('./TextEmbeddingService.mjs');
        return TextEmbeddingService.embedText(text, explicitProvider, options);
    });

    const attributedProbe = (text, explicitProvider, options) => probe(text, explicitProvider, {
        ...options,
        operationStage          : 'embedding-canary',
        providerActivityRecorder: MemoryCoreRecorderService,
        service                 : 'memory-core'
    });

    return buildEmbeddingProbeBlock({
        cfg,
        embedText     : attributedProbe,
        input,
        now,
        operationLabel: 'Embedding write canary',
        timeoutMs
    });
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
                host : cfg.openAiCompatible?.host || null,
                model: cfg.openAiCompatible?.embeddingModel || null,
                dimensions
            };
        case 'ollama':
            return {
                active,
                host : cfg.ollama?.host || null,
                model: cfg.ollama?.embeddingModel || null,
                dimensions
            };
        case 'gemini':
            return {
                active,
                host : null,
                model: cfg.embeddingModel || null,
                dimensions
            };
        default:
            return {
                active,
                host : null,
                model: null,
                dimensions,
                error: `Unrecognized ${configName}: '${active}'. Expected 'gemini' | 'openAiCompatible' | 'ollama'.`
            };
    }
}

/**
 * @summary Projects the active session-summary provider into the healthcheck `providers.summary`
 *          observability block.
 *
 * The shared-deployment local-model validation path needs operators to confirm that session
 * summaries are routed to the intended chat API before waiting for a disconnect-triggered
 * summarization run. This pure projection names the active provider, host, model, and local
 * status, mirroring the sibling
 * {@link buildEmbeddingProviderBlock} operator-facing `providers.*` observability strategy.
 *
 * @param {Object} cfg aiConfig-shaped input containing `modelProvider`, `modelName`, and
 *     `openAiCompatible.{host, model}`.
 * @returns {{active: String, host: String|null, model: String|null, local: Boolean}}
 */
export function buildSummaryProviderBlock(cfg) {
    const active = cfg.modelProvider || 'openAiCompatible';

    if (active === 'openAiCompatible') {
        const host = cfg.openAiCompatible?.host || null;

        return {
            active,
            host,
            model: cfg.openAiCompatible?.model || null,
            local: !!host && /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/|$)/.test(host)
        };
    }

    if (active === 'ollama') {
        const host = cfg.ollama?.host || null;

        return {
            active,
            host,
            model: cfg.ollama?.model || null,
            local: !!host && /^(https?:\/\/)?(127\.0\.0\.1|localhost|\[::1\])(?::|\/|$)/.test(host)
        };
    }

    return {
        active,
        host : null,
        model: active === 'gemini' ? cfg.modelName || null : null,
        local: false
    };
}

/**
 * @summary Resolves whether the configured Memory Core model providers have their
 *          required credentials available.
 *
 * Local providers (`openAiCompatible`, `ollama`) are valid without `GEMINI_API_KEY`;
 * Gemini requires `GEMINI_API_KEY` only for the exact summary or embedding surface that
 * selects Gemini. This keeps health diagnostics aligned with the provider SSOT instead
 * of treating a missing Gemini key as a universal Memory Core outage.
 *
 * @param {Object} cfg aiConfig-shaped input containing `modelProvider`, `embeddingProvider`,
 *     and `engine`.
 * @param {Object} [env=process.env] Environment object used for deterministic tests.
 * @returns {{ready: Boolean, summary: Object, embedding: Object, details: String[]}}
 */
export function buildProviderPrerequisiteBlock(cfg, env = process.env) {
    const supportedProviders = ['gemini', 'openAiCompatible', 'ollama'],
          engine             = cfg.engine,
          summaryProvider    = cfg.modelProvider || 'openAiCompatible',
          embeddingProvider  = cfg.embeddingProvider || 'openAiCompatible',
          checkProvider      = (provider, surface, unavailableDetail) => {
              if (!supportedProviders.includes(provider)) {
                  return {
                      ready : false,
                      detail: `Unsupported ${surface} provider '${provider}'. Expected 'gemini' | 'openAiCompatible' | 'ollama'.`
                  };
              }

              if (provider === 'gemini' && !env.GEMINI_API_KEY) {
                  return {
                      ready : false,
                      detail: unavailableDetail
                  };
              }

              return {
                  ready : true,
                  detail: null
              };
          },
          summary = checkProvider(
              summaryProvider,
              'summary',
              "Summary provider 'gemini' requires GEMINI_API_KEY - summarization features unavailable"
          ),
          embedding = (engine === 'chroma' || engine === 'hybrid')
              ? checkProvider(
                  embeddingProvider,
                  'embedding',
                  "Embedding provider 'gemini' requires GEMINI_API_KEY - semantic memory features unavailable"
              )
              : {ready: true, detail: null},
          details = [summary.detail, embedding.detail].filter(Boolean);

    return {
        ready  : summary.ready && embedding.ready,
        summary: {
            provider: summaryProvider,
            ready   : summary.ready
        },
        embedding: {
            provider: embeddingProvider,
            ready   : embedding.ready
        },
        details
    };
}

/**
 * @summary Projects wake-substrate observable state into the healthcheck `features.wake` block.
 *
 * Async pure projection: reads the wake-safety-gate state (via `wakeSafetyGate.readGateState`)
 * and the heartbeat-liveness file mtime (touched once per pulse by
 * `SwarmHeartbeatService.touchLivenessFile()`), returning the operator/agent-facing
 * observability shape. Mirrors the
 * {@link buildSummaryProviderBlock} sibling-block precedent
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
 * - `gateTrippedAt` / `gateTrippedBy`: pass-through from the gate state file when
 *   present (null otherwise).
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
 * - `subscription`: the caller-scoped arming verdict — whether THIS identity holds a wake
 *   subscription the receiver-manifest build would accept. `armed` is tri-state: `null` means the
 *   question could not be answered (unbound identity, unreadable graph), never "not armed".
 *   `reason` is one of `deliverable` | `no-active-subscription` | `unmigrated-target` |
 *   `missing-signing-key` | `unbound-identity` | `unreadable`. It reports the Memory-Core leg only
 *   and does NOT claim a wake will arrive — see {@link buildSubscriptionArmingBlock}.
 *
 * @param {Number|Date} [now=Date.now()] Time source for deterministic tests
 * @returns {Promise<{gateState: String, gateTrippedAt: String|null,
 *     gateTrippedBy: String|null, daemonRunning: Boolean, lastPulseAt: String|null,
 *     secondsSinceLastPulse: Number|null,
 *     subscription: {armed: Boolean|null, reason: String}}>}
 * @see ai/scripts/lifecycle/wakeSafetyGate.mjs
 * @see ai/daemons/SwarmHeartbeatService.mjs — the swarm-heartbeat lane that touches the liveness file
 * @see learn/agentos/wake-substrate/PersistentProcessManagement.md
 */
export async function buildWakeFeaturesBlock(now = Date.now()) {
    const nowMs = typeof now === 'number' ? now : now.getTime();

    let gateBlock = {
        gateState    : 'unknown',
        gateTrippedAt: null,
        gateTrippedBy: null
    };

    try {
        const gate = await readGateState();
        if (gate.trippedBy !== 'default-on-missing-file') {
            gateBlock = {
                gateState    : gate.state,
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
        const stat    = await fs.stat(heartbeatAlivePath());
        const mtimeMs = stat.mtime.getTime();
        const ageMs   = Math.max(0, nowMs - mtimeMs);
        livenessBlock = {
            daemonRunning        : ageMs < heartbeatLivenessStaleMs(),
            lastPulseAt          : stat.mtime.toISOString(),
            secondsSinceLastPulse: Math.floor(ageMs / 1000)
        };
    } catch (e) {
        // ENOENT is the expected case when the daemon hasn't been started locally.
        // Other errors (permission, etc.) also degrade gracefully to defaults.
    }

    return {...gateBlock, ...livenessBlock, subscription: await buildSubscriptionArmingBlock()};
}

/**
 * @summary Publishes the wake-arming verdict as a detail, so an unwakeable seat stops reading healthy.
 *
 * The verdict was already computed into `features.wake.subscription` and consumed by NOBODY — so a
 * seat with no wake route published `All features are operational` and then went silent. That silence
 * is indistinguishable from a peer who simply has nothing to say, which is how it survived weeks of
 * the swarm noticing that peers were not responding. A fact that reaches no reader is the same defect
 * as a fact never computed, and this one had its own docblock calling it "a question nothing asks".
 *
 * REPORTED, never degrading. The service is fine — it is THIS SEAT that is unreachable — and
 * degrading would restart a container over an identity-scoped condition no restart can fix.
 *
 * `armed: null` stays quiet by design: it means the question could not be answered (unbound identity,
 * unreadable graph), never "not armed". Reporting it would send someone to register a route for a
 * seat whose state is merely unknown.
 *
 * Exported and called rather than inlined at its one call site, so a test can drive THIS function
 * instead of re-implementing the predicate beside it — a spec that mirrors the rule proves only that
 * the mirror matches itself.
 *
 * @param {Object} payload Health payload under construction; mutated in place.
 * @returns {Object} The same payload.
 */
export function applyWakeArmingDetail(payload) {
    if (payload?.features?.wake?.subscription?.armed === false) {
        payload.details.push(
            `Wake route NOT armed: ${payload.features.wake.subscription.reason} — this seat cannot receive wakes until a route is registered`
        );
    }

    return payload;
}

/**
 * @summary Answers whether the CALLING identity holds a deliverable wake subscription — the
 * question nothing currently asks, so an unarmed seat reads healthy on every surface.
 *
 * **Scope, stated precisely, because conflating the two legs is how this stays invisible.** This
 * reports the Memory-Core side ONLY: does the caller own an active subscription that delivery would
 * accept. It does NOT claim a wake will arrive — the receiver holds a boot-snapshotted route
 * manifest and its own adapter coordinates, neither of which Memory Core can see. A seat can be
 * `armed: true` here and still unreachable because its route is absent from the host manifest. The
 * field is named for what it measures.
 *
 * The verdict mirrors `buildWakeReceiverManifest`'s own admission gate, in its order, because that
 * build is what actually decides whether a route exists: `status === 'active'`, then
 * `harnessTarget === 'a2a-webhook'`, then a server-issued `signingKey`. Re-deriving a looser rule
 * here is how a healthcheck comes to disagree with the thing it reports on — the earlier draft of
 * this block treated any non-`a2a-webhook` target as fine, exactly inverting the gate, so a seat
 * that the manifest refuses to publish would have read `armed: true`.
 *
 * `reason` names the furthest gate the seat reached, so it points at the next repair rather than the
 * first failure: `unmigrated-target` outranks `no-active-subscription`, and `missing-signing-key`
 * outranks both. All three were live on this plane.
 *
 * **The gates are not symmetric, and the verdict follows their asymmetry.** Status and target
 * failures SKIP their row; a missing key ABORTS the build. So one keyless row on the deliverable
 * path leaves the seat unarmed even when other rows are perfect — the manifest cannot be built at
 * all, so those good rows publish nothing either.
 *
 * Never throws, and never reports `false` on ignorance — an unbound identity (a container
 * healthcheck carries none) or an unreadable graph yields `armed: null`. Reporting `false` there
 * would manufacture an alarm out of a missing instrument.
 * @returns {Promise<{armed: Boolean|null, reason: String}>}
 * @see ai/daemons/wake/buildReceiverManifest.mjs — the gate this mirrors
 */
async function buildSubscriptionArmingBlock() {
    try {
        if (!RequestContextService.getAgentIdentityNodeId()) {
            return {armed: null, reason: 'unbound-identity'};
        }

        // Shared predicate, deliberately — this verdict claims only "the manifest build would accept
        // my rows", so it must decide `status` exactly as the builder does. It previously compared
        // strictly because the builder did, while the durable list path and the other consumers
        // coalesced an absent `status` to active; that split is now resolved in one place, and this
        // gate follows it rather than re-deciding. Hand-comparing here again would reintroduce the
        // same divergence in the opposite direction: reporting `armed: false` for a row the build
        // publishes.
        const {subscriptions = []} = await WakeSubscriptionService.list(),
              active               = subscriptions.filter(entry => isActiveWakeSubscriptionStatus(entry.status));

        if (active.length === 0) {
            return {armed: false, reason: 'no-active-subscription'};
        }

        const onDeliverablePath = active.filter(entry => entry.harnessTarget === DELIVERABLE_HARNESS_TARGET);

        if (onDeliverablePath.length === 0) {
            return {armed: false, reason: 'unmigrated-target'};
        }

        // `every`, NOT `some` — and the asymmetry is the whole point. The two earlier gates SKIP a
        // failing row (`continue`, route withdrawn), so one bad row costs only itself. The key check
        // THROWS, aborting the entire build. A single keyless row therefore makes the manifest
        // unbuildable for EVERY row in the set, including ones that are individually perfect. Read
        // with `some`, a seat holding one keyed and one keyless row reported armed while the build
        // it depends on could not run at all.
        const armed = onDeliverablePath.every(entry =>
            isServerIssuedSigningKey(entry.harnessTargetMetadata?.signingKey));

        return armed
            ? {armed: true,  reason: 'deliverable'}
            : {armed: false, reason: 'missing-signing-key'};
    } catch (e) {
        return {armed: null, reason: 'unreadable'};
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
 * **"A backup completed" and "a backup is restorable" are different facts, and this block reports
 * both separately.** Collapsing them is what let a deployment believe it had a recovery source when
 * it had none: a bundle exported zero rows for every subsystem, its receipt read `status: success`,
 * and this block — which stopped at the first `completedAt` it found — named it the last successful
 * backup. The bundle's own metadata had already recorded the truth; nothing read it.
 *
 * `backup.mjs` classifies each subsystem and persists the verdict into `bundle-meta.integrity`
 * expressly so a downstream consumer can act on it. This is that consumer.
 *
 * - `lastSuccessful` — newest completed bundle with **no** `empty` subsystem. The restorable one.
 * - `lastCompleted` — newest completed bundle regardless of verdict. Preserves the non-fatal
 *   semantics: a genuinely fresh environment backs up empty and legitimately succeeded, and making
 *   `empty` fatal would break first boot for every new deployment.
 * - `unusableCount` — completed bundles disqualified by an `empty` verdict, so
 *   `lastSuccessful: null` with a non-zero `count` cannot be misread as "runs that never finished".
 * - `unverifiedCount` — completed bundles carrying **no** integrity block, so "eligible" is never
 *   silently reported as "verified".
 *
 * A bundle with no integrity block stays **eligible**: absent evidence is not evidence of
 * emptiness, and disqualifying it would condemn any series predating the block — worse than the
 * defect. But eligible is not verified, and the receipt already records that difference as
 * `restorable: null`. Dropping it here would leave a computed verdict reaching one surface and not
 * the other, which is the exact failure this whole change exists to end. `unverifiedCount: 0` is a
 * positive assertion that everything reported was checked.
 *
 * @param {String} backupPath The path to the root backup directory.
 * @param {Object} fs The fs-extra module (dependency injected for testing).
 * @param {Object} path The path module (dependency injected for testing).
 * @returns {Promise<{lastSuccessful: String|null, lastCompleted: String|null, count: Number, unusableCount: Number, error: String|undefined}>}
 */
export async function buildBackupStateBlock(backupPath, fs, path) {
    const empty = {lastSuccessful: null, lastCompleted: null, count: 0, unusableCount: 0, unverifiedCount: 0};

    try {
        if (!await fs.pathExists(backupPath)) {
            return {...empty};
        }

        const entries = await fs.readdir(backupPath, { withFileTypes: true });

        const backupDirs = entries
            .filter(e => e.isDirectory() && e.name.startsWith('backup-'))
            .map(e => e.name);

        if (backupDirs.length === 0) {
            return {...empty};
        }

        backupDirs.sort((a, b) => b.localeCompare(a));

        let
            lastSuccessful  = null,
            lastCompleted   = null,
            unusableCount   = 0,
            unverifiedCount = 0,
            sawSuccessful   = false,
            sawCompleted    = false;

        // Full scan rather than break-on-first: `unusableCount` is a property of the SERIES, and an
        // operator reading `lastSuccessful: null` needs to know whether that means "nothing finished"
        // or "everything finished empty" — opposite diagnoses with opposite remedies.
        for (const dir of backupDirs) {
            const metaPath = path.join(backupPath, dir, 'bundle-meta.json');
            if (!await fs.pathExists(metaPath)) continue;

            let meta;

            try {
                meta = await fs.readJson(metaPath);
            } catch (e) {
                continue;
            }

            if (!meta?.completedAt) continue;

            if (!sawCompleted) {
                lastCompleted = meta.timestamp || null;
                sawCompleted  = true;
            }

            // Same rule as the backup receipt, imported rather than restated — two copies of one
            // predicate is how the halves of a contract end up disagreeing.
            const restorable = isBundleRestorable(meta.integrity);

            if (restorable === false) {
                unusableCount++;
                continue;
            }

            // Eligible but never checked. Counted rather than dropped: the receipt records this as
            // `restorable: null`, and a verdict that reaches one surface and not the other is the
            // defect this change exists to end.
            if (restorable === null) {
                unverifiedCount++;
            }

            if (!sawSuccessful) {
                lastSuccessful = meta.timestamp || null;
                sawSuccessful  = true;
            }
        }

        return {
            lastSuccessful,
            lastCompleted,
            count        : backupDirs.length,
            unusableCount,
            unverifiedCount
        };
    } catch (e) {
        return {
            ...empty,
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

        const rawUserId     = metadata?.userId;
        const missingUserId = rawUserId === undefined || rawUserId === null || rawUserId === '';
        const userId        = normalizeUserId(rawUserId);
        const hasCorePeer   = summaryCollection && hasCoreSwarmParticipant(metadata?.participatingAgents);

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
 * @param {Number} [timeoutMs=aiConfig.healthcheck.remAxisTimeoutMs] Max time to wait for the axis.
 * @returns {Promise<{value: Number, error: String|null}>} Axis count and optional degradation reason
 */
async function resolveRemAxis(label, fn, timeoutMs = aiConfig.healthcheck.remAxisTimeoutMs) {
    try {
        return {
            value: await withTimeout(Promise.resolve(fn()), timeoutMs, `REM axis ${label}`),
            error: null
        };
    } catch (e) {
        logger.warn(`[HealthService] get_rem_pipeline_state axis ${label} failed:`, e?.message ?? e);
        return {
            value: 0,
            error: e?.message || String(e)
        };
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
 * @param {Number} [options.axisTimeoutMs=aiConfig.healthcheck.remAxisTimeoutMs] Max time to wait for each axis.
 * @returns {Promise<Object>} REM pipeline state projection
 * @see ChromaManager#getUndigestedSessionCount
 * @see ChromaManager#getGraphDigestedCount
 * @see Neo.ai.services.memory-core.GraphService#getSessionNodeCount
 * @see Neo.ai.daemons.services.TopologyInferenceEngine#getTopologyConflictCount
 */
export async function buildRemPipelineState({sessionId, axisTimeoutMs = aiConfig.healthcheck.remAxisTimeoutMs} = {}) {
    const [
        {default: GraphService},
        {default: TopologyInferenceEngine}
    ] = await Promise.all([
        import('./GraphService.mjs'),
        import('../graph/TopologyInferenceEngine.mjs')
    ]);

    const axisEntries = await Promise.all([
        resolveRemAxis('undigested',        () => ChromaManager.getUndigestedSessionCount(), axisTimeoutMs),
        resolveRemAxis('digested',          () => ChromaManager.getGraphDigestedCount(), axisTimeoutMs),
        resolveRemAxis('sessionNodes',      () => GraphService.getSessionNodeCount(), axisTimeoutMs),
        resolveRemAxis('topologyConflicts', () => TopologyInferenceEngine.getTopologyConflictCount(), axisTimeoutMs)
    ]);

    const [undigested, digested, sessionNodes, topologyConflicts] = axisEntries.map(entry => entry.value),
          axisErrors                                              = Object.fromEntries(
              ['undigested', 'digested', 'sessionNodes', 'topologyConflicts']
                  .map((key, index) => [key, axisEntries[index].error])
                  .filter(([, error]) => error)
          );

    // Tracked inline (not via resolveRemBlock's silent fallback) so a failed cycle read is marked in
    // axisErrors below — a fallback [] must never masquerade as a measured empty cycle window downstream.
    let recentCycles = [], recentCyclesError;
    try {
        const entries = await readRecentRemRunStates({
            dir  : aiConfig.remRunStateDir,
            limit: aiConfig.remRunRecentLimit
        });

        recentCycles = entries.map(entry => ({
            runId              : entry.runId,
            wallClockMs        : entry.wallClockMs,
            cycleOverflowSignal: entry.cycleOverflowSignal,
            cycleOverflowRatio : entry.cycleOverflowRatio,
            outcome            : entry.outcome
        }));
    } catch (e) {
        logger.warn('[HealthService] get_rem_pipeline_state block recentCycles failed:', e?.message ?? e);
        recentCyclesError = e;
    }

    const state = {
        undigested,
        digested,
        sessionNodes,
        topologyConflicts,
        recentCycles
    };

    if (recentCyclesError) {
        axisErrors.recentCycles = recentCyclesError;
    }

    if (Object.keys(axisErrors).length) {
        state.axisErrors = axisErrors;
    }

    if (sessionId) {
        const entityCount = await resolveRemAxis(
            'perSession.entityCount',
            () => GraphService.getSessionEntityCount(sessionId),
            axisTimeoutMs
        );

        state.perSession = {
            sessionId,
            entityCount: entityCount.value
        };

        if (entityCount.error) {
            state.axisErrors = {
                ...(state.axisErrors || {}),
                'perSession.entityCount': entityCount.error
            };
        }
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
     * The lifecycle-owned embedding write-canary producer: `{gate, timer, stopped, cadenceMs,
     * healthyTtlMs, runCanary, keyFor, clock, clearSchedule}`. Created and armed ONLY by
     * `startEmbeddingWriteCanary()` (the MC server boot); disarmed by `stopEmbeddingWriteCanary()`
     * (wired to process exit). Liveness reads never create, start, or run it — they project the
     * gate's current truth, so a liveness probe issues no embedding request.
     *
     * This supersedes the retired "cache only healthy canaries so degraded probes still retry
     * immediately" asymmetry: under provider saturation that policy retried the canary at probe
     * frequency and made the liveness probe itself the load it was meant to spare. Retry now
     * lives in the gate's failure backoff; probes are pure readers.
     *
     * The gate survives stop/start: a restart re-arms the scheduler on the SAME gate, so a
     * stop-while-active restart joins (never overlaps) the unresolved flight — `maxActive=1`
     * across restarts by construction.
     * @member {Object|null} #embeddingWriteCanaryProducer
     * @private
     */
    #embeddingWriteCanaryProducer = null;

    /**
     * The status from the previous health check, used to detect state transitions
     * (e.g., recovery from 'unhealthy' to 'healthy') and log meaningful messages.
     * @member {string|null} #previousStatus
     * @private
     */
    #previousStatus = null;

    /**
     * Last-known outcomes for orchestrator-owned maintenance tasks.
     * @member {Object} #taskOutcomes
     * @private
     */
    #taskOutcomes = {};

    /**
     * Cached stdio identity state for the healthcheck `identity` observability block.
     * Populated by `Server.mjs` post-`resolveStdioIdentity()` via {@link HealthService#setStdioIdentityState}.
     * Null when the setter hasn't fired yet (Streamable HTTP transport, pre-boot, or timing races — all of
     * which project to `source: 'unresolved'` via {@link buildIdentityBlock}).
     * @member {Object|null} #stdioIdentityState
     * @private
     */
    #stdioIdentityState = null;

    /**
     * Startup dependency observations recorded by the Memory Core server boot path. These are
     * intentionally separate from the request-time health probes: the MCP server must still expose
     * WAL-local tools such as `add_memory` when graph/vector startup tiers degrade.
     * @member {Object}
     * @private
     */
    #startupDependencies = {};

    /**
     * Shared runtime freshness tracker.
     * @member {RuntimeFreshnessTracker} #runtimeFreshnessTracker
     * @private
     */
    #runtimeFreshnessTracker = runtimeFreshnessTracker;

    /**
     * Boot-time runtime identity captured before long-lived MCP clients can go stale.
     * @member {Object} bootRuntimeIdentity
     */
    get bootRuntimeIdentity() {
        return this.#runtimeFreshnessTracker.bootRuntimeIdentity;
    }

    set bootRuntimeIdentity(value) {
        this.#runtimeFreshnessTracker.bootRuntimeIdentity = value || {};
    }

    /**
     * Boot-time runtime identity read errors.
     * @member {String[]} bootRuntimeFreshnessErrors
     */
    get bootRuntimeFreshnessErrors() {
        return this.#runtimeFreshnessTracker.bootRuntimeFreshnessErrors;
    }

    set bootRuntimeFreshnessErrors(value) {
        this.#runtimeFreshnessTracker.bootRuntimeFreshnessErrors = Array.isArray(value) ? value : [];
    }

    /**
     * Optional unit-test seam for injecting boot/current runtime identity reads.
     * @member {Function|null} runtimeFreshnessReader
     */
    runtimeFreshnessReader = null;

    /**
     * ISO timestamp captured when this service module was loaded.
     * @member {String} runtimeStartedAt
     */
    get runtimeStartedAt() {
        return this.#runtimeFreshnessTracker.startedAt;
    }

    set runtimeStartedAt(value) {
        this.#runtimeFreshnessTracker.startedAt = value;
    }

    /**
     * Duration (in milliseconds) for which runtime freshness remains cached.
     * @member {Number} runtimeFreshnessCacheDuration
     */
    runtimeFreshnessCacheDuration = 30 * 1000;

    /**
     * Connect seam for the boot-time loopback bind-family probe.
     *
     * Exposed as a member so a unit spec can substitute a stub and exercise every verdict — including
     * the IPv6-answered/IPv4-refused asymmetry a single host cannot reproduce on demand — without
     * opening a real socket.
     * @member {Function} loopbackConnectProbe
     */
    loopbackConnectProbe = tcpConnectProbe;

    /**
     * Observes which loopback address families answer on the configured Chroma port and classifies
     * the result, so `logStartupStatus` can name a bind-family mismatch instead of printing an `lsof`
     * command for the operator to run.
     *
     * Wrapped in its own try/catch even though `probeLoopbackFamilies` is contractually
     * non-throwing: the config read and the classification are also inside this boundary, and this
     * runs on a path whose entire purpose is reporting a failure. A diagnostic that can itself fail a
     * boot is worse than no diagnostic.
     * @returns {Promise<Object>} Classification from `classifyLoopbackObservation`.
     * @private
     */
    async #observeLoopbackFamilies() {
        try {
            const {host, port} = aiConfig.engines.chroma;

            return classifyLoopbackObservation(await probeLoopbackFamilies({
                host,
                port,
                timeoutMs: LOOPBACK_PROBE_TIMEOUT_MS,
                connect  : this.loopbackConnectProbe
            }));
        } catch (error) {
            return {verdict: 'skipped', conclusive: false, reason: `loopback probe unavailable: ${error.message}`};
        }
    }

    /**
     * Checks if the active vector and graph databases are running and accessible.
     * @param {Number} chromaProbeTimeoutMs Chroma probe timeout budget.
     * @returns {Promise<Object>} {running: boolean, error: string|undefined, engines: Object}
     * @private
     */
    async #checkDatabaseConnections(chromaProbeTimeoutMs) {
        try {
            const engine  = aiConfig.engine;
            const engines = { chroma: false };

            // 2. Vector Chroma DB (Hybrid & Standalone Chroma)
            if (engine === 'chroma' || engine === 'hybrid') {
                await withTimeout(
                    ChromaManager.ready(),
                    chromaProbeTimeoutMs,
                    'ChromaManager.ready health probe'
                );
                if (!ChromaManager.connected && !(await withTimeout(
                    ChromaManager.connect(),
                    chromaProbeTimeoutMs,
                    'ChromaManager.connect health probe'
                ))) {
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
     * @param {Number} chromaProbeTimeoutMs Chroma probe timeout budget.
     * @returns {Promise<Object>} {memories: Object|null, summaries: Object|null, error: string|undefined}
     * @private
     */
    async #checkCollections(chromaProbeTimeoutMs) {
        const result = {
            memories         : null,
            summaries        : null,
            temporalSummaries: null
        };

        try {
            result.memories = await this.#checkCollectionCount({
                collectionType : 'memory',
                name           : aiConfig.collections.memory,
                getCollection  : () => StorageRouter.getMemoryCollection(),
                resolutionLabel: 'memory collection resolution health probe',
                countLabel     : 'memory collection count health probe',
                chromaProbeTimeoutMs
            });

            result.summaries = await this.#checkCollectionCount({
                collectionType : 'summary',
                name           : aiConfig.collections.session,
                getCollection  : () => StorageRouter.getSummaryCollection(),
                resolutionLabel: 'summary collection resolution health probe',
                countLabel     : 'summary collection count health probe',
                chromaProbeTimeoutMs
            });

            result.temporalSummaries = await this.#checkCollectionCount({
                collectionType : 'temporalSummary',
                name           : aiConfig.collections.temporalSummary,
                getCollection  : () => StorageRouter.getTemporalSummaryCollection(),
                resolutionLabel: 'temporal-summary collection resolution health probe',
                countLabel     : 'temporal-summary collection count health probe',
                chromaProbeTimeoutMs
            });

            const errors = [result.memories?.error, result.summaries?.error, result.temporalSummaries?.error].filter(Boolean);
            if (errors.length) {
                result.error = `Failed to access collections: ${errors.join('; ')}`;
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
     * Resolves and counts one Memory Core Chroma collection.
     *
     * Operation-level not-found failures on a resolved collection object are treated as
     * stale-handle evidence: invalidate that collection cache and retry resolution once.
     *
     * @param {Object} options
     * @param {'memory'|'summary'} options.collectionType
     * @param {String} options.name
     * @param {Function} options.getCollection
     * @param {String} options.resolutionLabel
     * @param {String} options.countLabel
     * @param {Number} options.chromaProbeTimeoutMs
     * @returns {Promise<Object>}
     * @private
     */
    async #checkCollectionCount({
        collectionType,
        name,
        getCollection,
        resolutionLabel,
        countLabel,
        chromaProbeTimeoutMs
    }) {
        let collection = await withTimeout(
            getCollection(),
            chromaProbeTimeoutMs,
            resolutionLabel
        ).catch(error => ({
            __resolutionError: error
        }));

        if (collection?.__resolutionError) {
            return {
                name,
                exists: false,
                count : 0,
                error : collection.__resolutionError.message
            }
        }

        if (!collection) {
            return {
                name,
                exists: false,
                count : 0
            }
        }

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                return {
                    name,
                    exists: true,
                    count : await withTimeout(
                        collection.count(),
                        chromaProbeTimeoutMs,
                        countLabel
                    )
                }
            } catch (error) {
                if (attempt > 0 || !ChromaManager.isCollectionNotFoundError(error)) {
                    return {
                        name,
                        exists: true,
                        count : 0,
                        error : error.message
                    }
                }

                ChromaManager.invalidateCollectionCache(collectionType);
                collection = await withTimeout(
                    getCollection(),
                    chromaProbeTimeoutMs,
                    resolutionLabel
                ).catch(resolveError => ({
                    __resolutionError: resolveError
                }));

                if (collection?.__resolutionError) {
                    return {
                        name,
                        exists: false,
                        count : 0,
                        error : collection.__resolutionError.message
                    }
                }

                if (!collection) {
                    return {
                        name,
                        exists: false,
                        count : 0
                    }
                }
            }
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
     * @param {Object} [options]
     * @param {Number} [options.chromaProbeTimeoutMs=aiConfig.healthcheck.chromaProbeTimeoutMs] Chroma probe timeout budget.
     * @returns {Promise<Object|null>} Fresh request snapshot or `null` when a full healthcheck is required.
     * @private
     */
    async #buildRequestFreshCachedHealth(cachedHealth, now, {
        chromaProbeTimeoutMs = aiConfig.healthcheck.chromaProbeTimeoutMs
    } = {}) {
        if (!cachedHealth) {
            return null;
        }

        let collectionsCheck;

        try {
            collectionsCheck = await this.#checkCollections(chromaProbeTimeoutMs);
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
            timestamp       : new Date(now).toISOString(),
            runtimeFreshness: await this.resolveRuntimeFreshness(),
            database        : {
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
     * Computes the untagged-legacy-node counts for the multi-tenant migration census. Reached via
     * the on-demand `getMigrationCensus()` (the `ai:migration-census-report` script) — NOT the
     * healthcheck (the census was relocated off the hot path). Operators read `graph.total` to track
     * how much pre-tenant-aware-era data remains as natural query patterns move writes toward
     * 100% tagged coverage. A zero total is the signal that defaults can be flipped from
     * `'legacy'` to `'private'` for the deployment.
     *
     * Implementation is pure SQLite aggregation via `GraphService.db.storage.db`. Two
     * `COUNT(*)` queries (one per tracked node label), negligible cost.
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
            const sqliteDb                = GraphService.db?.storage?.db;

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
        let   metadatas = [];
        let   offset    = 0;

        while (true) {
            const batch = await collection.get({limit: batchSize, offset, include: ['metadatas']});
            const n     = batch.ids?.length || 0;
            metadatas = metadatas.concat(batch.metadatas || []);
            if (n < batchSize) break;
            offset += batchSize;
        }

        return buildChromaMigrationStats(metadatas, options);
    }

    /**
     * @summary On-demand migration census: SQLite graph untagged-userId counts, plus the
     *          ChromaDB-side actionable migration-debt scan when `includeChroma` is set.
     *
     * Relocated off the healthcheck payload: the Chroma count batch-reads the full memory + summary
     * collections (`#scanChromaMetadata`), an `O(records)` cost that should not run on every liveness
     * probe. Operators run `ai:migration-census-report` (or call this) when they want the census;
     * nothing pays the scan cost otherwise. The cheap SQLite graph counts are always included;
     * `includeChroma` opts into the batch scan.
     *
     * @param {Object} [options]
     * @param {Boolean} [options.includeChroma=false] Run the `O(records)` ChromaDB metadata scan.
     * @returns {Promise<{graph: Object, chromadb: Object|undefined, measuredAt: String}>}
     */
    async getMigrationCensus({includeChroma = false} = {}) {
        const census = {
            graph     : await this.#checkMigrationState(),
            measuredAt: new Date().toISOString()
        };

        if (includeChroma) {
            census.chromadb = await this.#checkChromaMigrationState();
        }

        return census;
    }

    /**
     * Resolves the live runtime freshness diagnostic for the attached Memory Core MCP process.
     *
     * A stale runtime is a warning, not a service outage: callers can still use healthy read
     * paths while being told to restart before asserting provider/config/schema state.
     *
     * @returns {Promise<Object>} Runtime freshness diagnostic payload.
     */
    async resolveRuntimeFreshness() {
        return this.#runtimeFreshnessTracker.resolve({
            reader       : this.runtimeFreshnessReader,
            cacheDuration: this.runtimeFreshnessCacheDuration
        });
    }



    #checkProviderPrerequisites() {
        return buildProviderPrerequisiteBlock(aiConfig);
    }

    /**
     * @summary Overlays current canary truth onto a health payload — EVERY return path, no exceptions.
     *
     * The overlay is unconditional: a status-conditional overlay would drop current pending state,
     * so pending projects as a non-degrading detail even
     * when the payload stays healthy, and a settled failure degrades a cached-green payload
     * immediately. When nothing degrades, the SAME object is returned (identity preserved for
     * the `ensureHealthy()` fast path); when projecting, a new object with a new details array
     * is built — a cached payload is never mutated in place.
     *
     * Degradation DETECTION, not verbose reporting: the lean liveness payload keeps status +
     * one details entry (with the backoff reason), never the full canary sub-object.
     *
     * @param {Object} payload Health payload under construction or from cache.
     * @returns {Object} The same payload (healthy canary) or a projected copy.
     * @private
     */
    #applyEmbeddingWriteCanary(payload) {
        const canary = this.#getEmbeddingWriteCanary();

        if (canary.status === 'healthy') {
            // A live healthy canary strips canary details projected onto an earlier copy of this
            // payload (e.g. a pending note cached before the flight settled healthy) — on a COPY,
            // never mutating the stored cache. Identity is preserved when there is nothing to strip.
            // A slow-but-running loop is REPORTED without degrading. Degrading would flip exactly the
            // deployments this distinguishes into unhealthy, and the container restarts that follow
            // are the hazard the cadence leaf already warns about. Silence is not an option either:
            // an unreported slow loop is how this was mistaken for a dead one.
            if (canary.slow || payload.details?.some(detail => detail.startsWith('Embedding write canary'))) {
                const details = (payload.details || [])
                    .filter(detail => !detail.startsWith('Embedding write canary'));

                if (canary.slow) {
                    details.push(`Embedding write canary slow: ${canary.slow}`);
                }

                return {...payload, details};
            }

            return payload;
        }

        let details = (payload.details || [])
            .filter(detail => !detail.startsWith('Embedding write canary'));

        let status = payload.status;

        if (canary.status === 'failed' || canary.status === 'terminal' || canary.status === 'stale') {
            status = status === 'unhealthy' ? 'unhealthy' : 'degraded';

            details = details.filter(detail => detail !== 'All features are operational');

            if (canary.status === 'stale') {
                details.push(`Embedding write canary ${canary.reason}`);
            } else if (canary.stopReason) {
                details.push(`Embedding write canary failed: ${canary.error} (${canary.stopReason})`);
            } else if (canary.nextAttemptAt) {
                details.push(`Embedding write canary failed: ${canary.error} — backing off ${canary.backoffMs}ms (streak ${canary.failureStreak})`);
            } else {
                details.push(`Embedding write canary failed: ${canary.error}`);
            }
        } else {
            // 'pending' / 'unavailable' / 'disabled': appended observability, never a degradation — the
            // payload's existing details (including 'All features are operational') survive.
            details.push(`Embedding write canary ${canary.status}: ${canary.reason}`);
        }

        return {...payload, status, details};
    }

    /**
     * @summary Pure read of the canary producer's current truth — never creates, starts, or runs it.
     *
     * Reader-purity is the liveness contract: a liveness probe issues NO embedding request.
     * A never-started producer with a positive configured cadence reads as a named wiring gap
     * (non-degrading), not as a failure — the server boot owns `startEmbeddingWriteCanary()`.
     *
     * The staleness guard covers the dead-loop class: a healthy result older than
     * `3 · max(cadence, healthyTtl)` means the producer that should be refreshing it is gone.
     * Failure backoff is intentional waiting, not staleness — it is never flagged by this guard.
     *
     * @returns {Object} `{status: 'healthy'|'failed'|'terminal'|'stale'|'pending'|'unavailable', …}`
     * @private
     */
    #getEmbeddingWriteCanary() {
        const producer = this.#embeddingWriteCanaryProducer;

        if (!producer) {
            return {
                status: 'unavailable',
                reason: `producer not started (configured cadence ${aiConfig.healthcheck.embeddingWriteCanaryCadenceMs}ms) — scheduling is owned by the server boot`
            };
        }

        const snapshot = producer.gate.snapshot();

        if (producer.disabled) {
            // Intentional disablement is its own projection — never the old gate truth decaying
            // into a stale/failure degradation.
            return {
                status: 'disabled',
                reason: 'producer intentionally disabled (cadence <= 0) — scheduling is off until a positive cadence re-arms it'
            };
        }

        if (snapshot.status === 'healthy') {
            const staleAfter = 3 * Math.max(producer.cadenceMs, producer.healthyTtlMs),
                  age        = producer.clock() - snapshot.cached.checkedAt;

            if (age > staleAfter) {
                // An ACTIVE flight is the loop running, so it cannot also be evidence the loop is
                // gone — and this guard aged the cache without ever asking. A slow attempt therefore
                // reported `loop not running` while it was demonstrably running: on a live plane,
                // attempts of 662-1010s settled SUCCESSFULLY and were labelled dead throughout.
                //
                // That is worse than a mislabel. `loop not running` is the signal observers used to
                // conclude the deployment was dead, so the instrument manufactured the diagnosis it
                // was consulted for. The slow attempt is still reported — as slowness, which is what
                // it is — and a loop with NOTHING in flight still reports stale, because a dead loop
                // is a real condition and this must not become the way to hide it.
                // BOUNDED by the flight's own age, not by its mere existence. A flight that never
                // settles would otherwise suppress this guard forever — trading a false `stale` for a
                // permanent false `healthy`, which is the worse direction: a probe reporting a dead
                // provider as merely slow is unobservable, where the reverse at least gets
                // investigated. The attempt's issued budget is the bound it agreed to; past that, its
                // own deadline failed to fire, and that is a fault in its own right.
                // Both sides come from the attempt's OWN record: the budget it was issued under and
                // the start instant on the clock it was issued with. Reading `producer.timeoutMs`
                // here would judge a live flight against whatever the last re-arm happened to set.
                const attempt    = producer.activeAttempt,
                      inFlightMs = attempt ? Math.max(0, producer.clock() - attempt.startedAt) : null;

                if (snapshot.inFlight && attempt && inFlightMs <= attempt.timeoutMs) {
                    return {
                        status: 'healthy',
                        slow  : `an attempt has been in flight ${Math.round(inFlightMs / 1000)}s (issued budget ${attempt.timeoutMs}ms, last healthy result ${Math.round(age / 1000)}s old) — the loop is running SLOWLY, not stopped`
                    };
                }

                if (snapshot.inFlight) {
                    return {
                        status: 'stale',
                        reason: attempt
                            ? `attempt STUCK in flight ${Math.round(inFlightMs / 1000)}s, past the ${attempt.timeoutMs}ms budget it was ISSUED under — the deadline did not fire`
                            : 'a flight is active but its issued basis is unobservable — treating as stuck'
                    };
                }

                return {
                    status: 'stale',
                    reason: `loop not running (last healthy result ${Math.round(age / 1000)}s old, cadence ${producer.cadenceMs}ms, no attempt in flight)`
                };
            }

            return {status: 'healthy'};
        }

        if (snapshot.cached) {
            // One failure predicate, mirrored from the gate: ANY non-healthy settled outcome —
            // whatever status string the attempt body used — projects as a failure with its
            // retry truth, so inward and outward metadata can never disagree.
            return {
                status       : snapshot.terminal ? 'terminal' : 'failed',
                error        : snapshot.cached.result?.error || 'unknown error',
                failureStreak: snapshot.failureStreak,
                backoffMs    : snapshot.backoffMs,
                nextAttemptAt: snapshot.nextAttemptAt,
                stopReason   : snapshot.stopReason
            };
        }

        // 'pending' (no settled result yet — first flight in progress or never ticked)
        return {
            status: 'pending',
            reason: snapshot.inFlight ? 'run in flight' : 'no result yet'
        };
    }

    /**
     * @summary Starts (or re-arms) the lifecycle-owned embedding write-canary producer.
     *
     * The ONLY place canary scheduling exists. The MC server boot calls this before its first
     * healthcheck; liveness probes can never create, start, or run the producer. Start-after-stop
     * re-arms the scheduler on the SAME gate (single-flight continuity): a stop-while-active
     * restart joins the unresolved flight rather than launching beside it — `maxActive=1` across
     * restarts by construction. One immediate demand fires on start so the first healthcheck has
     * truth fast; single-flight makes that safe.
     *
     * The re-arm contract, explicitly:
     * - **Epoch fencing:** every arm and every stop bumps the producer epoch; a scheduled callback
     *   closes over its own epoch, so a callback queued before a stop/re-arm is inert forever —
     *   it can never be revived by a later arm resetting `stopped`.
     * - **Handle pairing:** a scheduled handle is always cleared by the `clearSchedule` that was
     *   armed alongside it, never by a different arm's clearer.
     * - **Preserve-vs-refresh:** collaborators (`runCanary`, `keyFor`, `scheduler`,
     *   `clearSchedule`, `clock`) are PRESERVED from the previous arm when omitted and REPLACED
     *   when provided. Config-resolved numerics (`cadenceMs`, `timeoutMs`, `healthyTtlMs`,
     *   `failureTtlMs`, `failureTtlMaxMs`) always re-resolve from config at arm time; the gate's
     *   backoff windows bind at first gate creation.
     * - **Disable:** a non-positive `cadenceMs` synchronously disarms AND epoch-fences an
     *   existing schedule before returning `null`.
     *
     * All collaborators are injectable seams (defaults read aiConfig at the use site) so specs
     * inject scheduler/clock/runCanary instead of mutating shared config.
     *
     * @param {Object}   [options]
     * @param {Number}   [options.cadenceMs=aiConfig.healthcheck.embeddingWriteCanaryCadenceMs] Producer attempt period; `<= 0` disables (disarms an existing schedule, returns null).
     * @param {Number}   [options.timeoutMs=aiConfig.healthcheck.embeddingWriteCanaryTimeoutMs] Per-attempt provider deadline for the DEFAULT attempt body — re-resolved on every arm and read at call time; a provided `runCanary` is opaque and keeps its own bounds.
     * @param {Number}   [options.healthyTtlMs=aiConfig.healthcheck.embeddingWriteCanaryHealthyTtlMs] Staleness floor for the last healthy result.
     * @param {Number}   [options.failureTtlMs=aiConfig.healthcheck.embeddingWriteCanaryFailureTtlMs] Base failure-backoff window (binds at first gate creation).
     * @param {Number}   [options.failureTtlMaxMs=aiConfig.healthcheck.embeddingWriteCanaryFailureTtlMaxMs] Backoff ceiling (binds at first gate creation).
     * @param {Function} [options.runCanary] Attempt body; preserved when omitted on re-arm.
     * @param {Function} [options.keyFor] Generation-key resolver; preserved when omitted on re-arm.
     * @param {Function} [options.scheduler] `(fn, ms) => handle`; preserved when omitted on re-arm.
     * @param {Function} [options.clearSchedule] `(handle) => void`; preserved when omitted on re-arm.
     * @param {Function} [options.clock] Time source; preserved when omitted on re-arm.
     * @returns {Object|null} The producer record, or `null` when disabled by cadence.
     * @protected
     */
    startEmbeddingWriteCanary(options = {}) {
        const {
            cadenceMs       = aiConfig.healthcheck.embeddingWriteCanaryCadenceMs,
            timeoutMs       = aiConfig.healthcheck.embeddingWriteCanaryTimeoutMs,
            healthyTtlMs    = aiConfig.healthcheck.embeddingWriteCanaryHealthyTtlMs,
            failureTtlMs    = aiConfig.healthcheck.embeddingWriteCanaryFailureTtlMs,
            failureTtlMaxMs = aiConfig.healthcheck.embeddingWriteCanaryFailureTtlMaxMs,
            runCanary,
            keyFor,
            scheduler,
            clearSchedule,
            clock
        } = options;

        let producer = this.#embeddingWriteCanaryProducer;

        if (!(cadenceMs > 0)) {
            // Disabled cadence: synchronously disarm AND fence an existing schedule (the epoch
            // bump makes any queued callback inert), then report disabled. The projection is
            // explicit: reads report `disabled` (non-degrading), never the old gate truth.
            if (producer) {
                producer.disabled = true;
                producer.epoch++;
                producer.stopped = true;

                if (producer.timer !== null && producer.timer !== undefined) {
                    producer.clearSchedule(producer.timer);
                    producer.timer = null;
                }
            }

            return null; // Contract Ledger fallback: a non-positive cadence disables the producer.
        }

        // Collaborators are PRESERVED from the previous arm when omitted and REPLACED when
        // provided — the explicit preserve-vs-refresh re-arm contract. Config-resolved numerics
        // always re-resolve (config may have changed while stopped); the gate's backoff windows
        // bind at first gate creation.
        const schedule   = scheduler     ?? producer?.schedule      ?? ((fn, ms) => setInterval(fn, ms)),
              unschedule = clearSchedule ?? producer?.clearSchedule ?? (handle => clearInterval(handle));

        if (producer?.timer !== null && producer?.timer !== undefined) {
            // The clearer that PAIRED the old handle clears it — never a different arm's clearer,
            // and every non-null handle is cleared (a scheduler may legitimately return 0).
            producer.clearSchedule(producer.timer);
            producer.timer = null;
        }

        if (!producer) {
            producer = this.#embeddingWriteCanaryProducer = {
                epoch: 0,
                gate : createBoundedRetryGate({
                    // Delegated through the record so a re-arm can refresh the attempt body
                    // without replacing the gate (single-flight continuity across restarts).
                    // Wrapped so the attempt's ISSUED budget and start instant are captured at the
                    // moment it is issued. `producer.timeoutMs` is mutable — every re-arm overwrites
                    // it while this gate and any in-flight attempt are deliberately preserved — so
                    // judging a live flight against the CURRENT config compares it to a deadline it
                    // was never issued under. A 900s attempt re-armed to 30s would read STUCK at 31s;
                    // a 30s attempt re-armed to 900s would read healthy past its missed deadline.
                    run: async ctx => {
                        producer.activeAttempt = {startedAt: producer.clock(), timeoutMs: producer.timeoutMs};

                        try {
                            return await producer.runCanary(ctx);
                        } finally {
                            producer.activeAttempt = null;
                        }
                    },
                    failureTtlMs,
                    failureTtlMaxMs,
                    now: () => producer.clock()
                }),
                clearSchedule: unschedule,
                disabled     : false,
                schedule,
                clock        : clock ?? Date.now,
                keyFor       : keyFor ?? (() => `${aiConfig.embeddingProvider}:${aiConfig.vectorDimension}`),
                // The default attempt body reads the arm's timeoutMs AT CALL TIME, so a numeric
                // re-resolve on re-arm flows through the preserved body without replacing it.
                runCanary: runCanary ?? (() => buildEmbeddingWriteCanaryBlock({timeoutMs: producer.timeoutMs})),
                stopped  : false,
                timer    : null,
                // The in-flight attempt's own basis: `{startedAt, timeoutMs}` as issued. Null between
                // attempts. Never read from the mutable arm fields — see the `run` wrapper above.
                activeAttempt: null
            };
        } else {
            if (clock) {
                // `startedAt` is an absolute instant, meaningful only in the clock that produced it.
                // A re-arm carrying a fresh source must carry the in-flight attempt's ELAPSED time
                // across, or the flight's age becomes a comparison between two unrelated timelines.
                if (producer.activeAttempt) {
                    const elapsedMs = Math.max(0, producer.clock() - producer.activeAttempt.startedAt);

                    producer.activeAttempt.startedAt = clock() - elapsedMs;
                }

                producer.clock = clock;
            }

            if (keyFor)    producer.keyFor    = keyFor;
            if (runCanary) producer.runCanary = runCanary;

            producer.schedule      = schedule;
            producer.clearSchedule = unschedule;
        }

        producer.cadenceMs    = cadenceMs;
        producer.disabled     = false;
        producer.healthyTtlMs = healthyTtlMs;
        producer.stopped      = false;
        producer.timeoutMs    = timeoutMs;

        const epoch = ++producer.epoch;

        producer.timer = producer.schedule(() => {
            // Epoch fence: a callback queued before stop()/re-arm stays inert forever — it reads
            // an epoch that has moved on, never a reset `stopped` flag.
            if (producer.epoch === epoch && !producer.stopped) {
                producer.gate.tick({key: producer.keyFor()});
            }
        }, cadenceMs);

        // First-truth-fast: one immediate demand; it joins an unresolved flight on re-arm.
        producer.gate.tick({key: producer.keyFor()});

        return producer;
    }

    /**
     * @summary Disarms the canary scheduler and fences any queued callbacks; never touches the
     * gate, its cache, or an in-flight run.
     *
     * Wired to `process exit` in the MC server boot: the epoch bump makes queued/captured tick
     * callbacks inert (a later re-arm cannot revive them), while an in-flight attempt drains
     * naturally — a later `startEmbeddingWriteCanary()` joins it through the same gate and never
     * overlaps.
     * @protected
     */
    stopEmbeddingWriteCanary() {
        const producer = this.#embeddingWriteCanaryProducer;

        if (producer) {
            producer.epoch++;
            producer.stopped = true;

            if (producer.timer !== null && producer.timer !== undefined) {
                producer.clearSchedule(producer.timer);
                producer.timer = null;
            }
        }
    }

    /**
     * @summary Disarms AND drops the canary producer — the test/restart-boundary seam.
     *
     * `stopEmbeddingWriteCanary()` deliberately preserves the gate so a restart joins an
     * in-flight attempt; this seam goes one step further for spec isolation and simulated
     * boot gaps (the `clearStartupDependencyState()` precedent): the next
     * `startEmbeddingWriteCanary()` builds a fresh gate, and reads report `unavailable`
     * (the named wiring gap) until then.
     * @returns {void}
     */
    clearEmbeddingWriteCanaryProducer() {
        this.stopEmbeddingWriteCanary();
        this.#embeddingWriteCanaryProducer = null;
    }

    /**
     * @summary Operator-diagnostics seam: demand one canary attempt now, through the gate.
     *
     * Joins an in-flight attempt and bypasses failure backoff (operator demand), but NEVER
     * overlaps. Recovery never depends on this — the scheduled tick drives it and the specs
     * prove that. Without a producer (server not booted / cadence disabled) it runs a detached
     * one-shot probe and caches nothing.
     * @returns {Promise<Object>} The attempt result (gate-annotated when a producer exists).
     */
    runEmbeddingWriteCanaryNow() {
        const producer = this.#embeddingWriteCanaryProducer;

        if (producer) {
            return producer.gate.runNow({key: producer.keyFor()});
        }

        return buildEmbeddingWriteCanaryBlock({
            timeoutMs: aiConfig.healthcheck.embeddingWriteCanaryTimeoutMs
        });
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
     * 3. Provider prerequisites (only the configured provider surfaces require credentials)
     *
     * Status levels:
     * - healthy: ChromaDB running, collections accessible, configured providers ready
     * - degraded: ChromaDB running, collections accessible, but a configured provider is missing credentials
     * - unhealthy: ChromaDB not running or collections not accessible
     *
     * @param {Object} [options]
     * @param {Number} [options.chromaProbeTimeoutMs=aiConfig.healthcheck.chromaProbeTimeoutMs] Chroma probe timeout budget.
     * @returns {Promise<object>} A comprehensive health status payload
     * @private
     */
    async #performHealthCheck({
        chromaProbeTimeoutMs = aiConfig.healthcheck.chromaProbeTimeoutMs
    } = {}) {
        const payload = {
            status          : 'healthy',
            timestamp       : new Date().toISOString(),
            runtimeFreshness: await this.resolveRuntimeFreshness(),
            session         : {
                currentId: Neo.ns('Neo.ai.services.memory-core.SessionService', false)?.currentSessionId
            },
            database : {
                process   : ChromaLifecycleService.getDatabaseStatus(),
                connection: {
                    connected  : false,
                    collections: null
                }
            },
            features : {
                summarization: false,
                wake         : await buildWakeFeaturesBlock()
            },
            identity : buildIdentityBlock(this.#stdioIdentityState),
            providers: {
                embedding: buildEmbeddingProviderBlock(aiConfig),
                summary  : buildSummaryProviderBlock(aiConfig)
            },
            startup : {
                dependencies: this.getStartupDependencyState()
            },
            backup : await buildBackupStateBlock(aiConfig.backupPath, fsExtra, path),
            details: [],
            version: process.env.npm_package_version || '1.0.0',
            // Which release line, not which commit — see the KB surface for the same pairing. Always
            // emitted, `unknown` when no build wrote a revision, because an omitted field reads as
            // current to a consumer computing deployment skew.
            deployedRevision: readDeployedRevision(),
            uptime          : process.uptime()
        };

        // Step 1: Check Database connectivity
        const connectionCheck = await this.#checkDatabaseConnections(chromaProbeTimeoutMs);
        payload.database.connection.connected = connectionCheck.running;
        payload.database.connection.engines = connectionCheck.engines;

        if (!connectionCheck.running) {
            payload.status = 'unhealthy';
            payload.details.push(connectionCheck.error);

            // Gated on the connection OUTCOME, not on the caller. `healthcheck()` also serves the MCP
            // `healthcheck` tool on every invocation, so an ungated probe would dial two sockets per
            // call forever to answer a question only a failure asks — but an UNHEALTHY tool call does
            // probe, deliberately, because that is exactly when the answer is wanted. Here the
            // connection has already failed, so the ~2ms buys the one diagnostic that distinguishes
            // "Chroma is down" from "Chroma is up on the family you did not dial".
            payload.database.connection[LOOPBACK_PROBE_HEALTH_KEY] = await this.#observeLoopbackFamilies();

            return this.#applyEmbeddingWriteCanary(payload);
        }

        // Step 2: Check collections
        const collectionsCheck = await this.#checkCollections(chromaProbeTimeoutMs);
        payload.database.connection.collections = {
            memories : collectionsCheck.memories,
            summaries: collectionsCheck.summaries
        };

        if (collectionsCheck.error) {
            payload.status = 'unhealthy';
            payload.details.push(collectionsCheck.error);
            return this.#applyEmbeddingWriteCanary(payload);
        }

        if (!collectionsCheck.memories?.exists || !collectionsCheck.summaries?.exists) {
            payload.status = 'unhealthy';
            payload.details.push('One or more required collections are missing');
            return this.#applyEmbeddingWriteCanary(payload);
        }

        // Step 3: Check configured provider prerequisites.
        const providerPrerequisites = this.#checkProviderPrerequisites();
        payload.features.summarization = providerPrerequisites.summary.ready;

        if (!providerPrerequisites.ready) {
            payload.status = 'degraded';
            payload.details.push(...providerPrerequisites.details);
        }

        if (payload.identity.warning) {
            if (payload.status === 'healthy') {
                payload.status = 'degraded';
            }
            payload.details.push(`WARN: ${payload.identity.warning}`);
        }

        for (const [name, dependency] of Object.entries(payload.startup.dependencies)) {
            if (dependency.status === 'ready') continue;

            if (payload.status === 'healthy') {
                payload.status = 'degraded';
            }
            payload.details.push(`Startup dependency '${name}' is ${dependency.status}: ${dependency.error || 'see startup.dependencies'}`);
        }

        applyWakeArmingDetail(payload);

        // If we made it here with no errors, report success
        if (payload.status === 'healthy') {
            // Unified topology: ChromaDB is orchestrator-owned; Memory Core is always an external client.
            payload.details.push('Connected to the orchestrator-managed ChromaDB instance');
            payload.details.push('All features are operational');
        }

        return this.#applyEmbeddingWriteCanary(payload);
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
     * @param {Number} [options.chromaProbeTimeoutMs=aiConfig.healthcheck.chromaProbeTimeoutMs] Chroma probe timeout budget.
     * @returns {Promise<object>} A health status payload with session information
     */
    async healthcheck({
        freshObservability = true,
        chromaProbeTimeoutMs = aiConfig.healthcheck.chromaProbeTimeoutMs
    } = {}) {
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
                    logger.fileDebug(`[HealthService] Using cached health status (age: ${Math.round(age / 1000)}s)`);

                    if (!freshObservability) {
                        return this.#applyEmbeddingWriteCanary(this.#cachedHealth);
                    }

                    const freshCachedHealth = await this.#buildRequestFreshCachedHealth(this.#cachedHealth, now, {
                        chromaProbeTimeoutMs
                    });

                    if (freshCachedHealth) {
                        return freshCachedHealth;
                    }

                    this.clearCache();
                }
            }

            // Check for in-flight request (deduplication)
            if (this.#healthCheckPromise) {
                logger.fileDebug('[HealthService] Joining in-flight health check...');
                return await this.#healthCheckPromise;
            }

            // Cache is stale, was unhealthy, or doesn't exist - perform a fresh check
            logger.fileDebug('[HealthService] Performing fresh health check');

            // Create the promise and store it
            this.#healthCheckPromise = this.#performHealthCheck({
                chromaProbeTimeoutMs
            }).finally(() => {
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
            return this.#applyEmbeddingWriteCanary({
                status : 'unhealthy',
                details: [`Unexpected error: ${error.message}`],
                error  : 'Health check failed unexpectedly',
                message: error.message,
                code   : 'HEALTH_CHECK_ERROR'
            });
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
     * @summary Returns an on-demand read-only diagnostic for sibling SQLite holder processes.
     *
     * The probe is intentionally outside the default healthcheck path: it shells out to `lsof`
     * and walks process parent chains, which is useful for operator triage but too expensive for
     * routine liveness. Probe failures degrade this diagnostic payload only; they do not change
     * Memory Core health when the database itself is usable.
     *
     * @returns {Promise<Object>} Current SQLite holder diagnostic payload.
     */
    async getSqliteHolderDiagnostics() {
        return buildSqliteHolderDiagnostics({
            dbPath    : aiConfig.storagePaths.graph,
            currentPid: process.pid
        });
    }

    /**
     * Ensures the Memory Core is healthy before allowing an operation to proceed.
     *
     * Intent: This is the "gatekeeper" method used by tool handlers to fail-fast
     * with a clear error message if dependencies are not available.
     *
     * By throwing an exception, we ensure that:
     * 1. The operation doesn't attempt to use unavailable storage/provider dependencies and get cryptic errors
     * 2. The agent receives a clear, actionable error message via the MCP protocol
     * 3. Users understand exactly what needs to be fixed
     *
     * This method leverages the cached health check, so calling it frequently
     * (e.g., before each tool invocation) has minimal performance impact.
     *
     * Note: Embedding-dependent reads require ChromaDB and the configured embedding
     * provider to be available. Local providers do not require `GEMINI_API_KEY`, and
     * the server exempts mailbox, WAL-backed `add_memory`, and non-embedding recency
     * reads from this gate when a model-provider surface is degraded.
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
     * Reads the most-recently recorded outcome for a task, or `null` when none is recorded.
     * Returns a **defensive deep clone** of `{status, details, recordedAt}` (via `structuredClone`),
     * so a caller mutating the result — including its nested `details` — can never corrupt the
     * internal per-task outcome map. Read-only accessor over that map.
     * @param {String} taskName
     * @returns {{status:String, details:(Object|null), recordedAt:String}|null}
     */
    getTaskOutcome(taskName) {
        const outcome = this.#taskOutcomes[taskName];
        return outcome ? structuredClone(outcome) : null;
    }

    /**
     * Caches the resolved stdio identity so the healthcheck `identity` block can surface
     * it. Called by `Server.mjs` after `resolveStdioIdentity()` completes in the
     * stdio boot path. Streamable HTTP transport does not call this — per-request OIDC identity is
     * orthogonal to process-level stdio identity; observability for Streamable HTTP per-request state
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
     * Records startup dependency readiness without turning degraded graph/vector tiers into MCP
     * server boot failures. Exposed through `healthcheck().startup.dependencies`.
     * @param {String} name Stable dependency key.
     * @param {String} status Readiness status, e.g. 'ready' or 'degraded'.
     * @param {Object|null} details Optional diagnostic details.
     */
    recordStartupDependency(name, status, details=null) {
        this.#startupDependencies[name] = {
            status,
            ...(details || {}),
            recordedAt: new Date().toISOString()
        };
        this.clearCache();
    }

    /**
     * @returns {Object} Shallow-cloned startup dependency status map.
     */
    getStartupDependencyState() {
        return Object.fromEntries(
            Object.entries(this.#startupDependencies).map(([key, value]) => [key, {...value}])
        );
    }

    /**
     * @summary Clears startup dependency observations for test/restart boundaries.
     * @returns {void}
     */
    clearStartupDependencyState() {
        this.#startupDependencies = {};
        this.clearCache();
    }

    /**
     * Clears the health check cache, forcing the next call to perform a fresh check.
     *
     * Intent: This is primarily useful for testing and debugging scenarios where
     * you need to immediately verify a fix (e.g., after starting ChromaDB)
     * without waiting for the 5-minute cache to expire.
     * The routine invalidation notice is durable-file-only so diagnostic churn
     * does not flood developer-facing console streams.
     */
    clearCache() {
        this.#cachedHealth = null;
        this.#lastCheckTime = null;
        this.#runtimeFreshnessTracker.clearCache();
        logger.fileDebug('[HealthService] Cache cleared, next health check will be fresh');
    }
}

export default Neo.setupClass(HealthService);
