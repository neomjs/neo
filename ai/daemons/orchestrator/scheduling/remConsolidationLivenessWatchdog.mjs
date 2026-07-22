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
 *   pipeline. `getRemCycleStaleness` fails SOFT (a read fault → a `readFault` reading that never
 *   alarms), and the backlog guard means a soft/quiet reading can never look like a stall on its own.
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
 * fault fails SOFT to a distinct `{hasCycle: false, readFault: true, stalenessMs: 0}` reading — a
 * watchdog read error must never masquerade as a stall (`evaluateConsolidationStallAlarm` treats
 * `readFault` as no-alarm). An empty store or an entry with no finite `completedAt` is a genuine
 * `{hasCycle: false, readFault: false}` no-cycle reading; whether that alarms is decided downstream
 * by pairing it with the undigested-backlog count (no backlog → never a stall), so a fresh/quiet
 * store cannot false-alarm on its own.
 *
 * @param {Object} options
 * @param {String} options.remRunStateDir Directory holding the REM run-state JSONL artifacts.
 * @param {Number} options.now Current epoch milliseconds (injected clock).
 * @param {Function} [options.readRecent] Async `({dir, limit}) => Promise<Object[]>` reader; defaults to
 *   {@link readRecentRemRunStates}. Injectable for unit isolation.
 * @returns {Promise<{hasCycle: Boolean, readFault: Boolean, lastCompletedAt: (Number|null), stalenessMs: Number}>}
 *   `hasCycle` is false (and `stalenessMs` 0) when the store is empty/unreadable or the latest entry
 *   carries no finite `completedAt`; `readFault` is true ONLY on the read-error path (never alarms).
 */
export async function getRemCycleStaleness({remRunStateDir, now, readRecent = readRecentRemRunStates} = {}) {
    let entries;
    try {
        entries = await readRecent({dir: remRunStateDir, limit: 1});
    } catch {
        // Read fault → fail soft to a distinct `readFault` reading. A watchdog fault degrades to "no
        // alarm" (never a false stall, never a throw into the never-fail scheduling pipeline).
        return {hasCycle: false, readFault: true, lastCompletedAt: null, stalenessMs: 0};
    }

    const latest      = Array.isArray(entries) && entries.length > 0 ? entries[0] : null;
    const completedAt = Number(latest?.completedAt);

    if (!latest || !Number.isFinite(completedAt)) {
        return {hasCycle: false, readFault: false, lastCompletedAt: null, stalenessMs: 0};
    }

    return {hasCycle: true, readFault: false, lastCompletedAt: completedAt, stalenessMs: Math.max(0, now - completedAt)};
}

/**
 * @summary Pure stall-edge evaluation with one-shot latch semantics.
 *
 * **Stall = there is an undigested backlog AND consolidation has not recently succeeded** — either no
 * recorded cycle at all (the `recentCycles: []` symptom) or the last successful cycle is older than
 * the threshold. The backlog guard (`undigestedCount > 0`) is load-bearing: it is what makes "no/stale
 * cycle" a *stall* rather than a fresh/quiet/idle state — no backlog → nothing to consolidate → never
 * stalled (so a cold start, a quiet store, or a soft read cannot false-alarm). This mirrors
 * `embedDrainLivenessWatchdog`'s `pendingCount > 0` guard, one subsystem over. A `readFault` reading
 * fails soft to no alarm (an inconclusive read must never masquerade as a stall) and preserves the latch.
 *
 * Latch: an alarm fires only on the transition into stalled (`stalled && !alreadyAlarmed`); once
 * latched it stays quiet on subsequent stalled checks; a healthy check clears the latch.
 *
 * **Down-time exclusion:** `stalenessMs` is wall-clock age and therefore counts intervals when the
 * orchestrator was not running at all (host off, laptop lid closed, process intentionally stopped)
 * — time in which no cycle could have run by design. When `uptimeMs` is provided, the stall clock
 * is the *effective* staleness: `min(stalenessMs, uptimeMs)` for a recorded cycle, or `uptimeMs`
 * when no cycle exists. A deployment that was off for 6.5h and booted 5 minutes ago evaluates as
 * 5 minutes stale — digest-resume, not a stall — while a genuinely starved consolidation still
 * alarms once the *process* has been up past the threshold without a cycle. `downTimeSuppressed`
 * marks the exclusion so the caller can log the resume note; callers that omit `uptimeMs` (default
 * `Infinity`) get the legacy wall-clock behavior unchanged.
 *
 * **Recovery baseline (drain verification):** a stall onset or a downtime-suppressed reading opens
 * a recovery *phase*, not a healthy state. The evaluator persists `recoveryBaseline` (the backlog
 * count at phase onset) inside `nextAlarmState`, and only a strictly DECREASING backlog completes
 * the phase and clears the latch — a merely non-stalled reading with an unchanged backlog holds
 * the state, so "the backlog actually drained" is observed, never assumed. `recoveryStarted`
 * marks the transition into the phase (the caller emits its resume note exactly once, on that
 * transition, never on every check).
 *
 * @param {Object} options
 * @param {Boolean} options.hasCycle Whether a REM cycle has been recorded (from {@link getRemCycleStaleness}).
 * @param {Boolean} [options.readFault] When true, the run-state read failed — fail soft to no alarm.
 * @param {Number} options.stalenessMs Age since the last successful cycle.
 * @param {Number} options.undigestedCount Current undigested-session backlog (the work-pending guard).
 * @param {Number} options.thresholdMs Stall threshold; `<= 0` disables alarming (never stalled).
 * @param {Number} [options.uptimeMs] Orchestrator process uptime; caps the stall clock so host-offline
 *   intervals cannot masquerade as consolidation starvation. Default `Infinity` (legacy behavior).
 * @param {Object} [options.alarmState] Prior latch state `{alarmed, stalledSince, recoveryBaseline}` from task state.
 * @returns {{stalled: Boolean, shouldAlarm: Boolean, downTimeSuppressed: Boolean, drainObserved: Boolean,
 *   recoveryStarted: Boolean, effectiveStalenessMs: Number,
 *   nextAlarmState: {alarmed: Boolean, stalledSince: (Number|null), recoveryBaseline: (Number|null)}}}
 */
export function evaluateConsolidationStallAlarm({hasCycle, readFault, stalenessMs, undigestedCount, thresholdMs, uptimeMs = Infinity, alarmState} = {}) {
    const alreadyAlarmed = !!alarmState?.alarmed,
          baseline       = Number.isFinite(alarmState?.recoveryBaseline) ? alarmState.recoveryBaseline : null;

    // Read fault → inconclusive; fail soft to no alarm and PRESERVE the latch (we neither observed a
    // healthy cycle to clear it, nor confirmed a stall to raise one).
    if (readFault) {
        return {stalled: false, shouldAlarm: false, downTimeSuppressed: false, drainObserved: false, recoveryStarted: false, effectiveStalenessMs: stalenessMs, nextAlarmState: {alarmed: alreadyAlarmed, stalledSince: alarmState?.stalledSince ?? null, recoveryBaseline: baseline}};
    }

    const hasBacklog = Number(undigestedCount) > 0;

    // Down-time exclusion: no cycle could have run while the process was down, so the stall clock is
    // the effective (uptime-capped) staleness. A recorded cycle older than the boot evaluates as the
    // uptime; no recorded cycle at all evaluates as the uptime directly.
    const effectiveStalenessMs = hasCycle ? Math.min(stalenessMs, uptimeMs) : uptimeMs,
          downTimeSuppressed   = hasCycle && stalenessMs > uptimeMs,
          cycleStale           = effectiveStalenessMs > thresholdMs;

    // Backlog guard is load-bearing: no undigested work → nothing to consolidate → never a stall.
    const stalled = thresholdMs > 0 && hasBacklog && cycleStale;

    // Recovery onset is a genuinely SUPPRESSED stall — wall-clock stale past the threshold with the
    // backlog present, held back only by the young process. A pre-boot cycle with no backlog or
    // with sub-threshold wall age opens no phase (no permanent baseline-0 latch, no noise phase).
    const suppressedStall = thresholdMs > 0 && hasBacklog && hasCycle && stalenessMs > thresholdMs && effectiveStalenessMs <= thresholdMs;

    if (!stalled) {
        // Recovery phase open? Only a strictly decreasing backlog completes it — a non-stalled
        // reading with an undrained backlog holds the latch (drain observed, never assumed).
        if (baseline !== null) {
            if (undigestedCount < baseline) {
                return {stalled: false, shouldAlarm: false, downTimeSuppressed, drainObserved: true, recoveryStarted: false, effectiveStalenessMs, nextAlarmState: {alarmed: false, stalledSince: null, recoveryBaseline: null}};
            }
            return {stalled: false, shouldAlarm: false, downTimeSuppressed, drainObserved: false, recoveryStarted: false, effectiveStalenessMs, nextAlarmState: {alarmed: alreadyAlarmed, stalledSince: alarmState?.stalledSince ?? null, recoveryBaseline: baseline}};
        }

        // First genuinely-suppressed stall opens the recovery phase: resume note fires exactly
        // once (on this transition), and the baseline makes the drain observable across checks.
        if (suppressedStall) {
            return {stalled: false, shouldAlarm: false, downTimeSuppressed, drainObserved: false, recoveryStarted: true, effectiveStalenessMs, nextAlarmState: {alarmed: false, stalledSince: null, recoveryBaseline: undigestedCount}};
        }

        // Genuinely healthy / nothing-to-do check: clear the latch so a future stall re-alarms.
        return {stalled: false, shouldAlarm: false, downTimeSuppressed, drainObserved: false, recoveryStarted: false, effectiveStalenessMs, nextAlarmState: {alarmed: false, stalledSince: null, recoveryBaseline: null}};
    }

    const shouldAlarm  = !alreadyAlarmed;
    const stalledSince = alreadyAlarmed ? (alarmState?.stalledSince ?? null) : null;

    return {stalled: true, shouldAlarm, downTimeSuppressed, drainObserved: false, recoveryStarted: false, effectiveStalenessMs, nextAlarmState: {alarmed: true, stalledSince, recoveryBaseline: baseline ?? undigestedCount}};
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
