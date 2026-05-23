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
});
