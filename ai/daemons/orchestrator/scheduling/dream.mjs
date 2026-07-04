/**
 * @summary Parses persisted task-state timestamps without throwing on legacy or
 * partially written state envelopes.
 * @param {Number|String|null|undefined} value Persisted timestamp value.
 * @returns {Number|null} Epoch milliseconds or null when the value is unusable.
 */
function toTimestampMs(value) {
    if (Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string' && value.length > 0) {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function requireFiniteNumber(name, value) {
    if (!Number.isFinite(value)) {
        throw new Error(`[dream scheduling] Required numeric option "${name}" is missing or invalid.`);
    }
}

/**
 * @summary Resolves the timestamp from which the next REM cadence should be
 * measured. Normal cycles retain start-time cadence; overflowed cycles cool down
 * from completion so one long run cannot immediately reacquire heavy maintenance.
 * @param {Object} options
 * @param {Object} [options.state] Current task state for the dream lane.
 * @param {Number} options.dreamIntervalMs Periodic REM interval.
 * @param {Number} options.dreamOverflowThreshold Config-owned fraction of cadence that triggers
 * completion-time cooldown for a completed cycle.
 * @returns {Number} Epoch millisecond cadence anchor.
 */
export function getCadenceAnchor({state, dreamIntervalMs, dreamOverflowThreshold}) {
    const lastRunAt        = toTimestampMs(state?.lastRunAt) ?? 0;
    const lastSuccessAt    = toTimestampMs(state?.lastSuccessAt);
    const thresholdMs      = dreamIntervalMs * dreamOverflowThreshold;
    const completedRuntime = lastSuccessAt !== null && lastSuccessAt > lastRunAt
        ? lastSuccessAt - lastRunAt
        : 0;

    return completedRuntime > thresholdMs ? lastSuccessAt : lastRunAt;
}

/**
 * @summary Determines whether the previous REM cycle proved a remaining backlog and was cheap enough
 * for a catch-up cadence.
 * @param {Object} options
 * @param {Object} [options.state] Current task state for the dream lane.
 * @param {Number} options.dreamIntervalMs Periodic REM interval.
 * @param {Number} options.dreamOverflowThreshold Config-owned fraction of cadence that triggers
 * completion-time cooldown for a completed cycle.
 * @returns {Boolean} `true` when the previous REM run may schedule catch-up.
 */
export function isRemBacklogCatchupEligible({state, dreamIntervalMs, dreamOverflowThreshold}) {
    const lastRunAt        = toTimestampMs(state?.lastRunAt) ?? 0;
    const lastSuccessAt    = toTimestampMs(state?.lastSuccessAt);
    const thresholdMs      = dreamIntervalMs * dreamOverflowThreshold;
    const completedRuntime = lastSuccessAt !== null && lastSuccessAt > lastRunAt
        ? lastSuccessAt - lastRunAt
        : 0;

    return state?.lastCompletion?.rem?.batchSaturated === true &&
        lastSuccessAt !== null &&
        completedRuntime > 0 &&
        completedRuntime <= thresholdMs;
}

/**
 * @summary Dream-cycle due-trigger projection. Returns a trigger descriptor when
 * the configured interval has elapsed since the resolved cadence anchor; null
 * otherwise. Pure function.
 * @param {Object} options
 * @param {Object} [options.state] Current task state for the dream lane.
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.dreamIntervalMs Periodic interval; `<= 0` disables.
 * @param {Number} options.dreamOverflowThreshold Config-owned fraction of cadence that makes
 * the completed prior cycle use completion-time cooldown.
 * @param {Number} options.remBacklogCatchupCooldownMs Short cooldown for saturated REM batches; also bounds the
 * starvation-breaker's re-fire cadence.
 * @param {Number} [options.remStarvationBreakerMs=0] Staleness threshold past which a stuck undigested backlog
 * forces one cycle regardless of the cooldown / contention yield — INCLUDING the post-restart case where
 * `lastSuccessAt` is not yet set, so a nulled task state cannot lock the breaker out of its own motivating
 * scenario. Re-fire is bounded to `remBacklogCatchupCooldownMs` so a FAILING forced cycle retries at cooldown
 * cadence, never every tick. `0` (default / unwired) disables it — fail-open, never fail-loud.
 * @param {Number} [options.undigestedBacklog=0] Current undigested-session backlog count (the same signal the
 * consolidation-liveness watchdog pairs with staleness); `0` means nothing to rescue, so the breaker holds.
 * @returns {Object|null} A dream task trigger or null when no work is due.
 */
export function getDueTask({state, now, dreamIntervalMs, dreamOverflowThreshold, remBacklogCatchupCooldownMs, remStarvationBreakerMs = 0, undigestedBacklog = 0}) {
    requireFiniteNumber('dreamIntervalMs', dreamIntervalMs);
    requireFiniteNumber('dreamOverflowThreshold', dreamOverflowThreshold);
    requireFiniteNumber('remBacklogCatchupCooldownMs', remBacklogCatchupCooldownMs);

    const cadenceAnchor = getCadenceAnchor({state, dreamIntervalMs, dreamOverflowThreshold});

    if (dreamIntervalMs <= 0) {
        return null;
    }

    if (now - cadenceAnchor >= dreamIntervalMs) {
        return {
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : `periodic-dream:${dreamIntervalMs}`
        };
    }

    const lastSuccessAt = toTimestampMs(state?.lastSuccessAt);
    if (remBacklogCatchupCooldownMs > 0 &&
        lastSuccessAt !== null &&
        now - lastSuccessAt >= remBacklogCatchupCooldownMs &&
        isRemBacklogCatchupEligible({state, dreamIntervalMs, dreamOverflowThreshold})) {
        return {
            taskName: 'dream',
            source  : 'rem-backlog-catchup',
            reason  : `rem-backlog-catchup:${remBacklogCatchupCooldownMs}`
        };
    }

    // Starvation-breaker (ticket-ref-ok: #14708 owning-leaf anchor): neither the periodic cadence nor the
    // cooldown-gated / contention-yielding catch-up has fired, but an undigested backlog is stuck while REM
    // is stale — the exact stall the consolidation-liveness watchdog alarms on. A bounded max-deferral guard,
    // NOT a cooldown removal — two guards keep it honest:
    //   - staleOrNeverSucceeded: a long-stale success OR lastSuccessAt===null. The null case is the S4
    //     scenario itself — a restart that nulls task state must NOT lock the breaker out of its own
    //     motivating condition (post-restart starvation), so no-success-yet + backlog counts as starved.
    //   - reFireBounded: re-fire is capped to the catch-up cooldown so a FORCED cycle that FAILS retries at
    //     cooldown cadence, never every evaluation tick (a broken pipeline is precisely when starvation is
    //     likely, and lastSuccessAt would stay stale — an unguarded breaker would hammer it every tick).
    // Normal contention-yielding is untouched: no backlog, within the threshold, or a just-run cycle → holds.
    const lastRunAt             = toTimestampMs(state?.lastRunAt),
          staleOrNeverSucceeded = lastSuccessAt === null || now - lastSuccessAt >= remStarvationBreakerMs,
          reFireBounded         = lastRunAt === null || now - lastRunAt >= remBacklogCatchupCooldownMs;

    if (remStarvationBreakerMs > 0 &&
        undigestedBacklog > 0 &&
        staleOrNeverSucceeded &&
        reFireBounded) {
        return {
            taskName: 'dream',
            source  : 'rem-starvation-breaker',
            reason  : `rem-starvation-breaker:${remStarvationBreakerMs}`
        };
    }

    return null;
}
