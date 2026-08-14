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
 * Whether the bounded retry window measured from the failure-streak anchor is still open.
 *
 * @summary The single definition of "is the budget spent". Both the trigger
 * ({@link isFailedRunRetryDue}) and the phase reporter ({@link describeBackupRetryState}) route
 * through it, because two independent computations of one fact can disagree — and the pair that
 * would disagree here is "the lane stopped retrying" versus "the lane reports it stopped", which is
 * precisely the drift that makes a silent failure look supervised.
 * @param {Object} options
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.streakStartedAtMs Failure-streak anchor, epoch ms; `0` when no streak is
 *     open. An earlier revision measured from `lastSuccessAt` instead, which is already roughly a
 *     full `intervalMs` stale when a periodic run fails — so at any `retryWindowMs < intervalMs`
 *     the budget was spent before the first failure and the feature no-opped at its own defaults.
 * @param {Number} options.retryWindowMs Retry window from the streak anchor; `0` disables retry.
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
 * `failureStreakStartedAt` is written by `TaskStateService.openFailureStreak()` with `??=`, so it is
 * set once at the first failure after a success and preserved across every subsequent retry, then
 * cleared by `markCompleted()`. Every terminal-failure writer shares that one transition —
 * `markFailed()` (exited non-zero), `markSpawnFailed()` (spawn threw), and `readState()`'s
 * interrupted-run normalization — because this predicate reads the anchor as the SOLE activation
 * fact, which makes any writer that skips it a silent forfeit of the whole budget.
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
 * persisted `running: true` fail-closed, and `configure()` COMMITS that normalization to disk before
 * any consumer can read the lane. Without the normalization, an interrupted run recorded no terminal
 * outcome at all and read as healthy — the very incident class this lane exists to catch. Without
 * the commit, the crashed bytes survive and each restart re-derives a fresh anchor, so the bound
 * slides forward once per outage and a crash loop never exhausts a budget meant to terminate.
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
 * @summary Derives the backup lane's next scheduler eligibility from the same persisted facts and
 * cadence bounds consumed by {@link buildBackupTrigger}.
 *
 * A closed retry burst is not a terminal lane: the ordinary periodic sweep remains eligible. This
 * projection makes that fallback visible instead of asking an operator to infer it from
 * `phase: exhausted`. `now` is returned when a path is already due; admission/backpressure may
 * still defer its actual dispatch.
 * @param {Object} options
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt Last backup attempt timestamp.
 * @param {Number} options.streakStartedAtMs Failure-streak anchor.
 * @param {Number} options.intervalMs Ordinary periodic cadence.
 * @param {Number} options.retryDelayMs Failed-run retry spacing.
 * @param {Number} options.retryWindowMs Failed-run retry window.
 * @returns {Number|null}
 */
function resolveNextBackupAttemptAtMs({
    now,
    lastRunAt,
    streakStartedAtMs,
    intervalMs,
    retryDelayMs,
    retryWindowMs
}) {
    const candidates = [];

    if (intervalMs > 0) {
        candidates.push(Math.max(now, lastRunAt + intervalMs))
    }

    if (retryDelayMs > 0 && isRetryWindowOpen({now, streakStartedAtMs, retryWindowMs})) {
        const retryAtMs = Math.max(now, lastRunAt + retryDelayMs);

        if (retryAtMs < streakStartedAtMs + retryWindowMs) {
            candidates.push(retryAtMs)
        }
    }

    return candidates.length > 0 ? Math.min(...candidates) : null
}

/**
 * @summary Reports the lane's retry phase as durable, readable STATE rather than a log edge.
 *
 * @summary AC5 requires budget exhaustion to reach a surface. An edge-triggered log would need
 * its own persisted "already warned" flag and would be lost on restart; every field this reads
 * is already persisted by `TaskStateService.writeState()`, so the phase is recomputable at any
 * time by any reader — including after a restart — and needs no state of its own. Exposed through
 * the orchestrator deployment-state bridge, whose current verdict is projected into the Memory Core
 * healthcheck without giving that process direct backup-path authority.
 * @param {Object} options
 * @param {Object} [options.taskState={}] Persisted `backup` task state.
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} [options.intervalMs=0] Ordinary periodic cadence.
 * @param {Number} [options.retryDelayMs=0] Minimum spacing between retries.
 * @param {Number} [options.retryWindowMs=0] Retry window measured from the streak anchor.
 * @returns {{phase: String, retriesRemaining: Number, windowEndsAtMs: Number|null, streakStartedAtMs: Number, interruptedAt: String|null, lastSuccessAt: String|null, lastSuccessAgeMs: Number|null, nextAttemptAtMs: Number|null}}
 */
export function describeBackupRetryState({
    taskState     = {},
    now,
    intervalMs    = 0,
    retryDelayMs  = 0,
    retryWindowMs = 0
} = {}) {
    const streakStartedAtMs = toEpochMs(taskState.failureStreakStartedAt),
          lastSuccessAtMs   = toEpochMs(taskState.lastSuccessAt),
          interruptedAt     = taskState.interruptedAt || null,
          lastRunAt         = Number.isFinite(Number(taskState.lastRunAt)) ? Number(taskState.lastRunAt) : 0,
          base              = {
              interruptedAt,
              lastSuccessAgeMs: lastSuccessAtMs > 0 ? Math.max(0, now - lastSuccessAtMs) : null,
              lastSuccessAt   : lastSuccessAtMs > 0 ? taskState.lastSuccessAt : null,
              nextAttemptAtMs : resolveNextBackupAttemptAtMs({
                  now, lastRunAt, streakStartedAtMs, intervalMs, retryDelayMs, retryWindowMs
              }),
              retriesRemaining: 0,
              streakStartedAtMs,
              windowEndsAtMs  : null
          };

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
                now, lastRunAt, streakStartedAtMs, retryDelayMs, retryWindowMs
            })
            : 0,
        windowEndsAtMs
    };
}

/**
 * @summary Reports a bounded, machine-readable maintenance-health verdict from backup facts the
 * deployment snapshot already owns.
 *
 * The verdict adds no scheduler or persistence. It translates the existing retry state, last
 * receipt, and durability posture into stable reason codes so consumers do not reverse-engineer a
 * safety decision from several fields. Backup freshness becomes overdue after one ordinary cadence
 * plus its bounded recovery window — the existing two configuration authorities, not a new hidden
 * threshold.
 * @param {Object} options
 * @param {Object} [options.durability={}] Deployment durability posture.
 * @param {Object|null} [options.lastBackup=null] Validated last-backup receipt projection.
 * @param {Object|null} [options.retryState=null] Output of {@link describeBackupRetryState}.
 * @param {Number} [options.backupIntervalMs=0] Ordinary backup cadence.
 * @param {Number} [options.retryWindowMs=0] Bounded failed-run recovery window.
 * @returns {{status: 'healthy'|'degraded'|'pending', reasonCodes: String[], staleAfterMs: Number|null}}
 */
export function describeBackupMaintenanceHealth({
    durability       = {},
    lastBackup       = null,
    retryState       = null,
    backupIntervalMs = 0,
    retryWindowMs    = 0
} = {}) {
    const
        reasonCodes  = [],
        staleAfterMs = backupIntervalMs > 0
            ? backupIntervalMs + Math.max(0, retryWindowMs)
            : null;

    if (durability.posture === 'unmet') {
        reasonCodes.push('off-host-durability-unmet')
    }
    if (durability.configErrorCode) {
        reasonCodes.push('off-host-config-invalid')
    }
    if (retryState?.phase === BACKUP_RETRY_PHASE.retrying) {
        reasonCodes.push('backup-retry-open')
    } else if (retryState?.phase === BACKUP_RETRY_PHASE.exhausted) {
        reasonCodes.push('backup-retry-exhausted')
    }
    if (lastBackup?.status === 'unreadable') {
        reasonCodes.push('backup-receipt-unreadable')
    } else if (lastBackup?.backup?.status === 'failed') {
        reasonCodes.push('backup-last-run-failed')
    }
    // `unanchored` is the expected pre-first-run state: it stays pending rather than turning every
    // fresh deployment into a never-succeeded incident before the lane has had one opportunity.
    if (retryState && retryState.phase !== BACKUP_RETRY_PHASE.unanchored && !retryState.lastSuccessAt) {
        reasonCodes.push('backup-never-succeeded')
    }
    if (staleAfterMs !== null && retryState?.lastSuccessAgeMs > staleAfterMs) {
        reasonCodes.push('backup-success-overdue')
    }

    return {
        reasonCodes: [...new Set(reasonCodes)],
        staleAfterMs,
        status     : reasonCodes.length > 0
            ? 'degraded'
            : (!lastBackup && (!retryState || retryState.phase === BACKUP_RETRY_PHASE.unanchored)
                ? 'pending'
                : 'healthy')
    }
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
