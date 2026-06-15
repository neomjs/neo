import {test, expect} from '@playwright/test';
import {
    buildSchedulingContext,
    runSchedulingPipeline
} from '../../../../../../../ai/daemons/orchestrator/scheduling/pipeline.mjs';

function makeContext(overrides = {}) {
    return buildSchedulingContext({
        db       : {},
        state    : {},
        now      : 1_000,
        intervals: {},
        enables  : {},
        hooks    : {},
        ...overrides
    });
}

function makeCandidateDescriptor({
    taskName = 'summary',
    executionKind = 'supervised-child-process',
    maintenanceClass = 'heavy',
    trigger = {reason: `${taskName}-reason`}
} = {}) {
    return {
        taskName,
        executionKind,
        maintenanceClass,
        backpressure : maintenanceClass === 'heavy' ? 'exclusive-heavy' : 'none',
        dependencies : [],
        getDueTask   : () => trigger
    };
}

function makeServices(overrides = {}) {
    return {
        dreamService: {
            executeRemCycle: () => Promise.resolve({status: 'completed'})
        },
        goldenPathSynthesizer: {
            synthesizeGoldenPath: () => Promise.resolve()
        },
        healthService: {
            recordTaskOutcome() {}
        },
        maintenanceBackpressureService: {
            acquireLeaseAndExecute({executeFn, taskName, reason, onSuccess, activeHeavyTask}) {
                return executeFn(taskName, reason, onSuccess, {activeHeavyTask});
            },
            executeWithGoldenPathDependencyGate({executeFn, taskName, reason}) {
                return executeFn(taskName, reason);
            },
            getActiveHeavyMaintenanceTask() { return null; },
            isHeavyMaintenanceTask() { return false; },
            recordDeferral() {}
        },
        primaryRepoSyncService: {
            runTask: () => true
        },
        processSupervisorService: {
            runTask: () => true
        },
        swarmHeartbeatService: {
            pulse: () => Promise.resolve()
        },
        taskStateService: {
            getTaskState: () => null,
            markCompleted() {},
            markFailed() {},
            markStarted() {}
        },
        tenantRepoSyncService: {
            runTask: () => true
        },
        ...overrides
    };
}

function makeRuntime(overrides = {}) {
    return {
        goldenPathRepoEnrichmentEnabled: true,
        primaryDevSyncRootsConfig      : null,
        tenantRepoSyncGlobalCadenceMs  : 10_000,
        tenantRepoSyncJitterRatio      : 0.1,
        writeLog                       : () => {},
        ...overrides
    };
}

test.describe('orchestrator/scheduling/pipeline (#11862/#11900)', () => {
    test('reports descriptor errors and still dispatches the selected candidate', () => {
        const outcomes = [];
        const started  = [];
        const logs     = [];

        const result = runSchedulingPipeline({
            registry: [
                {
                    taskName: 'broken',
                    getDueTask() { throw new Error('boom'); }
                },
                makeCandidateDescriptor({taskName: 'summary'})
            ],
            context : makeContext(),
            services: makeServices({
                healthService: {
                    recordTaskOutcome(taskName, status, details) {
                        outcomes.push({taskName, status, details});
                    }
                },
                processSupervisorService: {
                    runTask(taskName, reason) {
                        started.push({taskName, reason});
                        return true;
                    }
                }
            }),
            runtime: makeRuntime({
                writeLog(level, message) {
                    logs.push({level, message});
                }
            })
        });

        expect(result.errors).toHaveLength(1);
        expect(result.winner.taskName).toBe('summary');
        expect(outcomes).toContainEqual({
            taskName: 'broken',
            status  : 'failed',
            details : {phase: 'schedule', error: 'boom'}
        });
        expect(logs).toContainEqual({
            level  : 'ERROR',
            message: '[Orchestrator] broken scheduling failed: boom'
        });
        expect(started).toEqual([{taskName: 'summary', reason: 'summary-reason'}]);
    });

    test('records heavy-maintenance picker deferrals before selecting a winner', () => {
        const deferrals = [];

        const result = runSchedulingPipeline({
            registry: [
                makeCandidateDescriptor({taskName: 'kbSync', maintenanceClass: 'heavy'})
            ],
            context : makeContext({
                state: {
                    summary: {running: true},
                    kbSync : {running: false}
                }
            }),
            services: makeServices({
                maintenanceBackpressureService: {
                    acquireLeaseAndExecute() { throw new Error('should not execute'); },
                    getActiveHeavyMaintenanceTask() { return 'summary'; },
                    isHeavyMaintenanceTask(taskName) { return taskName === 'summary'; },
                    recordDeferral(deferral) {
                        deferrals.push(deferral);
                    }
                }
            }),
            runtime: makeRuntime()
        });

        expect(result.winner).toBeNull();
        expect(deferrals).toEqual([{
            taskName        : 'kbSync',
            reasonCode      : 'heavy-maintenance-backpressure',
            reasonText      : 'kbSync-reason',
            blockingTaskName: 'summary'
        }]);
    });

    test('does not record picker deferral for miniSummary backfill while compatible kbSync runs (#13358)', () => {
        const deferrals = [];
        const started   = [];

        const result = runSchedulingPipeline({
            registry: [
                makeCandidateDescriptor({taskName: 'memory-summary-backfill', maintenanceClass: 'heavy'})
            ],
            context : makeContext({
                state: {
                    kbSync: {running: true},
                    ['memory-summary-backfill']: {running: false}
                }
            }),
            services: makeServices({
                maintenanceBackpressureService: {
                    acquireLeaseAndExecute({executeFn, taskName, reason, onSuccess, activeHeavyTask}) {
                        return executeFn(taskName, reason, onSuccess, {activeHeavyTask});
                    },
                    getActiveHeavyMaintenanceTask() { return null; },
                    isHeavyMaintenanceTask(taskName) {
                        return taskName === 'kbSync' || taskName === 'memory-summary-backfill';
                    },
                    isHeavyMaintenanceConflict(taskName, otherTaskName) {
                        return !(taskName === 'memory-summary-backfill' && otherTaskName === 'kbSync');
                    },
                    recordDeferral(deferral) {
                        deferrals.push(deferral);
                    }
                },
                processSupervisorService: {
                    runTask(taskName, reason) {
                        started.push({taskName, reason});
                        return true;
                    }
                }
            }),
            runtime: makeRuntime()
        });

        expect(result.winner.taskName).toBe('memory-summary-backfill');
        expect(deferrals).toEqual([]);
        expect(started).toEqual([{
            taskName: 'memory-summary-backfill',
            reason  : 'memory-summary-backfill-reason'
        }]);
    });

    test('dispatches service-runner candidates through runtime-provided collaborators', () => {
        const calls = [];

        runSchedulingPipeline({
            registry: [
                makeCandidateDescriptor({
                    taskName        : 'tenant-repo-sync',
                    executionKind   : 'service-runner',
                    maintenanceClass: 'continuous'
                })
            ],
            context : makeContext(),
            services: makeServices({
                tenantRepoSyncService: {
                    runTask(config) {
                        calls.push(config);
                        return true;
                    }
                }
            }),
            runtime: makeRuntime({
                tenantRepoSyncGlobalCadenceMs: 25_000,
                tenantRepoSyncJitterRatio    : 0.25
            })
        });

        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({
            taskName       : 'tenant-repo-sync',
            reason         : 'tenant-repo-sync-reason',
            globalCadenceMs: 25_000,
            jitterRatio    : 0.25
        });
    });

    test('reports unsupported executionKind as dispatch failure', () => {
        const outcomes = [];
        const logs     = [];

        const result = runSchedulingPipeline({
            registry: [
                makeCandidateDescriptor({
                    taskName     : 'future-task',
                    executionKind: 'future-kind',
                    maintenanceClass: 'continuous'
                })
            ],
            context : makeContext(),
            services: makeServices({
                healthService: {
                    recordTaskOutcome(taskName, status, details) {
                        outcomes.push({taskName, status, details});
                    }
                }
            }),
            runtime: makeRuntime({
                writeLog(level, message) {
                    logs.push({level, message});
                }
            })
        });

        expect(result.winner.taskName).toBe('future-task');
        expect(outcomes).toEqual([{
            taskName: 'future-task',
            status  : 'failed',
            details : {
                phase: 'dispatch',
                error: 'Unsupported executionKind: future-kind'
            }
        }]);
        expect(logs).toEqual([{
            level  : 'ERROR',
            message: '[Orchestrator] Unsupported executionKind: future-kind'
        }]);
    });
});
