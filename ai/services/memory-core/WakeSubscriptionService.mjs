import crypto                 from 'crypto';
import fs                     from 'fs-extra';
import path                   from 'path';
import Base                   from '../../../src/core/Base.mjs';
import GraphService           from './GraphService.mjs';
import aiConfig               from '../../mcp/server/memory-core/config.mjs';
import RequestContextService  from '../../mcp/server/shared/services/RequestContextService.mjs';
import logger                 from '../../mcp/server/memory-core/logger.mjs';
import CoalescingEngineService from './CoalescingEngineService.mjs';

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
    heartbeatPulseEntityType = 'heartbeat_pulse'

    /**
     * @member {String} heartbeatPulseEntityPrefix='HEARTBEAT_PULSE'
     * @protected
     */
    heartbeatPulseEntityPrefix = 'HEARTBEAT_PULSE'

    /**
     * @member {String[]} validHarnessTargets
     * @protected
     */
    validHarnessTargets = ['mcp-notifications', 'a2a-webhook', 'bridge-daemon', 'disabled', 'none']

    /**
     * @member {String[]} validAppNames
     *
     * Canonical osascript target app names accepted on Shape C subscription writes. One entry per
     * harness onboarded into the swarm trio: Antigravity (@neo-gemini-3-1-pro), Claude
     * (@neo-opus-4-7), Codex (@neo-gpt). The bridge daemon dispatches via `tell application
     * "<appName>"`, so list completeness is load-bearing — a missing entry rejects the canonical
     * AgentIdentity.subscriptionTemplate at auto-bootstrap time and silently strands the
     * corresponding harness from Shape C wake delivery.
     *
     * @protected
     */
    validAppNames = ['Antigravity', 'Claude', 'Codex']

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
     * @member {Number} liveCursor=0
     * @protected
     */
    liveCursor = 0

    /**
     * @member {String} liveCursorStateFile
     * @protected
     */
    liveCursorStateFile = aiConfig.wakeDaemon.wakeSubscriptionLiveCursorPath

    /**
     * Sets the initial live cursor to the current graph log head to prevent
     * replaying historical events on boot.
     */
    async init() {
        await GraphService.ready();
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
     * Evaluates recent GraphLog deltas and pushes matching events to connected
     * Shape A (MCP notification) clients. Intended to be called by mutation paths
     * (e.g. MailboxService, PermissionService) for low-latency delivery.
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

            const delta = storage.getDeltaLog(this.liveCursor);
            if (delta.invalidEdges.length === 0 && delta.invalidNodes.length === 0) {
                this._setLiveCursor(delta.lastLogId);
                return;
            }

            // Shape A delivery needs every active mcp-notifications subscription, not only routes
            // that were touched through this process's lazy cache.
            this._warmMcpSubscriptions();

            const activeSubs = Array.from(this.subscriptionCache.values())
                .filter(sub => sub.harnessTarget === 'mcp-notifications' && sub.status === 'active');

            if (activeSubs.length === 0) {
                this._setLiveCursor(delta.lastLogId);
                return;
            }

            for (const sub of activeSubs) {
                for (const edgeRef of delta.invalidEdges) {
                    const logId = this._getEntityLogId(edgeRef.id) || delta.lastLogId;
                    const matched = this._evaluateEdgeAgainstSubscription(edgeRef, sub, logId);
                    if (matched) CoalescingEngineService.enqueue(sub, matched);
                }
                for (const nodeId of delta.invalidNodes) {
                    const logId = this._getEntityLogId(nodeId) || delta.lastLogId;
                    const matched = this._evaluateNodeAgainstSubscription(nodeId, sub, logId);
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
     * Ensures all active 'mcp-notifications' subscriptions are in cache.
     * @protected
     */
    _warmMcpSubscriptions() {
        const db = GraphService.db;
        if (!db) return;
        for (const node of db.nodes.items) {
            if (node.label !== 'WAKE_SUBSCRIPTION') continue;
            const props = node.properties || {};
            if (props.harnessTarget === 'mcp-notifications' && props.status === 'active') {
                if (!this.subscriptionCache.has(node.id)) {
                    this.subscriptionCache.set(node.id, {id: node.id, ...props});
                }
            }
        }
    }

    /**
     * Unified entry point for the `manage_wake_subscription` MCP tool. Dispatches to
     * action-specific handlers per ADR 0002 §6.6. ticket-ref-ok: decision-record authority, not issue archaeology
     *
     * @param {Object} opts
     * @param {String} opts.action One of 'subscribe' | 'unsubscribe' | 'update' | 'list' | 'resync'
     * @param {Object} [opts.rest] Action-specific parameters (see individual methods)
     * @returns {Promise<Object>}
     */
    async manage(opts = {}) {
        const {action, ...rest} = opts;
        switch (action) {
            case 'bootstrap'  : return this.bootstrap  (rest);
            case 'subscribe'  : return this.subscribe  (rest);
            case 'unsubscribe': return this.unsubscribe(rest);
            case 'update'     : return this.update     (rest);
            case 'list'       : return this.list       (rest);
            case 'resync'     : return this.resync     (rest);
            default:
                throw new Error(
                    `Invalid action '${action}'. Must be one of: bootstrap, subscribe, unsubscribe, update, list, resync.`
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
     * @param {Object} [opts.overrideMetadata] Optional metadata to override template defaults
     * @returns {Promise<Object>} {subscriptionId, harnessTarget, status: 'existing'|'created'}
     */
    async bootstrap({overrideMetadata} = {}) {
        const owner = RequestContextService.getAgentIdentityNodeId();
        if (!owner) throw new Error('Cannot bootstrap subscription: no agent identity context bound.');

        // Cross-session duplicate-accumulation defense.
        //
        // The route-key idempotency check below is necessary but empirically not sufficient: across
        // sessions, duplicates accumulate (`@neo-opus-4-7` had 2 active subscriptions 2 days apart;
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

        // Bootstrap and public subscribe must share the same durable route-idempotency contract.
        const existing = this._findActiveSubscriptionByRoute({
            owner,
            trigger              : template.trigger,
            filters              : template.filters || {},
            harnessTarget        : template.harnessTarget,
            harnessTargetMetadata: mergedMetadata
        });

        if (existing) {
            const refreshed = this._refreshExistingSubscriptionRoute(existing, {
                filters              : template.filters || {},
                harnessTargetMetadata: mergedMetadata
            });

            return {subscriptionId: refreshed.id, harnessTarget: refreshed.harnessTarget, status: 'existing'};
        }

        // Create new subscription from template.
        const result = await this.subscribe({
            trigger: template.trigger,
            filters: template.filters || {},
            harnessTarget: template.harnessTarget,
            harnessTargetMetadata: mergedMetadata
        });

        return {...result, status: result.status === 'existing' ? 'existing' : 'created'};
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
     * bridge daemon reads every durable active `WAKE_SUBSCRIPTION` row. To keep the
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
     *     daemonSocketPath | adapter | tabShortcut | focusSeedKey | tmuxSession | userDataDir
     *     (userDataDir: instance address for a same-bundle GUI harness — the bridge daemon resolves
     *     it to that instance's pid and raises that process, instead of the ambiguous frontmost guess)
     * @returns {Promise<Object>} {subscriptionId, harnessTarget, signingKey?}
     */
    async subscribe({trigger, filters = {}, harnessTarget, harnessTargetMetadata = {}} = {}) {
        const owner = RequestContextService.getAgentIdentityNodeId();
        if (!owner) throw new Error('Cannot create subscription: no agent identity context bound.');

        if (!this.validTriggers.includes(trigger)) {
            throw new Error(`Invalid trigger '${trigger}'. Must be one of: ${this.validTriggers.join(', ')}`);
        }
        if (!this.validHarnessTargets.includes(harnessTarget)) {
            throw new Error(`Invalid harnessTarget '${harnessTarget}'. Must be one of: ${this.validHarnessTargets.join(', ')}`);
        }

        const finalMetadata = {...harnessTargetMetadata};

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
            agentIdentity: owner,
            trigger,
            filters,
            harnessTarget,
            harnessTargetMetadata: finalMetadata,
            createdAt    : now,
            updatedAt    : now,
            userId       : owner,
            sharedEntity : false,
            status       : 'active'
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
        if (!caller) throw new Error('Cannot unsubscribe: no agent identity context bound.');
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
        if (!caller) throw new Error('Cannot update subscription: no agent identity context bound.');
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
        if (harnessTargetMetadata !== undefined) updated.harnessTargetMetadata = {...subscription.harnessTargetMetadata, ...harnessTargetMetadata};
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
        if (harnessTarget === 'bridge-daemon' && !metadata.appName) {
            throw new Error('Shape C (bridge-daemon) requires harnessTargetMetadata.appName.');
        }
        if (metadata.appName && !this.validAppNames.includes(metadata.appName)) {
            throw new Error(`Invalid appName '${metadata.appName}'. Must be one of: ${this.validAppNames.join(', ')}`);
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
        if (!caller) throw new Error('Cannot list subscriptions: no agent identity context bound.');

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
     * @summary Emits a durable GraphLog-only heartbeat pulse for an active bridge-daemon route.
     *
     * Heartbeat pulses are interrupt transport hints, not mailbox content. The pulse writes only a
     * tagged `GraphLog` row, never a `MESSAGE` node or `SENT_TO` edge, so it is replayable by
     * `resync()` and bridge-daemon tailing without surfacing in inbox listings.
     *
     * @param {Object} opts
     * @param {String} opts.targetIdentity AgentIdentity node id that should receive the pulse.
     * @returns {Promise<Object>} Emission status and optional `logId`.
     */
    async emitHeartbeatPulse({targetIdentity} = {}) {
        if (!targetIdentity) throw new Error("Missing 'targetIdentity' parameter.");

        // Heartbeat pulses ride the existing bridge-daemon route; a dedicated
        // HEARTBEAT_PULSE trigger is not exposed by manage_wake_subscription.
        if (!this._hasActiveBridgeDaemonRoute(targetIdentity)) {
            logger.info(`[WakeSubscription] heartbeat pulse skipped for ${targetIdentity}: no active bridge-daemon subscription.`);
            return {
                status: 'skipped',
                reason: 'no-active-bridge-daemon-subscription',
                targetIdentity
            };
        }

        const sqlite = GraphService.db?.storage?.db;
        if (!sqlite?.prepare) {
            throw new Error('Cannot emit heartbeat pulse: GraphLog storage unavailable.');
        }

        const entityId = this._createHeartbeatPulseEntityId(targetIdentity);
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
        if (!caller) throw new Error('Cannot resync: no agent identity context bound.');
        if (!subscriptionId) throw new Error("Missing 'subscriptionId' parameter.");

        const subscription = this._loadSubscription(subscriptionId);
        if (!subscription) throw new Error(`Subscription not found: ${subscriptionId}`);
        if (subscription.agentIdentity !== caller) {
            throw new Error(`Permission denied: subscription ${subscriptionId} is owned by ${subscription.agentIdentity}, not ${caller}.`);
        }

        const storage = GraphService.db.storage;
        if (!storage?.getDeltaLog) {
            logger.warn('[WakeSubscription] resync called but GraphLog storage unavailable; returning empty replay.');
            return {subscriptionId, events: [], lastLogId: sinceLogId, eventsReplayed: 0};
        }

        const delta  = storage.getDeltaLog(sinceLogId);
        const events = [];

        // Trigger evaluation walks the delta entities. SENT_TO_ME / PERMISSION_GRANTED
        // examine edges; TASK_STATE_CHANGED examines nodes (the Task envelope payload).
        // Filter spec is applied to the matched candidate's payload; non-matches are skipped.
        for (const edgeRef of delta.invalidEdges) {
            const logId = this._getEntityLogId(edgeRef.id) || delta.lastLogId;
            const matched = this._evaluateEdgeAgainstSubscription(edgeRef, subscription, logId);
            if (matched) events.push(matched);
        }
        for (const nodeId of delta.invalidNodes) {
            const logId = this._getEntityLogId(nodeId) || delta.lastLogId;
            const matched = this._evaluateNodeAgainstSubscription(nodeId, subscription, logId);
            if (matched) events.push(matched);
        }
        for (const pulseTrace of this._getHeartbeatPulseLogEntries(sinceLogId)) {
            const matched = this._evaluateHeartbeatPulseAgainstSubscription(pulseTrace, subscription);
            if (matched) events.push(matched);
        }

        return {
            subscriptionId,
            events,
            lastLogId     : delta.lastLogId,
            eventsReplayed: events.length
        };
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
        const db   = GraphService.db;
        const edge = db.edges.get(edgeRef.id);
        if (!edge) return null;

        const owner = subscription.agentIdentity;

        if (subscription.trigger === 'SENT_TO_ME' && edge.type === 'SENT_TO' && edge.target === owner) {
            const messageNode = db.nodes.get(edge.source);
            if (!messageNode) return null;
            if (messageNode.properties?.wakeSuppressed) return null;
            const payload = this._buildSentToMePayload(messageNode);
            if (!this._matchesFilters(payload, subscription.filters)) return null;
            return this._wrapEvent('wake/sent_to_me', subscription, payload, logIdAnchor);
        }

        if (subscription.trigger === 'PERMISSION_GRANTED'
            && ['CAN_REPLY_TO', 'CAN_READ_INBOX_OF', 'CAN_READ_MEMORIES_OF'].includes(edge.type)
            && edge.target === owner) {
            const payload = {
                scope     : edge.type,
                grantedBy : edge.source,
                grantedAt : new Date().toISOString()
            };
            return this._wrapEvent('wake/permission_granted', subscription, payload, logIdAnchor);
        }

        return null;
    }

    /**
     * Evaluates a GraphLog node entry against TASK_STATE_CHANGED triggers.
     * Returns the wake-event payload if matched, null otherwise.
     * @protected
     * @param {String} nodeId GraphLog-touched node ID (typically a `MESSAGE:*` carrying a Task envelope)
     * @param {Object} subscription The cached WAKE_SUBSCRIPTION entry (id + properties)
     * @param {Number} logIdAnchor The delta block's lastLogId for the notification watermark
     * @returns {Object|null} Wrapped wake-event payload (per §6.1.2 envelope) or null when no match
     */
    _evaluateNodeAgainstSubscription(nodeId, subscription, logIdAnchor) {
        if (subscription.trigger !== 'TASK_STATE_CHANGED') return null;

        const node = GraphService.db.nodes.get(nodeId);
        if (!node || node.label !== 'MESSAGE') return null;

        const props = node.properties || {};
        const task  = props.task;
        if (!task || !task.state) return null;

        const owner = subscription.agentIdentity;
        if (props.from !== owner && task.assignee !== owner) return null;

        const payload = {
            taskId        : nodeId,
            previousState : null,                          // Not retained in node properties; resync semantics return current state only.
            newState      : task.state,
            originator    : props.from,
            assignee      : task.assignee,
            lastModifiedAt: props.updatedAt || props.sentAt
        };
        return this._wrapEvent('wake/task_state_changed', subscription, payload, logIdAnchor);
    }

    /**
     * Evaluates a GraphLog-only heartbeat pulse against a subscription.
     * @protected
     * @param {Object} trace GraphLog heartbeat pulse row.
     * @param {Object} subscription The cached WAKE_SUBSCRIPTION entry.
     * @returns {Object|null} Wrapped heartbeat-pulse event or null.
     */
    _evaluateHeartbeatPulseAgainstSubscription(trace, subscription) {
        // Dispatch pulses through the existing bridge-daemon route, independent of the
        // subscription trigger that originally established the route.
        if (trace.entity_type !== this.heartbeatPulseEntityType) return null;
        if (subscription.harnessTarget !== 'bridge-daemon') return null;

        const pulse = this._parseHeartbeatPulseEntityId(trace.entity_id);
        if (!pulse || pulse.targetIdentity !== subscription.agentIdentity) return null;

        return this._wrapEvent('wake/heartbeat_pulse', subscription, {
            targetIdentity: pulse.targetIdentity,
            pulseId       : pulse.pulseId
        }, trace.log_id);
    }

    /**
     * Builds the wake/sent_to_me payload from a MESSAGE node.
     * @protected
     * @param {Object} messageNode Graph node with `properties` (from / subject / priority / taggedConcepts / inReplyTo / to)
     * @returns {{messageId:String,from:String,subject:String,priority:String,taggedConcepts:String[],isReplyTo:?String,isBroadcast:Boolean}}
     */
    _buildSentToMePayload(messageNode) {
        const props = messageNode.properties || {};
        return {
            messageId     : messageNode.id,
            from          : props.from,
            subject       : (props.subject || '').slice(0, 200),
            priority      : props.priority || 'normal',
            taggedConcepts: props.taggedConcepts || [],
            isReplyTo     : props.inReplyTo || null,
            isBroadcast   : props.to === 'AGENT:*'
        };
    }

    /**
     * Wraps a payload in the standard wake notification envelope per ADR 0002 §6.1.1-§6.1.3. ticket-ref-ok: decision-record authority, not issue archaeology
     * @protected
     * @param {String} eventType One of `wake/sent_to_me`, `wake/task_state_changed`, `wake/permission_granted`, `wake/heartbeat_pulse`
     * @param {Object} subscription Cached WAKE_SUBSCRIPTION entry (provides `id` + `agentIdentity`)
     * @param {Object} payload Trigger-specific inner payload built by the matching `_build*Payload` helper
     * @param {String|Number} logIdAnchor GraphLog `log_id` anchor preserved across re-emissions for cursor-based catchup
     * @returns {Object} Full notification envelope (`schemaVersion`, `eventType`, `eventId`, `logId`, `agentIdentity`, `subscriptionId`, `payload`, `emittedAt`)
     */
    _wrapEvent(eventType, subscription, payload, logIdAnchor) {
        return {
            schemaVersion : '1.0',
            eventType,
            eventId       : `01H${crypto.randomBytes(10).toString('hex').toUpperCase()}`,
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
     * @returns {String} Encoded heartbeat pulse entity id.
     */
    _createHeartbeatPulseEntityId(targetIdentity) {
        return `${this.heartbeatPulseEntityPrefix}:${targetIdentity}:${crypto.randomUUID()}`;
    }

    /**
     * Parses a heartbeat pulse GraphLog entity id.
     * @protected
     * @param {String} entityId Encoded heartbeat pulse entity id.
     * @returns {{targetIdentity:String,pulseId:String}|null} Parsed pulse identity.
     */
    _parseHeartbeatPulseEntityId(entityId) {
        const prefix = `${this.heartbeatPulseEntityPrefix}:`;
        if (!entityId?.startsWith(prefix)) return null;

        const body      = entityId.slice(prefix.length);
        const separator = body.lastIndexOf(':');
        if (separator <= 0 || separator === body.length - 1) return null;

        return {
            targetIdentity: body.slice(0, separator),
            pulseId       : body.slice(separator + 1)
        };
    }

    /**
     * Applies optional filter spec (taggedConcepts, priority, senderFilter, inReplyToFilter)
     * to a sent_to_me payload. Returns true if all configured filters pass.
     * @protected
     * @param {Object} payload The `_buildSentToMePayload` output to evaluate
     * @param {Object} [filters={}] Subscription filter spec (taggedConcepts / priority / senderFilter / inReplyToFilter)
     * @returns {Boolean} `true` if every configured filter passes (AND-conjunctive); `false` otherwise
     */
    _matchesFilters(payload, filters = {}) {
        if (filters.priority && payload.priority !== filters.priority) return false;

        if (Array.isArray(filters.senderFilter) && filters.senderFilter.length > 0
            && !filters.senderFilter.includes(payload.from)) return false;

        if (Array.isArray(filters.inReplyToFilter) && filters.inReplyToFilter.length > 0
            && !filters.inReplyToFilter.includes(payload.isReplyTo)) return false;

        if (Array.isArray(filters.taggedConcepts) && filters.taggedConcepts.length > 0) {
            const hasMatch = (payload.taggedConcepts || []).some(c => filters.taggedConcepts.includes(c));
            if (!hasMatch) return false;
        }

        return true;
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
     * creating a new `WAKE_SUBSCRIPTION` keeps the API and bridge daemon aligned and prevents
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
            if ((subscription.status || 'active') !== 'active') continue;
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
              AND COALESCE(json_extract(data, '$.properties.status'), 'active') = 'active'
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
     * The durable-first path mirrors the bridge daemon's source of truth. The in-memory fallback
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
                  AND COALESCE(json_extract(data, '$.properties.status'), 'active') = 'active'
            `).all(owner, trigger, harnessTarget);

            return rows
                .map(row => this._parseDurableSubscriptionRow(row))
                .filter(Boolean)
                .map(({id, node}) => this._hydrateSubscriptionFromDurableNode(id, node));
        }

        return this._getCandidateSubscriptionsFromMemory(owner, sub => sub.trigger === trigger && sub.harnessTarget === harnessTarget);
    }

    /**
     * @summary Returns true if the identity has at least one active bridge-daemon
     * subscription, regardless of trigger type.
     *
     * Heartbeat-pulse emission uses route reachability rather than a dedicated trigger.
     *
     * @param {String} identity AgentIdentity node id.
     * @returns {Boolean}
     * @protected
     */
    _hasActiveBridgeDaemonRoute(identity) {
        const sqlite = GraphService.db?.storage?.db;
        if (sqlite) {
            const row = sqlite.prepare(`
                SELECT count(*) as count FROM Nodes
                WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
                  AND json_extract(data, '$.properties.agentIdentity') = ?
                  AND json_extract(data, '$.properties.harnessTarget') = 'bridge-daemon'
                  AND COALESCE(json_extract(data, '$.properties.status'), 'active') = 'active'
            `).get(identity);
            return (row?.count || 0) > 0;
        }

        return this._getCandidateSubscriptionsFromMemory(identity, sub => sub.harnessTarget === 'bridge-daemon').length > 0;
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
            if ((props.status || 'active') !== 'active') continue;
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

        const row = sqlite.prepare('SELECT id, data FROM Nodes WHERE id = ? LIMIT 1').get(subscriptionId);
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
     * same MCP server lifetime see the same route the bridge daemon sees.
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
     * @summary Removes durable SUBSCRIBES_TO edges for cache-cold unsubscribe operations.
     *
     * `unsubscribe` used to scan only loaded `db.edges.items`; after restart, stale active
     * subscription nodes can still have durable `SUBSCRIBES_TO` edges that the bridge daemon
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
