import {test, expect} from '@playwright/test';
import path from 'path';
import Neo from '../../../../../src/Neo.mjs';
import * as core from '../../../../../src/core/_export.mjs';
import {
    Orchestrator
} from '../../../../../ai/daemons/Orchestrator.mjs';
import {
    DEFAULT_POLL_INTERVAL_MS,
    DEFAULT_SUMMARY_SWEEP_INTERVAL_MS,
    DEFAULT_KB_SYNC_INTERVAL_MS,
    DEFAULT_BACKUP_INTERVAL_MS,
    buildTaskDefinitions
} from '../../../../../ai/daemons/TaskDefinitions.mjs';
import TaskStateService, { createInitialTaskState } from '../../../../../ai/daemons/services/TaskStateService.mjs';

function createTestOrchestrator(config = {}) {
    const taskDefinitions = config.taskDefinitions || buildTaskDefinitions({
        scriptDir: '/repo/ai/scripts',
        nodeBin  : '/node'
    });

    TaskStateService.configure({
        stateFile      : '/tmp/orchestrator-test/state.json',
        taskDefinitions: taskDefinitions,
        writeLogFn     : () => {}
    });
    TaskStateService.taskState = createInitialTaskState(taskDefinitions);
    ['chroma', 'bridgeDaemon', 'mlx'].forEach(name => {
        if (TaskStateService.taskState[name]) {
            TaskStateService.taskState[name].running = true;
        }
    });

    const orchestrator = Neo.create(Orchestrator, {
        dataDir                 : '/tmp/orchestrator-test',
        stateFile               : '/tmp/orchestrator-test/state.json',
        logFile                 : null,
        taskDefinitions,
        taskStateService_       : TaskStateService,
        summarySweepIntervalMs  : config.summarySweepIntervalMs ?? 600000,
        kbSyncIntervalMs        : config.kbSyncIntervalMs ?? 600000,
        backupIntervalMs        : config.backupIntervalMs ?? 86400000,
        healthService           : config.healthService || {recordTaskOutcome() {}},
        summarizationCoordinator: config.summarizationCoordinator || {getDueTask: () => null},
        backupCoordinator       : config.backupCoordinator || {getDueTask: () => null},
        spawnFn                 : config.spawnFn || (() => { throw new Error('spawnFn not expected'); })
    });

    orchestrator.writeLog  = () => {};
    // orchestrator.writeState = () => {};

    return orchestrator;
}

test.describe('Neo.ai.daemons.Orchestrator (#11009)', () => {
    test('creates an isolated persisted-state envelope per task', () => {
        const state = createInitialTaskState(buildTaskDefinitions({
            scriptDir: '/repo/ai/scripts',
            nodeBin  : '/node'
        }));

        expect(Object.keys(state)).toEqual(['chroma', 'bridgeDaemon', 'mlx', 'summary', 'kbSync', 'backup']);
        expect(state.summary).toMatchObject({
            running      : false,
            pid          : null,
            lastRunAt    : 0,
            lastSuccessAt: null,
            lastErrorAt  : null,
            lastExitCode : null,
            lastReason   : null
        });
        expect(state.kbSync).not.toBe(state.summary);
    });

    test('isolates summary scheduling failure and still schedules due KB sync', () => {
        const outcomes = [];
        const started  = [];

        const orchestrator = createTestOrchestrator({
            healthService: {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            },
            summarizationCoordinator: {
                getDueTask() {
                    throw new Error('summary read failed');
                }
            }
        });

        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };

        orchestrator.poll();

        expect(outcomes).toEqual([{
            taskName: 'summary',
            status  : 'failed',
            details : {
                phase: 'schedule',
                error: 'summary read failed'
            }
        }]);
        expect(started).toEqual([{
            taskName: 'kbSync',
            reason  : 'periodic-sync:600000'
        }]);
    });

    test('isolates backup scheduling failure and still schedules other tasks', () => {
        const outcomes = [];
        const started  = [];

        const orchestrator = createTestOrchestrator({
            healthService: {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            },
            backupCoordinator: {
                getDueTask() {
                    throw new Error('backup logic failed');
                }
            }
        });

        orchestrator.processSupervisorService = {
            runTask(taskName, reason) {
                started.push({taskName, reason});
                return true;
            }
        };

        orchestrator.poll();

        expect(outcomes).toContainEqual({
            taskName: 'backup',
            status  : 'failed',
            details : {
                phase: 'schedule',
                error: 'backup logic failed'
            }
        });
        expect(started).toContainEqual({
            taskName: 'kbSync',
            reason  : 'periodic-sync:600000'
        });
    });

    test('resolves default paths correctly without configuration overrides', () => {
        const orchestrator = Neo.create(Orchestrator);
        const dataDir = '/tmp/orchestrator-test-defaults';
        
        expect(() => orchestrator.configure({ dataDir })).not.toThrow();
        
        expect(orchestrator.logFile).toBe(path.join(dataDir, 'orchestrator.log'));
        expect(orchestrator.stateFile).toBe(path.join(dataDir, 'orchestrator-state.json'));
        
        const repoRoot = path.resolve(process.cwd());
        const expectedSummaryScript = path.resolve(repoRoot, 'ai/scripts/summarize-sessions.mjs');
        const expectedKbSyncScript = path.resolve(repoRoot, 'buildScripts/ai/syncKnowledgeBase.mjs');
        
        expect(orchestrator.taskDefinitions.summary.args[0]).toBe(expectedSummaryScript);
        expect(orchestrator.taskDefinitions.kbSync.args[0]).toBe(expectedKbSyncScript);
    });

});
