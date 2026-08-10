import {test, expect}                               from '@playwright/test';
import fs                                           from 'fs-extra';
import path                                         from 'path';
import Neo                                          from '../../../../../../../src/Neo.mjs';
import * as core                                    from '../../../../../../../src/core/_export.mjs';
import { ProcessSupervisorService }                 from '../../../../../../../ai/daemons/orchestrator/services/ProcessSupervisorService.mjs';
import { TaskStateService, createInitialTaskState } from '../../../../../../../ai/daemons/orchestrator/services/TaskStateService.mjs';
import {
    BACKUP_RETRY_PHASE,
    describeBackupRetryState,
    getDueTask
} from '../../../../../../../ai/daemons/orchestrator/scheduling/backup.mjs';

const
    // SHIPPED defaults, matching backup.spec.mjs. Locally convenient constants are what let the
    // original revision pass 21 specs while no-opping at the real 24h/1h ratio.
    DAY_MS    = 86400000,
    DELAY_MS  = 15 * 60 * 1000,
    WINDOW_MS = 60 * 60 * 1000;

function createTestService() {
    const dataDir = `/tmp/task-state-service-test-${Date.now()}-${Math.random()}`;
    fs.ensureDirSync(dataDir);

    const stateFile       = path.join(dataDir, 'state.json');
    const taskDefinitions = {
        mockTask: {
            name      : 'mockTask',
            scriptPath: '/mock/script.mjs'
        }
    };

    const service = Neo.create(TaskStateService, {
        stateFile,
        taskDefinitions,
        writeLogFn: () => {}
    });

    service.configure({
        stateFile,
        taskDefinitions,
        writeLogFn: () => {}
    });

    return { service, stateFile };
}

test.describe('Neo.ai.daemons.services.TaskStateService', () => {
    test('initializes with default state when no file exists', () => {
        const { service } = createTestService();
        const state       = service.getTaskState('mockTask');

        expect(state).toMatchObject({
            running       : false,
            pid           : null,
            lastRunAt     : 0,
            lastSuccessAt : null,
            lastErrorAt   : null,
            lastExitCode  : null,
            lastReason    : null,
            lastCompletion: null
        });
    });

    test('state transitions trigger file writes correctly', () => {
        const { service, stateFile } = createTestService();

        // Test markStarted
        service.markStarted('mockTask', 'test-run');
        let stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        expect(stateData.mockTask.running).toBe(true);
        expect(stateData.mockTask.lastReason).toBe('test-run');

        // Test markSpawned
        service.markSpawned('mockTask', 1234);
        stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        expect(stateData.mockTask.pid).toBe(1234);
        expect(service.getTaskState('mockTask').pid).toBe(1234);

        // Test markCompleted
        service.markCompleted('mockTask');
        stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        expect(stateData.mockTask.running).toBe(false);
        expect(stateData.mockTask.pid).toBe(null);
        expect(stateData.mockTask.lastExitCode).toBe(0);
        expect(stateData.mockTask.lastSuccessAt).toEqual(expect.any(String));

        // Test markStarted again
        service.markStarted('mockTask', 'retry');

        // Test markFailed
        service.markFailed('mockTask', 1);
        stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        expect(stateData.mockTask.running).toBe(false);
        expect(stateData.mockTask.pid).toBe(null);
        expect(stateData.mockTask.lastExitCode).toBe(1);
        expect(stateData.mockTask.lastErrorAt).toEqual(expect.any(String));

        // Test markSpawnFailed. NOTE: this walk reaches markSpawnFailed only AFTER the markFailed
        // above has already opened the streak, so it cannot serve as streak coverage for this
        // writer — a `failureStreakStartedAt` assertion here passes either way. The clean specimen
        // is the known-good-lane test below, which reaches this writer after a SUCCESS instead.
        service.markStarted('mockTask', 'fail-spawn');
        service.markSpawnFailed('mockTask');
        stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        expect(stateData.mockTask.running).toBe(false);
        expect(stateData.mockTask.pid).toBe(null);
        expect(stateData.mockTask.lastErrorAt).toEqual(expect.any(String));
    });

    test('markSkipped clears running state without recording a new success (#13767)', () => {
        const { service, stateFile } = createTestService();

        service.markStarted('mockTask', 'successful-run');
        service.markCompleted('mockTask');

        const previousStateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        const previousSuccessAt = previousStateData.mockTask.lastSuccessAt;

        service.markStarted('mockTask', 'deferred-run');
        service.markSkipped('mockTask');

        const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

        expect(stateData.mockTask.running).toBe(false);
        expect(stateData.mockTask.pid).toBe(null);
        expect(stateData.mockTask.lastExitCode).toBe(null);
        expect(stateData.mockTask.lastReason).toBe('deferred-run');
        expect(stateData.mockTask.lastSuccessAt).toBe(previousSuccessAt);
    });

    test('completion metadata is persisted and cleared by non-completed endings (#13971)', () => {
        const { service, stateFile } = createTestService();
        const completion             = {
            rem: {
                sessionsProcessed: 10,
                batchLimit       : 10,
                batchSaturated   : true
            }
        };

        service.markCompleted('mockTask', completion);
        let stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        expect(stateData.mockTask.lastCompletion).toEqual(completion);

        service.markSkipped('mockTask');
        stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        expect(stateData.mockTask.lastCompletion).toBeNull();

        service.markCompleted('mockTask', completion);
        service.markFailed('mockTask', 1);
        stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        expect(stateData.mockTask.lastCompletion).toBeNull();

        const skippedCompletion = {status: 'skipped', reason: 'no-config'};
        service.markSkipped('mockTask', skippedCompletion);
        stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        expect(stateData.mockTask.lastCompletion).toEqual(skippedCompletion);

        const failedCompletion = {status: 'failed', reasonCode: 'TEST_FAILURE'};
        service.markFailed('mockTask', 1, failedCompletion);
        stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        expect(stateData.mockTask.lastCompletion).toEqual(failedCompletion);
    });

    test('adoptRunning sets state without immediately writing to disk', () => {
        const { service, stateFile } = createTestService();

        service.adoptRunning('mockTask', 5678);
        const state = service.getTaskState('mockTask');

        expect(state.running).toBe(true);
        expect(state.pid).toBe(5678);

        // state file should not be updated yet
        expect(fs.existsSync(stateFile)).toBe(false);
    });

    test('clearRecovered correctly clears and writes state if PID matches', () => {
        const { service, stateFile } = createTestService();

        service.adoptRunning('mockTask', 5678);

        // Trying to clear with wrong PID should return false and not change running state
        expect(service.clearRecovered('mockTask', 9999)).toBe(false);
        expect(service.getTaskState('mockTask').running).toBe(true);

        // Correct PID should clear state and write to disk
        expect(service.clearRecovered('mockTask', 5678)).toBe(true);
        const state = service.getTaskState('mockTask');
        expect(state.running).toBe(false);
        expect(state.pid).toBe(null);
        expect(state.lastExitCode).toBe(null);

        const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        expect(stateData.mockTask.running).toBe(false);
    });

    /**
     * The failure-streak anchor. `??=` is the whole contract: the streak opens at the FIRST failure
     * after a success and must not move when later attempts also fail. A retry budget measured from
     * `lastErrorAt` — which advances every attempt — would never close, and on a lane that wins its
     * scheduling pick unconditionally that is a lease monopoly rather than a cosmetic bug.
     */
    test('failureStreakStartedAt opens at the first failure and never slides (#16348)', async () => {
        const {service, stateFile} = createTestService();

        service.markFailed('mockTask', 1);
        const opened = service.getTaskState('mockTask').failureStreakStartedAt;
        expect(opened).toBeTruthy();

        await new Promise(resolve => setTimeout(resolve, 5));
        service.markFailed('mockTask', 1);

        const after = service.getTaskState('mockTask');
        expect(after.failureStreakStartedAt).toBe(opened);
        // The control that makes the assertion above meaningful: something DID advance, so a stale
        // anchor is being preserved deliberately rather than nothing having happened at all.
        expect(after.lastErrorAt).not.toBe(opened);

        expect(JSON.parse(fs.readFileSync(stateFile, 'utf8')).mockTask.failureStreakStartedAt).toBe(opened);
    });

    test('deferralStreakStartedAt opens at the first deferral and never slides (#16561)', async () => {
        // The mirror of the failure-streak contract, for the condition that lane never covers: a task
        // repeatedly DEFERRED records no failure, so `failureStreakStartedAt` stays null and every sweep
        // reads healthy while the task never runs.
        const {service, stateFile} = createTestService();

        const opened = service.markDeferred('mockTask');
        expect(opened).toBeTruthy();

        await new Promise(resolve => setTimeout(resolve, 5));

        const later = new Date().toISOString();
        expect(later).not.toBe(opened);   // the control: time DID advance between the two deferrals

        expect(service.markDeferred('mockTask', later)).toBe(opened);
        expect(service.getTaskState('mockTask').deferralStreakStartedAt).toBe(opened);

        // Durable, because the question outlives the process that measured it.
        expect(JSON.parse(fs.readFileSync(stateFile, 'utf8')).mockTask.deferralStreakStartedAt).toBe(opened);
    });

    test('the deferral streak SURVIVES a restart — which is the whole reason it is durable (#16561)', () => {
        // An in-memory streak map resets when the daemon restarts, so a starvation spanning a restart
        // reported a FRESH streak — and a threshold measured from a value that resets can never be
        // crossed. This is the property that makes the measurement worth having.
        const {service, stateFile} = createTestService();
        const opened               = service.markDeferred('mockTask');

        const reborn = Neo.create(TaskStateService, {
            stateFile,
            taskDefinitions: {mockTask: {name: 'mockTask', scriptPath: '/mock/script.mjs'}},
            writeLogFn     : () => {}
        });

        reborn.configure({
            stateFile,
            taskDefinitions: {mockTask: {name: 'mockTask', scriptPath: '/mock/script.mjs'}},
            writeLogFn     : () => {}
        });

        expect(reborn.readState().mockTask.deferralStreakStartedAt).toBe(opened);
    });

    test('a LEGACY state file with no deferral field reads null, not undefined (#16561)', () => {
        // The migration path, asserted rather than assumed: every persisted state file written before
        // this field existed lacks the key. `readState` spreads the fallback FIRST and the persisted data
        // over it, so the initial-envelope `null` survives for a key the file does not carry. Reversing
        // that spread order would yield `undefined`, and `undefined` is the value a threshold comparison
        // silently mishandles — `undefined > x` is false, so a legacy repo would read as never-deferred
        // rather than as unmeasured.
        const {service, stateFile} = createTestService();

        fs.writeJsonSync(stateFile, {
            mockTask: {
                running       : false,
                pid           : null,
                lastRunAt     : 0,
                lastSuccessAt : null,
                lastErrorAt   : null,
                lastExitCode  : null,
                lastReason    : null,
                lastCompletion: null
            }
        });

        const migrated = service.readState().mockTask;

        expect(migrated.deferralStreakStartedAt).toBeNull();
        expect('deferralStreakStartedAt' in migrated).toBe(true);
        // ...and the field is writable from that state, so a legacy task is not stuck unmeasurable.
        expect(service.markDeferred('mockTask')).toBeTruthy();
    });

    test('NEGATIVE DIRECTION — a task that RUNS reports no deferral streak (#16561)', () => {
        // The other half of the both-directions requirement. Without it, an implementation that never
        // clears the streak passes the assertions above and reports every task as starved forever — an
        // always-alarm is as useless as no alarm, and harder to notice because it looks like coverage.
        const {service} = createTestService();

        service.markDeferred('mockTask');
        expect(service.getTaskState('mockTask').deferralStreakStartedAt).toBeTruthy();

        service.markStarted('mockTask', 'periodic');
        expect(service.getTaskState('mockTask').deferralStreakStartedAt).toBeNull();

        // ...and a deferral AFTER a run opens a fresh streak rather than resurrecting the old one.
        const reopened = service.markDeferred('mockTask');
        expect(reopened).toBeTruthy();
    });

    test('a success closes the streak and clears the interruption marker (#16348)', () => {
        const {service} = createTestService();

        service.markFailed('mockTask', 1);
        expect(service.getTaskState('mockTask').failureStreakStartedAt).toBeTruthy();

        service.markCompleted('mockTask');
        expect(service.getTaskState('mockTask').failureStreakStartedAt).toBeNull();
        expect(service.getTaskState('mockTask').interruptedAt).toBeNull();
    });

    /**
     * The restart specimen. A process that dies mid-task never reaches `markFailed`, so the persisted
     * state keeps `running: true` and carries NO terminal outcome. `readState()` used to clear the
     * flag silently, which projected that run as neither failed nor successful — and every consumer
     * asking "any error since the last success?" then read it as healthy. Normalize fail-closed.
     */
    test('readState normalizes an interrupted run fail-closed rather than silently (#16348)', () => {
        const {service, stateFile} = createTestService(),
              taskDefinitions      = service.taskDefinitions;

        // Persist the crash shape directly: running, with a prior success and no terminal outcome.
        const crashed = createInitialTaskState(taskDefinitions);
        crashed.mockTask.running       = true;
        crashed.mockTask.pid           = 4242;
        crashed.mockTask.lastRunAt     = 1700000000000;
        crashed.mockTask.lastSuccessAt = new Date(1699999000000).toISOString();
        fs.writeFileSync(stateFile, JSON.stringify(crashed), 'utf8');

        const recovered = service.readState().mockTask;

        expect(recovered.running).toBe(false);
        expect(recovered.pid).toBeNull();
        // The load-bearing half — an interrupted run is NOT a success, and it opens a streak so the
        // bounded retry policy can see it at all.
        expect(recovered.interruptedAt).toBeTruthy();
        expect(recovered.lastErrorAt).toBe(recovered.interruptedAt);
        expect(recovered.failureStreakStartedAt).toBe(recovered.interruptedAt);
    });

    test('readState leaves a cleanly-stopped task untouched (#16348)', () => {
        const {service, stateFile} = createTestService(),
              taskDefinitions      = service.taskDefinitions;

        const clean = createInitialTaskState(taskDefinitions);
        clean.mockTask.running       = false;
        clean.mockTask.lastSuccessAt = new Date(1699999000000).toISOString();
        fs.writeFileSync(stateFile, JSON.stringify(clean), 'utf8');

        const recovered = service.readState().mockTask;

        // Positive control for the test above: normalization fires on `running: true` specifically,
        // not on every boot — otherwise the interrupted assertion would pass for the wrong reason.
        expect(recovered.interruptedAt).toBeNull();
        expect(recovered.failureStreakStartedAt).toBeNull();
        expect(recovered.lastErrorAt).toBeNull();
    });

    /**
     * The clean spawn-failure specimen. `state transitions trigger file writes correctly` above also
     * reaches `markSpawnFailed`, but only AFTER a `markFailed` that already opened the anchor — so it
     * passes whether or not this writer opens one, and cannot serve as streak coverage. Here the lane
     * is deliberately known-good first: the specimen is NEGATIVE on the axis the assertion reads.
     */
    test('markSpawnFailed opens the streak on a known-good lane (#16348)', async () => {
        const {service, stateFile} = createTestService();

        service.markStarted('mockTask', 'successful-run');
        service.markCompleted('mockTask');
        expect(service.getTaskState('mockTask').failureStreakStartedAt).toBeNull();

        service.markStarted('mockTask', 'spawn-throws');
        service.markSpawnFailed('mockTask');

        const opened = service.getTaskState('mockTask').failureStreakStartedAt;

        // A failed START is a failed cycle. Leaving it unanchored is not a cosmetic reporting gap:
        // the scheduler treats `failureStreakStartedAt` as the SOLE activation fact, so an
        // unanchored failure forfeits the entire retry budget and waits a full interval.
        expect(opened).toBeTruthy();
        expect(opened).toBe(service.getTaskState('mockTask').lastErrorAt);
        expect(JSON.parse(fs.readFileSync(stateFile, 'utf8')).mockTask.failureStreakStartedAt).toBe(opened);

        // ...and it must not slide on the next failed start either, from EITHER failure writer.
        await new Promise(resolve => setTimeout(resolve, 10));
        service.markStarted('mockTask', 'spawn-throws-again');
        service.markSpawnFailed('mockTask');
        expect(service.getTaskState('mockTask').failureStreakStartedAt).toBe(opened);

        await new Promise(resolve => setTimeout(resolve, 10));
        service.markFailed('mockTask', 1);
        const after = service.getTaskState('mockTask');
        expect(after.failureStreakStartedAt).toBe(opened);
        // Control: the clock did move, so the equalities above are preservation, not a frozen clock.
        expect(after.lastErrorAt).not.toBe(opened);
    });

    /**
     * The production-writer witness. Drives the REAL `ProcessSupervisorService.runTask()` against the
     * REAL `TaskStateService` with a `spawnFn` that throws synchronously — the exact path at
     * `ProcessSupervisorService.mjs:600-605`, where the catch block's only task-state write is
     * `markSpawnFailed()`. No reconstructed state object: the scheduler reads what the supervisor
     * actually persisted.
     */
    test('a synchronous spawn failure leaves the lane retry-due, not healthy (#16348)', () => {
        const dataDir = `/tmp/task-state-spawn-fail-${Date.now()}-${Math.random()}`;
        fs.ensureDirSync(dataDir);

        const stateFile       = path.join(dataDir, 'state.json'),
              taskDefinitions = {
                  backup: {
                      label          : 'agent OS backup',
                      command        : 'node',
                      args           : ['backup.mjs'],
                      pidFileName    : 'backup.pid',
                      expectedCommand: 'backup.mjs'
                  }
              },
              service         = Neo.create(TaskStateService, {stateFile, taskDefinitions, writeLogFn: () => {}});

        service.configure({stateFile, taskDefinitions, writeLogFn: () => {}});

        // The lane succeeded a full interval ago, then the periodic sweep fired and the spawn threw.
        service.markCompleted('backup');

        const supervisor = Neo.create(ProcessSupervisorService, {
            dataDir,
            taskDefinitions,
            taskStateService: service,
            healthService   : {recordTaskOutcome: () => {}},
            writeLog        : () => {},
            spawnFn         : () => {throw new Error('EACCES: spawn node backup.mjs');},
            processCommand  : () => ''
        });

        expect(supervisor.runTask('backup', `periodic-sweep:${DAY_MS}`)).toBe(false);

        const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8')),
              now       = Date.now() + DELAY_MS,
              trigger   = getDueTask({
                  state              : persisted,
                  now,
                  backupIntervalMs   : DAY_MS,
                  backupRetryDelayMs : DELAY_MS,
                  backupRetryWindowMs: WINDOW_MS
              }),
              phase     = describeBackupRetryState({
                  taskState    : persisted.backup,
                  now,
                  retryDelayMs : DELAY_MS,
                  retryWindowMs: WINDOW_MS
              });

        expect(trigger).toMatchObject({taskName: 'backup', source: 'failed-run-retry'});
        expect(phase.phase).toBe(BACKUP_RETRY_PHASE.retrying);
        expect(phase.retriesRemaining).toBeGreaterThan(0);
    });

    /**
     * The restart-durability witness. The prior restart spec asserted a single IN-MEMORY `readState()`
     * return, which is green whether or not the normalization ever reaches disk — so it could not see
     * that the crashed record stays `running: true` on disk with no streak.
     */
    test('the interrupted-run anchor is persisted, so a second restart cannot slide it (#16348)', async () => {
        const dataDir = `/tmp/task-state-restart-${Date.now()}-${Math.random()}`;
        fs.ensureDirSync(dataDir);

        const stateFile       = path.join(dataDir, 'state.json'),
              taskDefinitions = {backup: {name: 'backup', scriptPath: '/mock/backup.mjs'}},
              boot            = () => {
                  const instance = Neo.create(TaskStateService, {stateFile, taskDefinitions, writeLogFn: () => {}});
                  instance.configure({stateFile, taskDefinitions, writeLogFn: () => {}});
                  return instance;
              };

        const crashed = createInitialTaskState(taskDefinitions);
        crashed.backup.running       = true;
        crashed.backup.pid           = 4242;
        crashed.backup.lastRunAt     = Date.now();
        crashed.backup.lastSuccessAt = new Date(Date.now() - DAY_MS).toISOString();
        fs.writeFileSync(stateFile, JSON.stringify(crashed), 'utf8');

        const first          = boot(),
              afterFirstBoot = JSON.parse(fs.readFileSync(stateFile, 'utf8')).backup;

        // The normalization must reach DISK. Held only in memory, the next boot re-reads the same
        // unchanged `running: true` bytes and derives a FRESH anchor — so the "bounded" window slides
        // forward once per crash and a crash loop never exhausts its budget.
        expect(afterFirstBoot.running).toBe(false);
        expect(afterFirstBoot.pid).toBeNull();
        expect(afterFirstBoot.failureStreakStartedAt).toBeTruthy();
        expect(afterFirstBoot.failureStreakStartedAt).toBe(first.getTaskState('backup').failureStreakStartedAt);

        await new Promise(resolve => setTimeout(resolve, 10));

        const second = boot();

        // Control: 10ms of wall clock passed between boots, so a re-derived anchor would differ.
        // Equality is preservation, not a clock that failed to move.
        expect(second.getTaskState('backup').failureStreakStartedAt).toBe(afterFirstBoot.failureStreakStartedAt);
        expect(JSON.parse(fs.readFileSync(stateFile, 'utf8')).backup.failureStreakStartedAt)
            .toBe(afterFirstBoot.failureStreakStartedAt);

        // The consequence in the units the contract is written in: the budget ENDS at the same
        // instant after the second restart as it did after the first.
        const windowEnd = instance => describeBackupRetryState({
            taskState    : instance.getTaskState('backup'),
            now          : Date.now(),
            retryDelayMs : DELAY_MS,
            retryWindowMs: WINDOW_MS
        }).windowEndsAtMs;

        expect(windowEnd(second)).toBe(windowEnd(first));
    });
});
