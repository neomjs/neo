import {test, expect} from '@playwright/test';
import {
    BACKUP_RETRY_PHASE,
    buildBackupTrigger,
    describeBackupRetryState,
    getDueTask,
    isFailedRunRetryDue
} from '../../../../../../../ai/daemons/orchestrator/scheduling/backup.mjs';

const
    DAY_MS     = 86400000,
    DELAY_MS   = 15 * 60 * 1000,
    WINDOW_MS  = 60 * 60 * 1000,
    SUCCESS_AT = 1000000,
    iso        = ms => new Date(ms).toISOString(),

    /**
     * A lane whose last run FAILED: succeeded at `SUCCESS_AT`, attempted again at `+1000`, died at
     * `+2000`. Deliberately built from timestamps rather than a hand-set "failed" flag, so the
     * specimen is negative on the same axis the assertions read.
     */
    failedLane = (overrides = {}) => ({
        lastErrorAt  : iso(SUCCESS_AT + 2000),
        lastRunAt    : SUCCESS_AT + 1000,
        lastSuccessAt: iso(SUCCESS_AT),
        ...overrides
    }),

    retryOpts = (overrides = {}) => ({
        retryDelayMs : DELAY_MS,
        retryWindowMs: WINDOW_MS,
        ...overrides
    });

test.describe('orchestrator/scheduling/backup (#11864 / Epic #11831)', () => {
    test('buildBackupTrigger fires when the interval has elapsed', () => {
        expect(buildBackupTrigger({now: 86400000, lastRunAt: 0, intervalMs: 86400000})).toEqual({
            taskName: 'backup',
            source  : 'periodic-sweep',
            reason  : 'periodic-sweep:86400000'
        });
    });

    test('buildBackupTrigger returns null when the interval has not elapsed', () => {
        expect(buildBackupTrigger({now: 86399999, lastRunAt: 0, intervalMs: 86400000})).toBeNull();
    });

    test('buildBackupTrigger treats intervalMs <= 0 as disabled', () => {
        expect(buildBackupTrigger({now: 999999999, lastRunAt: 0, intervalMs: 0})).toBeNull();
    });

    test('getDueTask wraps buildBackupTrigger with state mapping', () => {
        expect(getDueTask({
            state           : {backup: {lastRunAt: 1000}},
            now             : 1000 + 86400000,
            backupIntervalMs: 86400000
        })).toEqual({
            taskName: 'backup',
            source  : 'periodic-sweep',
            reason  : 'periodic-sweep:86400000'
        });
    });

    test('getDueTask handles missing state.backup gracefully (lastRunAt defaults to 0)', () => {
        expect(getDueTask({state: {}, now: 86400000, backupIntervalMs: 86400000})).toEqual({
            taskName: 'backup',
            source  : 'periodic-sweep',
            reason  : 'periodic-sweep:86400000'
        });
    });
});

test.describe('orchestrator/scheduling/backup — failed-run retry (#16348 AC5)', () => {
    /**
     * The defect. `markStarted()` stamps `lastRunAt` pre-spawn and `markFailed()` never restores it,
     * so before this change a run that died 1 second in was not due again for a full DAY_MS — and
     * `backup`'s priority-0 status could not help, because ranking applies to candidates and a
     * failed backup was not one.
     */
    test('a FAILED run becomes due again long before the periodic interval elapses', () => {
        const now = SUCCESS_AT + 1000 + DELAY_MS;

        // Control: the periodic path alone still says "not due" at this instant. Without this the
        // test could pass on the ordinary sweep and prove nothing about the retry path.
        expect(buildBackupTrigger({now, lastRunAt: SUCCESS_AT + 1000, intervalMs: DAY_MS})).toBeNull();

        expect(buildBackupTrigger({
            ...retryOpts(),
            intervalMs     : DAY_MS,
            lastErrorAtMs  : SUCCESS_AT + 2000,
            lastRunAt      : SUCCESS_AT + 1000,
            lastSuccessAtMs: SUCCESS_AT,
            now
        })).toEqual({
            taskName: 'backup',
            source  : 'failed-run-retry',
            reason  : `failed-run-retry:${now - SUCCESS_AT}`
        });
    });

    test('a run whose last outcome SUCCEEDED is never retried', () => {
        expect(isFailedRunRetryDue({
            ...retryOpts(),
            // Success is the NEWER of the two — a lane that failed yesterday and succeeded today.
            lastErrorAtMs  : SUCCESS_AT - 5000,
            lastRunAt      : SUCCESS_AT,
            lastSuccessAtMs: SUCCESS_AT,
            now            : SUCCESS_AT + DELAY_MS
        })).toBe(false);
    });

    test('the retry respects its spacing — it does not fire one millisecond early', () => {
        const args = {
            ...retryOpts(),
            lastErrorAtMs  : SUCCESS_AT + 2000,
            lastRunAt      : SUCCESS_AT + 1000,
            lastSuccessAtMs: SUCCESS_AT
        };

        expect(isFailedRunRetryDue({...args, now: SUCCESS_AT + 1000 + DELAY_MS - 1})).toBe(false);
        expect(isFailedRunRetryDue({...args, now: SUCCESS_AT + 1000 + DELAY_MS})).toBe(true);
    });

    /**
     * THE livelock guard, and the reason the window anchors where it does. `backup` is the only
     * priority-0 lane (`PRIORITY_ZERO_TASKS`) and wins the pick unconditionally, so an unbounded
     * retry would monopolize the heavy-maintenance lease and starve the REM chain — the exact
     * starvation the scheduling fairness model exists to eliminate, re-created by the repair for it.
     *
     * Asserted by RUNNING THE CLOCK over a lane that fails every single time, rather than by
     * restating `floor(window / delay)`. Re-deriving the formula the implementation uses would
     * assert nothing; counting actual firings is an independent property. It also caught that the
     * achievable count is one BELOW the formula, because the first failure consumes part of the
     * window before the first retry can be spaced.
     */
    test('an always-failing backup stops re-firing — the streak terminates', () => {
        let lastErrorAtMs = SUCCESS_AT + 2000,
            lastRunAt     = SUCCESS_AT + 1000,
            fired         = 0,
            now           = SUCCESS_AT + 2000;

        const limit = SUCCESS_AT + WINDOW_MS * 10;

        while (now <= limit) {
            const trigger = buildBackupTrigger({
                ...retryOpts(),
                intervalMs     : DAY_MS,
                lastErrorAtMs,
                lastRunAt,
                lastSuccessAtMs: SUCCESS_AT,
                now
            });

            if (trigger?.source === 'failed-run-retry') {
                fired        += 1;
                lastRunAt     = now;
                lastErrorAtMs = now;   // the retry failed too
            }

            now += 60000;
        }

        // Terminates, and every firing happened INSIDE the window.
        expect(fired).toBe(3);
        expect(fired).toBeLessThan(Math.floor(WINDOW_MS / DELAY_MS));

        // The livelock assertion proper: ten windows later, nothing more fires however long we wait.
        expect(isFailedRunRetryDue({
            ...retryOpts(),
            lastErrorAtMs,
            lastRunAt,
            lastSuccessAtMs: SUCCESS_AT,
            now            : limit
        })).toBe(false);
    });

    /**
     * The named term. The design's whole claim is that the window anchors on `lastSuccessAt`
     * BECAUSE that field cannot move during a failure streak, while `lastErrorAt` advances with
     * every failed retry and would slide the window forever. This fails if the anchor is swapped —
     * a red-on-old-tree check would not, since any difference satisfies that.
     */
    test('the window anchors on lastSuccessAt, which a failure streak cannot move', () => {
        const streakAgeMs = WINDOW_MS * 4,
              lastRunAt   = SUCCESS_AT + streakAgeMs,
              now         = lastRunAt + DELAY_MS;

        // `lastErrorAt` is RECENT — anchoring on it would keep the window permanently open.
        expect(now - (SUCCESS_AT + streakAgeMs)).toBeLessThan(WINDOW_MS);

        expect(isFailedRunRetryDue({
            ...retryOpts(),
            lastErrorAtMs  : SUCCESS_AT + streakAgeMs,
            lastRunAt,
            lastSuccessAtMs: SUCCESS_AT,
            now
        })).toBe(false);
    });

    test('a lane that has NEVER succeeded is not retried — no anchor, no boundable window', () => {
        expect(isFailedRunRetryDue({
            ...retryOpts(),
            lastErrorAtMs  : SUCCESS_AT,
            lastRunAt      : SUCCESS_AT,
            lastSuccessAtMs: 0,
            now            : SUCCESS_AT + DELAY_MS * 2
        })).toBe(false);
    });

    test('either retry value at 0 restores the exact pre-#16348 behaviour', () => {
        const args = {
            intervalMs     : DAY_MS,
            lastErrorAtMs  : SUCCESS_AT + 2000,
            lastRunAt      : SUCCESS_AT + 1000,
            lastSuccessAtMs: SUCCESS_AT,
            now            : SUCCESS_AT + 1000 + DELAY_MS
        };

        expect(buildBackupTrigger({...args, retryDelayMs: 0, retryWindowMs: WINDOW_MS})).toBeNull();
        expect(buildBackupTrigger({...args, retryDelayMs: DELAY_MS, retryWindowMs: 0})).toBeNull();
        // Positive control: the same arguments DO fire once both are configured, so the two
        // assertions above are proving the disable branch rather than a malformed fixture.
        expect(buildBackupTrigger({...args, ...retryOpts()})).not.toBeNull();
    });

    test('the periodic sweep still wins when both paths are due', () => {
        expect(buildBackupTrigger({
            ...retryOpts(),
            intervalMs     : DAY_MS,
            lastErrorAtMs  : SUCCESS_AT + 2000,
            lastRunAt      : SUCCESS_AT + 1000,
            lastSuccessAtMs: SUCCESS_AT,
            now            : SUCCESS_AT + 1000 + DAY_MS
        }).source).toBe('periodic-sweep');
    });

    test('getDueTask parses the ISO timestamps TaskStateService persists', () => {
        expect(getDueTask({
            backupIntervalMs   : DAY_MS,
            backupRetryDelayMs : DELAY_MS,
            backupRetryWindowMs: WINDOW_MS,
            now                : SUCCESS_AT + 1000 + DELAY_MS,
            state              : {backup: failedLane()}
        })?.source).toBe('failed-run-retry');
    });
});

test.describe('orchestrator/scheduling/backup — retry phase reporting (#16348 AC5)', () => {
    test('reports healthy when the last run succeeded', () => {
        expect(describeBackupRetryState({
            ...retryOpts(),
            now      : SUCCESS_AT + 5000,
            taskState: {lastErrorAt: iso(SUCCESS_AT - 5000), lastSuccessAt: iso(SUCCESS_AT)}
        }).phase).toBe(BACKUP_RETRY_PHASE.healthy);
    });

    test('reports retrying with a remaining count while the window is open', () => {
        const state = describeBackupRetryState({
            ...retryOpts(),
            now      : SUCCESS_AT + 3000,
            taskState: failedLane()
        });

        expect(state.phase).toBe(BACKUP_RETRY_PHASE.retrying);
        expect(state.retriesRemaining).toBeGreaterThan(0);
        expect(state.windowEndsAtMs).toBe(SUCCESS_AT + WINDOW_MS);
    });

    /**
     * Exhaustion must reach a surface. The lane simply stops producing candidates, so without this
     * the failure is silent — a diagnosis nothing reads. Reported as recomputable STATE rather than
     * a log edge, so it survives a restart without a flag of its own.
     */
    test('reports exhausted once the window has closed, with no retries remaining', () => {
        const state = describeBackupRetryState({
            ...retryOpts(),
            now      : SUCCESS_AT + WINDOW_MS + 1,
            taskState: failedLane()
        });

        expect(state.phase).toBe(BACKUP_RETRY_PHASE.exhausted);
        expect(state.retriesRemaining).toBe(0);
    });

    /**
     * The reporter and the trigger must never disagree about whether the budget is spent — "the
     * lane stopped retrying" versus "the lane reports it stopped" is exactly the drift that makes a
     * silent failure look supervised. Found by a mutation run: deleting the trigger's budget clause
     * left the `exhausted` phase spec green, because the two sides computed the window separately.
     * They now route through one predicate, and this sweeps the whole boundary rather than sampling
     * a point that could sit on the agreeing side of a drift.
     */
    test('the reported phase never contradicts the trigger across the whole window', () => {
        for (let offset = 0; offset <= WINDOW_MS * 2; offset += 60000) {
            const now       = SUCCESS_AT + offset,
                  taskState = failedLane(),
                  phase     = describeBackupRetryState({...retryOpts(), now, taskState}).phase,
                  due       = isFailedRunRetryDue({
                      ...retryOpts(),
                      lastErrorAtMs  : SUCCESS_AT + 2000,
                      lastRunAt      : SUCCESS_AT + 1000,
                      lastSuccessAtMs: SUCCESS_AT,
                      now
                  });

            if (phase === BACKUP_RETRY_PHASE.exhausted) {
                expect(due, `exhausted at +${offset}ms must not still be due`).toBe(false);
            }
        }
    });

    test('reports unanchored for a lane that has never succeeded', () => {
        expect(describeBackupRetryState({
            ...retryOpts(),
            now      : SUCCESS_AT,
            taskState: {lastErrorAt: iso(SUCCESS_AT), lastRunAt: SUCCESS_AT}
        }).phase).toBe(BACKUP_RETRY_PHASE.unanchored);
    });

    test('an unparseable persisted timestamp degrades to unanchored, never to a stray epoch', () => {
        expect(describeBackupRetryState({
            ...retryOpts(),
            now      : SUCCESS_AT,
            taskState: {lastErrorAt: 'not-a-date', lastSuccessAt: 'not-a-date'}
        }).phase).toBe(BACKUP_RETRY_PHASE.unanchored);
    });
});
