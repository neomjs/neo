/**
 * Retry phases a backup lane can be in, derived from persisted task state.
 *
 * @summary `healthy` — the last run succeeded. `retrying` — the last run failed and the
 * bounded retry window is still open. `exhausted` — the last run failed and the window has
 * closed, so the lane has fallen back to its ordinary cadence with a stale last-known-good
 * bundle. `unanchored` — the lane has never succeeded, so there is no known-good timestamp
 * to bound a retry window against (see {@link isFailedRunRetryDue}).
 * @type {Object}
 */
export const BACKUP_RETRY_PHASE = Object.freeze({
    exhausted : 'exhausted',
    healthy   : 'healthy',
    retrying  : 'retrying',
    unanchored: 'unanchored'
});

/**
 * Parses a persisted ISO timestamp into epoch ms.
 *
 * @summary `TaskStateService` writes `lastSuccessAt` / `lastErrorAt` as ISO strings while
 * `lastRunAt` is already epoch ms; the trigger compares all three, so the ISO pair is
 * normalized here. Absent or unparseable values become `0` — "never happened" — which the
 * callers treat as an explicit branch rather than as a small timestamp.
 * @param {String|null|undefined} isoTimestamp
 * @returns {Number} Epoch ms, or `0` when absent/unparseable.
 */
export function toEpochMs(isoTimestamp) {
    const parsed = Date.parse(isoTimestamp);
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Whether the bounded retry window measured from the last success is still open.
 *
 * @summary The single definition of "is the budget spent". Both the trigger
 * ({@link isFailedRunRetryDue}) and the phase reporter ({@link describeBackupRetryState}) route
 * through it, because two independent computations of one fact can disagree — and the pair that
 * would disagree here is "the lane stopped retrying" versus "the lane reports it stopped", which is
 * precisely the drift that makes a silent failure look supervised.
 * @param {Object} options
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.lastSuccessAtMs Last successful completion, epoch ms; `0` when never.
 * @param {Number} options.retryWindowMs Retry window from the last success; `0` disables retry.
 * @returns {Boolean}
 */
export function isRetryWindowOpen({now, streakStartedAtMs, retryWindowMs}) {
    if (retryWindowMs <= 0 || streakStartedAtMs <= 0) {
        return false;
    }

    return now - streakStartedAtMs < retryWindowMs;
}

/**
 * Counts the retries that can still fire before the window closes.
 *
 * @summary Derived from the SAME schedule the trigger uses — next firing at
 * `max(lastRunAt + retryDelayMs, now)`, then one per delay until the window ends — rather than
 * from wall-clock division. `floor((windowEnd - now) / delay)` ignores `lastRunAt`, so a lane whose
 * retry is already due (or overdue) reports one fewer than will actually fire. A count that does
 * not come from the activation predicate is a second opinion about the same schedule.
 * @param {Object} options
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt Last backup ATTEMPT timestamp.
 * @param {Number} options.streakStartedAtMs Failure-streak anchor, epoch ms.
 * @param {Number} options.retryDelayMs Minimum spacing between retries.
 * @param {Number} options.retryWindowMs Retry window measured from the streak anchor.
 * @returns {Number}
 */
export function countRemainingRetries({now, lastRunAt, streakStartedAtMs, retryDelayMs, retryWindowMs}) {
    if (retryDelayMs <= 0 || retryWindowMs <= 0 || streakStartedAtMs <= 0) {
        return 0;
    }

    const windowEndsAtMs = streakStartedAtMs + retryWindowMs;
    let   nextFiringAtMs = Math.max(lastRunAt + retryDelayMs, now),
          remaining      = 0;

    // Strictly `<`, matching `isRetryWindowOpen`. A firing scheduled exactly AT the window end does
    // not happen — the window is already closed there — and counting it over-reported by one.
    while (nextFiringAtMs < windowEndsAtMs) {
        remaining      += 1;
        nextFiringAtMs += retryDelayMs
    }

    return remaining;
}

/**
 * Decides whether a FAILED backup run is due for a bounded retry.
 *
 * @summary `markStarted()` stamps `lastRunAt` PRE-SPAWN and `markFailed()` never restores it,
 * so a run that dies seconds after spawn is not periodically due again for a full `intervalMs`.
 * `backup` is the system's only priority-0 lane (`PRIORITY_ZERO_TASKS`) — it wins the pick
 * unconditionally when due — and that guarantee is worth nothing against its own failure,
 * because ranking applies to candidates and a failed backup is not one. This predicate reads
 * the finer field the periodic path ignores — `failureStreakStartedAt` — to distinguish
 * *attempted* from *succeeded*.
 *
 * **The window opens at the FAILED CYCLE and never slides, and both halves of that are load-bearing.**
 * `failureStreakStartedAt` is written by `TaskStateService.markFailed()` with `??=`, so it is set
 * once at the first failure after a success and preserved across every subsequent retry, then
 * cleared by `markCompleted()`.
 *
 * - **Opening it at the failure** is what makes the feature work at all. An earlier revision
 *   anchored on `lastSuccessAt`, which is immovable but roughly one full `intervalMs` stale by the
 *   time a periodic run fails — so with any `retryWindowMs < intervalMs` the window was already
 *   expired at the first failure and no retry could ever fire at the shipped defaults.
 * - **Not sliding** is the livelock guard. Because `backup` wins the pick unconditionally, an
 *   unbounded retry would turn a persistently-failing lane into a heavy-lease monopoly and starve
 *   `summary` / `dream` / `memory-summary-backfill` — the exact starvation the scheduling fairness
 *   model exists to eliminate, re-created by the repair for it. `lastErrorAt` advances with every
 *   failed retry, so a window measured from it would never close.
 *
 * A run interrupted by a crash also opens a streak: `TaskStateService.readState()` normalizes a
 * persisted `running: true` fail-closed. Without that, an interrupted run recorded no terminal
 * outcome at all and read as healthy — the very incident class this lane exists to catch.
 *
 * @param {Object} options
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt Last backup ATTEMPT timestamp (pre-spawn stamp).
 * @param {Number} options.streakStartedAtMs Failure-streak anchor, epoch ms; `0` when the lane is
 *     known-good (no open streak).
 * @param {Number} options.retryDelayMs Minimum spacing between retries; `0` disables retry.
 * @param {Number} options.retryWindowMs How long after the streak opened retries stay permitted;
 *     `0` disables retry.
 * @returns {Boolean}
 */
export function isFailedRunRetryDue({
    now,
    lastRunAt,
    streakStartedAtMs,
    retryDelayMs,
    retryWindowMs
}) {
    if (retryDelayMs <= 0 || retryWindowMs <= 0) {
        return false;
    }

    // No open streak ⇒ the last outcome was a success (or the lane never ran). Nothing to retry.
    if (streakStartedAtMs <= 0) {
        return false;
    }

    // Budget: measured from the streak anchor, which does not move while the streak is open.
    if (!isRetryWindowOpen({now, streakStartedAtMs, retryWindowMs})) {
        return false;
    }

    return now - lastRunAt >= retryDelayMs;
}

/**
 * Reports the lane's retry phase as durable, readable STATE rather than a log edge.
 *
 * @summary AC5 requires budget exhaustion to reach a surface. An edge-triggered log would need
 * its own persisted "already warned" flag and would be lost on restart; every field this reads
 * is already persisted by `TaskStateService.writeState()`, so the phase is recomputable at any
 * time by any reader — including after a restart — and needs no state of its own. Exposed on the
 * orchestrator health payload, which is the surface that can actually see the backup lane.
 * @param {Object} options
 * @param {Object} [options.taskState={}] Persisted `backup` task state.
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} [options.retryDelayMs=0] Minimum spacing between retries.
 * @param {Number} [options.retryWindowMs=0] Retry window measured from the streak anchor.
 * @returns {{phase: String, retriesRemaining: Number, windowEndsAtMs: Number|null, streakStartedAtMs: Number, interruptedAt: String|null}}
 */
export function describeBackupRetryState({taskState = {}, now, retryDelayMs = 0, retryWindowMs = 0} = {}) {
    const streakStartedAtMs = toEpochMs(taskState.failureStreakStartedAt),
          lastSuccessAtMs   = toEpochMs(taskState.lastSuccessAt),
          interruptedAt     = taskState.interruptedAt || null,
          base              = {retriesRemaining: 0, windowEndsAtMs: null, streakStartedAtMs, interruptedAt};

    // No open streak: either known-good, or never ran at all. Both are reported, never conflated —
    // an interrupted run opens a streak (`readState` normalizes fail-closed), so it cannot land here.
    if (streakStartedAtMs <= 0) {
        return {...base, phase: lastSuccessAtMs > 0 ? BACKUP_RETRY_PHASE.healthy : BACKUP_RETRY_PHASE.unanchored};
    }

    const windowEndsAtMs = streakStartedAtMs + retryWindowMs,
          open           = retryDelayMs > 0 && isRetryWindowOpen({now, streakStartedAtMs, retryWindowMs});

    return {
        ...base,
        phase           : open ? BACKUP_RETRY_PHASE.retrying : BACKUP_RETRY_PHASE.exhausted,
        retriesRemaining: open
            ? countRemainingRetries({
                now, lastRunAt: taskState.lastRunAt || 0, streakStartedAtMs, retryDelayMs, retryWindowMs
            })
            : 0,
        windowEndsAtMs
    };
}

/**
 * Builds the task trigger for the backup sweep. Pure function.
 *
 * @summary Two paths, periodic-first. The periodic sweep is unchanged; the retry path fires only
 * for a lane whose last run FAILED, within a bounded window. Retry values arrive as parameters
 * (the `tenantRepoSync.isRepoDue` shape) so this module imports no config of its own — the caller
 * reads `AiConfig.orchestrator.intervals.*` at its own use site, and a second resolution path able
 * to disagree with the leaf never exists. Passing `0` for either retry value disables the retry
 * path entirely, leaving the periodic sweep exactly as it behaves without it.
 * @param {Object} options
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt Last backup task start timestamp.
 * @param {Number} options.intervalMs Periodic backup interval; `0` disables it.
 * @param {Number} [options.streakStartedAtMs=0] Failure-streak anchor, epoch ms; `0` when known-good.
 * @param {Number} [options.retryDelayMs=0] Minimum spacing between retries; `0` disables retry.
 * @param {Number} [options.retryWindowMs=0] Retry window from the streak anchor; `0` disables retry.
 * @returns {Object|null} A backup task trigger or null when no work is due.
 */
export function buildBackupTrigger({
    now,
    lastRunAt,
    intervalMs,
    streakStartedAtMs = 0,
    retryDelayMs      = 0,
    retryWindowMs     = 0
}) {
    if (intervalMs > 0 && now - lastRunAt >= intervalMs) {
        return {
            taskName: 'backup',
            source  : 'periodic-sweep',
            reason  : `periodic-sweep:${intervalMs}`
        };
    }

    if (isFailedRunRetryDue({now, lastRunAt, streakStartedAtMs, retryDelayMs, retryWindowMs})) {
        return {
            taskName: 'backup',
            source  : 'failed-run-retry',
            reason  : `failed-run-retry:${now - streakStartedAtMs}`
        };
    }

    return null;
}

/**
 * Resolves the next backup task trigger.
 *
 * @param {Object} options
 * @param {Object} options.state Current orchestrator task state.
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.backupIntervalMs Periodic backup interval.
 * @param {Number} [options.backupRetryDelayMs=0] Minimum spacing between failed-run retries.
 * @param {Number} [options.backupRetryWindowMs=0] Retry window measured from the streak anchor.
 * @returns {Object|null}
 */
export function getDueTask({state, now, backupIntervalMs, backupRetryDelayMs = 0, backupRetryWindowMs = 0}) {
    const taskState = state.backup || {};

    return buildBackupTrigger({
        now,
        intervalMs       : backupIntervalMs,
        lastRunAt        : taskState.lastRunAt || 0,
        streakStartedAtMs: toEpochMs(taskState.failureStreakStartedAt),
        retryDelayMs     : backupRetryDelayMs,
        retryWindowMs    : backupRetryWindowMs
    });
}
