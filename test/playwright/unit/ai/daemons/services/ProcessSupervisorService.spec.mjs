import {test, expect} from '@playwright/test';
import fs from 'fs-extra';
import path from 'path';
import Neo from '../../../../../../src/Neo.mjs';
import * as core from '../../../../../../src/core/_export.mjs';
import { ProcessSupervisorService } from '../../../../../../ai/daemons/services/ProcessSupervisorService.mjs';

function createTestService() {
    const dataDir = `/tmp/process-supervisor-service-test-${Date.now()}-${Math.random()}`;
    fs.ensureDirSync(dataDir);
    
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
        recordTaskOutcome: () => {}
    };

    const service = Neo.create(ProcessSupervisorService, {
        dataDir,
        taskDefinitions,
        taskStateService: mockTaskStateService,
        healthService: mockHealthService,
        writeLog: () => {},
        spawnFn: () => ({ pid: 1234, on: () => {} }),
        processCommand: (pid) => 'echo hello'
    });
    
    return { service, dataDir, mockTaskStateService };
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
});
