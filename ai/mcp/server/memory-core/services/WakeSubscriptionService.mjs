import crypto                 from 'crypto';
import Base                   from '../../../../../src/core/Base.mjs';
import GraphService           from './GraphService.mjs';
import RequestContextService  from '../../shared/services/RequestContextService.mjs';
import logger                 from '../logger.mjs';
import CoalescingEngineService from './CoalescingEngineService.mjs';

/**
 * @summary Service for managing graph-resident WAKE_SUBSCRIPTION nodes and the
 * `manage_wake_subscription` MCP tool surface — the foundational substrate for the
 * Phase 3 cross-harness autonomous wake substrate (ADR 0002).
 *
 * Subscriptions are graph-resident (durable across MCP server restarts per ADR 0002 §6.6.2)
 * with a write-through in-memory cache for sub-millisecond trigger evaluation.
 * Per-agent ownership is enforced via `RequestContextService.getAgentIdentityNodeId()`
 * and an explicit `SUBSCRIBES_TO` edge from the AgentIdentity node to the WAKE_SUBSCRIPTION
 * node.
 *
 * The service implements the discipline-layer surface; channel-specific event delivery
 * (Shape A MCP notifications, Shape B A2A webhook, Shape C bridge daemon) is wired
 * by the consuming sub-tickets #10358 / #10359 / #10360. The `resync` action queries
 * `GraphLog` deltas and returns the event-payload list; channel dispatch is the
 * consumer's responsibility.
 *
 * @class Neo.ai.mcp.server.memory-core.services.WakeSubscriptionService
 * @extends Neo.core.Base
 * @singleton
 * @see learn/agentos/decisions/0002-phase3-wake-substrate-standards-alignment.md §6.6
 * @see #10357 (parent Epic) #10361 (this sub) #10358/#10359/#10360 (channel consumers)
 */
class WakeSubscriptionService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.services.WakeSubscriptionService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.services.WakeSubscriptionService',
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
    validTriggers = ['SENT_TO_ME', 'TASK_STATE_CHANGED', 'PERMISSION_GRANTED']

    /**
     * @member {String[]} validHarnessTargets
     * @protected
     */
    validHarnessTargets = ['mcp-notifications', 'a2a-webhook', 'bridge-daemon', 'disabled', 'none']

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
     * Sets the initial live cursor to the current graph log head to prevent
     * replaying historical events on boot.
     */
    async init() {
        await GraphService.ready();
        const storage = GraphService.db?.storage;
        if (storage?.db) {
            try {
                const row = storage.db.prepare('SELECT MAX(log_id) as maxId FROM GraphLog').get();
                this.liveCursor = row.maxId || 0;
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
                this.liveCursor = delta.lastLogId;
                return;
            }

            // We only care about mcp-notifications target
            // We also explicitly do a full scan since the cache might only have lazy-loaded partials.
            // Wait, does subscriptionCache have all active subscriptions? No, it's lazy loaded.
            // We should ensure all active mcp-notifications subscriptions are in cache.
            // Or simply do a quick SQLite scan for them to guarantee we don't miss any if we haven't listed them.
            this._warmMcpSubscriptions();

            const activeSubs = Array.from(this.subscriptionCache.values())
                .filter(sub => sub.harnessTarget === 'mcp-notifications' && sub.status === 'active');
                
            if (activeSubs.length === 0) {
                this.liveCursor = delta.lastLogId;
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

            
            this.liveCursor = delta.lastLogId;
        } catch (e) {
            logger.error('[WakeSubscription] Background pump failed:', e);
        } finally {
            this._pumping = false;
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
     * action-specific handlers per ADR 0002 §6.6.
     *
     * @param {Object} opts
     * @param {String} opts.action One of 'subscribe' | 'unsubscribe' | 'update' | 'list' | 'resync'
     * @param {Object} [opts.rest] Action-specific parameters (see individual methods)
     * @returns {Promise<Object>}
     */
    async manage(opts = {}) {
        const {action, ...rest} = opts;
        switch (action) {
            case 'subscribe'  : return this.subscribe  (rest);
            case 'unsubscribe': return this.unsubscribe(rest);
            case 'update'     : return this.update     (rest);
            case 'list'       : return this.list       (rest);
            case 'resync'     : return this.resync     (rest);
            default:
                throw new Error(
                    `Invalid action '${action}'. Must be one of: subscribe, unsubscribe, update, list, resync.`
                );
        }
    }

    /**
     * Creates a new subscription. Generates a fresh subscriptionId, persists the
     * WAKE_SUBSCRIPTION node + SUBSCRIBES_TO edge, and populates the cache.
     * For Shape B (`a2a-webhook`), generates an HMAC signing key and returns it once.
     *
     * @param {Object} opts
     * @param {String} opts.trigger One of validTriggers
     * @param {Object} [opts.filters] taggedConcepts | priority | senderFilter | inReplyToFilter
     * @param {String} opts.harnessTarget One of validHarnessTargets
     * @param {Object} [opts.harnessTargetMetadata] url | coalesceWindow | daemonSocketPath
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

        const subscriptionId = `WAKE_SUB:${crypto.randomUUID()}`;
        const now            = new Date().toISOString();
        const finalMetadata  = {...harnessTargetMetadata};

        // Shape B requires an HMAC signing key for webhook authenticity.
        // Per ADR 0002 §6.2.3 the server generates and returns it once at subscribe-time;
        // it is stored in the node's harnessTargetMetadata for subsequent verification.
        let signingKey;
        if (harnessTarget === 'a2a-webhook') {
            if (!finalMetadata.url) {
                throw new Error("Shape B (a2a-webhook) requires harnessTargetMetadata.url.");
            }
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

        const db           = GraphService.db;
        const edgesToRemove = [];
        for (const edge of db.edges.items) {
            if (edge.target === subscriptionId && edge.type === 'SUBSCRIBES_TO') {
                edgesToRemove.push(edge);
            }
        }
        if (edgesToRemove.length > 0) db.edges.remove(edgesToRemove);

        db.removeNode(subscriptionId);
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

        // Full scan for caller-owned subscriptions. The cache may be partial (lazy-loaded);
        // walk SQLite directly for completeness, then warm the cache as a side effect.
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
     * Replays GraphLog deltas matching the subscription's current trigger+filter spec,
     * starting from `sinceLogId`. Returns the matching event payloads as data; the
     * channel-specific re-emission (MCP notifications / webhook POST / daemon dispatch)
     * is the responsibility of Shape A/B/C consumers wiring this output to their
     * delivery surfaces. Per ADR 0002 §6.1.6 + §6.6.2.
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

        return {
            subscriptionId,
            events,
            lastLogId     : delta.lastLogId,
            eventsReplayed: events.length
        };
    }

    /**
     * Retrieves the specific GraphLog log_id for an entity, to anchor the wake event
     * per ADR 0002 §6.1.6.
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
     * Wraps a payload in the standard wake notification envelope per ADR 0002 §6.1.1-§6.1.3.
     * @protected
     * @param {String} eventType One of `wake/sent_to_me`, `wake/task_state_changed`, `wake/permission_granted`
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
        if (!node || node.label !== 'WAKE_SUBSCRIPTION') return null;

        const entry = {id: node.id, ...(node.properties || {})};
        this.subscriptionCache.set(subscriptionId, entry);
        return entry;
    }
}

export default Neo.setupClass(WakeSubscriptionService);
