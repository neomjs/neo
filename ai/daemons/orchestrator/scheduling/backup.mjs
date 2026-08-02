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
export function isRetryWindowOpen({now, lastSuccessAtMs, retryWindowMs}) {
    if (retryWindowMs <= 0 || lastSuccessAtMs <= 0) {
        return false;
    }

    return now - lastSuccessAtMs < retryWindowMs;
}

/**
 * Decides whether a FAILED backup run is due for a bounded retry.
 *
 * @summary `markStarted()` stamps `lastRunAt` PRE-SPAWN and `markFailed()` never restores it,
 * so a run that dies seconds after spawn is not periodically due again for a full `intervalMs`.
 * `backup` is the system's only priority-0 lane (`PRIORITY_ZERO_TASKS`) — it wins the pick
 * unconditionally when due — and that guarantee is worth nothing against its own failure,
 * because ranking applies to candidates and a failed backup is not one. This predicate reads
 * the finer fields the periodic path ignores (`lastSuccessAt` / `lastErrorAt`) to distinguish
 * *attempted* from *succeeded*.
 *
 * **The window anchors on `lastSuccessAt`, and that choice is the livelock guard.** Because
 * `backup` wins unconditionally, an unbounded retry would turn a persistently-failing lane into
 * a heavy-lease monopoly and starve `summary` / `dream` / `memory-summary-backfill` — the exact
 * starvation the scheduling fairness model exists to eliminate, re-created by the repair for it.
 * `lastErrorAt` moves
 * with every failed retry, so anchoring there would slide the window forever; `lastSuccessAt`
 * cannot move during a failure streak, so the window closes deterministically. The effective
 * attempt budget is therefore `floor(retryWindowMs / retryDelayMs)`, bounded by construction
 * rather than by a counter that would have to survive a restart on its own.
 *
 * A lane that has never succeeded is deliberately NOT retried: it has no known-good anchor, so
 * any window would be unbounded. It keeps today's ordinary cadence — this is a bound, not an
 * oversight, and {@link describeBackupRetryState} reports it as `unanchored` so the case is
 * visible rather than silently indistinguishable from healthy.
 *
 * @param {Object} options
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt Last backup ATTEMPT timestamp (pre-spawn stamp).
 * @param {Number} options.lastSuccessAtMs Last successful completion, epoch ms; `0` when never.
 * @param {Number} options.lastErrorAtMs Last failure, epoch ms; `0` when never.
 * @param {Number} options.retryDelayMs Minimum spacing between retries; `0` disables retry.
 * @param {Number} options.retryWindowMs How long after the last success retries stay permitted;
 *     `0` disables retry.
 * @returns {Boolean}
 */
export function isFailedRunRetryDue({
    now,
    lastRunAt,
    lastSuccessAtMs,
    lastErrorAtMs,
    retryDelayMs,
    retryWindowMs
}) {
    if (retryDelayMs <= 0 || retryWindowMs <= 0) {
        return false;
    }

    // No known-good anchor ⇒ no boundable window. Ordinary cadence governs.
    if (lastSuccessAtMs <= 0) {
        return false;
    }

    // The last run did not fail — nothing to retry.
    if (lastErrorAtMs <= lastSuccessAtMs) {
        return false;
    }

    // Budget: the window is measured from the IMMOVABLE last success, so it closes.
    if (!isRetryWindowOpen({now, lastSuccessAtMs, retryWindowMs})) {
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
 * @param {Number} [options.retryWindowMs=0] Retry window measured from the last success.
 * @returns {{phase: String, retriesRemaining: Number, windowEndsAtMs: Number|null, lastSuccessAtMs: Number}}
 */
export function describeBackupRetryState({taskState = {}, now, retryDelayMs = 0, retryWindowMs = 0} = {}) {
    const lastSuccessAtMs = toEpochMs(taskState.lastSuccessAt),
          lastErrorAtMs   = toEpochMs(taskState.lastErrorAt);

    if (lastSuccessAtMs <= 0) {
        return {phase: BACKUP_RETRY_PHASE.unanchored, retriesRemaining: 0, windowEndsAtMs: null, lastSuccessAtMs};
    }

    if (lastErrorAtMs <= lastSuccessAtMs) {
        return {phase: BACKUP_RETRY_PHASE.healthy, retriesRemaining: 0, windowEndsAtMs: null, lastSuccessAtMs};
    }

    const windowEndsAtMs = lastSuccessAtMs + retryWindowMs,
          exhausted      = retryDelayMs <= 0 || !isRetryWindowOpen({now, lastSuccessAtMs, retryWindowMs});

    return {
        phase           : exhausted ? BACKUP_RETRY_PHASE.exhausted : BACKUP_RETRY_PHASE.retrying,
        retriesRemaining: exhausted ? 0 : Math.floor((windowEndsAtMs - now) / retryDelayMs),
        windowEndsAtMs,
        lastSuccessAtMs
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
 * @param {Number} [options.lastSuccessAtMs=0] Last successful completion, epoch ms.
 * @param {Number} [options.lastErrorAtMs=0] Last failure, epoch ms.
 * @param {Number} [options.retryDelayMs=0] Minimum spacing between retries; `0` disables retry.
 * @param {Number} [options.retryWindowMs=0] Retry window from the last success; `0` disables retry.
 * @returns {Object|null} A backup task trigger or null when no work is due.
 */
export function buildBackupTrigger({
    now,
    lastRunAt,
    intervalMs,
    lastSuccessAtMs = 0,
    lastErrorAtMs   = 0,
    retryDelayMs    = 0,
    retryWindowMs   = 0
}) {
    if (intervalMs > 0 && now - lastRunAt >= intervalMs) {
        return {
            taskName: 'backup',
            source  : 'periodic-sweep',
            reason  : `periodic-sweep:${intervalMs}`
        };
    }

    if (isFailedRunRetryDue({now, lastRunAt, lastSuccessAtMs, lastErrorAtMs, retryDelayMs, retryWindowMs})) {
        return {
            taskName: 'backup',
            source  : 'failed-run-retry',
            reason  : `failed-run-retry:${now - lastSuccessAtMs}`
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
 * @param {Number} [options.backupRetryWindowMs=0] Retry window measured from the last success.
 * @returns {Object|null}
 */
export function getDueTask({state, now, backupIntervalMs, backupRetryDelayMs = 0, backupRetryWindowMs = 0}) {
    const taskState = state.backup || {};

    return buildBackupTrigger({
        now,
        intervalMs     : backupIntervalMs,
        lastRunAt      : taskState.lastRunAt || 0,
        lastSuccessAtMs: toEpochMs(taskState.lastSuccessAt),
        lastErrorAtMs  : toEpochMs(taskState.lastErrorAt),
        retryDelayMs   : backupRetryDelayMs,
        retryWindowMs  : backupRetryWindowMs
    });
}
