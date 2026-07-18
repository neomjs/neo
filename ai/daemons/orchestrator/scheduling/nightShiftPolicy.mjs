/**
 * @module ai/daemons/orchestrator/scheduling/nightShiftPolicy
 * @summary The presence-aware heartbeat-mode decision — the pure contract behind night-shift
 * re-invocation: WHEN the swarm heartbeat runs is decided from operator presence + the operator's
 * own explicit setting, so a fleet whose operator walked away keeps receiving autonomous turns
 * instead of sleeping forever on its last allowed stop.
 *
 * The decision hierarchy (each tier fills only the ABSENCE of a decision above it):
 * 1. **An explicit operator setting always wins** — `manualEnabled: true` runs the heartbeat,
 *    `manualEnabled: false` stops it, and the policy NEVER overrides either. The policy is not a
 *    fight with the operator; it fills the gap where no explicit decision exists.
 * 2. **Policy fills the unset gap** (`manualEnabled: null`/`undefined`): with
 *    `policyMode: 'presence-aware'`, operator inactivity past the threshold flips night-shift mode
 *    ON (heartbeats flow); a present operator leaves the heartbeat OFF by default (their hours,
 *    their noise budget — quiet unless they said otherwise).
 * 3. **Conservative on missing evidence:** an unreadable/absent presence signal treats the operator
 *    as PRESENT — no auto-night-mode from blindness. A daemon that cannot see must not get loud.
 *
 * Pure and total by contract: injected clock + presence + settings, no imports, no I/O, never
 * throws — the orchestrator pipeline consumes the verdict at pulse-scheduling time, and unit
 * witnesses drive every tier of the hierarchy directly.
 */

/**
 * Default operator-inactivity window before night-shift mode engages: long enough that a coffee
 * break never flips the fleet loud, short enough that a departed operator strands no seat for long.
 * @type {Number}
 */
export const DEFAULT_INACTIVITY_THRESHOLD_MS = 40 * 60 * 1000;

/**
 * @summary Resolves whether the swarm heartbeat should run, from the operator's explicit setting,
 * the policy mode, and operator presence. See the module summary for the three-tier hierarchy.
 * @param {Object} input
 * @param {Boolean|null} [input.manualEnabled=null] The operator's EXPLICIT heartbeat setting —
 *     `true`/`false` wins outright; `null`/`undefined` means "no explicit decision" and hands the
 *     verdict to the policy tier.
 * @param {String} [input.policyMode='manual'] `'presence-aware'` activates the night-shift tier;
 *     any other value keeps the legacy manual-only semantics (unset manual ⇒ heartbeat off).
 * @param {Number|null} [input.operatorLastActiveAt=null] Epoch ms of the newest operator-class
 *     activity, or `null` when the presence signal is unavailable (conservative: treated as
 *     present-now).
 * @param {Number} [input.now=Date.now()] Injected clock (epoch ms).
 * @param {Number} [input.inactivityThresholdMs=DEFAULT_INACTIVITY_THRESHOLD_MS] Inactivity window
 *     before night-shift engages; non-finite or non-positive values fall back to the default.
 * @returns {{heartbeatActive: Boolean, mode: String, reason: String}} `mode` is one of
 *     `'manual-on'` | `'manual-off'` | `'night-shift'` | `'day-quiet'` — greppable in pulse logs so
 *     the next teethless-fleet investigation takes minutes, not hours.
 */
export function resolveHeartbeatMode({
    manualEnabled         = null,
    policyMode            = 'manual',
    operatorLastActiveAt  = null,
    now                   = Date.now(),
    inactivityThresholdMs = DEFAULT_INACTIVITY_THRESHOLD_MS
} = {}) {
    // Tier 1: an explicit operator decision is never overridden, in either direction.
    if (manualEnabled === true) {
        return {heartbeatActive: true, mode: 'manual-on', reason: 'explicit operator setting: heartbeat enabled'}
    }
    if (manualEnabled === false) {
        return {heartbeatActive: false, mode: 'manual-off', reason: 'explicit operator setting: heartbeat disabled — policy never overrides an explicit off'}
    }

    // Tier 2 requires the presence-aware mode; legacy manual-only semantics otherwise.
    if (policyMode !== 'presence-aware') {
        return {heartbeatActive: false, mode: 'day-quiet', reason: 'no explicit setting and policy is manual-only — heartbeat stays off'}
    }

    const threshold = Number.isFinite(inactivityThresholdMs) && inactivityThresholdMs > 0
        ? inactivityThresholdMs
        : DEFAULT_INACTIVITY_THRESHOLD_MS;

    // Tier 3: blindness is presence — a daemon that cannot see the operator must not get loud.
    const lastActive = Number.isFinite(operatorLastActiveAt) ? operatorLastActiveAt : now,
          inactiveMs = Math.max(0, now - lastActive);

    if (inactiveMs >= threshold) {
        return {
            heartbeatActive: true,
            mode           : 'night-shift',
            reason         : `operator inactive ${Math.round(inactiveMs / 60000)}min (threshold ${Math.round(threshold / 60000)}min) — night-shift heartbeat active`
        }
    }

    return {
        heartbeatActive: false,
        mode           : 'day-quiet',
        reason         : 'operator present (or presence unreadable — conservative) and no explicit enable — heartbeat quiet'
    }
}
