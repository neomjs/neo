import fs from 'node:fs'

/**
 * @module ai/services/fleet/fleetWakeStateAdapter
 * @summary Maps wake-subscription intent + wake-daemon liveness into per-agent wake-state
 * observation rows for the Fleet roster DTO — the wake axis of the S2 telltale taxonomy.
 *
 * The adapter reads OBSERVATION truth only, never control intent: subscription state comes through
 * an injected read path (the caller owns identity binding, mirroring `fleetA2AActivityAdapter`),
 * and daemon liveness comes from the wake daemon's exclusive-create PID file plus a
 * `process.kill(pid, 0)` existence probe. Watermark/state-file mtime is deliberately NOT a
 * liveness signal: the watermark advances only on delivery activity, so a quiet fleet would be
 * indistinguishable from a dead daemon. The `setWakeEnabled` control verb mutates state that this
 * producer independently observes — the two never share a source.
 *
 * Fail-honest discipline (the graduated taxonomy's honest-degradation rule): every unreadable
 * source degrades to `unknown` with a reason — absence of truth is never rendered as a healthy
 * default. The adapter itself never resolves configuration — config resolution belongs to process
 * entrypoints and this module is not one: the PID file path is injected by the composing
 * entrypoint; without it, liveness is honestly `unknown`.
 */

export const WAKE_STATES = Object.freeze(['on', 'off', 'suppressed', 'unknown'])

export const WAKE_SOURCE_LABEL = 'fleet:wakeState'

/**
 * @summary Resolves wake-daemon liveness from its PID file — observed, stale-aware, fail-honest.
 *
 * The daemon creates its PID file with the exclusive-create flag, so a missing file is OBSERVED
 * not-running (`alive: false`), not an unknown. A present file still requires the process probe:
 * a crash can leave a stale PID behind, and `ESRCH` proves the recorded process is gone. `EPERM`
 * proves the process exists (probe denied ⇒ someone answers that pid). Every other failure —
 * unreadable file, malformed content, unexpected probe error — degrades to `'unknown'` with the
 * reason preserved.
 * @param {Object} options={}
 * @param {String|null} [options.pidFilePath] Absolute path to the daemon's PID file; `null` ⇒ unknown.
 * @param {Function} [options.readFile] `(path) => String` override for tests; defaults to `node:fs`.
 * @param {Function} [options.probeProcess] `(pid) => void` throwing ESRCH/EPERM; defaults to `process.kill(pid, 0)`.
 * @returns {{alive: Boolean|'unknown', reason: String|null}}
 */
export function resolveDaemonLiveness({
    pidFilePath = null,
    readFile = path => fs.readFileSync(path, 'utf8'),
    probeProcess = pid => process.kill(pid, 0)
} = {}) {
    if (!pidFilePath) {
        return {alive: 'unknown', reason: 'wake daemon PID file path not configured'}
    }

    let raw

    try {
        raw = readFile(pidFilePath)
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return {alive: false, reason: null}
        }
        return {alive: 'unknown', reason: normalizeReason(error)}
    }

    const pid = Number(String(raw).trim())

    if (!Number.isSafeInteger(pid) || pid <= 0) {
        return {alive: 'unknown', reason: 'malformed wake daemon PID file'}
    }

    try {
        probeProcess(pid)
        return {alive: true, reason: null}
    } catch (error) {
        if (error?.code === 'ESRCH') {
            return {alive: false, reason: 'stale PID file: recorded process is gone'}
        }
        if (error?.code === 'EPERM') {
            return {alive: true, reason: null}
        }
        return {alive: 'unknown', reason: normalizeReason(error)}
    }
}

/**
 * @summary Maps one agent's subscription state × daemon liveness onto the graduated wake taxonomy.
 *
 * The truth table is the S2 registry contract verbatim: no subscription is OBSERVED `off`; an
 * active subscription with a live daemon is `on`; an active subscription with a dead daemon is
 * `suppressed` (intent on, delivery off — the blind-switch incident class); and any unknown input
 * axis makes the output `unknown`, because claiming `on` or `suppressed` without both facts would
 * fabricate precision.
 * @param {Object} options={}
 * @param {'active'|'none'|'unknown'} options.subscriptionState One agent's wake-subscription intent.
 * @param {Boolean|'unknown'} options.daemonAlive Daemon liveness from {@link resolveDaemonLiveness}.
 * @returns {'on'|'off'|'suppressed'|'unknown'}
 */
export function resolveAgentWakeState({subscriptionState, daemonAlive}) {
    if (subscriptionState === 'none') {
        return 'off'
    }
    if (subscriptionState !== 'active' || daemonAlive === 'unknown') {
        return 'unknown'
    }

    return daemonAlive ? 'on' : 'suppressed'
}

/**
 * @summary Reads the fleet-wide wake-state observation snapshot: one taxonomy row per agent plus a
 * capability envelope declaring how much of the truth was reachable.
 *
 * Liveness is resolved ONCE (the daemon is host-global) and joined onto every row; subscription
 * state is resolved per agent through the injected reader. Capability semantics: `wired/observed`
 * when both sources answered, `degraded/partial` when exactly one did, `degraded/none` when
 * neither — so a consumer can distinguish "the fleet is off" from "we cannot see".
 * @param {Object} options={}
 * @param {Object[]} [options.agents] Registry roster rows; each needs an `id`.
 * @param {Function|null} [options.resolveSubscriptionState] `(agent) => 'active'|'none'|'unknown'`
 *     (sync or async). Absent ⇒ the subscription axis is honestly `unknown` for every agent.
 * @param {String|null} [options.pidFilePath] Wake daemon PID file path (entrypoint-resolved).
 * @param {Function} [options.readFile] Test seam for {@link resolveDaemonLiveness}.
 * @param {Function} [options.probeProcess] Test seam for {@link resolveDaemonLiveness}.
 * @param {Date|String} [options.capturedAt] Capture timestamp.
 * @returns {Promise<{capability: Object, states: Object[]}>} `states` rows:
 *     `{agentId, wake, confidence, source}` (+ `reason` when `wake` is `unknown`).
 */
export async function readFleetWakeStateSnapshot({
    agents = [],
    resolveSubscriptionState = null,
    pidFilePath = null,
    readFile,
    probeProcess,
    capturedAt = new Date()
} = {}) {
    const liveness = resolveDaemonLiveness({pidFilePath, ...(readFile && {readFile}), ...(probeProcess && {probeProcess})})

    let subscriptionSourceOk = Boolean(resolveSubscriptionState),
        subscriptionFailure  = resolveSubscriptionState ? null : 'subscription read path unavailable'

    const states = []

    for (const agent of asArray(agents)) {
        const agentId = agent?.id

        if (!agentId) continue

        let subscriptionState = 'unknown'

        if (resolveSubscriptionState) {
            try {
                subscriptionState = normalizeSubscriptionState(await resolveSubscriptionState(agent))
            } catch (error) {
                subscriptionSourceOk = false
                subscriptionFailure  = normalizeReason(error)
            }
        }

        const wake = resolveAgentWakeState({subscriptionState, daemonAlive: liveness.alive})

        const row = {
            agentId,
            wake,
            confidence: wake === 'unknown' ? 'none' : 'observed',
            source    : WAKE_SOURCE_LABEL
        }

        if (wake === 'unknown') {
            row.reason = subscriptionState === 'unknown'
                ? (subscriptionFailure || 'subscription state unreadable')
                : (liveness.reason || 'wake daemon liveness unknown')
        }

        states.push(row)
    }

    const livenessSourceOk = liveness.alive !== 'unknown',
          bothOk           = livenessSourceOk && subscriptionSourceOk,
          neitherOk        = !livenessSourceOk && !subscriptionSourceOk

    return {
        capability: {
            source    : WAKE_SOURCE_LABEL,
            state     : bothOk ? 'wired' : 'degraded',
            confidence: bothOk ? 'observed' : (neitherOk ? 'none' : 'partial'),
            capturedAt: toIsoString(capturedAt),
            reason    : bothOk ? null : [
                livenessSourceOk ? null : (liveness.reason || 'daemon liveness unknown'),
                subscriptionSourceOk ? null : subscriptionFailure
            ].filter(Boolean).join('; ') || null
        },
        states
    }
}

function normalizeSubscriptionState(value) {
    return value === 'active' || value === 'none' ? value : 'unknown'
}

function normalizeReason(error) {
    return String(error?.message || error || 'source unavailable').replace(/\s+/g, ' ').slice(0, 240)
}

function toIsoString(value) {
    const date = value instanceof Date ? value : new Date(value)

    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function asArray(value) {
    return Array.isArray(value) ? value : []
}
