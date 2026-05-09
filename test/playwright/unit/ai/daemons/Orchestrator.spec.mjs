import {test, expect} from '@playwright/test';
import Neo from '../../../../../src/Neo.mjs';
import * as core from '../../../../../src/core/_export.mjs';
import {
    Orchestrator
} from '../../../../../ai/daemons/Orchestrator.mjs';
import {
    DEFAULT_POLL_INTERVAL_MS,
    DEFAULT_SUMMARY_SWEEP_INTERVAL_MS,
    DEFAULT_KB_SYNC_INTERVAL_MS,
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

    const orchestrator = Neo.create(Orchestrator, {
        dataDir                 : '/tmp/orchestrator-test',
        stateFile               : '/tmp/orchestrator-test/state.json',
        logFile                 : null,
        taskDefinitions,
        taskStateService_       : TaskStateService,
        summarySweepIntervalMs  : config.summarySweepIntervalMs ?? 600000,
        kbSyncIntervalMs        : config.kbSyncIntervalMs ?? 600000,
        healthService           : config.healthService || {recordTaskOutcome() {}},
        summarizationCoordinator: config.summarizationCoordinator || {getDueTask: () => null},
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

        expect(Object.keys(state)).toEqual(['summary', 'kbSync']);
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

});
