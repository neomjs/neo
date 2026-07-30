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

import {
    TASK_ASSIGNMENT_AUTHORITY,
    TASK_STATES,
    TASK_STATE_CHANGED_ENTITY_TYPE,
    TASK_STATE_CHANGED_SCHEMA_VERSION
} from './taskAssignmentContract.mjs';

export {TASK_STATE_CHANGED_ENTITY_TYPE, TASK_STATE_CHANGED_SCHEMA_VERSION} from './taskAssignmentContract.mjs';

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

const TASK_STATE_SET = new Set(TASK_STATES);

/**
 * @summary True only for the canonical millisecond-precision UTC timestamp emitted by `toISOString()`.
 * @param {String} value Timestamp candidate.
 * @returns {Boolean}
 */
function isCanonicalIsoTimestamp(value) {
    if (typeof value !== 'string') return false;

    const milliseconds = Date.parse(value);

    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
}

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
 * pulse for an interrupt-capable Shape B/C subscription whose `agentIdentity` matches the pulse
 * target; `null` otherwise. The caller formats the match into its own delivery shape.
 *
 * `bridge-daemon` remains the sunset-bound Shape-C route value; `a2a-webhook` is the signed
 * Shape-B route that replaces it for the Docker-canonical local topology.
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
    if (!['bridge-daemon', 'a2a-webhook'].includes(harnessTarget)) return null;

    const pulse = parseHeartbeatPulseEntityId(trace.entity_id, prefix);
    if (!pulse || pulse.targetIdentity !== agentIdentity) return null;

    return {
        targetIdentity: pulse.targetIdentity,
        pulseId       : pulse.pulseId,
        logId         : trace.log_id
    };
}

/**
 * @summary Parses and validates an immutable Task-transition GraphLog row.
 *
 * The row is intentionally self-contained: consumers never re-read the MESSAGE node to recover
 * historical state. Malformed rows fail closed so generic cache invalidation cannot masquerade as
 * a Task transition.
 * @param {Object} trace GraphLog row with `event_id` and JSON `event_payload`.
 * @returns {{sourceEventId:String,payload:Object,logId:(Number|String)}|null}
 */
export function parseTaskStateChangedTrace(trace) {
    if (trace?.entity_type !== TASK_STATE_CHANGED_ENTITY_TYPE) return null;
    if (typeof trace.event_id !== 'string' || !trace.event_id) return null;
    if (typeof trace.event_payload !== 'string' || !trace.event_payload) return null;

    let payload;

    try {
        payload = JSON.parse(trace.event_payload)
    } catch (error) {
        return null
    }

    if (!payload || payload.schemaVersion !== TASK_STATE_CHANGED_SCHEMA_VERSION) return null;
    if (typeof payload.taskId !== 'string' || !payload.taskId || payload.taskId !== trace.entity_id) return null;
    if (!TASK_STATE_SET.has(payload.previousState)) return null;
    if (!TASK_STATE_SET.has(payload.newState)) return null;
    if (typeof payload.originator !== 'string' || !payload.originator) return null;
    if (!Object.hasOwn(payload, 'assignee') ||
        (payload.assignee !== null && (typeof payload.assignee !== 'string' || !payload.assignee))
    ) return null;
    if (!Object.hasOwn(payload, 'assignmentAuthority') ||
        (payload.assignmentAuthority !== null && typeof payload.assignmentAuthority !== 'string')
    ) return null;
    if (!isCanonicalIsoTimestamp(payload.lastModifiedAt)) return null;

    const {schemaVersion, ...snapshot} = payload;

    return {
        sourceEventId: trace.event_id,
        payload      : snapshot,
        logId        : trace.log_id
    }
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
        sentAt        : props.sentAt,
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

    // HEARTBEAT_PULSE — GraphLog-only; the Shape B/C route gate lives in matchHeartbeatPulse.
    if (trace?.entity_type === HEARTBEAT_PULSE_ENTITY_TYPE) {
        const pulse = matchHeartbeatPulse({trace, harnessTarget, agentIdentity});
        return pulse
            ? {type: 'heartbeat_pulse', payload: {targetIdentity: pulse.targetIdentity, pulseId: pulse.pulseId}, logId: pulse.logId}
            : null;
    }

    // TASK_STATE_CHANGED — immutable GraphLog-only transition fact. This branch runs before entity
    // resolution because the typed row carries the complete historical snapshot; re-reading the
    // mutable MESSAGE node would recreate the duplicate/resync defect this contract closes.
    if (trigger === 'TASK_STATE_CHANGED' && trace?.entity_type === TASK_STATE_CHANGED_ENTITY_TYPE) {
        const event = parseTaskStateChangedTrace(trace);
        if (!event) return null;

        const {payload}    = event;
        const isOriginator = payload.originator === agentIdentity;
        const isAssignee   = payload.assignmentAuthority === TASK_ASSIGNMENT_AUTHORITY
            && payload.assignee === agentIdentity;

        if (!isOriginator && !isAssignee) return null;

        return {
            type         : 'task_state_changed',
            sourceEventId: event.sourceEventId,
            payload      : event.payload,
            logId        : event.logId
        }
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

    return null;
}
