/**
 * @summary Pure, dependency-free heartbeat-pulse evaluation shared by the standalone wake-daemon
 * and `WakeSubscriptionService` — the single source of truth for the heartbeat-pulse wake trigger.
 *
 * Both `ai/daemons/wake/daemon.mjs` (the standalone poll loop) and `WakeSubscriptionService` (the
 * Memory-Core resync path) previously re-implemented the heartbeat-pulse entity-id parse + the
 * eligibility check, including duplicated `HEARTBEAT_PULSE` prefix / `heartbeat_pulse` entity-type
 * literals that could silently drift apart. This module consolidates that evaluation logic.
 *
 * **Kept GraphService-free on purpose.** The wake-daemon is a lightweight standalone process with
 * its own SQLite connection; consuming these pure functions lets it share the canonical evaluation
 * without importing the full `WakeSubscriptionService` (which would pull in `GraphService` +
 * `CoalescingEngineService`). Each caller still owns its OWN delivery shape — the daemon builds its
 * flat `{type: 'heartbeat', …}` coalescing payload, the service wraps the match in its
 * wake-notification envelope — so only the evaluation (parse + eligibility) is consolidated here,
 * not the output format.
 *
 * The prefix / entity-type are accepted as parameters (defaulting to the canonical constants) so a
 * caller that carries them as configurable members keeps its override-ability while still sharing
 * the parse + match logic.
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
