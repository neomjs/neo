import {test, expect} from '@playwright/test';
import fs from 'fs-extra';
import path from 'path';
import Neo from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';
import { TaskStateService, createInitialTaskState } from '../../../../../../../ai/daemons/orchestrator/services/TaskStateService.mjs';

function createTestService() {
    const dataDir = `/tmp/task-state-service-test-${Date.now()}-${Math.random()}`;
    fs.ensureDirSync(dataDir);

    const stateFile = path.join(dataDir, 'state.json');
    const taskDefinitions = {
        mockTask: {
            name: 'mockTask',
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
        const state = service.getTaskState('mockTask');

        expect(state).toMatchObject({
            running      : false,
            pid          : null,
            lastRunAt    : 0,
            lastSuccessAt: null,
            lastErrorAt  : null,
            lastExitCode : null,
            lastReason   : null
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
});
