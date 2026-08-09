import crypto                                                                                   from 'crypto';
import fs                                                                                       from 'fs-extra';
import path                                                                                     from 'path';
import Base                                                                                     from '../../../src/core/Base.mjs';
import GraphService                                                                             from './GraphService.mjs';
import AiConfig                                                                                 from '../../mcp/server/memory-core/config.mjs';
import RequestContextService, {normalizeUserId}                                                 from '../../mcp/server/shared/services/RequestContextService.mjs';
import logger                                                                                   from '../../mcp/server/memory-core/logger.mjs';
import CoalescingEngineService                                                                  from './CoalescingEngineService.mjs';
import TurnPresenceService                                                                      from './TurnPresenceService.mjs';
import WebhookDeliveryService                                                                   from './WebhookDeliveryService.mjs';
import {DELIVERABLE_HARNESS_TARGET}                                                             from '../../daemons/wake/buildReceiverManifest.mjs';
import {buildWakeDigest, getHighestWakePriority}                                                from '../../daemons/wake/wakeDigestBuilder.mjs';
import {HEARTBEAT_PULSE_ENTITY_PREFIX, HEARTBEAT_PULSE_ENTITY_TYPE, match, matchHeartbeatPulse} from './heartbeatPulseEvaluator.mjs';
import {resolveResidentFamilyById}                                                              from '../graph/agentFamilyResolution.mjs';
import {readActiveWakeSubscriptionIdentities}                                                   from './readActiveWakeSubscriptionIdentities.mjs';
import {
    activeWakeSubscriptionStatusSql,
    isActiveWakeSubscriptionStatus
} from './wakeSubscriptionStatusPolicy.mjs';

/**
 * @summary Renders a millisecond window as the coarsest unit that divides it evenly, for the
 * `who_is_online` summary line.
 *
 * The summary states the windows it applied because the same counts mean different things under
 * different calibrations — `3 idle` is a different fact at 15 minutes and at 4 hours. Rendering
 * the resolved value (rather than documenting a constant) keeps the line honest when a deployment
 * overrides the leaf.
 * @param {Number} ms
 * @returns {String}
 */
function formatWindow(ms) {
    const minutes = ms / 60000,
          hours   = minutes / 60;

    if (Number.isInteger(hours) && hours >= 1) return `${hours}h`;
    if (Number.isInteger(minutes))             return `${minutes}m`;

    return `${ms}ms`;
}

/**
 * @summary Service for managing graph-resident WAKE_SUBSCRIPTION nodes and the
 * `manage_wake_subscription` MCP tool surface — the graph-backed substrate for
 * cross-harness autonomous wake delivery.
 *
 * Subscriptions are graph-resident (durable across MCP server restarts per ADR 0002 §6.6.2; ticket-ref-ok: decision-record authority, not issue archaeology)
 * with a write-through in-memory cache for sub-millisecond trigger evaluation.
 * Per-agent ownership is enforced via `RequestContextService.getAgentIdentityNodeId()`
 * and an explicit `SUBSCRIBES_TO` edge from the AgentIdentity node to the WAKE_SUBSCRIPTION
 * node.
 *
 * The service implements the discipline-layer surface; channel-specific event delivery
 * is handled by the MCP notification, A2A webhook, and bridge-daemon consumers. The
 * `resync` action queries `GraphLog` deltas and returns event payloads; channel
 * dispatch is the consumer's responsibility.
 *
 * @class Neo.ai.services.memory-core.WakeSubscriptionService
 * @extends Neo.core.Base
 * @singleton
 * @see learn/agentos/decisions/0002-phase3-wake-substrate-standards-alignment.md §6.6
 */
class WakeSubscriptionService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.WakeSubscriptionService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.WakeSubscriptionService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {String[]} validTriggers
     * @protected
     */
    validTriggers = ['SENT_TO_ME', 'TASK_STATE_CHANGED', 'PERMISSION_GRANTED', 'HEARTBEAT_PULSE']

    /**
     * @member {String} heartbeatPulseEntityType='heartbeat_pulse'
     * @protected
     */
    heartbeatPulseEntityType = HEARTBEAT_PULSE_ENTITY_TYPE

    /**
     * @member {String} heartbeatPulseEntityPrefix='HEARTBEAT_PULSE'
     * @protected
     */
    heartbeatPulseEntityPrefix = HEARTBEAT_PULSE_ENTITY_PREFIX

    /**
     * @member {String[]} validHarnessTargets
     * @protected
     */
    validHarnessTargets = ['mcp-notifications', 'a2a-webhook', 'bridge-daemon', 'disabled', 'none']

    /**
     * @member {String[]} validAppNames
     *
     * Canonical osascript target app names accepted on Shape C subscription writes. One entry per
     * harness onboarded into the swarm: Antigravity (@neo-gemini-pro), Claude
     * (@neo-opus-ada), Codex (@neo-gpt). The wake daemon dispatches via `tell application
     * "<appName>"`, so list completeness is load-bearing — a missing entry rejects the canonical
     * AgentIdentity.subscriptionTemplate at auto-bootstrap time and silently strands the
     * corresponding harness from Shape C wake delivery.
     *
     * @protected
     */
    validAppNames = ['Antigravity', 'Claude', 'Codex', 'OpenCode']

    /**
     * @member {String[]} validAdapters
     *
     * Delivery-adapter identifiers accepted in `harnessTargetMetadata.adapter`. The first three
     * dispatch through GUI/CLI control planes (osascript, tmux, the Codex app-server);
     * `opencode-server` routes through the seat's embedded HTTP server via its seat envelope
     * and is exempt from the bridge-daemon `appName` requirement; `kimi-server` routes through
     * the seat's local `kimi server` REST surface via its wake envelope (same exemption);
     * `kimi-pull-bridge` appends the digest to the seat's local wake-outbox for the owning
     * session's own cron poll to steer in-process (same envelope authority, same exemption;
     * never touches the web-server twin surface).
     *
     * @protected
     */
    validAdapters = ['osascript', 'tmux', 'codex-app-server', 'opencode-server', 'kimi-server', 'kimi-pull-bridge']

    /**
     * In-memory write-through cache for sub-millisecond trigger evaluation.
     * Keyed by subscriptionId; values are the full WAKE_SUBSCRIPTION node payload.
     * Populated lazily on `list` and on every mutation; rebuilt at boot from graph state
     * if the service is reinitialized (durable layer is the source of truth).
     * @member {Map<String, Object>} subscriptionCache
     * @protected
     */
    subscriptionCache = new Map()

    /**
     * @member {String[]} validHarnessPresenceStates
     * @protected
     */
    validHarnessPresenceStates = ['unknown', 'idle', 'active', 'waitingOnApproval', 'userTyping']

    /**
     * @member {String[]} validWakePolicies
     * @protected
     */
    validWakePolicies = ['silent', 'next_turn', 'immediate']

    /**
     * @member {String[]} validAddressTypes
     * @protected
     */
    validAddressTypes = ['userDataDir', 'pid', 'tmuxSession', 'webhookUrl']

    /**
     * @member {Number} harnessPresenceFreshMs
     * Presence older than one heartbeat is not fresh enough for immediate targeted delivery.
     * @protected
     */
    harnessPresenceFreshMs = 5 * 60 * 1000

    /**
     * @member {Number} harnessPresenceTtlMs
     * TTL backstop for stale HarnessPresence records, approximately 2x swarm heartbeat.
     * @protected
     */
    harnessPresenceTtlMs = 10 * 60 * 1000

    /**
     * @member {String} bootId
     * Per-process boot identity used to supersede stale HarnessPresence rows.
     * @protected
     */
    bootId = crypto.randomUUID()

    /**
     * @member {Number} liveCursor=0
     * @protected
     */
    liveCursor = 0

    /**
     * @member {String} liveCursorStateFile
     * @protected
     */
    liveCursorStateFile = AiConfig.wakeDaemon.wakeSubscriptionLiveCursorPath

    /**
     * Sets the initial live cursor to the current graph log head to prevent
     * replaying historical events on boot.
     */
    async init() {
        await GraphService.ready();
        if (!GraphService.db) {
            const reason = GraphService.graphInitError?.message || 'graph database is not mounted';
            throw new Error(`GraphService unavailable: ${reason}`);
        }
        const storage = GraphService.db?.storage;
        if (storage?.db) {
            try {
                const row = storage.db.prepare('SELECT MAX(log_id) as maxId FROM GraphLog').get();
                this._setLiveCursor(row.maxId || 0);
            } catch (e) {
                logger.warn('[WakeSubscription] Failed to read max log_id on init', e);
            }
        }
    }

    /**
     * Guard against re-entrant calls to pump()
     * @member {Boolean} _pumping=false
     * @protected
     */
    _pumping = false

    /**
     * Evaluates recent GraphLog deltas and pushes matching events to active Shape A
     * (MCP notification) and Shape B (signed webhook) routes. Intended to be called by
     * mutation paths (e.g. MailboxService, PermissionService) for low-latency delivery.
     * @returns {Promise<void>}
     */
    async pump() {
        if (this._pumping) return;

        try {
            this._pumping = true;
            const db = GraphService.db;
            if (!db) return;

            const storage = db.storage;
            if (!storage?.getDeltaLog) return;

            const delta       = storage.getDeltaLog(this.liveCursor);
            const typedEvents = delta.events || [];
            if (delta.invalidEdges.length === 0 && delta.invalidNodes.length === 0 && typedEvents.length === 0) {
                this._setLiveCursor(delta.lastLogId);
                return;
            }

            // Live push needs every active Shape A/B subscription, not only routes that were
            // touched through this process's lazy cache.
            this._warmPushSubscriptions();

            // Shared predicate, NOT `sub.status === 'active'`. This is the hot push path, and the cache
            // is warmed from `_hydrateSubscriptionFromDurableNode`, which preserves an absent `status`
            // as absent rather than synthesizing one. A strict compare here publishes a route into the
            // manifest and then never dispatches through it — a live route that reads armed everywhere
            // and delivers nothing, which is worse than either consistent answer.
            const activeSubs = Array.from(this.subscriptionCache.values())
                .filter(sub => ['mcp-notifications', 'a2a-webhook'].includes(sub.harnessTarget) && isActiveWakeSubscriptionStatus(sub.status));

            if (activeSubs.length === 0) {
                this._setLiveCursor(delta.lastLogId);
                return;
            }

            for (const sub of activeSubs) {
                for (const edgeRef of delta.invalidEdges) {
                    const logId   = this._getEntityLogId(edgeRef.id) || delta.lastLogId;
                    const matched = this._evaluateEdgeAgainstSubscription(edgeRef, sub, logId);
                    if (matched) CoalescingEngineService.enqueue(sub, matched);
                }
                for (const nodeId of delta.invalidNodes) {
                    const logId   = this._getEntityLogId(nodeId) || delta.lastLogId;
                    const matched = this._evaluateNodeAgainstSubscription(nodeId, sub, logId);
                    if (matched) CoalescingEngineService.enqueue(sub, matched);
                }
                for (const trace of typedEvents) {
                    const matched = this._evaluateTypedEventAgainstSubscription(trace, sub);
                    if (matched) CoalescingEngineService.enqueue(sub, matched);
                }
            }


            this._setLiveCursor(delta.lastLogId);
        } catch (e) {
            logger.error('[WakeSubscription] Background pump failed:', e);
        } finally {
            this._pumping = false;
        }
    }

    /**
     * @summary Advances the in-process GraphLog cursor and mirrors it to an operator-readable file.
     *
     * The file is the durable watermark consumed by `ai:compact-graphlog`; it is intentionally
     * outside the graph so persisting the cursor does not recursively append another GraphLog row.
     *
     * @param {Number} logId
     * @protected
     */
    _setLiveCursor(logId) {
        const next = Number.isFinite(Number(logId)) ? Number(logId) : 0;

        this.liveCursor = next;
        this._persistLiveCursor();
    }

    /**
     * @summary Persists the WakeSubscriptionService GraphLog cursor for maintenance compaction.
     *
     * Unit tests skip the default repo-local state write unless they provide an explicit
     * `NEO_AI_WAKE_SUBSCRIPTION_CURSOR_FILE` override.
     *
     * @protected
     */
    _persistLiveCursor() {
        if (process.env.UNIT_TEST_MODE === 'true' && !process.env.NEO_AI_WAKE_SUBSCRIPTION_CURSOR_FILE) {
            return;
        }

        try {
            fs.ensureDirSync(path.dirname(this.liveCursorStateFile));
            fs.writeFileSync(this.liveCursorStateFile, String(this.liveCursor), 'utf8');
        } catch (e) {
            logger.warn(`[WakeSubscription] Failed to persist live cursor at ${this.liveCursorStateFile}`, e);
        }
    }

    /**
     * @summary Warms Shape A/B routes from durable SQLite before the live GraphLog cursor advances.
     *
     * A Memory Core restart begins with an empty graph/cache even though wake subscriptions remain
     * durable. The pump therefore treats SQLite as the source of truth, refreshes push routes whose
     * status or target changed, and removes cached push routes that no longer have a valid durable
     * row. Isolated harnesses without raw SQLite retain the graph-resident fallback.
     *
     * @protected
     */
    _warmPushSubscriptions() {
        const db = GraphService.db;
        if (!db) return;

        const pushTargets = ['mcp-notifications', 'a2a-webhook'];
        const sqlite      = db.storage?.db;

        if (sqlite) {
            const durableIds = new Set();
            const rows       = sqlite.prepare(`
                SELECT id, data FROM Nodes
                WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
            `).all();

            for (const row of rows) {
                const parsed = this._parseDurableSubscriptionRow(row);
                if (!parsed) continue;

                const {id, node} = parsed;
                const cached     = this.subscriptionCache.get(id);
                const isPush     = pushTargets.includes(node.properties?.harnessTarget);
                const wasPush    = pushTargets.includes(cached?.harnessTarget);

                durableIds.add(id);

                if (isPush || wasPush) {
                    this._hydrateSubscriptionFromDurableNode(id, node);
                }
            }

            for (const [id, cached] of this.subscriptionCache) {
                if (pushTargets.includes(cached?.harnessTarget) && !durableIds.has(id)) {
                    this.subscriptionCache.delete(id);
                }
            }

            return;
        }

        for (const node of db.nodes.items) {
            if (node.label !== 'WAKE_SUBSCRIPTION') continue;
            const props   = node.properties || {};
            const cached  = this.subscriptionCache.get(node.id);
            const isPush  = pushTargets.includes(props.harnessTarget);
            const wasPush = pushTargets.includes(cached?.harnessTarget);

            // Refresh active routes and invalidate a cached push route when webhook delivery
            // degraded or an operator changed/retired it since the previous pump.
            if (isPush || wasPush) {
                this.subscriptionCache.set(node.id, {id: node.id, ...props});
            }
        }
    }

    /**
     * Unified entry point for the `manage_wake_subscription` MCP tool. Dispatches to
     * action-specific handlers per ADR 0002 §6.6. ticket-ref-ok: decision-record authority, not issue archaeology
     *
     * @param {Object} opts
     * @param {String} opts.action One of 'subscribe' | 'unsubscribe' | 'update' | 'list' | 'resync' | 'poll-digest' | 'resume' | 'rotate-key' | 'fleet-identities'
     * @param {Object} [opts.rest] Action-specific parameters (see individual methods)
     * @returns {Promise<Object>}
     */
    async manage(opts = {}) {
        GraphService.requireDb('WakeSubscriptionService.manage');

        const {action, ...rest} = opts;
        switch (action) {
            case 'bootstrap'       : return this.bootstrap  (rest);
            case 'fleet-identities': return this.fleetIdentities();
            case 'subscribe'       : return this.subscribe  (rest);
            case 'unsubscribe'     : return this.unsubscribe(rest);
            case 'update'          : return this.update     (rest);
            case 'list'            : return this.list       (rest);
            case 'poll-digest'     : return this.pollDigest (rest);
            case 'resync'          : return this.resync     (rest);
            case 'resume'          : return this.resume     (rest);
            case 'rotate-key'      : return this.rotateKey  (rest);
            default:
                throw new Error(
                    `Invalid action '${action}'. Must be one of: bootstrap, fleet-identities, subscribe, unsubscribe, update, list, poll-digest, resync, resume, rotate-key.`
                );
        }
    }

    /**
     * @summary Idempotently bootstraps a wake subscription from the bound AgentIdentity template.
     *
     * This restart-boundary action bridges the Memory Core AgentIdentity graph and the Shape C
     * wake-substrate routing contract. It must resolve the canonical template from durable graph
     * state instead of synthesizing cross-harness defaults, otherwise MCP restarts can strand an
     * agent even while mailbox storage remains healthy.
     *
     * @param {Object} [opts]
     * @param {Object} [opts.overrideMetadata] Optional metadata to override template defaults.
     * @param {Object} [opts.presence] Optional HarnessPresence state override, used by tests and
     *     future native-control-plane adapters.
     * @param {String} [opts.bootId] Optional boot id override for deterministic tests.
     * @param {Number} [opts.pid] Optional process id override for deterministic tests.
     * @param {Date|String|Number} [opts.now] Optional clock override for deterministic tests.
     * @returns {Promise<Object>} {subscriptionId, harnessTarget, status: 'existing'|'created'}
     */
    async bootstrap({overrideMetadata, presence = {}, bootId = this.bootId, pid = process.pid, now = new Date()} = {}) {
        const owner = RequestContextService.getAgentIdentityNodeId();
        if (!owner) throw RequestContextService.unboundIdentityError('bootstrap subscription');

        // Cross-session duplicate-accumulation defense.
        //
        // The route-key idempotency check below is necessary but empirically not sufficient: across
        // sessions, duplicates accumulate (`@neo-opus-ada` had 2 active subscriptions 2 days apart;
        // `@neo-gpt` same pattern). The exact root cause for the lookup-miss is unclear without
        // runtime instrumentation, but the recovery substrate works regardless: scan SQLite for all
        // active subscriptions owned by this agent, and if more than one exists, retire all-but-
        // newest before the route-key check runs. This makes bootstrap itself the canonical retire
        // point — agents that never sunset cleanly are self-healed at next boot.
        this._reconcileDuplicateSubscriptions(owner);

        const template = this.loadIdentitySubscriptionTemplate(owner);
        if (!template) {
            throw new Error(`Cannot bootstrap subscription: no subscriptionTemplate found on AgentIdentity '${owner}'.`);
        }

        const mergedMetadata = {
            ...(template.harnessTargetMetadata || {}),
            ...(overrideMetadata || {})
        };

        // The transport is DERIVED, never read from the template — and this is the whole reason
        // bootstrap could not arm anyone. A committed template cannot describe a deliverable route,
        // because the two things that make one deliverable are both un-committable: the signing key
        // is minted server-side at subscribe-time (`subscribe()` below, a2a-webhook branch only),
        // and the address is per-machine and arrives via the boot envelope as `overrideMetadata`.
        // The four shipped templates still declared `bridge-daemon`, which `buildReceiverManifest`
        // withdraws by design — so bootstrap faithfully minted rows the builder was built to reject
        // and reported success. Deriving from the same constant the builder enforces is what makes
        // the two agree. A template's legitimate content is policy (`trigger`, `filters`) plus GUI
        // dispatch hints; never the transport.
        const harnessTarget = DELIVERABLE_HARNESS_TARGET;

        // Bootstrap and public subscribe must share the same durable route-idempotency contract.
        const existing = this._findActiveSubscriptionByRoute({
            owner,
            trigger              : template.trigger,
            filters              : template.filters || {},
            harnessTarget,
            harnessTargetMetadata: mergedMetadata
        });

        if (existing) {
            const refreshed = this._refreshExistingSubscriptionRoute(existing, {
                filters              : template.filters || {},
                harnessTargetMetadata: mergedMetadata
            });

            this.upsertHarnessPresence({owner, subscriptionId: refreshed.id, metadata: mergedMetadata, presence, bootId, pid, now});

            return {subscriptionId: refreshed.id, harnessTarget: refreshed.harnessTarget, status: 'existing'};
        }

        // Create new subscription from template. `subscribe()` mints the signing key on this
        // target's branch — the step the template can never perform for itself.
        const result = await this.subscribe({
            trigger              : template.trigger,
            filters              : template.filters || {},
            harnessTarget,
            harnessTargetMetadata: mergedMetadata
        });

        this.upsertHarnessPresence({owner, subscriptionId: result.subscriptionId, metadata: mergedMetadata, presence, bootId, pid, now});

        return {...result, status: result.status === 'existing' ? 'existing' : 'created'};
    }

    /**
     * @summary Upserts the volatile HarnessPresence overlay for a bootstrapped wake route.
     *
     * The durable WAKE_SUBSCRIPTION node records interest in a wake channel. HarnessPresence records
     * the currently booted receiver's live routing input: receiver state vocabulary plus the
     * boot-envelope address tuple. Presence is intentionally separate from subscription metadata so
     * stale receiver state can retire without deleting the durable subscription.
     *
     * @param {Object} opts
     * @param {String} opts.owner AgentIdentity node id.
     * @param {String} opts.subscriptionId Durable WAKE_SUBSCRIPTION id this presence overlays.
     * @param {Object} [opts.metadata={}] Merged harnessTargetMetadata.
     * @param {Object} [opts.presence={}] Presence state overrides.
     * @param {String} [opts.bootId=this.bootId] Per-process boot id.
     * @param {Number} [opts.pid=process.pid] Process id used for stale-pid probes.
     * @param {Date|String|Number} [opts.now=new Date()] Clock source.
     * @returns {Object} Persisted HarnessPresence properties.
     */
    upsertHarnessPresence({
        owner,
        subscriptionId,
        metadata = {},
        presence = {},
        bootId = this.bootId,
        pid = process.pid,
        now = new Date()
    } = {}) {
        if (!owner || !subscriptionId) return null;

        const nowDate = this._coerceDate(now),
              nowIso  = nowDate.toISOString();

        this.retireStaleHarnessPresence({owner, bootId, now: nowDate});

        const {instanceAddress, addressType} = this._resolvePresenceAddress(metadata);
        const presencePid                    = this._normalizePresencePid(presence.pid ?? (addressType === 'pid' ? instanceAddress : pid));
        const state                          = this.validHarnessPresenceStates.includes(presence.state) ? presence.state : 'unknown';
        const wakePolicy                     = this.validWakePolicies.includes(presence.wakePolicy) ? presence.wakePolicy : 'next_turn';

        const properties = {
            agentIdentity  : owner,
            subscriptionId,
            state,
            activeTurnId   : presence.activeTurnId || null,
            wakePolicy,
            source         : presence.source || 'mcp-client',
            instanceAddress: instanceAddress || null,
            addressType    : addressType || null,
            pid            : presencePid,
            bootId,
            lastSeenAt     : nowIso,
            capabilities   : Array.isArray(presence.capabilities) ? presence.capabilities : [],
            freshUntil     : new Date(nowDate.getTime() + this.harnessPresenceFreshMs).toISOString(),
            expiresAt      : new Date(nowDate.getTime() + this.harnessPresenceTtlMs).toISOString(),
            updatedAt      : nowIso,
            status         : 'active',
            userId         : normalizeUserId(owner),
            sharedEntity   : false
        };

        GraphService.upsertNode({
            id         : this._buildHarnessPresenceId(owner, bootId),
            type       : 'HARNESS_PRESENCE',
            name       : `HarnessPresence ${owner}`,
            description: 'Volatile wake-routing presence overlay for a booted harness instance.',
            properties
        });

        return properties;
    }

    /**
     * @summary Retires stale HarnessPresence rows for an identity.
     *
     * Primary stale signal: a prior boot id plus a dead pid. TTL is a backstop for harnesses whose
     * pid cannot be trusted or was never recorded.
     *
     * @param {Object} opts
     * @param {String} opts.owner AgentIdentity node id.
     * @param {String} opts.bootId Current boot id.
     * @param {Date|String|Number} [opts.now=new Date()] Clock source.
     * @returns {Number} Count of retired rows.
     */
    retireStaleHarnessPresence({owner, bootId, now = new Date()} = {}) {
        const sqlite = GraphService.db?.storage?.db;
        if (!sqlite || !owner) return 0;

        const nowMs = this._coerceDate(now).getTime();
        const rows  = sqlite.prepare(`
            SELECT id, data FROM Nodes
            WHERE json_extract(data, '$.label') = 'HARNESS_PRESENCE'
              AND json_extract(data, '$.properties.agentIdentity') = ?
              AND COALESCE(json_extract(data, '$.properties.status'), 'active') = 'active'
        `).all(owner);

        let retired = 0;

        for (const row of rows) {
            let node;
            try {
                node = JSON.parse(row.data);
            } catch (error) {
                logger.warn(`[WakeSubscription] Failed to parse HarnessPresence row ${row.id}: ${error.message}`);
                continue;
            }

            const props        = node.properties || {};
            const bootMismatch = props.bootId && props.bootId !== bootId;
            const ttlExpired   = this._isPresenceTtlExpired(props, nowMs);
            const pidDead      = props.pid ? !this._isPidAlive(props.pid) : false;

            if (!ttlExpired && !(bootMismatch && pidDead)) continue;

            GraphService.upsertNode({
                id        : row.id || node.id,
                type      : 'HARNESS_PRESENCE',
                properties: {
                    ...props,
                    status      : 'retired',
                    retiredAt   : new Date(nowMs).toISOString(),
                    retireReason: ttlExpired ? 'ttl-expired' : 'boot-mismatch-pid-dead'
                }
            });
            retired++;
        }

        return retired;
    }

    /**
     * @summary Projects per-maintainer live availability — the `who_is_online` read tool.
     *
     * Composes the liveness layers, in precedence order:
     * 1. **`participationStatus` hard gate** — `operator_benched` / `temporarily_unreachable`
     *    report `online:false` regardless of any softer signal.
     * 2. **`add_memory`-recency (primary)** — the deployment-agnostic activity signal
     *    ({@link WakeSubscriptionService#_readActivityRecency}): a rostered agent's most-recent OWN
     *    `AGENT_MEMORY` write within the freshness window ⇒ recently active ⇒ online; stale or none ⇒
     *    dark. `add_memory` is the universal activity write every authenticated agent produces — so the
     *    signal works identically in the swarm and a multi-tenant cloud deployment, unlike a harness
     *    beacon (emitted only by the neo-swarm harness, inert elsewhere) or process-presence
     *    (pid/clone-local — the "local neo activity" coupling that is not mergeable). The read is
     *    roster-scoped (the AgentIdentity roster is the visibility boundary, not the per-caller tenant)
     *    and graph-backed (survives an embed-drain — it reads the durable node, not Chroma).
     *
     * Deliberately **advisory**: it surfaces *probably-dark* maintainers for review-routing /
     * lane-handoff / lead-baton / wake-targeting so a request to a dark agent fails loud instead
     * of stalling silently; it is not a hard routing gate.
     *
     * @param {Object} [opts]
     * @param {String} [opts.family] Optional model-family filter (e.g. `'claude'`, `'gpt'`).
     * @param {Boolean} [opts.verbose=false] When false (default) returns the terse roster summary
     *   (`{generatedAt, summary, online, idle, benched}`) — a "who is online?" answer, not a
     *   diagnostics dump. When true returns the full per-agent projection (signalStatus + per-agent
     *   reason/signals) for diagnostics. Default stays terse so the per-call token cost is
     *   proportional to the question.
     * @param {Date|String|Number} [opts.now=new Date()] Clock source (unit-test seam).
     * @returns {Promise<Object>} Terse (default):
     *   `{generatedAt, summary, windows, online[], idle[], dark[], neverConnected[], benched[]}`
     *   (identity arrays). The five buckets separate LIVENESS from MEMBERSHIP: `online` (acting
     *   now), `idle` (stale but inside the idle cutoff), `dark` (stale beyond it), `neverConnected`
     *   (rostered but never observed on THIS deployment), `benched` (participationStatus gate).
     *   `windows` carries the resolved `{activityFreshMs, idleCutoffMs}` so the counts are
     *   interpretable without reading source. Verbose: `{generatedAt, signalStatus, agents}` where
     *   each agent is `{identity, name, family, participationStatus, online, state, reason, signals}`.
     */
    async whoIsOnline({family, verbose = false, now = new Date()} = {}) {
        const nowMs       = this._coerceDate(now).getTime(),
              agents      = this._listAgentIdentityNodes(family).map(node => this._projectAgentLiveness(node, nowMs)),
              generatedAt = new Date(nowMs).toISOString();

        if (verbose) {
            return {
                generatedAt,
                signalStatus: 'Precedence: (1) participationStatus hard gate; (2) a fresh turn-presence beacon, ' +
                              'which decides online before any absence verdict — add_memory lands at turn ' +
                              'boundaries, so a first or long turn is present without a recent write; (3) ' +
                              'add_memory-recency, the deployment-agnostic fallback where no beacon is emitted, ' +
                              'roster-scoped and graph-backed (survives an embed-drain). Advisory, not a hard ' +
                              'routing gate.',
                agents
            };
        }

        // Terse default — a "who is online?" answer, not a diagnostics book. The signalStatus essay
        // and the per-agent reason/signals live behind verbose:true so the per-call token cost stays
        // proportional to the question. Buckets are keyed off the projected state so the wire shape
        // and the per-agent verdict can never disagree.
        const inState        = state => agents.filter(agent => agent.state === state).map(agent => agent.identity),
              online         = inState('online'),
              idle           = inState('idle'),
              dark           = inState('dark'),
              neverConnected = inState('neverConnected'),
              benched        = inState('benched'),
              windows        = {
                  activityFreshMs: AiConfig.whoIsOnline.activityFreshMs,
                  idleCutoffMs   : AiConfig.whoIsOnline.idleCutoffMs
              };

        return {
            generatedAt,
            // The summary states the windows it applied: the same counts mean different things under
            // a 15-minute and a 4-hour window, so a bare number is not interpretable without them.
            summary: `${online.length} online · ${idle.length} idle · ${dark.length} dark · ` +
                     `${neverConnected.length} never-connected · ${benched.length} benched ` +
                     `(online ≤ ${formatWindow(windows.activityFreshMs)}, idle ≤ ${formatWindow(windows.idleCutoffMs)})`,
            windows,
            online,
            idle,
            dark,
            neverConnected,
            benched
        };
    }

    /**
     * @summary Reads live `AgentIdentity` nodes for the liveness projection (authoritative,
     * runtime-mutable `participationStatus`), optionally filtered by model family. Uses the same
     * `json_extract($.label)` SQLite pattern as the presence reads so the projection reflects the
     * durable node row, not a possibly-stripped in-memory cache stub.
     * @param {String} [family] Optional model-family filter.
     * @returns {Object[]} Parsed AgentIdentity node objects.
     * @protected
     */
    _listAgentIdentityNodes(family) {
        const sqlite = GraphService.db?.storage?.db;
        if (!sqlite) return [];

        const rows = sqlite.prepare(`
            SELECT data FROM Nodes
            WHERE json_extract(data, '$.label') = 'AgentIdentity'
        `).all();
        const nodes = [];

        for (const row of rows) {
            let node;
            try {
                node = JSON.parse(row.data);
            } catch (error) {
                logger.warn(`[WakeSubscription] who_is_online: skipped unparseable AgentIdentity row: ${error.message}`);
                continue;
            }

            // Era-chain-first for rostered residents (the identity trail owns the family fact);
            // the node's flat family/modelFamily properties remain the fallback for
            // runtime-provisioned identities that exist only in the graph (retirement-gated read).
            const nodeFamily = resolveResidentFamilyById(node.id) ?? node.properties?.family ?? node.properties?.modelFamily ?? null;
            if (family && nodeFamily !== family) continue;
            nodes.push(node);
        }

        return nodes;
    }

    /**
     * @summary Projects a single AgentIdentity node to its liveness verdict via the
     * participationStatus-gate → add_memory-recency precedence.
     * @param {Object} node Parsed AgentIdentity node.
     * @param {Number} nowMs Clock epoch ms.
     * @returns {Object} `{identity, name, family, participationStatus, online, reason, signals}`.
     * @protected
     */
    _projectAgentLiveness(node, nowMs) {
        const props               = node.properties || {},
              identity            = node.id,
              name                = node.name || props.displayName || node.id,
              family              = resolveResidentFamilyById(node.id) ?? props.family ?? props.modelFamily ?? null,
              participationStatus = props.participationStatus || 'active',
              signals             = {participationStatus, activityRecency: null};

        // 1. participationStatus HARD GATE — benched/unreachable overrides every softer signal.
        if (participationStatus !== 'active') {
            return {identity, name, family, participationStatus, online: false, state: 'benched',
                reason: `roster: participationStatus is '${participationStatus}' (benched / unreachable)`, signals};
        }

        // 2. add_memory-recency — the deployment-agnostic activity signal. Every authenticated agent's
        //    memory write stamps an AGENT_MEMORY node (agentIdentity + timestamp); this rostered
        //    agent's fresh most-recent OWN write ⇒ recently active ⇒ online. Unlike a harness beacon
        //    (emitted only by the neo-swarm harness, inert in a multi-tenant/cloud deployment),
        //    add_memory is universal — and the read is roster-scoped (the AgentIdentity roster is the
        //    visibility boundary) and graph-backed (survives an embed-drain).
        const activity = this._readActivityRecency(identity, nowMs);
        signals.activityRecency = activity;

        // The turn-presence beacon is consulted BEFORE any not-online verdict, not only on the stale
        // branch. add_memory lands at turn boundaries, so an agent on its FIRST turn has no
        // AGENT_MEMORY row yet while being maximally present — reading that absence as "never
        // connected" asserts a membership fact the beacon directly falsifies, and routes around a
        // new peer precisely while they work. Absence of the durable write is only evidence of
        // never-connected once every current-observation signal is exhausted.
        if (!activity?.fresh) {
            const beacon = TurnPresenceService.getFreshTurnPresence(identity, nowMs);
            signals.turnPresence = beacon;

            if (beacon?.fresh) {
                return {identity, name, family, participationStatus, online: true, state: 'online',
                    reason: `local turn-presence beacon fresh (turn started ${beacon.startedAt}; ` +
                            `${activity ? 'add_memory stale' : 'no add_memory write yet — first turn'}) — mid-turn rescue`, signals};
            }
        }

        // Never observed HERE, and no live beacon contradicting that. This is a MEMBERSHIP fact, not
        // a freshness one: the identity ships in the roster but has no AGENT_MEMORY write on this
        // deployment at all. Folding it into `idle` is what made a remote roster read as an
        // attendance list — an operator could not tell a colleague who logged off from a seat that
        // has never once connected.
        if (!activity) {
            return {identity, name, family, participationStatus, online: false, state: 'neverConnected',
                reason: 'never connected to this deployment (no AGENT_MEMORY write on record, no live turn presence)', signals};
        }
        if (!activity.fresh) {
            // The beacon was already consulted above and did not rescue this identity — a beaconless
            // deployment is never gated on a signal it cannot emit, so the memory verdict stands.
            // Stale then splits on the idle cutoff: inside it the identity is plausibly still in this
            // session; beyond it `idle` would be a claim the signal cannot support, so it reports
            // `dark` — rostered and reachable, but not evidence of anyone being around.
            return activity.withinIdle
                ? {identity, name, family, participationStatus, online: false, state: 'idle',
                    reason: `stale add_memory activity (last write ${activity.lastActivityAt} — outside the freshness window, within the idle cutoff)`, signals}
                : {identity, name, family, participationStatus, online: false, state: 'dark',
                    reason: `no activity within the idle cutoff (last write ${activity.lastActivityAt}) — rostered, not recently seen`, signals};
        }

        return {identity, name, family, participationStatus, online: true, state: 'online',
            reason: `recent add_memory activity (last write ${activity.lastActivityAt})`, signals};
    }

    /**
     * @summary Reads a rostered agent's most-recent `add_memory` activity — the
     * deployment-agnostic liveness signal that replaced the harness beacon.
     *
     * Every authenticated agent's memory write stamps an `AGENT_MEMORY` graph node with
     * `agentIdentity` + `timestamp` + `userId` ({@link Neo.ai.services.memory-core.MemoryService#addMemory}).
     * This returns the freshness verdict for that agent's most-recent OWN write, matched by
     * `agentIdentity`. who_is_online's visibility boundary is the AgentIdentity ROSTER
     * ({@link WakeSubscriptionService#_listAgentIdentityNodes}), not the per-caller tenant: raw
     * AGENT_MEMORY is tagged with each agent's own per-agent `userId`, so a per-caller `user_id` RLS
     * filter here would hide same-deployment teammates from each other.
     * Cross-tenant isolation for a multi-tenant cloud belongs at the roster scope (a tenant-scoped
     * `_listAgentIdentityNodes`), tracked separately. It reads the durable graph node, not Chroma, so it
     * survives an embed-drain; and `add_memory` is the universal activity write (no harness hook, no
     * per-deployment beacon), so the signal works identically in the swarm and a multi-tenant cloud.
     *
     * Freshness window: `add_memory` lands at turn boundaries (the consolidate-then-save gate), so the
     * window must exceed a typical turn to avoid marking a mid-turn agent dark. It is a deployment-
     * calibrated config leaf rather than a constant, because the right value depends on a deployment's
     * own turn rhythm; the caller reads the resolved value and the summary line reports it. A fresh
     * turn-presence beacon takes precedence over this signal entirely, so a deployment that emits one
     * is never gated on a window at all.
     * @param {String} owner AgentIdentity node id.
     * @param {Number} nowMs Clock epoch ms.
     * @returns {Object|null} `{lastActivityAt, ageMs, fresh}` or null when the roster agent has no
     *   AGENT_MEMORY activity.
     * @protected
     */
    _readActivityRecency(owner, nowMs) {
        const sqlite = GraphService.db?.storage?.db;
        if (!sqlite || !owner) return null;

        // Roster-liveness scope: report THIS rostered agent's OWN most-recent activity, matched by
        // agentIdentity. who_is_online's visibility boundary is the AgentIdentity roster
        // (_listAgentIdentityNodes), NOT the per-caller tenant: every agent's raw AGENT_MEMORY is
        // tagged with its own per-agent userId, so a per-caller user_id RLS filter here hid
        // same-deployment teammates from each other. (getAgentIdentityNodeId
        // is explicitly "NOT for isolation" per RequestContextService, and the prior filter keyed on
        // it against the normalizeUserId'd user_id column, so it never matched own writes either.)
        // Cross-tenant isolation for a multi-tenant cloud belongs at the roster scope (tenant-scoped
        // _listAgentIdentityNodes), tracked separately — not by isolating roster teammates here.
        let latest;
        try {
            const row = sqlite.prepare(`
                SELECT MAX(json_extract(data, '$.properties.timestamp')) AS latest
                FROM Nodes
                WHERE json_extract(data, '$.label') = 'AGENT_MEMORY'
                  AND json_extract(data, '$.properties.agentIdentity') = ?
            `).get(owner);
            latest = row?.latest || null;
        } catch (error) {
            logger.warn(`[WakeSubscription] who_is_online: activity-recency read failed for ${owner}: ${error.message}`);
            return null;
        }

        if (!latest) return null;

        const lastMs = new Date(latest).getTime();
        if (!Number.isFinite(lastMs)) return null;

        // Both windows come from the Provider SSOT so a deployment can calibrate to its own turn
        // rhythm; `stale` is the membership axis (still plausibly in this session) and is what
        // separates an identity that logged off at lunch from one last seen eight hours ago.
        const ageMs = nowMs - lastMs;

        return {
            lastActivityAt: new Date(lastMs).toISOString(),
            ageMs,
            fresh         : ageMs >= 0 && ageMs <= AiConfig.whoIsOnline.activityFreshMs,
            withinIdle    : ageMs >= 0 && ageMs <= AiConfig.whoIsOnline.idleCutoffMs
        };
    }

    /**
     * @summary Resolves an AgentIdentity wake subscription template with a durable read-through fallback.
     *
     * Bootstrap sits on the restart boundary between the Memory Core graph cache and the Shape C
     * bridge-daemon wake substrate. The in-memory graph cache can hold a stale or stripped
     * AgentIdentity stub after MCP restart, while the durable SQLite `Nodes` row still contains
     * the canonical `subscriptionTemplate`. This helper keeps the cache fast path but echoes the
     * wake-substrate source-of-truth rule: a missing cache property is not proof that the durable
     * AgentIdentity lacks a template.
     *
     * @param {String} owner The bound AgentIdentity node id.
     * @returns {Object|null} The canonical subscription template, or null when the durable identity
     *     genuinely has no template.
     * @protected
     */
    loadIdentitySubscriptionTemplate(owner) {
        // Access GraphService.db.nodes.get directly because GraphService.getNode filters out custom properties
        const identityNode  = GraphService.db?.nodes?.get(owner);
        const cacheTemplate = identityNode?.properties?.subscriptionTemplate;

        if (cacheTemplate) return cacheTemplate;

        const sqlite = GraphService.db?.storage?.db;
        if (!sqlite) return null;

        const row = sqlite.prepare('SELECT data FROM Nodes WHERE id = ? LIMIT 1').get(owner);
        if (!row?.data) return null;

        let durableNode;
        try {
            durableNode = JSON.parse(row.data);
        } catch (error) {
            logger.warn(`[WakeSubscription] Failed to parse durable AgentIdentity row for ${owner}: ${error.message}`);
            return null;
        }

        const durableTemplate = durableNode?.properties?.subscriptionTemplate;
        if (!durableTemplate) return null;

        this.hydrateIdentityCacheFromDurableNode(owner, durableNode);

        return durableTemplate;
    }

    /**
     * @summary Rehydrates a stale AgentIdentity cache stub from the durable graph row.
     *
     * The Wake Subscription bootstrap path must not silently keep using a stripped cache node once
     * SQLite proves the AgentIdentity is richer. Rehydrating the cache prevents repeated
     * read-through queries during the same MCP server lifetime while preserving SQLite as the
     * canonical source for restart-time wake-substrate templates.
     *
     * @param {String} owner The bound AgentIdentity node id.
     * @param {Object} durableNode The parsed SQLite `Nodes.data` payload.
     * @protected
     */
    hydrateIdentityCacheFromDurableNode(owner, durableNode) {
        const cachedNode = GraphService.db?.nodes?.get(owner);

        if (cachedNode) {
            cachedNode.label      = durableNode.label || cachedNode.label;
            cachedNode.properties = {
                ...(cachedNode.properties || {}),
                ...(durableNode.properties || {})
            };

            return;
        }

        GraphService.db?.nodes?.add(durableNode);
    }

    /**
     * @summary Creates or reuses a caller-owned wake subscription for one canonical route tuple.
     *
     * The public `subscribe` action is a restart-boundary surface, not only a fresh-create
     * primitive. Agents routinely re-subscribe after MCP or bridge-daemon restarts, and the
     * wake daemon reads every durable active `WAKE_SUBSCRIPTION` row. To keep the
     * wake-substrate route topology one-active-row-per-identity, this method first checks the
     * SQLite source of truth for an active route match using `(agentIdentity, trigger,
     * harnessTarget, normalized filters, route metadata)`. If one exists, it warms the
     * in-memory cache and returns the existing id instead of creating duplicate wake fanout.
     *
     * Generates a fresh subscriptionId only when no active route exists, persists the
     * WAKE_SUBSCRIPTION node + SUBSCRIBES_TO edge, and populates the cache.
     * For Shape B (`a2a-webhook`), generates an HMAC signing key and returns it once.
     *
     * @param {Object} opts
     * @param {String} opts.trigger One of validTriggers
     * @param {Object} [opts.filters] taggedConcepts | priority | senderFilter | inReplyToFilter
     * @param {String} opts.harnessTarget One of validHarnessTargets
     * @param {Object} [opts.harnessTargetMetadata] appName | url | coalesceWindow |
     *     daemonSocketPath | adapter | tabShortcut | focusSeedKey | tmuxSession |
     *     instanceAddress | addressType | userDataDir
     *     (`instanceAddress` + `addressType`: boot-envelope instance address for bridge-daemon
     *     dispatch; `userDataDir` remains a legacy compatibility field for existing subscriptions)
     * @returns {Promise<Object>} {subscriptionId, harnessTarget, signingKey?}
     */
    async subscribe({trigger, filters = {}, harnessTarget, harnessTargetMetadata = {}} = {}) {
        const owner = RequestContextService.getAgentIdentityNodeId();
        if (!owner) throw RequestContextService.unboundIdentityError('create subscription');

        if (!this.validTriggers.includes(trigger)) {
            throw new Error(`Invalid trigger '${trigger}'. Must be one of: ${this.validTriggers.join(', ')}`);
        }
        if (!this.validHarnessTargets.includes(harnessTarget)) {
            throw new Error(`Invalid harnessTarget '${harnessTarget}'. Must be one of: ${this.validHarnessTargets.join(', ')}`);
        }

        const finalMetadata = this._retireWebCoordinatesForPullBridge({...harnessTargetMetadata});

        if (harnessTarget === 'a2a-webhook' && !finalMetadata.url) {
            throw new Error("Shape B (a2a-webhook) requires harnessTargetMetadata.url.");
        }
        this.validateHarnessTargetMetadata(harnessTarget, finalMetadata);

        const existing = this._findActiveSubscriptionByRoute({
            owner,
            trigger,
            filters,
            harnessTarget,
            harnessTargetMetadata: finalMetadata
        });

        if (existing) {
            const refreshed = this._refreshExistingSubscriptionRoute(existing, {filters, harnessTargetMetadata: finalMetadata});
            return {subscriptionId: refreshed.id, harnessTarget: refreshed.harnessTarget, status: 'existing'};
        }

        const subscriptionId = `WAKE_SUB:${crypto.randomUUID()}`;
        const now            = new Date().toISOString();

        // Shape B requires an HMAC signing key for webhook authenticity.
            // Per ADR 0002 §6.2.3 the server generates and returns it once at subscribe-time; ticket-ref-ok: decision-record authority, not issue archaeology
        // it is stored in the node's harnessTargetMetadata for subsequent verification.
        let signingKey;
        if (harnessTarget === 'a2a-webhook') {
            signingKey              = crypto.randomBytes(32).toString('hex');
            finalMetadata.signingKey = signingKey;
        }

        const properties = {
            agentIdentity        : owner,
            trigger,
            filters,
            harnessTarget,
            harnessTargetMetadata: finalMetadata,
            createdAt            : now,
            updatedAt            : now,
            userId               : normalizeUserId(owner),
            sharedEntity         : false,
            status               : 'active'
        };

        GraphService.upsertNode({
            id  : subscriptionId,
            type: 'WAKE_SUBSCRIPTION',
            properties
        });

        // SUBSCRIBES_TO edge: AgentIdentity --SUBSCRIBES_TO--> WAKE_SUBSCRIPTION
        GraphService.linkNodes(owner, subscriptionId, 'SUBSCRIBES_TO', 1.0);

        const cacheEntry = {id: subscriptionId, ...properties};
        this.subscriptionCache.set(subscriptionId, cacheEntry);

        logger.info(`[WakeSubscription] subscribed ${subscriptionId} for ${owner} (trigger=${trigger}, harness=${harnessTarget})`);

        const result = {subscriptionId, harnessTarget};
        if (signingKey) result.signingKey = signingKey;
        return result;
    }

    /**
     * Removes a subscription. Caller must own it.
     *
     * @param {Object} opts
     * @param {String} opts.subscriptionId
     * @returns {Promise<Object>} {subscriptionId, status: 'removed'}
     */
    async unsubscribe({subscriptionId} = {}) {
        const caller = RequestContextService.getAgentIdentityNodeId();
        if (!caller) throw RequestContextService.unboundIdentityError('unsubscribe');
        if (!subscriptionId) throw new Error("Missing 'subscriptionId' parameter.");

        const subscription = this._loadSubscription(subscriptionId);
        if (!subscription) throw new Error(`Subscription not found: ${subscriptionId}`);
        if (subscription.agentIdentity !== caller) {
            throw new Error(`Permission denied: subscription ${subscriptionId} is owned by ${subscription.agentIdentity}, not ${caller}.`);
        }

        const db            = GraphService.db;
        const edgesToRemove = [];
        for (const edge of db.edges.items) {
            if (edge.target === subscriptionId && edge.type === 'SUBSCRIBES_TO') {
                edgesToRemove.push(edge);
            }
        }
        if (edgesToRemove.length > 0) db.edges.remove(edgesToRemove);

        this._removeDurableSubscriptionEdges(subscriptionId);

        if (db.nodes.get(subscriptionId)) {
            db.removeNode(subscriptionId);
        } else {
            db.storage?.removeNodes?.([subscriptionId]);
            db.vicinityLoadedNodes?.delete(subscriptionId);
            db.lastAccessMap?.delete(subscriptionId);
        }
        this.subscriptionCache.delete(subscriptionId);

        logger.info(`[WakeSubscription] unsubscribed ${subscriptionId} for ${caller}`);

        return {subscriptionId, status: 'removed'};
    }

    /**
     * @summary Restores a degraded route to active — the operator-reachable resumption path.
     *
     * Degradation is deliberately terminal: a route whose endpoint refuses connections is marked
     * `status: 'degraded'` and then never attempted again, which is what bounds the attempt count.
     * Coming back is therefore an explicit operator act, never something the delivery path does on
     * its own — a service that silently re-activates routes would restore the unbounded retry the
     * bound exists to prevent.
     *
     * Resuming requires clearing BOTH truths the delivery skip reads: the durable
     * `properties.status` on the node, and the in-flight process markers. Splitting them across two
     * calls is a footgun — clearing only the in-memory half resumes nothing, because the next flush
     * re-reads a `status` that still says `degraded`. This action performs both as one step so an
     * operator never has to know that.
     *
     * @param {Object} opts
     * @param {String} opts.subscriptionId
     * @returns {Promise<Object>} `{subscriptionId, status: 'active', wasDegraded}`
     */
    async resume({subscriptionId} = {}) {
        const caller = RequestContextService.getAgentIdentityNodeId();
        if (!caller) throw RequestContextService.unboundIdentityError('resume');
        if (!subscriptionId) throw new Error("Missing 'subscriptionId' parameter.");

        const subscription = this._loadSubscription(subscriptionId);
        if (!subscription) throw new Error(`Subscription not found: ${subscriptionId}`);
        if (subscription.agentIdentity !== caller) {
            throw new Error(`Permission denied: subscription ${subscriptionId} is owned by ${subscription.agentIdentity}, not ${caller}.`);
        }

        const wasDegraded = subscription.status === 'degraded';

        // Durable half. `upsertNode` merges onto the stored properties, so this moves `status` only.
        GraphService.upsertNode({id: subscriptionId, properties: {status: 'active'}});

        // In-flight half: the process-local degraded marker plus the failure streak, so the route
        // does not re-degrade on the very next failure from a stale count.
        WebhookDeliveryService.clearDegraded(subscriptionId);

        // The cache holds the pre-resume record; a stale read here would re-skip the route.
        this.subscriptionCache.delete(subscriptionId);

        logger.info(`[WakeSubscription] resumed ${subscriptionId} for ${caller} (wasDegraded: ${wasDegraded})`);

        return {subscriptionId, status: 'active', wasDegraded};
    }

    /**
     * @summary Re-issues the Shape-B signing key for a route that has lost one, in place.
     *
     * **Why this exists as its own action rather than inside `subscribe()`.** A row can hold an
     * `a2a-webhook` target with no `signingKey`, and every prior repair door was closed: the mint runs
     * only on `subscribe()`'s new-row branch, `subscribe()` on an existing route returns
     * `{status: 'existing'}` before reaching it, and `update()` has no key surface. The only escape was
     * unsubscribe + subscribe, which allocates a **new subscription id** — and that id is what the
     * manifest, the receiver route table, delivery receipts, and the degrade all index on. Recovery by
     * re-identification is not repair.
     *
     * **Why not mint inside `subscribe()`'s existing-row branch instead.** That call's contract is
     * "ensure a row exists", and it is idempotent. Minting there would make every defensive
     * re-subscribe a silent key rotation, and a *wrong* rotation is worse than the bug it fixes: it
     * invalidates a `routes.json` a live receiver already validated, turning a deaf seat into a deaf
     * seat plus a stale manifest. A caller survey settled it — every path into `subscribe()` is the
     * `manage_wake_subscription` MCP tool, so a distinct action costs no existing caller anything.
     *
     * Server-issued only: the key is minted here and returned once, never accepted from the caller.
     * The manifest generator fails closed on key disagreement, so an operator-supplied key would put
     * two authorities on one secret.
     *
     * @param {Object} opts
     * @param {String} opts.subscriptionId
     * @returns {Promise<Object>} `{subscriptionId, signingKey, status: 'rotated', hadKey}`
     */
    async rotateKey({subscriptionId} = {}) {
        const caller = RequestContextService.getAgentIdentityNodeId();
        if (!caller) throw RequestContextService.unboundIdentityError('rotate signing key');
        if (!subscriptionId) throw new Error("Missing 'subscriptionId' parameter.");

        const subscription = this._loadSubscription(subscriptionId);
        if (!subscription) throw new Error(`Subscription not found: ${subscriptionId}`);

        // Owner-scoped, and this is the security boundary rather than a convenience: re-issuing a key
        // for another seat's route hands the caller the ability to sign that seat's wakes.
        if (subscription.agentIdentity !== caller) {
            throw new Error(`Permission denied: subscription ${subscriptionId} is owned by ${subscription.agentIdentity}, not ${caller}.`);
        }

        if (subscription.harnessTarget !== 'a2a-webhook') {
            throw new Error(
                `Subscription ${subscriptionId} targets '${subscription.harnessTarget}', which carries no signing key. ` +
                `Only a2a-webhook (Shape B) routes are signed.`
            );
        }

        const
            existingMetadata = subscription.harnessTargetMetadata || {},
            hadKey           = Boolean(existingMetadata.signingKey),
            signingKey       = crypto.randomBytes(32).toString('hex');

        // Spread the stored metadata: `upsertNode` merges top-level properties, so replacing
        // `harnessTargetMetadata` wholesale without the spread would drop `url` and the adapter tuple.
        GraphService.upsertNode({
            id        : subscriptionId,
            properties: {harnessTargetMetadata: {...existingMetadata, signingKey}}
        });

        // The cache holds the pre-rotation record; a stale read would keep serving the old key.
        this.subscriptionCache.delete(subscriptionId);

        logger.info(`[WakeSubscription] rotated signing key for ${subscriptionId} (owner ${caller}, hadKey: ${hadKey})`);

        // `hadKey` distinguishes repair from rotation for the caller, without logging either key.
        return {subscriptionId, signingKey, status: 'rotated', hadKey};
    }

    /**
     * Mutates subscription properties. Filters/harnessTarget/harnessTargetMetadata are
     * the typical update targets. agentIdentity is immutable; createdAt is immutable.
     *
     * @param {Object} opts
     * @param {String} opts.subscriptionId
     * @param {Object} [opts.filters]
     * @param {String} [opts.harnessTarget]
     * @param {Object} [opts.harnessTargetMetadata]
     * @returns {Promise<Object>} {subscriptionId, currentState}
     */
    async update({subscriptionId, filters, harnessTarget, harnessTargetMetadata} = {}) {
        const caller = RequestContextService.getAgentIdentityNodeId();
        if (!caller) throw RequestContextService.unboundIdentityError('update subscription');
        if (!subscriptionId) throw new Error("Missing 'subscriptionId' parameter.");

        const subscription = this._loadSubscription(subscriptionId);
        if (!subscription) throw new Error(`Subscription not found: ${subscriptionId}`);
        if (subscription.agentIdentity !== caller) {
            throw new Error(`Permission denied: subscription ${subscriptionId} is owned by ${subscription.agentIdentity}, not ${caller}.`);
        }

        if (harnessTarget !== undefined && !this.validHarnessTargets.includes(harnessTarget)) {
            throw new Error(`Invalid harnessTarget '${harnessTarget}'. Must be one of: ${this.validHarnessTargets.join(', ')}`);
        }

        const updated = {...subscription};
        if (filters               !== undefined) updated.filters               = filters;
        if (harnessTarget         !== undefined) updated.harnessTarget         = harnessTarget;
        if (harnessTargetMetadata !== undefined) updated.harnessTargetMetadata = this._retireWebCoordinatesForPullBridge({...subscription.harnessTargetMetadata, ...harnessTargetMetadata});
        this.validateHarnessTargetMetadata(updated.harnessTarget, updated.harnessTargetMetadata || {});
        updated.updatedAt = new Date().toISOString();

        const {id, ...properties} = updated;
        GraphService.upsertNode({
            id  : subscriptionId,
            type: 'WAKE_SUBSCRIPTION',
            properties
        });

        this.subscriptionCache.set(subscriptionId, updated);

        return {subscriptionId, currentState: updated};
    }

    /**
     * Retires `kimi-server` web coordinates (`lockPath`, `tokenPath`) from subscription metadata
     * when the route is the `kimi-pull-bridge`. The pull route reads the wake envelope and writes
     * the seat outbox; a stale web coordinate merge-retained across the adapter switch would
     * resurrect the twin surface the migration exists to leave behind. Retirement is atomic with
     * the route change, on subscribe and update alike; re-selecting `kimi-server` later requires
     * re-adding coordinates explicitly.
     * @param {Object} metadata The harnessTargetMetadata candidate.
     * @returns {Object} Metadata with web coordinates retired when the adapter is the pull-bridge.
     * @protected
     */
    _retireWebCoordinatesForPullBridge(metadata = {}) {
        if (metadata?.adapter !== 'kimi-pull-bridge') return metadata;

        const retired = {...metadata};

        delete retired.lockPath;
        delete retired.tokenPath;

        return retired
    }

    /**
     * @summary Validates channel metadata for the WAKE_SUBSCRIPTION lifecycle before
     * graph persistence.
     *
     * This service-side guard complements the `manage_wake_subscription` MCP tool shape:
     * the schema teaches fresh agents to pass the bridge-daemon routing fields, while
     * this check protects bootstrap and programmatic paths that bypass MCP Zod parsing.
     * The explicit `appName` requirement intentionally echoes the bridge-daemon/osascript
     * routing contract so malformed subscriptions fail before the daemon can only log a
     * missed wake.
     *
     * @param {String} harnessTarget The wake delivery channel.
     * @param {Object} metadata Channel-specific harnessTargetMetadata.
     * @throws {Error} When required metadata is missing.
     * @protected
     */
    validateHarnessTargetMetadata(harnessTarget, metadata = {}) {
        if (metadata.adapter !== undefined && !this.validAdapters.includes(metadata.adapter)) {
            throw new Error(`Invalid adapter '${metadata.adapter}'. Must be one of: ${this.validAdapters.join(', ')}`);
        }
        // The osascript-style bridge-daemon routes need an appName target; the opencode-server and
        // kimi-server adapters route by seat envelope instead and are exempt (their authority is
        // the envelope file); kimi-pull-bridge shares the envelope authority (same exemption).
        if (harnessTarget === 'bridge-daemon' && !['opencode-server', 'kimi-server', 'kimi-pull-bridge'].includes(metadata.adapter) && !metadata.appName) {
            throw new Error('Shape C (bridge-daemon) requires harnessTargetMetadata.appName.');
        }
        if (metadata.envelopePath !== undefined && typeof metadata.envelopePath !== 'string') {
            throw new Error('harnessTargetMetadata.envelopePath must be a string when provided.');
        }
        if (metadata.outboxPath !== undefined && typeof metadata.outboxPath !== 'string') {
            throw new Error('harnessTargetMetadata.outboxPath must be a string when provided.');
        }
        if (metadata.appName && !this.validAppNames.includes(metadata.appName)) {
            throw new Error(`Invalid appName '${metadata.appName}'. Must be one of: ${this.validAppNames.join(', ')}`);
        }
        // Instance-addressed routes — explicit addressType/instanceAddress, or the legacy
        // userDataDir field — must RESOLVE to a complete, non-empty address. Mirror
        // _resolvePresenceAddress (the same resolver the wake daemon dispatches through) so a legacy
        // userDataDir row stays valid, while an addressType that resolves to no address fails closed
        // at registration. A route that can never target an instance is the same-app cross-leak /
        // silent-miss hazard — worse than no route at all.
        if (metadata.instanceAddress || metadata.addressType || metadata.userDataDir) {
            const {instanceAddress, addressType} = this._resolvePresenceAddress(metadata);
            if (!addressType) {
                throw new Error('Shape C instance addressing requires harnessTargetMetadata.addressType (or a legacy userDataDir).');
            }
            if (!this.validAddressTypes.includes(addressType)) {
                throw new Error(`Invalid addressType '${addressType}'. Must be one of: ${this.validAddressTypes.join(', ')}`);
            }
            if (!instanceAddress) {
                throw new Error(`Shape C addressType '${addressType}' requires a non-empty instance address (harnessTargetMetadata.instanceAddress, or a non-empty userDataDir for the userDataDir type).`);
            }
        }
    }

    /**
     * Lists subscriptions owned by the calling agent identity, or a single subscription
     * if `subscriptionId` is provided.
     *
     * @param {Object} opts
     * @param {String} [opts.subscriptionId]
     * @returns {Promise<Object>} {subscriptions: [...]}
     */
    async list({subscriptionId} = {}) {
        const caller = RequestContextService.getAgentIdentityNodeId();
        if (!caller) throw RequestContextService.unboundIdentityError('list subscriptions');

        if (subscriptionId) {
            const subscription = this._loadSubscription(subscriptionId);
            if (!subscription)                           return {subscriptions: []};
            if (subscription.agentIdentity !== caller)   return {subscriptions: []};
            return {subscriptions: [subscription]};
        }

        const durableSubscriptions = this._listDurableSubscriptionsForOwner(caller);
        if (durableSubscriptions) return {subscriptions: durableSubscriptions};

        // Fallback for test environments without raw SQLite storage. The cache may be partial
        // (lazy-loaded); walk the in-memory graph when no durable scan is available.
        const subscriptions = [];
        const db            = GraphService.db;
        for (const node of db.nodes.items) {
            if (node.label !== 'WAKE_SUBSCRIPTION') continue;
            const props = node.properties || {};
            if (props.agentIdentity !== caller)     continue;
            const entry = {id: node.id, ...props};
            this.subscriptionCache.set(node.id, entry);
            subscriptions.push(entry);
        }
        return {subscriptions};
    }

    /**
     * Fleet-wide wake-observation telemetry: the deduplicated identities holding an ACTIVE
     * subscription — and nothing else. The disclosure contract is deliberately the `whoIsOnline`
     * class (any authenticated caller, fleet-scoped operational telemetry), NOT the caller-owner
     * `list` class: owner rows carry endpoint/filter/key-adjacent material a roster read has no
     * business seeing, so this action never returns row properties. The scan itself is the shared
     * `readActiveWakeSubscriptionIdentities` — the same one query the fleet dev-server runs
     * in-process against a host plane — with the absent-status meaning owned by
     * `wakeSubscriptionStatusPolicy` in both.
     *
     * @returns {Promise<{identities: String[]}>} Sorted for deterministic wire output.
     */
    async fleetIdentities() {
        const caller = RequestContextService.getAgentIdentityNodeId();
        if (!caller) throw RequestContextService.unboundIdentityError('list fleet wake identities');

        const identities = await readActiveWakeSubscriptionIdentities({graphService: GraphService});

        return {identities: identities.sort()}
    }

    /**
     * @summary Emits a durable GraphLog-only heartbeat pulse for an active Shape B/C interrupt route.
     *
     * Heartbeat pulses are interrupt transport hints, not mailbox content. The pulse writes only a
     * tagged `GraphLog` row, never a `MESSAGE` node or `SENT_TO` edge, so it is replayable by
     * `resync()` and push delivery without surfacing in inbox listings.
     *
     * @param {Object} opts
     * @param {String} opts.targetIdentity AgentIdentity node id that should receive the pulse.
     * @param {String} [opts.pulseId] Optional caller-owned pulse id payload.
     * @returns {Promise<Object>} Emission status and optional `logId`.
     */
    async emitHeartbeatPulse({targetIdentity, pulseId} = {}) {
        if (!targetIdentity) throw new Error("Missing 'targetIdentity' parameter.");

        // Heartbeat pulses ride an existing interrupt-capable Shape B/C route; a dedicated
        // HEARTBEAT_PULSE trigger is not exposed by manage_wake_subscription.
        if (!this._hasActiveInterruptRoute(targetIdentity)) {
            logger.info(`[WakeSubscription] heartbeat pulse skipped for ${targetIdentity}: no active Shape B/C subscription.`);
            return {
                status: 'skipped',
                reason: 'no-active-interrupt-subscription',
                targetIdentity
            };
        }

        const sqlite = GraphService.db?.storage?.db;
        if (!sqlite?.prepare) {
            throw new Error('Cannot emit heartbeat pulse: GraphLog storage unavailable.');
        }

        const entityId = this._createHeartbeatPulseEntityId(targetIdentity, pulseId);
        sqlite.prepare('INSERT INTO GraphLog(entity_id, entity_type) VALUES (?, ?)').run(entityId, this.heartbeatPulseEntityType);

        const logId = this._getEntityLogId(entityId);
        logger.info(`[WakeSubscription] emitted heartbeat pulse for ${targetIdentity} at GraphLog ${logId}.`);

        return {
            status: 'emitted',
            targetIdentity,
            entityId,
            logId
        };
    }

    /**
     * Replays GraphLog deltas matching the subscription's current trigger+filter spec,
     * starting from `sinceLogId`. Returns the matching event payloads as data; the
     * channel-specific re-emission (MCP notifications / webhook POST / daemon dispatch)
     * is the responsibility of Shape A/B/C consumers wiring this output to their
     * delivery surfaces. Per ADR 0002 §6.1.6 + §6.6.2. ticket-ref-ok: decision-record authority, not issue archaeology
     *
     * @param {Object} opts
     * @param {String} opts.subscriptionId
     * @param {Number} [opts.sinceLogId=0] GraphLog watermark; client-tracked
     * @returns {Promise<Object>} {subscriptionId, events: [...], lastLogId, eventsReplayed}
     */
    async resync({subscriptionId, sinceLogId = 0} = {}) {
        const caller = RequestContextService.getAgentIdentityNodeId();
        if (!caller) throw RequestContextService.unboundIdentityError('resync');
        if (!subscriptionId) throw new Error("Missing 'subscriptionId' parameter.");

        const subscription = this._loadSubscription(subscriptionId);
        if (!subscription) throw new Error(`Subscription not found: ${subscriptionId}`);
        if (subscription.agentIdentity !== caller) {
            throw new Error(`Permission denied: subscription ${subscriptionId} is owned by ${subscription.agentIdentity}, not ${caller}.`);
        }

        const {events, lastLogId} = this._collectSubscriptionEvents(subscription, sinceLogId);

        return {
            subscriptionId,
            events,
            lastLogId,
            eventsReplayed: events.length
        };
    }

    /**
     * @summary Derives the caller's wake digest AT READ TIME — the pull half of wake delivery
     * for clients without host-reachable listeners.
     *
     * Composes the daemon's flush semantics from the same shared parts: events above the
     * client-held `sinceLogId` watermark are collected by the same trigger/filter evaluation
     * `resync` consumes — whose shared `match()` evaluator already reconciles CURRENT read state
     * per delivery shape, so a wake for an already-read message never matches — and the
     * survivors pass through the daemon's own `buildWakeDigest`. Nothing is queued server-side:
     * a missed poll re-includes anything still unread on the next call, the self-healing
     * property the push path documents. An empty answer is a CLOSED state carrying its reason,
     * always distinguishable from a transport failure — absence of signal, never a verdict.
     *
     * Per ADR 0002 §6.1.6 + §6.6.2 (resync's authority) + ADR 0038 §2.5.1 row 6. ticket-ref-ok: decision-record authority, not issue archaeology
     *
     * @param {Object} opts
     * @param {String} opts.subscriptionId
     * @param {Number} [opts.sinceLogId=0] GraphLog watermark; client-tracked, never server-persisted
     * @returns {Promise<Object>} `{subscriptionId, pending, watermark, reason}` when empty, else
     * `{subscriptionId, pending, digest, digestPriority, watermark, eventsReplayed}`
     */
    async pollDigest({subscriptionId, sinceLogId = 0} = {}) {
        const caller = RequestContextService.getAgentIdentityNodeId();
        if (!caller) throw RequestContextService.unboundIdentityError('poll-digest');
        if (!subscriptionId) throw new Error("Missing 'subscriptionId' parameter.");

        const subscription = this._loadSubscription(subscriptionId);
        if (!subscription) throw new Error(`Subscription not found: ${subscriptionId}`);
        if (subscription.agentIdentity !== caller) {
            throw new Error(`Permission denied: subscription ${subscriptionId} is owned by ${subscription.agentIdentity}, not ${caller}.`);
        }

        const {events, lastLogId} = this._collectSubscriptionEvents(subscription, sinceLogId);

        const messages = [], tasks = [], permissions = [], heartbeats = [];

        for (const {eventType, payload = {}} of events) {
            if      (eventType === 'wake/sent_to_me')         messages.push({priority: 'normal', ...payload});
            else if (eventType === 'wake/task_state_changed') tasks.push(payload);
            else if (eventType === 'wake/permission_granted') permissions.push(payload);
            else if (eventType === 'wake/heartbeat_pulse')    heartbeats.push(payload);
        }

        const pending = messages.length + tasks.length + permissions.length + heartbeats.length;

        if (pending === 0) {
            return {
                subscriptionId,
                pending  : 0,
                reason   : 'no wake-relevant events above the client watermark in current read state',
                watermark: lastLogId
            };
        }

        return {
            subscriptionId,
            pending,
            digest        : buildWakeDigest(caller, {messages, tasks, permissions, heartbeats}),
            digestPriority: messages.length > 0 ? getHighestWakePriority(messages) : 'normal',
            eventsReplayed: events.length,
            watermark     : lastLogId
        };
    }

    /**
     * Walks GraphLog deltas above a client watermark and evaluates every candidate against the
     * subscription's trigger+filter spec. Shared by `resync` (replay) and `pollDigest`
     * (derive-at-read) so the two cannot drift. The watermark is echoed, never persisted.
     * @protected
     * @param {Object} subscription The cached WAKE_SUBSCRIPTION entry (id + properties)
     * @param {Number} sinceLogId Client-held GraphLog watermark
     * @returns {{events: Object[], lastLogId: Number}}
     */
    _collectSubscriptionEvents(subscription, sinceLogId) {
        const storage = GraphService.db.storage;
        if (!storage?.getDeltaLog) {
            logger.warn('[WakeSubscription] GraphLog storage unavailable; returning an empty event collection.');
            return {events: [], lastLogId: sinceLogId};
        }

        const delta  = storage.getDeltaLog(sinceLogId);
        const events = [];

        // Trigger evaluation walks the delta entities. SENT_TO_ME / PERMISSION_GRANTED examine
        // edges; generic nodes remain cache invalidation only. TASK_STATE_CHANGED consumes the
        // immutable typed-event rows returned separately by getDeltaLog().
        // Filter spec is applied to the matched candidate's payload; non-matches are skipped.
        for (const edgeRef of delta.invalidEdges) {
            const logId   = this._getEntityLogId(edgeRef.id) || delta.lastLogId;
            const matched = this._evaluateEdgeAgainstSubscription(edgeRef, subscription, logId);
            if (matched) events.push(matched);
        }
        for (const nodeId of delta.invalidNodes) {
            const logId   = this._getEntityLogId(nodeId) || delta.lastLogId;
            const matched = this._evaluateNodeAgainstSubscription(nodeId, subscription, logId);
            if (matched) events.push(matched);
        }
        for (const trace of delta.events || []) {
            const matched = this._evaluateTypedEventAgainstSubscription(trace, subscription);
            if (matched) events.push(matched);
        }
        for (const pulseTrace of this._getHeartbeatPulseLogEntries(sinceLogId)) {
            const matched = this._evaluateHeartbeatPulseAgainstSubscription(pulseTrace, subscription);
            if (matched) events.push(matched);
        }

        return {events, lastLogId: delta.lastLogId}
    }

    /**
     * Retrieves the specific GraphLog log_id for an entity, to anchor the wake event
     * per ADR 0002 §6.1.6. ticket-ref-ok: decision-record authority, not issue archaeology
     * @protected
     * @param {String} entityId
     * @returns {Number|null}
     */
    _getEntityLogId(entityId) {
        try {
            const row = GraphService.db.storage.db.prepare('SELECT MAX(log_id) as maxId FROM GraphLog WHERE entity_id = ?').get(entityId);
            return row?.maxId || null;
        } catch (e) { return null; }
    }

    /**
     * Reads heartbeat pulse GraphLog rows after a cursor.
     * @protected
     * @param {Number} sinceLogId Client watermark.
     * @returns {Object[]} GraphLog heartbeat pulse rows.
     */
    _getHeartbeatPulseLogEntries(sinceLogId) {
        const sqlite = GraphService.db?.storage?.db;
        if (!sqlite?.prepare) return [];

        return sqlite.prepare(`
            SELECT log_id, entity_id, entity_type
            FROM GraphLog
            WHERE log_id > ?
              AND entity_type = ?
            ORDER BY log_id ASC
        `).all(sinceLogId, this.heartbeatPulseEntityType);
    }

    /**
     * Evaluates a GraphLog edge entry against a subscription's trigger+filter spec.
     * Returns the wake-event payload if matched, null otherwise.
     * @protected
     * @param {Object} edgeRef GraphLog edge reference: `{id, source, target}`
     * @param {Object} subscription The cached WAKE_SUBSCRIPTION entry (id + properties)
     * @param {Number} logIdAnchor The delta block's lastLogId for the notification watermark
     * @returns {Object|null} Wrapped wake-event payload (per §6.1.1 / §6.1.3 envelope) or null when no match
     */
    _evaluateEdgeAgainstSubscription(edgeRef, subscription, logIdAnchor) {
        const edge = GraphService.db.edges.get(edgeRef.id);
        if (!edge) return null;

        // Delegate all edge triggers (SENT_TO_ME / PERMISSION_GRANTED) to the shared `match()`
        // evaluator — the single source of truth also consumed by the standalone wake-daemon, so the
        // two call-sites cannot drift. This service owns only its GraphService-backed data accessors
        // and the notification envelope (`_wrapEvent`).
        const result = match(subscription, {
            entity             : edge,
            getNode            : id    => GraphService.db.nodes.get(id),
            hasDeliveryReceipts: msgId => this._messageHasDeliveryReceipts(msgId)
        }, {entity_type: 'edges', entity_id: edge.id, log_id: logIdAnchor});

        if (!result) return null;

        // The `wake/permission_granted` payload carries `grantedAt` — a delivery-time stamp, distinct
        // from the envelope's `emittedAt`. The shared evaluator stays pure / Date-free, so the service
        // restores this documented wire-contract field in its own delivery path.
        if (result.type === 'permission_granted') {
            result.payload.grantedAt = new Date().toISOString();
        }

        return this._wrapEvent('wake/' + result.type, subscription, result.payload, result.logId);
    }

    /**
     * @summary Detects whether a broadcast MESSAGE has per-recipient delivery receipts.
     *
     * Receipt-backed broadcasts are evaluated through `DELIVERED_TO` edges only. The legacy
     * `SENT_TO -> AGENT:*` path remains for old messages that predate receipt fan-out.
     *
     * @protected
     * @param {String} messageId MESSAGE node id.
     * @returns {Boolean}
     */
    _messageHasDeliveryReceipts(messageId) {
        return (GraphService.db?.edges?.items || []).some(edge =>
            edge.source === messageId && edge.type === 'DELIVERED_TO'
        );
    }

    /**
     * @summary Evaluates one generic GraphLog node-invalidation entry.
     *
     * Typed Task transitions deliberately do not match this path: they are evaluated from their
     * immutable GraphLog event rows by `_evaluateTypedEventAgainstSubscription()`.
     * @protected
     * @param {String} nodeId GraphLog-touched node ID.
     * @param {Object} subscription The cached WAKE_SUBSCRIPTION entry (id + properties)
     * @param {Number} logIdAnchor The delta block's lastLogId for the notification watermark
     * @returns {Object|null} Wrapped wake-event payload (per §6.1.2 envelope) or null when no match
     */
    _evaluateNodeAgainstSubscription(nodeId, subscription, logIdAnchor) {
        const node = GraphService.db.nodes.get(nodeId);
        if (!node) return null;

        // Generic nodes remain cache-invalidation inputs. The shared evaluator rejects them for
        // TASK_STATE_CHANGED, preventing a mutable MESSAGE snapshot from manufacturing history.
        const result = match(subscription, {entity: node}, {entity_type: 'nodes', entity_id: nodeId, log_id: logIdAnchor});

        return result ? this._wrapEvent('wake/' + result.type, subscription, result.payload, result.logId) : null;
    }

    /**
     * @summary Evaluates one immutable typed GraphLog event against a subscription.
     * @protected
     * @param {Object} trace GraphLog row with durable event id and payload.
     * @param {Object} subscription Cached WAKE_SUBSCRIPTION entry.
     * @returns {Object|null} Wrapped wake event preserving the source event id.
     */
    _evaluateTypedEventAgainstSubscription(trace, subscription) {
        const result = match(subscription, {entity: null}, trace);

        return result
            ? this._wrapEvent('wake/' + result.type, subscription, result.payload, result.logId, result.sourceEventId)
            : null
    }

    /**
     * Evaluates a GraphLog-only heartbeat pulse against a subscription.
     * @protected
     * @param {Object} trace GraphLog heartbeat pulse row.
     * @param {Object} subscription The cached WAKE_SUBSCRIPTION entry.
     * @returns {Object|null} Wrapped heartbeat-pulse event or null.
     */
    _evaluateHeartbeatPulseAgainstSubscription(trace, subscription) {
        // Heartbeat pulses dispatch through an interrupt-capable Shape B/C route regardless of the
        // subscription's original trigger. The parse + eligibility live in the shared,
        // GraphService-free `heartbeatPulseEvaluator` (also consumed by the standalone wake-daemon),
        // so the two heartbeat-pulse evaluators cannot drift; this service still owns the
        // wake-notification envelope wrapping.
        const pulse = matchHeartbeatPulse({
            trace,
            harnessTarget: subscription.harnessTarget,
            agentIdentity: subscription.agentIdentity,
            entityType   : this.heartbeatPulseEntityType,
            prefix       : this.heartbeatPulseEntityPrefix
        });
        if (!pulse) return null;

        return this._wrapEvent('wake/heartbeat_pulse', subscription, {
            targetIdentity: pulse.targetIdentity,
            pulseId       : pulse.pulseId
        }, pulse.logId);
    }

    /**
     * Wraps a payload in the standard wake notification envelope per ADR 0002 §6.1.1-§6.1.3. ticket-ref-ok: decision-record authority, not issue archaeology
     * @protected
     * @param {String} eventType One of `wake/sent_to_me`, `wake/task_state_changed`, `wake/permission_granted`, `wake/heartbeat_pulse`
     * @param {Object} subscription Cached WAKE_SUBSCRIPTION entry (provides `id` + `agentIdentity`)
     * @param {Object} payload Trigger-specific inner payload returned by the shared `match()` evaluator
     * @param {String|Number} logIdAnchor GraphLog `log_id` anchor preserved across re-emissions for cursor-based catchup
     * @param {String} [sourceEventId] Durable source event id; omitted for legacy edge/pulse events.
     * @returns {Object} Full notification envelope (`schemaVersion`, `eventType`, `eventId`, optional `sourceEventId`, `logId`, `agentIdentity`, `subscriptionId`, `payload`, `emittedAt`)
     */
    _wrapEvent(eventType, subscription, payload, logIdAnchor, sourceEventId) {
        return {
            schemaVersion: '1.0',
            eventType,
            eventId      : `01H${crypto.randomBytes(10).toString('hex').toUpperCase()}`,
            ...(sourceEventId ? {sourceEventId} : {}),
            logId         : logIdAnchor,
            agentIdentity : subscription.agentIdentity,
            subscriptionId: subscription.id,
            payload,
            emittedAt     : new Date().toISOString()
        };
    }

    /**
     * Creates the stable GraphLog entity id for a heartbeat pulse.
     * @protected
     * @param {String} targetIdentity AgentIdentity node id.
     * @param {String} [pulseId] Optional caller-owned id payload. Must not contain `:`.
     * @returns {String} Encoded heartbeat pulse entity id.
     */
    _createHeartbeatPulseEntityId(targetIdentity, pulseId = crypto.randomUUID()) {
        if (String(pulseId).includes(':')) {
            throw new Error("Heartbeat pulse id must not contain ':'.")
        }
        return `${this.heartbeatPulseEntityPrefix}:${targetIdentity}:${pulseId}`;
    }

    /**
     * Loads a subscription by id, preferring the in-memory cache and falling back to
     * SQLite. Cache-warms on miss.
     * @protected
     * @param {String} subscriptionId The `WAKE_SUB:<uuid>` identifier
     * @returns {Object|null} Cached entry (`{id, ...properties}`) or null if no matching node exists
     */
    _loadSubscription(subscriptionId) {
        if (this.subscriptionCache.has(subscriptionId)) return this.subscriptionCache.get(subscriptionId);

        const node = GraphService.db.nodes.get(subscriptionId);
        if (node?.label === 'WAKE_SUBSCRIPTION') {
            const entry = {id: node.id, ...(node.properties || {})};
            this.subscriptionCache.set(subscriptionId, entry);
            return entry;
        }

        const durable = this._loadDurableSubscription(subscriptionId);
        if (!durable) return null;

        const entry = this._hydrateSubscriptionFromDurableNode(subscriptionId, durable);
        this.subscriptionCache.set(subscriptionId, entry);
        return entry;
    }

    /**
     * @summary Locates an active wake-subscription route from the durable source of truth.
     *
     * Public re-subscribe calls are semantically route recovery attempts after restart, while
     * bridge-daemon dispatch consumes every active SQLite row. Matching against SQLite before
     * creating a new `WAKE_SUBSCRIPTION` keeps the API and wake daemon aligned and prevents
     * duplicate wake fanout when the in-memory cache is cold.
     *
     * @param {Object} opts
     * @param {String} opts.owner AgentIdentity node id that owns the route.
     * @param {String} opts.trigger Wake trigger.
     * @param {Object} opts.filters Normalized AND-conjunctive filter object.
     * @param {String} opts.harnessTarget Wake delivery channel.
     * @param {Object} opts.harnessTargetMetadata Channel-specific route metadata.
     * @returns {Object|null} Cached entry for the existing active route, if present.
     * @protected
     */
    _findActiveSubscriptionByRoute({owner, trigger, filters = {}, harnessTarget, harnessTargetMetadata = {}}) {
        const candidateRouteKey = this._buildSubscriptionRouteKey({
            agentIdentity: owner,
            trigger,
            filters,
            harnessTarget,
            harnessTargetMetadata
        });

        for (const subscription of this._getCandidateSubscriptions(owner, trigger, harnessTarget)) {
            if (!isActiveWakeSubscriptionStatus(subscription.status)) continue;
            if (this._buildSubscriptionRouteKey(subscription) === candidateRouteKey) {
                this.subscriptionCache.set(subscription.id, subscription);
                return subscription;
            }
        }

        return null;
    }

    /**
     * @summary Retires all-but-newest active wake subscriptions WITHIN each canonical route group.
     *
     * Active subscription duplicates can accumulate across sessions when route recovery misses a
     * durable row or a prior session exits without cleanup. The reconciler groups owner-scoped
     * active subscriptions by canonical route key and retires N-1 per group. This preserves
     * legitimate multi-route setups for the same agent, such as a `SENT_TO_ME` bridge-daemon route
     * plus a `TASK_STATE_CHANGED` webhook route; only identical route tuples are retired.
     *
     * @param {String} owner AgentIdentity node id.
     * @returns {Number} Count of subscriptions retired (0 when state was already canonical).
     * @protected
     */
    _reconcileDuplicateSubscriptions(owner) {
        const sqlite = GraphService.db?.storage?.db;
        if (!sqlite) return 0;

        const rows = sqlite.prepare(`
            SELECT id, data FROM Nodes
            WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
              AND json_extract(data, '$.properties.agentIdentity') = ?
              AND ${activeWakeSubscriptionStatusSql()}
            ORDER BY COALESCE(
                json_extract(data, '$.properties.updatedAt'),
                json_extract(data, '$.properties.createdAt'),
                ''
            ) DESC
        `).all(owner);

        if (rows.length <= 1) return 0;

        // Parse durable rows into route-key-comparable cache entries.
        const subscriptions = rows
            .map(row => this._parseDurableSubscriptionRow(row))
            .filter(Boolean)
            .map(({id, node}) => ({id, ...(node.properties || {})}));

        if (subscriptions.length <= 1) return 0;

        // Group by canonical route key (preserves DESC order within each group via Map insertion order
        // because SQL already ordered by updatedAt/createdAt DESC).
        const byRouteKey = new Map();
        for (const subscription of subscriptions) {
            const key = this._buildSubscriptionRouteKey(subscription);
            if (!byRouteKey.has(key)) byRouteKey.set(key, []);
            byRouteKey.get(key).push(subscription);
        }

        let retiredCount = 0;
        for (const group of byRouteKey.values()) {
            if (group.length <= 1) continue;

            // Group is already newest-first; keep [0], retire the rest.
            const [keep, ...retire] = group;
            logger.warn(`[WakeSubscription] Reconciler: ${group.length} duplicate subscriptions for ${owner} on route ${keep.harnessTarget}/${keep.trigger}, keeping ${keep.id}, retiring ${retire.length}`);

            for (const {id} of retire) {
                if (this._retireSubscription(id)) retiredCount++;
            }
        }

        return retiredCount;
    }

    /**
     * @summary Marks a wake subscription as `retired` durably + drops from cache.
     *
     * Distinct from `unsubscribe()`: this is the reconciler's stale-duplicate-retire path. It does
     * NOT remove the SUBSCRIBES_TO edge (preserves audit trail) and uses `status: 'retired'` to
     * distinguish from agent-initiated `inactive` / removed states. Future investigators can trace
     * which subscriptions were reconciler-retired vs sunset-unsubscribed.
     *
     * @param {String} subscriptionId The subscription to retire.
     * @returns {Boolean} True if retired; false if not found.
     * @protected
     */
    _retireSubscription(subscriptionId) {
        const subscription = this._loadSubscription(subscriptionId);
        if (!subscription) return false;

        const updatedProperties = {
            ...subscription,
            status   : 'retired',
            retiredAt: new Date().toISOString()
        };
        delete updatedProperties.id; // upsertNode expects properties separately from id

        GraphService.upsertNode({
            id        : subscriptionId,
            type      : 'WAKE_SUBSCRIPTION',
            properties: updatedProperties
        });

        this.subscriptionCache.delete(subscriptionId);
        return true;
    }

    /**
     * @summary Reads candidate wake subscriptions from SQLite, falling back to graph cache.
     *
     * The durable-first path mirrors the wake daemon's source of truth. The in-memory fallback
     * keeps isolated unit-test harnesses working when they replace the graph storage substrate.
     *
     * @param {String} owner AgentIdentity node id.
     * @param {String} trigger Wake trigger.
     * @param {String} harnessTarget Wake delivery channel.
     * @returns {Object[]} Candidate subscription entries.
     * @protected
     */
    _getCandidateSubscriptions(owner, trigger, harnessTarget) {
        const sqlite = GraphService.db?.storage?.db;
        if (sqlite) {
            const rows = sqlite.prepare(`
                SELECT id, data FROM Nodes
                WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
                  AND json_extract(data, '$.properties.agentIdentity') = ?
                  AND json_extract(data, '$.properties.trigger') = ?
                  AND json_extract(data, '$.properties.harnessTarget') = ?
                  AND ${activeWakeSubscriptionStatusSql()}
            `).all(owner, trigger, harnessTarget);

            return rows
                .map(row => this._parseDurableSubscriptionRow(row))
                .filter(Boolean)
                .map(({id, node}) => this._hydrateSubscriptionFromDurableNode(id, node));
        }

        return this._getCandidateSubscriptionsFromMemory(owner, sub => sub.trigger === trigger && sub.harnessTarget === harnessTarget);
    }

    /**
     * @summary Returns true if the identity has at least one active Shape B/C interrupt
     * subscription, regardless of trigger type.
     *
     * Heartbeat-pulse emission uses route reachability rather than a dedicated trigger.
     *
     * @param {String} identity AgentIdentity node id.
     * @returns {Boolean}
     * @protected
     */
    _hasActiveInterruptRoute(identity) {
        const sqlite = GraphService.db?.storage?.db;
        if (sqlite) {
            const row = sqlite.prepare(`
                SELECT count(*) as count FROM Nodes
                WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
                  AND json_extract(data, '$.properties.agentIdentity') = ?
                  AND json_extract(data, '$.properties.harnessTarget') IN ('bridge-daemon', 'a2a-webhook')
                  AND ${activeWakeSubscriptionStatusSql()}
            `).get(identity);
            return (row?.count || 0) > 0;
        }

        return this._getCandidateSubscriptionsFromMemory(
            identity,
            sub => ['bridge-daemon', 'a2a-webhook'].includes(sub.harnessTarget)
        ).length > 0;
    }

    /**
     * @summary In-memory subscription scan fallback for unit-test harnesses where the
     * graph storage substrate is replaced. Pulls active nodes from `GraphService.db.nodes`
     * and applies the caller-supplied predicate on the WAKE_SUBSCRIPTION's properties.
     *
     * @param {String} owner AgentIdentity node id.
     * @param {Function} predicate Filter applied to the hydrated subscription entry.
     * @returns {Object[]}
     * @protected
     */
    _getCandidateSubscriptionsFromMemory(owner, predicate) {
        const candidates = [];
        const db         = GraphService.db;
        if (!db) return candidates;

        for (const node of db.nodes.items) {
            if (node.label !== 'WAKE_SUBSCRIPTION')   continue;
            const props = node.properties || {};
            if (props.agentIdentity !== owner)        continue;
            if (!isActiveWakeSubscriptionStatus(props.status)) continue;
            const entry = {id: node.id, ...props};
            if (!predicate(entry))                    continue;
            candidates.push(entry);
        }

        return candidates;
    }

    /**
     * @summary Lists caller-owned wake subscriptions from durable SQLite and warms cache.
     *
     * `manage_wake_subscription({action: 'list'})` must show the same active rows the bridge
     * daemon can dispatch. A full SQLite scan prevents stale-but-active rows from hiding behind
     * a cold Memory Core graph cache after process restarts.
     *
     * @param {String} owner AgentIdentity node id.
     * @returns {Object[]|null} Durable subscriptions, or null when raw SQLite is unavailable.
     * @protected
     */
    _listDurableSubscriptionsForOwner(owner) {
        const sqlite = GraphService.db?.storage?.db;
        if (!sqlite) return null;

        const rows = sqlite.prepare(`
            SELECT id, data FROM Nodes
            WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
              AND json_extract(data, '$.properties.agentIdentity') = ?
            ORDER BY COALESCE(
                json_extract(data, '$.properties.updatedAt'),
                json_extract(data, '$.properties.createdAt'),
                ''
            ) ASC
        `).all(owner);

        return rows
            .map(row => this._parseDurableSubscriptionRow(row))
            .filter(Boolean)
            .map(({id, node}) => this._hydrateSubscriptionFromDurableNode(id, node));
    }

    /**
     * @summary Loads one durable wake-subscription node by id.
     *
     * @param {String} subscriptionId The `WAKE_SUB:<uuid>` identifier.
     * @returns {Object|null} Parsed graph node, or null when absent / malformed / wrong label.
     * @protected
     */
    _loadDurableSubscription(subscriptionId) {
        const sqlite = GraphService.db?.storage?.db;
        if (!sqlite) return null;

        const row    = sqlite.prepare('SELECT id, data FROM Nodes WHERE id = ? LIMIT 1').get(subscriptionId);
        const parsed = this._parseDurableSubscriptionRow(row);
        return parsed?.node || null;
    }

    /**
     * @summary Parses a SQLite Nodes row that should contain a WAKE_SUBSCRIPTION graph node.
     *
     * Malformed historical rows are ignored rather than breaking `list` for the caller. The warning
     * keeps operator forensics possible without making one corrupt row hide all valid wake routes.
     *
     * @param {Object} row SQLite row with `id` and JSON `data`.
     * @returns {{id:String,node:Object}|null}
     * @protected
     */
    _parseDurableSubscriptionRow(row) {
        if (!row?.data) return null;

        try {
            const node = JSON.parse(row.data);
            if (node?.label !== 'WAKE_SUBSCRIPTION') return null;
            return {id: row.id || node.id, node: {...node, id: node.id || row.id}};
        } catch (error) {
            logger.warn(`[WakeSubscription] Failed to parse durable subscription row ${row.id}: ${error.message}`);
            return null;
        }
    }

    /**
     * @summary Hydrates the graph cache and subscription cache from a durable subscription node.
     *
     * This is the Echo half of the durable-source alignment strategy: once SQLite proves a
     * subscription exists, the hot graph/cache layers are updated so subsequent operations in the
     * same MCP server lifetime see the same route the wake daemon sees.
     *
     * @param {String} subscriptionId The durable subscription id.
     * @param {Object} node Parsed `WAKE_SUBSCRIPTION` graph node.
     * @returns {Object} Cache entry (`{id, ...properties}`).
     * @protected
     */
    _hydrateSubscriptionFromDurableNode(subscriptionId, node) {
        const id         = subscriptionId || node.id;
        const properties = node.properties || {};
        const db         = GraphService.db;
        const cachedNode = db?.nodes?.get(id);

        if (cachedNode) {
            cachedNode.label      = node.label || cachedNode.label;
            cachedNode.properties = {
                ...(cachedNode.properties || {}),
                ...properties
            };
        } else {
            const wasAutoSave = db?.autoSave;
            if (db) db.autoSave = false;
            try {
                db?.nodes?.add({
                    ...node,
                    id,
                    label: node.label || 'WAKE_SUBSCRIPTION',
                    properties
                });
            } finally {
                if (db) db.autoSave = wasAutoSave;
            }
        }

        const entry = {id, ...properties};
        this.subscriptionCache.set(id, entry);
        return entry;
    }

    /**
     * @summary Refreshes mutable metadata on an existing active wake route during re-subscribe.
     *
     * Idempotent subscribe must not create a duplicate route, but re-subscribe is also the
     * operator recovery path after bridge/MCP restarts. Merging the current request's filters and
     * metadata into the existing row lets agents repair stale route settings (for example a
     * corrected `focusSeedKey`) without adding parallel active `WAKE_SUBSCRIPTION` rows.
     *
     * @param {Object} subscription Existing cache entry.
     * @param {Object} opts
     * @param {Object} opts.filters Current filter request.
     * @param {Object} opts.harnessTargetMetadata Current metadata request.
     * @returns {Object} Refreshed cache entry.
     * @protected
     */
    _refreshExistingSubscriptionRoute(subscription, {filters = {}, harnessTargetMetadata = {}} = {}) {
        const refreshed = {
            ...subscription,
            filters,
            harnessTargetMetadata: {
                ...(subscription.harnessTargetMetadata || {}),
                ...harnessTargetMetadata
            },
            updatedAt: new Date().toISOString()
        };

        this.validateHarnessTargetMetadata(refreshed.harnessTarget, refreshed.harnessTargetMetadata || {});

        const {id, ...properties} = refreshed;
        GraphService.upsertNode({
            id,
            type: 'WAKE_SUBSCRIPTION',
            properties
        });

        this.subscriptionCache.set(id, refreshed);

        return refreshed;
    }

    /**
     * @summary Builds a deterministic HarnessPresence node id for one identity boot.
     * @param {String} owner AgentIdentity node id.
     * @param {String} bootId Per-process boot id.
     * @returns {String}
     * @protected
     */
    _buildHarnessPresenceId(owner, bootId) {
        return `HARNESS_PRESENCE:${owner}:${bootId}`;
    }

    /**
     * @summary Resolves generic and legacy route metadata into a presence address tuple.
     * @param {Object} metadata Merged harnessTargetMetadata.
     * @returns {{instanceAddress: (String|null), addressType: (String|null)}}
     * @protected
     */
    _resolvePresenceAddress(metadata = {}) {
        const addressType = metadata.addressType
            || (metadata.userDataDir ? 'userDataDir' : null);

        const instanceAddress = metadata.instanceAddress
            || (addressType === 'userDataDir' ? metadata.userDataDir : null);

        return {
            instanceAddress: instanceAddress || null,
            addressType    : addressType || null
        };
    }

    /**
     * @summary Normalizes a process id candidate for HarnessPresence storage.
     * @param {*} pid Process id candidate.
     * @returns {Number|null}
     * @protected
     */
    _normalizePresencePid(pid) {
        const numericPid = Number(pid);

        return Number.isInteger(numericPid) && numericPid > 0 ? numericPid : null;
    }

    /**
     * @summary Coerces test-injected and production clock values to a valid Date.
     * @param {Date|String|Number} value Clock value.
     * @returns {Date}
     * @protected
     */
    _coerceDate(value) {
        const date = value instanceof Date ? value : new Date(value);

        return Number.isNaN(date.getTime()) ? new Date() : date;
    }

    /**
     * @summary Tests whether a HarnessPresence row has exceeded its TTL backstop.
     * @param {Object} props HarnessPresence properties.
     * @param {Number} nowMs Current timestamp in milliseconds.
     * @returns {Boolean}
     * @protected
     */
    _isPresenceTtlExpired(props, nowMs) {
        const expiresAt = props.expiresAt ? new Date(props.expiresAt).getTime() : NaN;
        if (Number.isFinite(expiresAt)) return expiresAt <= nowMs;

        const lastSeenAt = props.lastSeenAt ? new Date(props.lastSeenAt).getTime() : NaN;
        return Number.isFinite(lastSeenAt) && nowMs - lastSeenAt > this.harnessPresenceTtlMs;
    }

    /**
     * @summary Checks pid liveness for stale HarnessPresence retirement.
     * @param {Number|String} pid Process id candidate.
     * @returns {Boolean}
     * @protected
     */
    _isPidAlive(pid) {
        const numericPid = this._normalizePresencePid(pid);
        if (!numericPid) return false;

        try {
            process.kill(numericPid, 0);
            return true;
        } catch (error) {
            return error.code === 'EPERM';
        }
    }

    /**
     * @summary Removes durable SUBSCRIBES_TO edges for cache-cold unsubscribe operations.
     *
     * `unsubscribe` used to scan only loaded `db.edges.items`; after restart, stale active
     * subscription nodes can still have durable `SUBSCRIBES_TO` edges that the wake daemon
     * observes but the cache has not hydrated. This durable cleanup keeps the public API's remove
     * semantics aligned with the SQLite graph source of truth.
     *
     * @param {String} subscriptionId The subscription node id being removed.
     * @protected
     */
    _removeDurableSubscriptionEdges(subscriptionId) {
        const db     = GraphService.db;
        const sqlite = db?.storage?.db;
        if (!sqlite) return;

        const edgeIds = sqlite.prepare(`
            SELECT id FROM Edges
            WHERE target = ?
              AND type = 'SUBSCRIBES_TO'
        `).all(subscriptionId).map(row => row.id);

        if (edgeIds.length === 0) return;

        db.edges.remove(edgeIds);
        db.storage?.removeEdges?.(edgeIds);
    }

    /**
     * @summary Builds the canonical active-route key for wake subscription idempotency.
     *
     * The route key deliberately includes filter semantics but only channel routing metadata
     * (`appName` for Shape C, `url` for Shape B). Non-routing settings such as `coalesceWindow`,
     * `tabShortcut`, or `focusSeedKey` are mutable configuration for an existing route and should
     * be changed with `update`, not by creating parallel active rows.
     *
     * @param {Object} subscription Subscription-like object with route fields.
     * @returns {String} Stable route identity string.
     * @protected
     */
    _buildSubscriptionRouteKey(subscription) {
        const routeMetadata = this._getRouteMetadata(subscription.harnessTarget, subscription.harnessTargetMetadata || {});

        return this._stableStringify({
            agentIdentity: subscription.agentIdentity,
            trigger      : subscription.trigger,
            filters      : subscription.filters || {},
            harnessTarget: subscription.harnessTarget,
            routeMetadata
        });
    }

    /**
     * @summary Extracts only routing metadata for a wake delivery channel.
     *
     * @param {String} harnessTarget Wake delivery channel.
     * @param {Object} metadata Raw harness target metadata.
     * @returns {Object} Route-relevant metadata subset.
     * @protected
     */
    _getRouteMetadata(harnessTarget, metadata = {}) {
        if (harnessTarget === 'bridge-daemon') return {appName: metadata.appName || null};
        if (harnessTarget === 'a2a-webhook')   return {url: metadata.url || null};
        return {};
    }

    /**
     * @summary Serializes objects with stable key ordering for semantic tuple comparison.
     *
     * @param {*} value Value to normalize and stringify.
     * @returns {String} Deterministic JSON representation.
     * @protected
     */
    _stableStringify(value) {
        return JSON.stringify(this._stableNormalize(value));
    }

    /**
     * @summary Normalizes object keys and primitive arrays for route-key comparison.
     *
     * @param {*} value Value to normalize.
     * @returns {*} Stable normalized value.
     * @protected
     */
    _stableNormalize(value) {
        if (Array.isArray(value)) {
            return value
                .map(item => this._stableNormalize(item))
                .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        }

        if (value && typeof value === 'object') {
            return Object.keys(value).sort().reduce((out, key) => {
                out[key] = this._stableNormalize(value[key]);
                return out;
            }, {});
        }

        return value;
    }
}

export default Neo.setupClass(WakeSubscriptionService);
