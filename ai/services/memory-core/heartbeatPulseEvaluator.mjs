/**
 * @summary Pure, dependency-free wake-subscription evaluation shared by the standalone wake-daemon
 * and `WakeSubscriptionService` — the single source of truth for ALL wake-trigger matching
 * (`SENT_TO_ME` / `TASK_STATE_CHANGED` / `PERMISSION_GRANTED` / `HEARTBEAT_PULSE`).
 *
 * Both `ai/daemons/wake/daemon.mjs` (the standalone poll loop) and `WakeSubscriptionService` (the
 * Memory-Core resync path) previously re-implemented the per-trigger eligibility logic, and had
 * silently DIVERGED: the service applied unread-filtering + `DELIVERED_TO` receipt handling + a
 * broader task match (originator OR assignee), while the daemon over-woke on already-read messages
 * and its `PERMISSION_GRANTED` keyed on a non-existent `HAS_PERMISSION` edge (dead code — it never
 * fired). This module consolidates the SERVICE's (correct, superset) logic into one pure `match()`
 * that both callers invoke — killing the dual-write and the daemon's drift.
 *
 * **Kept GraphService-free on purpose.** The wake-daemon is a lightweight standalone process with
 * its own SQLite connection; consuming a pure `match()` lets it share the canonical evaluation
 * without importing the full `WakeSubscriptionService` (which would pull in `GraphService` +
 * `CoalescingEngineService`). Each caller fetches its OWN entity data and injects it via the
 * `entityData` accessor bag; each caller also still owns its delivery shape (the daemon builds a
 * flat coalescing payload, the service wraps the match in its envelope) — only the matching is
 * consolidated here, not the data-fetch or the output format.
 */

/**
 * Canonical GraphLog `entity_type` for a heartbeat pulse.
 * @type {String}
 */
export const HEARTBEAT_PULSE_ENTITY_TYPE = 'heartbeat_pulse';

/**
 * Canonical prefix (without trailing colon) for an encoded heartbeat-pulse entity id
 * (`HEARTBEAT_PULSE:<identity>:<uuid>`).
 * @type {String}
 */
export const HEARTBEAT_PULSE_ENTITY_PREFIX = 'HEARTBEAT_PULSE';

/**
 * Typed permission edges a `PERMISSION_GRANTED` subscription fires on. These are the edges
 * `PermissionService` actually creates — the legacy `HAS_PERMISSION` literal the wake-daemon used
 * to check is created nowhere, so that branch was dead code.
 * @type {String[]}
 */
export const PERMISSION_EDGE_TYPES = ['CAN_REPLY_TO', 'CAN_READ_INBOX_OF', 'CAN_READ_MEMORIES_OF'];

/**
 * @summary Parses a GraphLog-only heartbeat-pulse entity id into its target identity + pulse id.
 * @param {String}  entityId Encoded `<prefix>:<identity>:<uuid>` id.
 * @param {String} [prefix=HEARTBEAT_PULSE_ENTITY_PREFIX] Entity-id prefix (without trailing colon).
 * @returns {{targetIdentity:String,pulseId:String}|null} Parsed pulse, or `null` if malformed.
 */
export function parseHeartbeatPulseEntityId(entityId, prefix = HEARTBEAT_PULSE_ENTITY_PREFIX) {
    const fullPrefix = `${prefix}:`;
    if (!entityId?.startsWith(fullPrefix)) return null;

    const body      = entityId.slice(fullPrefix.length);
    const separator = body.lastIndexOf(':');
    if (separator <= 0 || separator === body.length - 1) return null;

    return {
        targetIdentity: body.slice(0, separator),
        pulseId       : body.slice(separator + 1)
    };
}

/**
 * @summary Evaluates a GraphLog trace against a subscription's heartbeat-pulse eligibility.
 *
 * Returns the matched pulse (`{targetIdentity, pulseId, logId}`) when the trace is a heartbeat
 * pulse for a `bridge-daemon`-routed subscription whose `agentIdentity` matches the pulse target;
 * `null` otherwise. The caller formats the match into its own delivery shape.
 *
 * `harnessTarget === 'bridge-daemon'` is the FROZEN subscription route value, kept verbatim through
 * the bridge→wake-daemon process rename — it is a wire/route value, not the daemon process name.
 *
 * @param {Object}        options
 * @param {Object}        options.trace                                  GraphLog row (`{entity_type, entity_id, log_id}`).
 * @param {String}        options.harnessTarget                          Subscription's harness-target route value.
 * @param {String}        options.agentIdentity                          Subscription's owning agent identity.
 * @param {String}        [options.entityType=HEARTBEAT_PULSE_ENTITY_TYPE] GraphLog entity-type treated as a pulse.
 * @param {String}        [options.prefix=HEARTBEAT_PULSE_ENTITY_PREFIX]   Entity-id prefix.
 * @returns {{targetIdentity:String,pulseId:String,logId:(Number|String)}|null}
 */
export function matchHeartbeatPulse({trace, harnessTarget, agentIdentity, entityType = HEARTBEAT_PULSE_ENTITY_TYPE, prefix = HEARTBEAT_PULSE_ENTITY_PREFIX}) {
    if (trace?.entity_type !== entityType) return null;
    if (harnessTarget !== 'bridge-daemon')  return null;

    const pulse = parseHeartbeatPulseEntityId(trace.entity_id, prefix);
    if (!pulse || pulse.targetIdentity !== agentIdentity) return null;

    return {
        targetIdentity: pulse.targetIdentity,
        pulseId       : pulse.pulseId,
        logId         : trace.log_id
    };
}

/**
 * @summary True when a node is a wake-eligible MESSAGE: it exists, is labelled `MESSAGE`, and is
 * not flagged `wakeSuppressed`.
 * @param {Object|null} messageNode
 * @returns {Boolean}
 */
function isMessageWakeEligible(messageNode) {
    return !!messageNode && messageNode.label === 'MESSAGE' && !messageNode.properties?.wakeSuppressed;
}

/**
 * @summary Builds the inner `SENT_TO_ME` payload from a resolved MESSAGE node — the canonical
 * shape consumed verbatim by both wake call-sites (the daemon + `WakeSubscriptionService`).
 * @param {Object} messageNode
 * @returns {Object}
 */
function buildSentToMeInner(messageNode) {
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
 * @summary AND-conjunctive subscription filter match — every configured filter must pass. The
 * canonical filter pass for both wake call-sites (consolidates the daemon's former inline filters
 * and the service's former filter pass): `priority` / `senderFilter` / `inReplyToFilter` / `taggedConcepts`.
 * @param {Object} payload The `buildSentToMeInner` output.
 * @param {Object} [filters={}]
 * @returns {Boolean}
 */
function matchesFilters(payload, filters = {}) {
    if (filters.priority && payload.priority !== filters.priority) return false;

    if (Array.isArray(filters.senderFilter) && filters.senderFilter.length > 0
        && !filters.senderFilter.includes(payload.from)) return false;

    if (Array.isArray(filters.inReplyToFilter) && filters.inReplyToFilter.length > 0
        && !filters.inReplyToFilter.includes(payload.isReplyTo)) return false;

    if (Array.isArray(filters.taggedConcepts) && filters.taggedConcepts.length > 0) {
        if (!(payload.taggedConcepts || []).some(c => filters.taggedConcepts.includes(c))) return false;
    }

    return true;
}

/**
 * @summary Evaluates a `SENT_TO` / `DELIVERED_TO` edge against the subscription owner; returns the
 * inner payload only for an UNREAD, recipient-visible, wake-eligible message, else `null`.
 *
 * Unread state is split by delivery shape: direct DMs + legacy broadcasts carry `readAt` on the
 * MESSAGE node, while receipt-backed fan-out broadcasts carry it on the per-recipient `DELIVERED_TO`
 * edge — so receipt-backed broadcasts are evaluated through `DELIVERED_TO` only, and the legacy
 * `SENT_TO -> AGENT:*` path defers (`hasDeliveryReceipts`) when receipts exist. This is the
 * canonical edge evaluation consumed by both wake call-sites (the daemon + `WakeSubscriptionService`).
 *
 * @param {Object}   edge                Candidate mailbox delivery edge (`{type, source, target, properties}`).
 * @param {String}   owner               Subscription owner AgentIdentity.
 * @param {Function} getNode             `(nodeId) => node|null` — resolves the MESSAGE node.
 * @param {Function} hasDeliveryReceipts `(messageNodeId) => Boolean` — does the message have any `DELIVERED_TO` edges?
 * @returns {Object|null}
 */
function matchSentToMeEdge(edge, owner, getNode, hasDeliveryReceipts) {
    if (edge.type === 'DELIVERED_TO' && edge.target === owner) {
        if (edge.properties?.readAt) return null;

        const messageNode = getNode(edge.source);
        if (!isMessageWakeEligible(messageNode)) return null;

        return buildSentToMeInner(messageNode);
    }

    if (edge.type !== 'SENT_TO') return null;

    const messageNode = getNode(edge.source);
    if (!isMessageWakeEligible(messageNode)) return null;

    if (edge.target === owner) {
        return messageNode.properties?.readAt ? null : buildSentToMeInner(messageNode);
    }

    if (edge.target === 'AGENT:*') {
        if (messageNode.properties?.from === owner) return null;       // same-sender broadcast suppression: the sender already holds the broadcast in context
        if (messageNode.properties?.readAt)         return null;
        if (hasDeliveryReceipts(messageNode.id))    return null;       // receipt-backed broadcasts go via DELIVERED_TO
        return buildSentToMeInner(messageNode);
    }

    return null;
}

/**
 * @summary The single shared, pure wake-trigger evaluator. Returns `{type, payload, logId}` for a
 * matched trigger, or `null`.
 *
 * Pure: no DB, no `GraphService`. The caller fetches its own GraphLog delta data and injects it via
 * `entityData`; `match()` only reads `entityData.entity` plus the two accessors. The caller maps the
 * returned `{type, payload, logId}` into its own delivery shape (the daemon's flat coalescing
 * payload, or the service's wake-notification envelope).
 *
 * `type` is one of `sent_to_me` / `task_state_changed` / `permission_granted` / `heartbeat_pulse`.
 *
 * @param {Object}   subscription                   `{trigger, harnessTarget, agentIdentity, filters}`.
 * @param {Object}   entityData
 * @param {Object}   entityData.entity              The resolved node/edge the trace points at (`null` for a pure heartbeat trace).
 * @param {Function} [entityData.getNode]           `(nodeId) => node|null` — resolves a MESSAGE node (used by `SENT_TO_ME`).
 * @param {Function} [entityData.hasDeliveryReceipts] `(messageNodeId) => Boolean` — any `DELIVERED_TO` edges? (`SENT_TO_ME` receipt dedup).
 * @param {Object}   trace                          GraphLog row `{entity_type, entity_id, log_id}`.
 * @returns {{type:String, payload:Object, logId:(Number|String)}|null}
 */
export function match(subscription, entityData, trace) {
    const {trigger, harnessTarget, agentIdentity, filters = {}} = subscription || {};
    if (!agentIdentity) return null;

    // HEARTBEAT_PULSE — GraphLog-only; the `bridge-daemon` route gate lives in matchHeartbeatPulse.
    if (trace?.entity_type === HEARTBEAT_PULSE_ENTITY_TYPE) {
        const pulse = matchHeartbeatPulse({trace, harnessTarget, agentIdentity});
        return pulse
            ? {type: 'heartbeat_pulse', payload: {targetIdentity: pulse.targetIdentity, pulseId: pulse.pulseId}, logId: pulse.logId}
            : null;
    }

    const entity = entityData?.entity;
    if (!entity) return null;

    // SENT_TO_ME — edge trigger (`SENT_TO` / `DELIVERED_TO`); unread-gated then filter-matched.
    if (trigger === 'SENT_TO_ME' && trace?.entity_type === 'edges') {
        const inner = matchSentToMeEdge(entity, agentIdentity, entityData.getNode, entityData.hasDeliveryReceipts);
        if (!inner)                          return null;
        if (!matchesFilters(inner, filters)) return null;
        return {type: 'sent_to_me', payload: inner, logId: trace.log_id};
    }

    // PERMISSION_GRANTED — a typed `CAN_*` edge granted TO the owner.
    if (trigger === 'PERMISSION_GRANTED' && trace?.entity_type === 'edges'
        && PERMISSION_EDGE_TYPES.includes(entity.type) && entity.target === agentIdentity) {
        return {type: 'permission_granted', payload: {scope: entity.type, grantedBy: entity.source}, logId: trace.log_id};
    }

    // TASK_STATE_CHANGED — a MESSAGE node carrying a Task envelope, targeted at the owner
    // (originator OR assignee — the daemon formerly matched assignee only).
    if (trigger === 'TASK_STATE_CHANGED' && trace?.entity_type === 'nodes' && entity.label === 'MESSAGE') {
        const props = entity.properties || {};
        const task  = props.task;
        if (!task?.state) return null;
        if (props.from !== agentIdentity && task.assignee !== agentIdentity) return null;

        return {
            type   : 'task_state_changed',
            payload: {
                taskId        : entity.id,
                previousState : null,                          // GraphLog carries only the new state at resync time
                newState      : task.state,
                originator    : props.from,
                assignee      : task.assignee,
                lastModifiedAt: props.updatedAt || props.sentAt
            },
            logId: trace.log_id
        };
    }

    return null;
}
