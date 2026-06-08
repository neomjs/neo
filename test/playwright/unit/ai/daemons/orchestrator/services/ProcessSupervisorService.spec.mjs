import {test, expect} from '@playwright/test';
import fs from 'fs-extra';
import path from 'path';
import Neo from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';
import { ProcessSupervisorService } from '../../../../../../../ai/daemons/orchestrator/services/ProcessSupervisorService.mjs';

function createTestService() {
    const dataDir = `/tmp/process-supervisor-service-test-${Date.now()}-${Math.random()}`;
    fs.ensureDirSync(dataDir);
    const logEntries = [];
    const taskOutcomes = [];

    const taskDefinitions = {
        mockTask: {
            label: 'Mock Task',
            command: 'echo',
            args: ['hello'],
            pidFileName: 'mockTask.pid',
            expectedCommand: 'echo'
        }
    };

    const mockTaskStateService = {
        getTaskState: (name) => ({ running: false, pid: null }),
        markStarted: () => {},
        markSpawnFailed: () => {},
        markSpawned: () => {},
        markFailed: () => {},
        markCompleted: () => {},
        markReady: () => {},
        clearRecovered: () => true,
        adoptRunning: () => {}
    };

    const mockHealthService = {
        recordTaskOutcome: (taskName, status, details) => taskOutcomes.push({details, status, taskName})
    };

    const service = Neo.create(ProcessSupervisorService, {
        dataDir,
        taskDefinitions,
        taskStateService: mockTaskStateService,
        healthService: mockHealthService,
        writeLog: (level, message) => logEntries.push({level, message}),
        spawnFn: () => ({ pid: 1234, on: () => {} }),
        processCommand: (pid) => 'echo hello'
    });

    return { service, dataDir, logEntries, mockTaskStateService, taskOutcomes };
}

test.describe('Neo.ai.daemons.services.ProcessSupervisorService', () => {
    test('getTaskPidFile returns correct path', () => {
        const { service, dataDir } = createTestService();
        const pidFile = service.getTaskPidFile('mockTask');

        expect(pidFile).toBe(path.join(dataDir, 'mockTask.pid'));
    });

    test('runTask spawns child and updates state', () => {
        const { service, mockTaskStateService } = createTestService();

        let spawnCalled = false;
        let markSpawnedCalled = false;

        service.spawnFn = () => {
            spawnCalled = true;
            return { pid: 9999, on: () => {} };
        };

        service.taskStateService.markSpawned = (name, pid) => {
            if (name === 'mockTask' && pid === 9999) {
                markSpawnedCalled = true;
            }
        };

        const result = service.runTask('mockTask', 'test-reason');

        expect(result).toBe(true);
        expect(spawnCalled).toBe(true);
        expect(markSpawnedCalled).toBe(true);
    });

    test('runTask watchdog kills a child that exceeds maxRuntimeMs and finalizes it as failed', async () => {
        const { service, taskOutcomes } = createTestService();
        let killed = false;

        service.taskDefinitions = {
            ...service.taskDefinitions,
            watchdogTask: {
                label          : 'Watchdog Task',
                command        : 'sleep',
                args           : ['999'],
                pidFileName    : 'watchdog.pid',
                expectedCommand: 'sleep',
                maxRuntimeMs   : 40
            }
        };

        // Fake child that never fires 'close' — simulates a hung child (e.g. a downstream call
        // with no timeout). The watchdog must kill it rather than let its running flag stick.
        service.spawnFn = () => ({pid: 4242, on: () => {}, kill: () => { killed = true; }, stderr: {on: () => {}}});

        const result = service.runTask('watchdogTask', 'watchdog-test');
        expect(result).toBe(true);

        await new Promise(resolve => setTimeout(resolve, 150));

        expect(killed).toBe(true);
        const failed = taskOutcomes.find(o => o.status === 'failed' && o.details?.phase === 'watchdog-timeout');
        expect(failed).toBeTruthy();
    });

    test('runTask does NOT arm a watchdog when maxRuntimeMs is unset (opt-in)', async () => {
        const { service } = createTestService();
        let killed = false;

        // mockTask has no maxRuntimeMs → no watchdog → a long-lived child is left alone.
        service.spawnFn = () => ({pid: 4243, on: () => {}, kill: () => { killed = true; }, stderr: {on: () => {}}});

        service.runTask('mockTask', 'no-watchdog-test');
        await new Promise(resolve => setTimeout(resolve, 80));

        expect(killed).toBe(false);
    });

    test('runTask skips if already running', () => {
        const { service, mockTaskStateService } = createTestService();

        service.taskStateService.getTaskState = () => ({ running: true, pid: 1234 });

        let spawnCalled = false;
        service.spawnFn = () => {
            spawnCalled = true;
            return { pid: 9999, on: () => {} };
        };

        const result = service.runTask('mockTask', 'test-reason');

        expect(result).toBe(false);
        expect(spawnCalled).toBe(false);
    });

    test('runTask classifies child stderr log prefixes', () => {
        const { service, logEntries } = createTestService();
        let stderrHandler;

        service.spawnFn = () => ({
            pid   : 9999,
            stderr: {
                on: (eventName, handler) => {
                    if (eventName === 'data') {
                        stderrHandler = handler;
                    }
                }
            },
            on: () => {}
        });

        service.runTask('mockTask', 'test-reason');

        stderrHandler(Buffer.from([
            '[LOG] Processed and embedded batch 83 of 237',
            '[INFO] Sync still running',
            '[WARN] Slow embedding batch',
            '[ERROR] Failed embedding batch',
            'plain stderr output'
        ].join('\n')));

        const stderrLogs = logEntries.filter(entry => entry.message.includes('stderr:'));

        expect(stderrLogs.map(entry => entry.level)).toEqual(['INFO', 'INFO', 'WARN', 'ERROR', 'ERROR']);
    });

    test('runTask dedupes repeated already-running skip logs', () => {
        const { service, logEntries, taskOutcomes } = createTestService();

        service.taskStateService.getTaskState = () => ({ running: true, pid: 1234 });

        service.runTask('mockTask', 'same-reason');
        service.runTask('mockTask', 'same-reason');
        service.runTask('mockTask', 'different-reason');

        const skipLogs = logEntries.filter(entry => entry.message.includes('task already running'));
        const skippedOutcomes = taskOutcomes.filter(entry => entry.status === 'skipped');

        expect(skipLogs.length).toBe(2);
        expect(skippedOutcomes.length).toBe(3);
    });

    test('runTask records ready state after a post-spawn hook succeeds', async () => {
        const { service, taskOutcomes } = createTestService();
        let readyMarked = false;

        service.taskDefinitions.mockTask.postSpawn = async () => ({models: ['chat', 'embedding']});
        service.taskStateService.markReady = taskName => {
            readyMarked = taskName === 'mockTask';
        };
        service.spawnFn = () => ({
            pid   : 9999,
            stderr: {on: () => {}},
            on    : () => {}
        });

        expect(service.runTask('mockTask', 'test-reason')).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(readyMarked).toBe(true);
        expect(taskOutcomes).toContainEqual(expect.objectContaining({
            status  : 'ready',
            taskName: 'mockTask',
            details : expect.objectContaining({
                readiness: {models: ['chat', 'embedding']}
            })
        }));
    });

    test('runTask records degraded state when a post-spawn hook returns partial readiness (#12264)', async () => {
        const { service, logEntries, taskOutcomes } = createTestService();
        let readyMarked = false;
        let closeHandler;

        service.taskDefinitions.mockTask.postSpawn = async () => ({
            ready        : false,
            degraded     : true,
            missingModels: ['chat-model']
        });
        service.taskStateService.markReady = () => {
            readyMarked = true;
        };
        service.spawnFn = () => ({
            pid   : 9999,
            stderr: {on: () => {}},
            on    : (eventName, handler) => {
                if (eventName === 'close') {
                    closeHandler = handler;
                }
            }
        });

        expect(service.runTask('mockTask', 'test-reason')).toBe(true);
        closeHandler(0);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(readyMarked).toBe(false);
        expect(logEntries).toContainEqual(expect.objectContaining({
            level  : 'WARN',
            message: expect.stringContaining('degraded readiness')
        }));
        expect(taskOutcomes).toContainEqual(expect.objectContaining({
            status  : 'degraded',
            taskName: 'mockTask',
            details : expect.objectContaining({
                readiness: expect.objectContaining({
                    ready        : false,
                    missingModels: ['chat-model']
                })
            })
        }));
        expect(taskOutcomes.filter(entry => entry.status === 'completed')).toEqual([]);
    });

    test('runTask fails and terminates the child when a post-spawn hook fails', async () => {
        const { service, taskOutcomes } = createTestService();
        let killed = false;
        let failed = false;

        service.taskDefinitions.mockTask.postSpawn = async () => {
            throw new Error('models missing');
        };
        service.taskStateService.markFailed = taskName => {
            failed = taskName === 'mockTask';
        };
        service.spawnFn = () => ({
            pid   : 9999,
            stderr: {on: () => {}},
            kill  : () => { killed = true; },
            on    : () => {}
        });

        expect(service.runTask('mockTask', 'test-reason')).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(killed).toBe(true);
        expect(failed).toBe(true);
        expect(taskOutcomes).toContainEqual(expect.objectContaining({
            status : 'failed',
            details: expect.objectContaining({
                phase: 'post-spawn-readiness',
                error: 'models missing'
            })
        }));
    });

    test('reapDuplicateListeners SIGKILLs extra listeners but keeps the canonical pid', () => {
        const { service, taskOutcomes } = createTestService();
        const killed = [];

        service.taskDefinitions.mockTask.singletonPort = 8000;
        service.taskStateService.getTaskState = () => ({running: true, pid: 100});
        service.listPortListeners = () => [100, 200, 300];
        service.processCommand    = () => 'echo serving';
        service.killProcess       = pid => killed.push(pid);

        const reaped = service.reapDuplicateListeners('mockTask');

        expect(reaped).toBe(2);
        expect(killed).toEqual([200, 300]);
        expect(taskOutcomes.filter(o => o.status === 'reaped-duplicate').length).toBe(2);
    });

    test('reapDuplicateListeners leaves a process whose command is not the task command', () => {
        const { service } = createTestService();
        const killed = [];

        service.taskDefinitions.mockTask.singletonPort = 8000;
        service.taskStateService.getTaskState = () => ({running: true, pid: 100});
        service.listPortListeners = () => [200];
        service.processCommand    = () => 'unrelated-process';
        service.killProcess       = pid => killed.push(pid);

        expect(service.reapDuplicateListeners('mockTask')).toBe(0);
        expect(killed).toEqual([]);
    });

    test('reapDuplicateListeners is a no-op for tasks without a singletonPort', () => {
        const { service } = createTestService();
        let probed = false;

        service.listPortListeners = () => { probed = true; return [200]; };

        expect(service.reapDuplicateListeners('mockTask')).toBe(0);
        expect(probed).toBe(false);
    });

    test('reapDuplicateListeners reaps every matching listener when no canonical pid is tracked', () => {
        const { service } = createTestService();
        const killed = [];

        service.taskDefinitions.mockTask.singletonPort = 8000;
        service.taskStateService.getTaskState = () => ({running: false, pid: null});
        service.listPortListeners = () => [200, 300];
        service.processCommand    = () => 'echo';
        service.killProcess       = pid => killed.push(pid);

        expect(service.reapDuplicateListeners('mockTask')).toBe(2);
        expect(killed).toEqual([200, 300]);
    });

    test('killTask SIGKILLs the tracked pid, marks the task recycled, and records the outcome (#12138)', () => {
        const {service, taskOutcomes} = createTestService();
        const killed   = [];
        const recycled = [];

        service.taskStateService.getTaskState = () => ({running: true, pid: 4242});
        service.taskStateService.markRecycled = name => recycled.push(name);
        service.killProcess                   = pid => killed.push(pid);

        service.killTask('mockTask', 'max-runtime:test');

        expect(killed).toEqual([4242]);
        expect(recycled).toEqual(['mockTask']);
        expect(taskOutcomes).toContainEqual(
            expect.objectContaining({taskName: 'mockTask', status: 'recycled'})
        );
    });

    test('killTask is safe when no pid is tracked: no kill attempted, still marks recycled (#12138)', () => {
        const {service, taskOutcomes} = createTestService();
        const killed   = [];
        const recycled = [];

        service.taskStateService.getTaskState = () => ({running: false, pid: null});
        service.taskStateService.markRecycled = name => recycled.push(name);
        service.killProcess                   = pid => killed.push(pid);

        service.killTask('mockTask', 'max-runtime:test');

        expect(killed).toEqual([]);
        expect(recycled).toEqual(['mockTask']);
        expect(taskOutcomes).toContainEqual(
            expect.objectContaining({taskName: 'mockTask', status: 'recycled'})
        );
    });

    test('killProcess is a no-op under UNIT_TEST_MODE — no real process is touched (#12138 AC)', () => {
        const {service} = createTestService();
        // Unit tests run with UNIT_TEST_MODE=true; killProcess must return before any process.kill.
        expect(process.env.UNIT_TEST_MODE).toBe('true');
        expect(() => service.killProcess(999999999)).not.toThrow();
    });

    // === superviseTask: liveness-gated (re)start decision (moved out of the orchestrator poll loop) ===

    test('superviseTask restarts a down process-match task once the cooldown elapses', () => {
        const {service} = createTestService();
        const calls     = [];
        service.runTask = (taskName, reason) => { calls.push({taskName, reason}); return true; };
        service.taskStateService.getTaskState = () => ({running: false, lastRunAt: 0});

        service.superviseTask('mockTask', 1_000_000, 15000);

        expect(calls).toEqual([{taskName: 'mockTask', reason: 'supervisor-restart'}]);
    });

    test('superviseTask leaves a running task alone — no restart', () => {
        const {service} = createTestService();
        const calls     = [];
        service.runTask = (taskName, reason) => { calls.push({taskName, reason}); return true; };
        service.taskStateService.getTaskState = () => ({running: true, lastRunAt: 0, pid: 1234});

        service.superviseTask('mockTask', 1_000_000, 15000);

        expect(calls).toEqual([]);
    });

    test('superviseTask holds off within the cooldown window', () => {
        const {service} = createTestService();
        const calls     = [];
        service.runTask = (taskName, reason) => { calls.push({taskName, reason}); return true; };
        // lastRunAt only 5s before `now`: still inside the 15s cooldown.
        service.taskStateService.getTaskState = () => ({running: false, lastRunAt: 995_000});

        service.superviseTask('mockTask', 1_000_000, 15000);

        expect(calls).toEqual([]);
    });

    test('superviseTask gates a fire-and-exit lane on its liveness probe — UP yields a silent no-op', async () => {
        const {service} = createTestService();
        const calls     = [];
        service.runTask = (taskName, reason) => { calls.push({taskName, reason}); return true; };
        service.taskStateService.getTaskState = () => ({running: false, lastRunAt: 0});
        service.taskDefinitions = {probeTask: {label: 'Probe Task', livenessProbe: async () => true}};

        service.superviseTask('probeTask', 1_000_000, 15000);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(calls).toEqual([]);
        expect(service._livenessConfirmedAt.probeTask).toBeTruthy();
    });

    test('superviseTask gates a fire-and-exit lane on its liveness probe — DOWN triggers a restart', async () => {
        const {service} = createTestService();
        const calls     = [];
        service.runTask = (taskName, reason) => { calls.push({taskName, reason}); return true; };
        service.taskStateService.getTaskState = () => ({running: false, lastRunAt: 0});
        service.taskDefinitions = {probeTask: {label: 'Probe Task', livenessProbe: async () => false}};

        service.superviseTask('probeTask', 1_000_000, 15000);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(calls).toEqual([{taskName: 'probeTask', reason: 'supervisor-restart'}]);
    });
});
