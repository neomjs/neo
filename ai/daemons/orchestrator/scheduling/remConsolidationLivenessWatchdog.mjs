import {readRecentRemRunStates} from '../../../services/memory-core/helpers/remRunStateStore.mjs';

/**
 * @summary Read-only liveness watchdog for the REM consolidation cycle.
 *
 * The DreamService REM cycle (`executeRemCycle`) digests session memory into the Native Edge Graph.
 * It is decoupled from the Golden Path forecast — correct (the forecast must never stall on
 * a model-dependent digest), but it means a dead/stalled consolidation produces NO user-visible
 * error: the forecast keeps regenerating fresh while the undigested backlog grows un-consolidated
 * (the "green-but-rotting" state). In the recovery incident the symptom was
 * `recentCycles: []` alongside a stable ~316-undigested backlog while the orchestrator was alive —
 * exactly the silent stall the embed-drain liveness watchdog closes for the WAL, one subsystem over.
 *
 * This module is the consolidation-side analog of `embedDrainLivenessWatchdog`. It computes the AGE
 * since the last successful REM cycle and raises a one-shot alarm when that age exceeds a threshold
 * **while an undigested backlog exists** — the progress check process-existence supervision cannot
 * provide (process-alive != consolidating). Consolidation-liveness — *observable, never
 * assumed-green* — is the invariant it serves.
 *
 * ## Hard constraints (mirroring the embed-drain watchdog)
 *
 * - **Read-only.** It only READS the REM run-state store (via `readRecentRemRunStates`) plus a
 *   passed-in undigested-backlog count; it never writes a record or touches the digest write path.
 * - **Never-fail.** A check failure degrades to "no alarm", never to a thrown error in the scheduling
 *   pipeline. `getRemCycleStaleness` fails SOFT (a read fault → no-cycle reading), and the backlog
 *   guard means a soft reading can never look like a stall on its own.
 * - **One-shot alarm.** Fires once on stall-onset and latches; a healthy check clears the latch so a
 *   later stall re-alarms. Avoids a per-check alarm storm.
 *
 * The cadence projection (`getDueTask`) is pure and I/O-free, mirroring the other scheduling
 * descriptors; the run-state read happens only in the execute branch.
 *
 * @module ai/daemons/orchestrator/scheduling/remConsolidationLivenessWatchdog
 * @see ai/daemons/orchestrator/scheduling/embedDrainLivenessWatchdog.mjs — the embed-drain sibling watchdog
 * @see ai/services/memory-core/helpers/remRunStateStore.mjs — `readRecentRemRunStates` (the read primitive)
 * @see ai/daemons/orchestrator/scheduling/pipeline.mjs — the `health-check` execute branch + outcome record
 * @see learn/agentos/decisions/0023-dreamservice-organism-map-fidelity-consolidation-liveness.md — AC-3
 */

/**
 * @summary Computes the age since the last successful REM cycle. Read-only, fail-soft.
 *
 * Reads the most-recent REM run-state entry and derives staleness as `now - completedAt`. A read
 * fault OR an empty store fails SOFT to `{hasCycle: false, stalenessMs: 0}` — never a thrown error
 * into the never-fail scheduling pipeline. A no-cycle reading is itself a stall under the
 * staleness-only alarm signal (a healthy orchestrator records a cycle every cadence even with no
 * work), so `evaluateConsolidationStallAlarm` treats `!hasCycle` as stalled directly.
 *
 * @param {Object} options
 * @param {String} options.remRunStateDir Directory holding the REM run-state JSONL artifacts.
 * @param {Number} options.now Current epoch milliseconds (injected clock).
 * @param {Function} [options.readRecent] Async `({dir, limit}) => Promise<Object[]>` reader; defaults to
 *   {@link readRecentRemRunStates}. Injectable for unit isolation.
 * @returns {Promise<{hasCycle: Boolean, lastCompletedAt: (Number|null), stalenessMs: Number}>}
 *   `hasCycle` is false (and `stalenessMs` 0) when the store is empty or unreadable, or the latest
 *   entry carries no finite `completedAt`.
 */
export async function getRemCycleStaleness({remRunStateDir, now, readRecent = readRecentRemRunStates} = {}) {
    let entries;
    try {
        entries = await readRecent({dir: remRunStateDir, limit: 1});
    } catch {
        // Read fault → no-cycle reading. A watchdog fault degrades to "no alarm", never a false stall
        // and never a throw into the never-fail scheduling pipeline.
        return {hasCycle: false, lastCompletedAt: null, stalenessMs: 0};
    }

    const latest      = Array.isArray(entries) && entries.length > 0 ? entries[0] : null;
    const completedAt = Number(latest?.completedAt);

    if (!latest || !Number.isFinite(completedAt)) {
        return {hasCycle: false, lastCompletedAt: null, stalenessMs: 0};
    }

    return {hasCycle: true, lastCompletedAt: completedAt, stalenessMs: Math.max(0, now - completedAt)};
}

/**
 * @summary Pure stall-edge evaluation with one-shot latch semantics.
 *
 * **Stall = consolidation has not recently succeeded** — either no recorded cycle at all (the
 * `recentCycles: []` symptom) or the last successful cycle is older than the threshold. No backlog
 * guard is needed: a healthy orchestrator records a REM cycle every cadence *even with no work*
 * (`executeRemCycle` runs `decayGlobalTopology` on a no-work cycle), so an absent/stale cycle is
 * itself the stall — and the cadence is a cheap run-state file read (no Chroma / undigested-count
 * dependency). A cold-start (no cycle recorded yet) raises one self-clearing alarm — tolerable, and
 * arguably useful ("REM has not started yet"). The staleness-only mirror of
 * `embedDrainLivenessWatchdog` (oldest-pending-age), one subsystem over.
 *
 * Latch: an alarm fires only on the transition into stalled (`stalled && !alreadyAlarmed`); once
 * latched it stays quiet on subsequent stalled checks; a healthy check clears the latch.
 *
 * @param {Object} options
 * @param {Boolean} options.hasCycle Whether a REM cycle has been recorded (from {@link getRemCycleStaleness}).
 * @param {Number} options.stalenessMs Age since the last successful cycle.
 * @param {Number} options.thresholdMs Stall threshold; `<= 0` disables alarming (never stalled).
 * @param {Object} [options.alarmState] Prior latch state `{alarmed, stalledSince}` from task state.
 * @returns {{stalled: Boolean, shouldAlarm: Boolean, nextAlarmState: {alarmed: Boolean, stalledSince: (Number|null)}}}
 */
export function evaluateConsolidationStallAlarm({hasCycle, stalenessMs, thresholdMs, alarmState} = {}) {
    const alreadyAlarmed = !!alarmState?.alarmed;
    // No recorded cycle at all (the `recentCycles: []` symptom) is maximally stale; otherwise compare
    // the last successful cycle's age. A healthy orchestrator records a cycle every cadence even on a
    // no-work cycle, so an absent/stale cycle is itself the stall — no backlog guard needed.
    const stalled = thresholdMs > 0 && (!hasCycle || stalenessMs > thresholdMs);

    if (!stalled) {
        // Healthy (or nothing-to-do) check: clear the latch so a future stall re-alarms.
        return {stalled: false, shouldAlarm: false, nextAlarmState: {alarmed: false, stalledSince: null}};
    }

    const shouldAlarm  = !alreadyAlarmed;
    const stalledSince = alreadyAlarmed ? (alarmState?.stalledSince ?? null) : null;

    return {stalled: true, shouldAlarm, nextAlarmState: {alarmed: true, stalledSince}};
}

/**
 * @summary Cadence due-trigger projection. Returns a trigger descriptor when the configured check
 * interval has elapsed since `lastRunAt`; null otherwise. Pure — no I/O (the run-state read happens in
 * the execute branch, never here), mirroring `embedDrainLivenessWatchdog.getDueTask`.
 *
 * @param {Object} options
 * @param {Object} [options.state] Current task state for this lane (`{lastRunAt}`).
 * @param {Number} options.now Current epoch milliseconds.
 * @param {Number} options.remConsolidationWatchdogCheckMs Check cadence; `<= 0` disables the lane.
 * @returns {Object|null} A watchdog task trigger or null when no check is due.
 */
export function getDueTask({state, now, remConsolidationWatchdogCheckMs}) {
    const lastRunAt = state?.lastRunAt ?? 0;
    if (remConsolidationWatchdogCheckMs > 0 && now - lastRunAt >= remConsolidationWatchdogCheckMs) {
        return {
            taskName: 'rem-consolidation-liveness-watchdog',
            source  : 'periodic-health-check',
            reason  : `periodic-health-check:${remConsolidationWatchdogCheckMs}`
        };
    }
    return null;
}
