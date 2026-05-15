import {test, expect} from '@playwright/test';
import path from 'path';
import Neo from '../../../../../src/Neo.mjs';
import * as core from '../../../../../src/core/_export.mjs';
import {
    Orchestrator,
    resolvePrimaryDevSyncRootsConfig,
    resolvePrimaryDevSyncRootsSource
} from '../../../../../ai/daemons/Orchestrator.mjs';
import {
    DEV_SYNC_ROOTS_CONFIG_KEY,
    DEV_SYNC_ROOTS_ENV_VAR
} from '../../../../../ai/daemons/services/PrimaryRepoSyncService.mjs';
import {
    DEFAULT_POLL_INTERVAL_MS,
    DEFAULT_SUMMARY_SWEEP_INTERVAL_MS,
    DEFAULT_KB_SYNC_INTERVAL_MS,
    DEFAULT_BACKUP_INTERVAL_MS,
    PRIMARY_DEV_SYNC_TASK_NAME,
    DREAM_TASK_NAME,
    GOLDEN_PATH_TASK_NAME,
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
    ['chroma', 'memoryCoreChroma', 'bridgeDaemon', 'mlx'].forEach(name => {
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
        primaryDevSyncIntervalMs: config.primaryDevSyncIntervalMs ?? 600000,
        primaryDevSyncEnabled   : config.primaryDevSyncEnabled ?? false,
        primaryDevSyncRootsConfig: config.primaryDevSyncRootsConfig ?? null,
        dreamIntervalMs         : config.dreamIntervalMs ?? Number.MAX_SAFE_INTEGER,
        goldenPathIntervalMs    : config.goldenPathIntervalMs ?? Number.MAX_SAFE_INTEGER,
        healthService           : config.healthService || {recordTaskOutcome() {}},
        summarizationCoordinator: config.summarizationCoordinator || {getDueTask: () => null},
        backupCoordinator       : config.backupCoordinator || {getDueTask: () => null},
        primaryRepoSyncService  : config.primaryRepoSyncService || {getDueTask: () => null, runTask: () => null},
        dreamService            : config.dreamService || {processUndigestedSessions: () => Promise.resolve()},
        goldenPathSynthesizer   : config.goldenPathSynthesizer || {synthesizeGoldenPath: () => Promise.resolve()},
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

        expect(Object.keys(state)).toEqual(['chroma', 'memoryCoreChroma', 'bridgeDaemon', 'mlx', 'summary', 'kbSync', 'backup', PRIMARY_DEV_SYNC_TASK_NAME, DREAM_TASK_NAME, GOLDEN_PATH_TASK_NAME]);
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

    test('routes primary-dev-sync through its service coordinator', () => {
        const started = [];
        const orchestrator = createTestOrchestrator({
            kbSyncIntervalMs        : 0,
            backupIntervalMs        : 0,
            primaryDevSyncEnabled   : true,
            primaryDevSyncIntervalMs: 600000,
            primaryRepoSyncService  : {
                getDueTask() {
                    return {
                        taskName: PRIMARY_DEV_SYNC_TASK_NAME,
                        reason  : 'periodic-sweep:600000'
                    };
                },
                runTask({taskName, reason}) {
                    started.push({taskName, reason});
                }
            }
        });

        orchestrator.processSupervisorService = {
            runTask() {}
        };

        orchestrator.poll();

        expect(started).toEqual([{
            taskName: PRIMARY_DEV_SYNC_TASK_NAME,
            reason  : 'periodic-sweep:600000'
        }]);
    });

    test('passes local dev-sync roots to primary-dev-sync while env keeps precedence', () => {
        const originalEnvValue = process.env[DEV_SYNC_ROOTS_ENV_VAR];
        delete process.env[DEV_SYNC_ROOTS_ENV_VAR];

        try {
            const received = [];
            const orchestrator = createTestOrchestrator({
                kbSyncIntervalMs          : 0,
                backupIntervalMs          : 0,
                primaryDevSyncEnabled     : true,
                primaryDevSyncIntervalMs  : 600000,
                primaryDevSyncRootsConfig : ['/config/neo'],
                primaryRepoSyncService    : {
                    getDueTask() {
                        return {
                            taskName: PRIMARY_DEV_SYNC_TASK_NAME,
                            reason  : 'periodic-sweep:600000'
                        };
                    },
                    runTask(options) {
                        received.push({
                            value : options.devSyncRootsConfig,
                            source: options.devSyncRootsSource
                        });
                    }
                }
            });

            orchestrator.processSupervisorService = {
                runTask() {}
            };

            orchestrator.poll();

            process.env[DEV_SYNC_ROOTS_ENV_VAR] = '["/env/neo"]';
            orchestrator.poll();

            expect(received).toEqual([{
                value : ['/config/neo'],
                source: DEV_SYNC_ROOTS_CONFIG_KEY
            }, {
                value : '["/env/neo"]',
                source: DEV_SYNC_ROOTS_ENV_VAR
            }]);
            expect(resolvePrimaryDevSyncRootsConfig({
                envValue   : '',
                configValue: ['/config/neo']
            })).toEqual(['/config/neo']);
            expect(resolvePrimaryDevSyncRootsConfig({
                envValue   : '',
                configValue: []
            })).toBeNull();
            expect(resolvePrimaryDevSyncRootsSource({envValue: ''})).toBe(DEV_SYNC_ROOTS_CONFIG_KEY);
        } finally {
            if (originalEnvValue === undefined) {
                delete process.env[DEV_SYNC_ROOTS_ENV_VAR];
            } else {
                process.env[DEV_SYNC_ROOTS_ENV_VAR] = originalEnvValue;
            }
        }
    });

});
