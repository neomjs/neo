import {test, expect} from '@playwright/test';
import {
    BACKUP_RETRY_PHASE,
    buildBackupTrigger,
    countRemainingRetries,
    describeBackupMaintenanceHealth,
    describeBackupRetryState,
    getDueTask,
    isFailedRunRetryDue
} from '../../../../../../../ai/daemons/orchestrator/scheduling/backup.mjs';

const
    // SHIPPED defaults. Fixtures use these rather than locally convenient numbers: an earlier
    // revision passed every spec with a success-to-failure gap of seconds and still no-opped at the
    // real 24h/1h ratio, because the window was anchored to the prior success.
    DAY_MS    = 86400000,
    DELAY_MS  = 15 * 60 * 1000,
    WINDOW_MS = 60 * 60 * 1000,
    T         = 1700000000000,
    iso       = ms => new Date(ms).toISOString(),

    retryOpts = (overrides = {}) => ({retryDelayMs: DELAY_MS, retryWindowMs: WINDOW_MS, ...overrides}),

    /**
     * The PRODUCTION shape: succeeded at `T`, the periodic sweep fired a full `DAY_MS` later and
     * failed. `failureStreakStartedAt` is what `TaskStateService.markFailed` writes.
     */
    productionFailure = (overrides = {}) => ({
        failureStreakStartedAt: iso(T + DAY_MS + 1000),
        lastErrorAt           : iso(T + DAY_MS + 1000),
        lastRunAt             : T + DAY_MS,
        lastSuccessAt         : iso(T),
        ...overrides
    }),

    /**
     * Runs the clock over an always-failing lane and returns how many retries actually fire. Used
     * instead of restating `floor(window / delay)` — re-deriving the implementation's own formula
     * asserts nothing.
     */
    countActualFirings = ({taskState, from, until, stepMs = 60000}) => {
        let streak = new Date(taskState.failureStreakStartedAt).getTime(),
            runAt  = taskState.lastRunAt,
            fired  = 0;

        for (let now = from; now <= until; now += stepMs) {
            const trigger = buildBackupTrigger({
                now, intervalMs: DAY_MS, lastRunAt: runAt, streakStartedAtMs: streak, ...retryOpts()
            });
            if (trigger?.source === 'failed-run-retry') { fired += 1; runAt = now }
        }
        return fired
    };

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
     * THE production-cadence witness, and the one an earlier revision could not pass.
     *
     * Ordering is deliberately at shipped scale: success at T, the periodic attempt and its failure
     * a full `backupMs` later, the check one `backupRetryDelayMs` after that. A window anchored on
     * `lastSuccessAt` is ~24h stale by this point and already closed, so the whole feature no-opped
     * at its own defaults while every second-scale fixture stayed green.
     */
    test('a run that fails a FULL INTERVAL after the last success still retries', () => {
        const failedAt = T + DAY_MS + 1000,
              now      = failedAt + DELAY_MS;

        // Control: the periodic path alone says "not due" here, so the retry path is what fires.
        expect(buildBackupTrigger({now, lastRunAt: T + DAY_MS, intervalMs: DAY_MS})).toBeNull();

        expect(getDueTask({
            state              : {backup: productionFailure()},
            now,
            backupIntervalMs   : DAY_MS,
            backupRetryDelayMs : DELAY_MS,
            backupRetryWindowMs: WINDOW_MS
        })).toMatchObject({taskName: 'backup', source: 'failed-run-retry'});
    });

    test('the streak anchor does not slide, so a failing lane still terminates', () => {
        const streakAt = T + DAY_MS + 1000,
              fired    = countActualFirings({
                  taskState: productionFailure(), from: streakAt, until: streakAt + WINDOW_MS * 10
              });

        expect(fired).toBeGreaterThan(0);
        expect(fired).toBeLessThanOrEqual(Math.floor(WINDOW_MS / DELAY_MS));

        // Ten windows later nothing fires however long we wait — the livelock assertion proper.
        expect(isFailedRunRetryDue({
            ...retryOpts(),
            lastRunAt        : streakAt + WINDOW_MS * 9,
            streakStartedAtMs: streakAt,
            now              : streakAt + WINDOW_MS * 10
        })).toBe(false);
    });

    test('a lane with no open streak is never retried', () => {
        expect(isFailedRunRetryDue({
            ...retryOpts(), lastRunAt: T, streakStartedAtMs: 0, now: T + DELAY_MS
        })).toBe(false);
    });

    test('the retry respects its spacing — it does not fire one millisecond early', () => {
        const args = {...retryOpts(), lastRunAt: T + DAY_MS, streakStartedAtMs: T + DAY_MS + 1000};

        expect(isFailedRunRetryDue({...args, now: T + DAY_MS + DELAY_MS - 1})).toBe(false);
        expect(isFailedRunRetryDue({...args, now: T + DAY_MS + DELAY_MS})).toBe(true);
    });

    test('either retry value at 0 restores the pre-retry behaviour', () => {
        const args = {
            intervalMs       : DAY_MS,
            lastRunAt        : T + DAY_MS,
            streakStartedAtMs: T + DAY_MS + 1000,
            now              : T + DAY_MS + DELAY_MS
        };

        expect(buildBackupTrigger({...args, retryDelayMs: 0, retryWindowMs: WINDOW_MS})).toBeNull();
        expect(buildBackupTrigger({...args, retryDelayMs: DELAY_MS, retryWindowMs: 0})).toBeNull();
        // Positive control: the same arguments DO fire once both are configured.
        expect(buildBackupTrigger({...args, ...retryOpts()})).not.toBeNull();
    });

    test('the periodic sweep still wins when both paths are due', () => {
        expect(buildBackupTrigger({
            ...retryOpts(),
            intervalMs       : DAY_MS,
            lastRunAt        : T,
            streakStartedAtMs: T + 1000,
            now              : T + DAY_MS
        }).source).toBe('periodic-sweep');
    });

    /**
     * A first-ever backup that fails is covered, not excluded. It has no `lastSuccessAt`, but it
     * does open a streak — so the anchor exists and the window is bounded exactly as for any other
     * failure. The previous last-success anchor could not express this case at all.
     */
    test('a first-ever run that fails is retried — the streak is the anchor, not the success', () => {
        expect(getDueTask({
            state: {backup: {
                failureStreakStartedAt: iso(T + 1000),
                lastErrorAt           : iso(T + 1000),
                lastRunAt             : T,
                lastSuccessAt         : null
            }},
            now                : T + 1000 + DELAY_MS,
            backupIntervalMs   : DAY_MS,
            backupRetryDelayMs : DELAY_MS,
            backupRetryWindowMs: WINDOW_MS
        })).toMatchObject({source: 'failed-run-retry'});
    });
});

test.describe('orchestrator/scheduling/backup — retry phase reporting (#16348 AC5)', () => {
    test('reports healthy when there is no open streak and the lane has succeeded', () => {
        expect(describeBackupRetryState({
            ...retryOpts(),
            now      : T + 5000,
            taskState: {failureStreakStartedAt: null, lastSuccessAt: iso(T)}
        }).phase).toBe(BACKUP_RETRY_PHASE.healthy);
    });

    test('reports unanchored for a lane that has neither succeeded nor opened a streak', () => {
        expect(describeBackupRetryState({...retryOpts(), now: T, taskState: {}}).phase)
            .toBe(BACKUP_RETRY_PHASE.unanchored);
    });

    /**
     * The restart specimen. A crash mid-backup records no terminal outcome; `readState()` normalizes
     * it fail-closed by opening a streak and stamping `interruptedAt`. Before that, the lane read as
     * `healthy` — and the orchestrator crash-loop is the incident class the parent ticket was filed
     * from, so reporting it as healthy was the worst available answer.
     */
    test('an interrupted run reports retrying with its interruption marker, never healthy', () => {
        const state = describeBackupRetryState({
            ...retryOpts(),
            now      : T + DAY_MS + 2000,
            taskState: {
                failureStreakStartedAt: iso(T + DAY_MS + 1000),
                interruptedAt         : iso(T + DAY_MS + 1000),
                lastErrorAt           : iso(T + DAY_MS + 1000),
                lastRunAt             : T + DAY_MS,
                lastSuccessAt         : iso(T)
            }
        });

        expect(state.phase).toBe(BACKUP_RETRY_PHASE.retrying);
        expect(state.phase).not.toBe(BACKUP_RETRY_PHASE.healthy);
        expect(state.interruptedAt).toBe(iso(T + DAY_MS + 1000));
    });

    test('reports exhausted once the window has closed, with no retries remaining', () => {
        const state = describeBackupRetryState({
            ...retryOpts(),
            intervalMs: DAY_MS,
            now       : T + DAY_MS + 1000 + WINDOW_MS + 1,
            taskState : productionFailure()
        });

        expect(state.phase).toBe(BACKUP_RETRY_PHASE.exhausted);
        expect(state.retriesRemaining).toBe(0);
        expect(state.nextAttemptAtMs).toBe(T + DAY_MS * 2);
        expect(state.lastSuccessAt).toBe(iso(T));
        expect(state.lastSuccessAgeMs).toBe(DAY_MS + 1000 + WINDOW_MS + 1);
    });

    test('#17068: exhaustion exposes the existing periodic fallback and becomes due at that cadence', () => {
        const
            lastRunAt   = T + DAY_MS,
            state       = productionFailure({lastRunAt}),
            exhaustedAt = Date.parse(state.failureStreakStartedAt) + WINDOW_MS + 1,
            retry       = describeBackupRetryState({
                ...retryOpts(), intervalMs: DAY_MS, now: exhaustedAt, taskState: state
            });

        expect(retry.phase).toBe(BACKUP_RETRY_PHASE.exhausted);
        expect(retry.nextAttemptAtMs).toBe(lastRunAt + DAY_MS);
        expect(getDueTask({
            state              : {backup: state},
            now                : retry.nextAttemptAtMs,
            backupIntervalMs   : DAY_MS,
            backupRetryDelayMs : DELAY_MS,
            backupRetryWindowMs: WINDOW_MS
        })).toMatchObject({source: 'periodic-sweep'});
    });

    /**
     * `retriesRemaining` must describe actual future firings. The previous
     * `floor((windowEnd - now) / delay)` ignored `lastRunAt`, so a lane whose retry was already due
     * under-reported by one — and my own probe missed it by sampling MID-delay, the single offset
     * where the wrong formula happens to agree. Every offset is swept here for that reason.
     */
    test('retriesRemaining equals the firings that actually occur, at every offset in the delay', () => {
        const streakAt = T + DAY_MS + 1000;

        for (const offsetMs of [0, DELAY_MS / 4, DELAY_MS / 2, DELAY_MS, DELAY_MS * 2]) {
            const now       = streakAt + offsetMs,
                  taskState = productionFailure(),
                  reported  = describeBackupRetryState({...retryOpts(), now, taskState}).retriesRemaining,
                  actual    = countActualFirings({
                      taskState, from: now, until: streakAt + WINDOW_MS * 3, stepMs: 1000
                  });

            expect(reported, `offset ${offsetMs}ms into the window`).toBe(actual)
        }
    });

    test('countRemainingRetries is zero once either retry value is disabled', () => {
        const args = {now: T, lastRunAt: T, streakStartedAtMs: T};

        expect(countRemainingRetries({...args, retryDelayMs: 0, retryWindowMs: WINDOW_MS})).toBe(0);
        expect(countRemainingRetries({...args, retryDelayMs: DELAY_MS, retryWindowMs: 0})).toBe(0);
        expect(countRemainingRetries({...args, ...retryOpts()})).toBeGreaterThan(0);
    });

    test('an unparseable persisted timestamp degrades to unanchored, never to a stray epoch', () => {
        expect(describeBackupRetryState({
            ...retryOpts(),
            now      : T,
            taskState: {failureStreakStartedAt: 'not-a-date', lastSuccessAt: 'not-a-date'}
        }).phase).toBe(BACKUP_RETRY_PHASE.unanchored);
    });
});

test.describe('orchestrator/scheduling/backup — maintenance health (#17068)', () => {
    test('degrades with bounded reason codes for the observed failed/exhausted/unmet shape', () => {
        const health = describeBackupMaintenanceHealth({
            backupIntervalMs: DAY_MS,
            durability      : {posture: 'unmet'},
            lastBackup      : {backup: {status: 'failed'}},
            retryState      : {
                phase           : BACKUP_RETRY_PHASE.exhausted,
                lastSuccessAgeMs: DAY_MS + WINDOW_MS + 1,
                lastSuccessAt   : iso(T)
            },
            retryWindowMs: WINDOW_MS
        });

        expect(health).toEqual({
            observationStatus: 'observed',
            reasonCodes      : [
                'off-host-durability-unmet',
                'backup-retry-exhausted',
                'backup-last-run-failed',
                'backup-success-overdue'
            ],
            staleAfterMs: DAY_MS + WINDOW_MS,
            status      : 'degraded'
        });
    });

    test('reports pending before a first receipt and healthy after a fresh successful run', () => {
        expect(describeBackupMaintenanceHealth({durability: {posture: 'configured'}}).status).toBe('pending');
        expect(describeBackupMaintenanceHealth({
            backupIntervalMs: DAY_MS,
            durability      : {posture: 'configured'},
            lastBackup      : {backup: {status: 'success'}},
            retryState      : {
                phase           : BACKUP_RETRY_PHASE.healthy,
                lastSuccessAgeMs: 1000,
                lastSuccessAt   : iso(T)
            },
            retryWindowMs: WINDOW_MS
        })).toEqual({
            observationStatus: 'observed',
            reasonCodes      : [],
            staleAfterMs     : DAY_MS + WINDOW_MS,
            status           : 'healthy'
        });
    });

    // The affected plane, field for field: `status: healthy`, `reasonCodes: []`, `staleAfterMs:
    // 90000000` — reproduced from the shipped 24h/1h defaults, not from convenient numbers. The
    // receipt is what makes the absent retry state a failure to OBSERVE rather than an absence.
    test('an unread retry state cannot report healthy, and names itself', () => {
        expect(describeBackupMaintenanceHealth({
            backupIntervalMs: DAY_MS,
            durability      : {posture: 'configured'},
            lastBackup      : {backup: {status: 'success'}, status: 'ok'},
            retryState      : null,
            retryWindowMs   : WINDOW_MS
        })).toEqual({
            observationStatus: 'partial',
            reasonCodes      : ['backup-retry-state-unobserved'],
            staleAfterMs     : DAY_MS + WINDOW_MS,
            status           : 'degraded'
        });
    });

    // CONTROL. Without a receipt the same absent retry state is equally consistent with "nothing
    // has run here yet", and `pending` already says so. Degrading it would warn on every first
    // boot, which is the signal-destroying half of the fix rather than the fix.
    test('a first boot stays pending, and reports its coverage rather than a verdict', () => {
        expect(describeBackupMaintenanceHealth({
            backupIntervalMs: DAY_MS,
            durability      : {posture: 'configured'},
            lastBackup      : null,
            retryState      : null,
            retryWindowMs   : WINDOW_MS
        })).toEqual({
            observationStatus: 'partial',
            reasonCodes      : [],
            staleAfterMs     : DAY_MS + WINDOW_MS,
            status           : 'pending'
        });
    });

    // The invariant, not one of its instances: whatever else is in hand, an unread run-dependent
    // input never buys a positive claim. Two routes enforce it — a receipt pushes a reason code, no
    // receipt lands on the pending arm — so a change that removes either one is caught here.
    test('partial coverage never reaches healthy, across every other input', () => {
        const cases = [];

        for (const lastBackup of [null, {backup: {status: 'success'}, status: 'ok'}, {status: 'unreadable'}]) {
            for (const durability of [{}, {posture: 'configured'}, {posture: 'unmet'}, {configErrorCode: 'E'}]) {
                const health = describeBackupMaintenanceHealth({
                    backupIntervalMs: DAY_MS,
                    durability,
                    lastBackup,
                    retryState      : null,
                    retryWindowMs   : WINDOW_MS
                });

                cases.push(health.status);
                expect(health.observationStatus).toBe('partial');
            }
        }

        expect(cases).toHaveLength(12);
        expect(cases).not.toContain('healthy');
    });
});

// Binding only the positive direction — never `healthy` from an unread input — leaves a scorer free
// to emit the opposite unfounded verdict from that same input, and a definite negative is the more
// expensive half: it reads as a finding and gets acted on. These arms bind the negative direction
// without unbinding the positive one, and the reconciliation they cover is between two records of
// one lane that ride the same snapshot — the receipt the lane writes, and the retry ledger derived
// from task state.
test.describe('orchestrator/scheduling/backup — receipt/retry reconciliation (#17785)', () => {
    const
        STREAK_AT = T,
        // The shape measured on pin 467fd122f3: streak open, no ledger success, receipt 21 days newer.
        conflicted = (overrides = {}) => describeBackupMaintenanceHealth({
            backupIntervalMs: DAY_MS,
            durability      : {posture: 'configured'},
            lastBackup      : {backup: {status: 'success'}, finishedAt: iso(STREAK_AT + 21 * DAY_MS), status: 'ok'},
            retryState      : {
                phase            : BACKUP_RETRY_PHASE.exhausted,
                lastSuccessAgeMs : null,
                lastSuccessAt    : null,
                streakStartedAtMs: STREAK_AT
            },
            retryWindowMs: WINDOW_MS,
            ...overrides
        });

    // AC-3 (i). Reddens if the reconciliation is removed: the scorer falls back to the ledger alone
    // and `backup-never-succeeded` returns — the exact string that cost four maintainers an evening.
    test('a success receipt newer than the streak yields a conflict, never a fabricated negative', () => {
        expect(conflicted()).toEqual({
            observationStatus: 'observed',
            reasonCodes      : ['backup-retry-exhausted', 'backup-state-conflict'],
            staleAfterMs     : DAY_MS + WINDOW_MS,
            status           : 'degraded'
        });
    });

    // AC-3 (ii). The first direction stays bound. Reddens if the reconciliation is widened to
    // suppress the negative whenever a receipt is merely PRESENT: here there is none, the lane
    // genuinely has no recorded success, and the definite negative is the honest answer.
    test('a genuinely receipt-less exhausted lane still reports backup-never-succeeded', () => {
        expect(conflicted({lastBackup: null}).reasonCodes).toEqual([
            'backup-retry-exhausted',
            'backup-never-succeeded'
        ]);
    });

    // The receipt's AGE decides nothing, and this arm is where that is enforced. `markFailed()`
    // advances the streak and leaves `lastSuccessAt` standing, so a lane that genuinely succeeded
    // and then began failing never reaches this branch at all — it has a recorded success. Reaching
    // it with a success receipt of ANY age therefore means the two records disagree about whole-lane
    // history, and the whole-history negative is falsified either way. Reddens any implementation
    // that reintroduces a recency comparison to decide between the two codes.
    test('a success receipt older than the streak yields the same conflict, not the negative', () => {
        expect(conflicted({
            lastBackup: {backup: {status: 'success'}, finishedAt: iso(STREAK_AT - DAY_MS), status: 'ok'}
        }).reasonCodes).toEqual(['backup-retry-exhausted', 'backup-state-conflict']);
    });

    // CONTROL, and the discriminator the reconciliation actually turns on: the receipt's STATUS. A
    // failed receipt proves a run happened, never that one succeeded, so the negative must survive
    // it. Reddens any implementation that reads a receipt's mere presence as proof of success —
    // which is the shape a recency test collapses into once the timestamps stop being consulted.
    test('a failed receipt does not suppress the negative', () => {
        expect(conflicted({
            lastBackup: {backup: {status: 'failed'}, finishedAt: iso(STREAK_AT + DAY_MS), status: 'ok'}
        }).reasonCodes).toEqual([
            'backup-retry-exhausted',
            'backup-last-run-failed',
            'backup-never-succeeded'
        ]);
    });

    // AC-3 (iii). The conflict must not launder an unrelated true negative. Reddens if the
    // reconciliation is placed so that it returns early or clears previously pushed codes.
    test('off-host-durability-unmet survives the conflict verdict', () => {
        expect(conflicted({durability: {posture: 'unmet'}}).reasonCodes).toEqual([
            'off-host-durability-unmet',
            'backup-retry-exhausted',
            'backup-state-conflict'
        ]);
    });

    // The divergence is a defect in its own right and must stay visible: reporting the disagreement
    // is not the same as resolving it in the receipt's favour and going quiet.
    test('a conflicted lane never reads healthy', () => {
        expect(conflicted().status).toBe('degraded');
        expect(conflicted({durability: {posture: 'unmet'}}).status).toBe('degraded');
    });
});
