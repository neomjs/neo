import {classifyMemoryWalDrain, readPendingWalRecords} from '../../../services/memory-core/helpers/memoryWalStore.mjs';

/**
 * @summary Read-only liveness watchdog for the embed-drain WAL backlog.
 *
 * The per-turn `add_memory` save appends a durable WAL record (`appendWalMemory`) and the embed is
 * decoupled — a separate drain (`ai/daemons/embed/daemon.mjs`) embeds pending records asynchronously.
 * That decoupling is correct (the save must never fail or stall on a model-dependent embed) but it
 * means a dead/stalled drain produces NO user-visible error: the WAL just grows un-reconciled until a
 * human notices stale semantic recall. In the recovery incident the drain died silently and no alarm
 * fired for ~8 days.
 *
 * This module closes that detection gap. It periodically computes the AGE of the oldest un-embedded
 * (pending) WAL record and raises a one-shot alarm when that age first exceeds a threshold. It is the
 * progress check the orchestrator's existing process-existence supervision could not provide
 * (process-alive != draining).
 *
 * ## Hard constraints
 *
 * - **Read-only.** It only READS the WAL via `readPendingWalRecords`; it never writes a record, a
 *   marker, or any file in the WAL directory. It can never touch or slow the never-fail
 *   `appendWalMemory` write path.
 * - **Never-fail.** A failure in the check degrades to "no alarm," never to a write failure or a
 *   thrown error into the scheduling pipeline. The execute branch in `pipeline.mjs` wraps the call and
 *   records the outcome; this module's `getEmbedDrainPendingAge` additionally fails soft (returns a
 *   zero-backlog reading on a read error) so a transient FS error does not look like a stall.
 * - **One-shot alarm.** The active alarm fires once on stall-onset and stays latched (no re-alarm on
 *   consecutive stalled checks); a healthy check below threshold clears the latch so a later stall can
 *   re-alarm. This avoids a per-check alarm storm.
 *
 * The cadence projection (`getDueTask`) is a pure, I/O-free function mirroring the other scheduling
 * descriptors; the WAL read happens only in the execute branch.
 *
 * @module ai/daemons/orchestrator/scheduling/embedDrainLivenessWatchdog
 * @see ai/services/memory-core/helpers/memoryWalStore.mjs — `readPendingWalRecords` (the pending primitive)
 * @see ai/daemons/orchestrator/scheduling/pipeline.mjs — the `health-check` execute branch + outcome record
 * @see ai/daemons/orchestrator/scheduling/swarmHeartbeat.mjs — the sibling pure-cadence `getDueTask` precedent
 */

/**
 * @summary Computes the age and count of the oldest un-embedded (pending) WAL record. Read-only.
 *
 * Reads the pending WAL records (appended but not yet embed-marked) and derives the oldest age as
 * `now - min(record.timestamp)`. The WAL store already tolerates corrupt/torn lines and a missing
 * directory (returns `[]`), so an empty/clean WAL yields a zero-backlog reading. Any unexpected read
 * error fails SOFT to a zero-backlog reading — a watchdog read fault must never be misread as a stall
 * (it would false-alarm), and it must never propagate into the never-fail write path.
 *
 * Records missing a finite `timestamp` are ignored for the age computation but still counted as
 * pending, so a malformed record cannot suppress a real backlog signal.
 *
 * @param {Object} options
 * @param {String} options.walDir Directory holding the WAL day-segment files (`aiConfig.memoryWal.dir`).
 * @param {Number} options.now Current epoch milliseconds (injected clock).
 * @param {Function} [options.readPending] Async `({dir}) => Promise<Object[]>` WAL reader; defaults to
 *   {@link readPendingWalRecords}. Injectable for unit isolation.
 * @returns {Promise<{oldestAgeMs: Number, pendingCount: Number, oldestTimestamp: (Number|null)}>}
 *   `oldestAgeMs` is `0` when nothing is pending; `oldestTimestamp` is `null` when no pending record
 *   carries a finite timestamp.
 */
export async function getEmbedDrainPendingAge({walDir, now, readPending = readPendingWalRecords} = {}) {
    let records;
    try {
        records = await readPending({dir: walDir});
    } catch {
        // Read fault → zero-backlog reading. A watchdog fault degrades to "no alarm", never to a
        // false stall signal and never to a thrown error in the scheduling pipeline.
        return {oldestAgeMs: 0, pendingCount: 0, oldestTimestamp: null};
    }

    if (!Array.isArray(records) || records.length === 0) {
        return {oldestAgeMs: 0, pendingCount: 0, oldestTimestamp: null};
    }

    let oldestTimestamp = null;
    for (const record of records) {
        const timestamp = Number(record?.timestamp);
        if (!Number.isFinite(timestamp)) continue;
        if (oldestTimestamp === null || timestamp < oldestTimestamp) {
            oldestTimestamp = timestamp;
        }
    }

    const oldestAgeMs = oldestTimestamp === null ? 0 : Math.max(0, now - oldestTimestamp);

    return {oldestAgeMs, pendingCount: records.length, oldestTimestamp};
}

/**
 * @summary Pure stall-edge evaluation with one-shot latch semantics.
 *
 * Compares the oldest pending age against the threshold and applies the latch: an alarm fires only on
 * the transition into the stalled state (`stalled && !alreadyAlarmed`); once latched it stays quiet on
 * subsequent stalled checks; a healthy (below-threshold) check clears the latch so a later stall can
 * re-alarm.
 *
 * @param {Object} options
 * @param {Number} options.oldestAgeMs Age of the oldest pending record (from {@link getEmbedDrainPendingAge}).
 * @param {Number} options.pendingCount Pending record count.
 * @param {Number} options.thresholdMs Stall threshold; `<= 0` disables alarming (never stalled).
 * @param {Object} [options.alarmState] Prior latch state `{alarmed, stalledSince}` from task state.
 * @returns {{stalled: Boolean, shouldAlarm: Boolean, nextAlarmState: {alarmed: Boolean, stalledSince: (Number|null)}}}
 */
export function evaluateStallAlarm({oldestAgeMs, pendingCount, thresholdMs, alarmState} = {}) {
    const alreadyAlarmed = !!alarmState?.alarmed;
    const stalled        = classifyMemoryWalDrain({
        observable        : true,
        pendingDrainDepth : pendingCount,
        oldestPendingAgeMs: oldestAgeMs,
        stallThresholdMs  : thresholdMs
    }) === 'stalled';

    if (!stalled) {
        // Healthy check: clear the latch so a future stall re-alarms.
        return {stalled: false, shouldAlarm: false, nextAlarmState: {alarmed: false, stalledSince: null}};
    }

    const shouldAlarm  = !alreadyAlarmed;
    const stalledSince = alreadyAlarmed ? (alarmState?.stalledSince ?? null) : null;

    return {stalled: true, shouldAlarm, nextAlarmState: {alarmed: true, stalledSince}};
}

/**
 * @summary Cadence due-trigger projection. Returns a trigger descriptor when the configured check
 * interval has elapsed since `lastRunAt`; null otherwise. Pure function — no I/O (the WAL read happens
 * in the execute branch, never here), mirroring `swarmHeartbeat.getDueTask`.
 *
 * @param {Object} options
 * @param {Object} [options.state] Current task state for this lane (`{lastRunAt}`).
 * @param {Number} options.now Current epoch milliseconds.
 * @param {Number} options.embedDrainLivenessWatchdogCheckMs Check cadence; `<= 0` disables the lane.
 * @returns {Object|null} A watchdog task trigger or null when no check is due.
 */
export function getDueTask({state, now, embedDrainLivenessWatchdogCheckMs}) {
    const lastRunAt = state?.lastRunAt ?? 0;
    if (embedDrainLivenessWatchdogCheckMs > 0 && now - lastRunAt >= embedDrainLivenessWatchdogCheckMs) {
        return {
            taskName: 'embed-drain-liveness-watchdog',
            source  : 'periodic-health-check',
            reason  : `periodic-health-check:${embedDrainLivenessWatchdogCheckMs}`
        };
    }
    return null;
}
