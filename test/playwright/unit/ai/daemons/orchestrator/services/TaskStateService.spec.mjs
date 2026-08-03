import {test, expect}                               from '@playwright/test';
import fs                                           from 'fs-extra';
import path                                         from 'path';
import Neo                                          from '../../../../../../../src/Neo.mjs';
import * as core                                    from '../../../../../../../src/core/_export.mjs';
import { TaskStateService, createInitialTaskState } from '../../../../../../../ai/daemons/orchestrator/services/TaskStateService.mjs';

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

        // Test markSpawnFailed
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
});
