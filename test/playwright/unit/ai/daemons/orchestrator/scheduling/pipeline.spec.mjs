import {test, expect} from '@playwright/test';
import {
    buildSchedulingContext,
    buildTaskStalenessMeta,
    runSchedulingPipeline,
    TASK_STALENESS_CADENCE_KEY
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
        backpressure: maintenanceClass === 'heavy' ? 'exclusive-heavy' : 'none',
        dependencies: [],
        getDueTask  : () => trigger
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
            markSkipped() {},
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
                    kbSync                     : {running: true},
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
                    taskName        : 'future-task',
                    executionKind   : 'future-kind',
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

    test('records completed Dream outcomes as successful runs (#13767)', async () => {
        const calls    = [];
        const outcomes = [];

        const result = runSchedulingPipeline({
            registry: [
                makeCandidateDescriptor({
                    taskName        : 'dream',
                    executionKind   : 'in-process-async',
                    maintenanceClass: 'heavy'
                })
            ],
            context : makeContext(),
            services: makeServices({
                dreamService: {
                    executeRemCycle: () => Promise.resolve({
                        status           : 'completed',
                        completedAt      : '2026-06-21T12:00:00.000Z',
                        durationMs       : 42,
                        sessionsProcessed: 3,
                        runId            : 'run-completed'
                    })
                },
                healthService: {
                    recordTaskOutcome(taskName, status, details) {
                        outcomes.push({taskName, status, details});
                    }
                },
                taskStateService: {
                    getTaskState: () => null,
                    markCompleted(taskName) { calls.push(['markCompleted', taskName]); },
                    markFailed(taskName) { calls.push(['markFailed', taskName]); },
                    markSkipped(taskName) { calls.push(['markSkipped', taskName]); },
                    markStarted(taskName, reason) { calls.push(['markStarted', taskName, reason]); }
                }
            }),
            runtime: makeRuntime()
        });

        await result.executed;

        expect(calls).toEqual([
            ['markStarted', 'dream', 'dream-reason'],
            ['markCompleted', 'dream']
        ]);
        expect(outcomes).toEqual([
            {
                taskName: 'dream',
                status  : 'running',
                details : {reason: 'dream-reason', startedAt: expect.any(String)}
            },
            {
                taskName: 'dream',
                status  : 'completed',
                details : {
                    reason           : 'dream-reason',
                    completedAt      : '2026-06-21T12:00:00.000Z',
                    durationMs       : 42,
                    sessionsProcessed: 3,
                    runId            : 'run-completed'
                }
            }
        ]);
    });

    test('records skipped Dream outcomes without marking success (#13767)', async () => {
        const calls    = [];
        const outcomes = [];

        const result = runSchedulingPipeline({
            registry: [
                makeCandidateDescriptor({
                    taskName        : 'dream',
                    executionKind   : 'in-process-async',
                    maintenanceClass: 'heavy'
                })
            ],
            context : makeContext(),
            services: makeServices({
                dreamService: {
                    executeRemCycle: () => Promise.resolve({
                        status           : 'skipped',
                        completedAt      : '2026-06-21T12:01:00.000Z',
                        durationMs       : 7,
                        sessionsProcessed: 0,
                        runId            : 'run-skipped',
                        skipReason       : 'no-actionable-sessions'
                    })
                },
                healthService: {
                    recordTaskOutcome(taskName, status, details) {
                        outcomes.push({taskName, status, details});
                    }
                },
                taskStateService: {
                    getTaskState: () => null,
                    markCompleted(taskName) { calls.push(['markCompleted', taskName]); },
                    markFailed(taskName) { calls.push(['markFailed', taskName]); },
                    markSkipped(taskName) { calls.push(['markSkipped', taskName]); },
                    markStarted(taskName, reason) { calls.push(['markStarted', taskName, reason]); }
                }
            }),
            runtime: makeRuntime()
        });

        await result.executed;

        expect(calls).toEqual([
            ['markStarted', 'dream', 'dream-reason'],
            ['markSkipped', 'dream']
        ]);
        expect(outcomes).toEqual([
            {
                taskName: 'dream',
                status  : 'running',
                details : {reason: 'dream-reason', startedAt: expect.any(String)}
            },
            {
                taskName: 'dream',
                status  : 'skipped',
                details : {
                    reason           : 'dream-reason',
                    completedAt      : '2026-06-21T12:01:00.000Z',
                    durationMs       : 7,
                    sessionsProcessed: 0,
                    runId            : 'run-skipped',
                    skipReason       : 'no-actionable-sessions'
                }
            }
        ]);
    });

    test('records failed Dream outcomes as failures with diagnostics (#13767)', async () => {
        const calls    = [];
        const outcomes = [];
        const state    = {};

        const result = runSchedulingPipeline({
            registry: [
                makeCandidateDescriptor({
                    taskName        : 'dream',
                    executionKind   : 'in-process-async',
                    maintenanceClass: 'heavy'
                })
            ],
            context : makeContext(),
            services: makeServices({
                dreamService: {
                    executeRemCycle: () => Promise.resolve({
                        status           : 'failed',
                        completedAt      : '2026-06-21T12:02:00.000Z',
                        durationMs       : 11,
                        sessionsProcessed: 0,
                        runId            : 'run-failed',
                        diagnostic       : {reason: 'provider-unready'}
                    })
                },
                healthService: {
                    recordTaskOutcome(taskName, status, details) {
                        outcomes.push({taskName, status, details});
                    }
                },
                taskStateService: {
                    getTaskState: () => state,
                    markCompleted(taskName) { calls.push(['markCompleted', taskName]); },
                    markFailed(taskName, exitCode) { calls.push(['markFailed', taskName, exitCode]); },
                    markSkipped(taskName) { calls.push(['markSkipped', taskName]); },
                    markStarted(taskName, reason) { calls.push(['markStarted', taskName, reason]); }
                }
            }),
            runtime: makeRuntime()
        });

        await result.executed;

        expect(calls).toEqual([
            ['markStarted', 'dream', 'dream-reason'],
            ['markFailed', 'dream', 1]
        ]);
        expect(state.lastReason).toBe('provider-unready');
        expect(outcomes).toEqual([
            {
                taskName: 'dream',
                status  : 'running',
                details : {reason: 'dream-reason', startedAt: expect.any(String)}
            },
            {
                taskName: 'dream',
                status  : 'failed',
                details : {
                    reason           : 'dream-reason',
                    completedAt      : '2026-06-21T12:02:00.000Z',
                    durationMs       : 11,
                    sessionsProcessed: 0,
                    runId            : 'run-failed',
                    failedAt         : '2026-06-21T12:02:00.000Z',
                    failurePhase     : 'provider-readiness',
                    diagnostic       : {reason: 'provider-unready'},
                    error            : undefined
                }
            }
        ]);
    });
});

test.describe('orchestrator/scheduling/pipeline staleness selector (#13586)', () => {
    test('buildTaskStalenessMeta: builds {lastRunAt, cadenceMs} only for staleness-eligible candidates', () => {
        const candidates = [
            {taskName: 'summary'},
            {taskName: 'golden-path'},
            {taskName: 'swarm-heartbeat'},               // light → omitted
            {taskName: 'embed-drain-liveness-watchdog'}  // health → omitted
        ];
        const state = {
            summary      : {lastRunAt: 5_000},
            'golden-path': {lastRunAt: 1_000}
        };
        const intervals = {summarySweep: 600_000, goldenPath: 3_600_000};

        const meta = buildTaskStalenessMeta({candidates, state, intervals});

        expect(meta).toEqual({
            summary      : {lastRunAt: 5_000, cadenceMs: 600_000},
            'golden-path': {lastRunAt: 1_000, cadenceMs: 3_600_000}
        });
        expect(meta['swarm-heartbeat']).toBeUndefined();
        expect(meta['embed-drain-liveness-watchdog']).toBeUndefined();
    });

    test('buildTaskStalenessMeta: defaults lastRunAt to 0 when task state is absent', () => {
        const meta = buildTaskStalenessMeta({
            candidates: [{taskName: 'memory-summary-backfill'}],
            state     : {},
            intervals : {summarySweep: 600_000}
        });
        // backlog-driven backfill shares the summary-sweep cadence; never-run → lastRunAt 0
        expect(meta['memory-summary-backfill']).toEqual({lastRunAt: 0, cadenceMs: 600_000});
    });

    test('TASK_STALENESS_CADENCE_KEY: excludes lightweight / health / continuous tasks', () => {
        expect(TASK_STALENESS_CADENCE_KEY['swarm-heartbeat']).toBeUndefined();
        expect(TASK_STALENESS_CADENCE_KEY['embed-drain-liveness-watchdog']).toBeUndefined();
        expect(TASK_STALENESS_CADENCE_KEY['tenant-repo-sync']).toBeUndefined();
        expect(TASK_STALENESS_CADENCE_KEY['golden-path']).toBe('goldenPath');
        expect(TASK_STALENESS_CADENCE_KEY.summary).toBe('summarySweep');
    });

    test('end-to-end: a weeks-stale golden-path is selected over a just-run summary', () => {
        const WEEK = 7 * 24 * 60 * 60 * 1000;
        const now  = 100 * WEEK;

        const result = runSchedulingPipeline({
            registry: [
                makeCandidateDescriptor({taskName: 'summary',     maintenanceClass: 'heavy'}),
                makeCandidateDescriptor({taskName: 'golden-path', maintenanceClass: 'graph-dependent', executionKind: 'in-process-async'})
            ],
            context: makeContext({
                now,
                state: {
                    summary      : {lastRunAt: now - 60_000,   running: false},
                    'golden-path': {lastRunAt: now - 3 * WEEK, running: false}
                },
                intervals: {summarySweep: 600_000, goldenPath: 3_600_000}
            }),
            services: makeServices(),
            runtime : makeRuntime()
        });

        expect(result.winner.taskName).toBe('golden-path');
    });

    test('end-to-end: backup (priority-0) is selected over a hugely-stale never-run backfill', () => {
        const now = 1_000_000_000;

        const result = runSchedulingPipeline({
            registry: [
                makeCandidateDescriptor({taskName: 'memory-summary-backfill', maintenanceClass: 'heavy'}),
                makeCandidateDescriptor({taskName: 'backup',                   maintenanceClass: 'heavy'})
            ],
            context: makeContext({
                now,
                state: {
                    'memory-summary-backfill': {lastRunAt: 0,           running: false}, // never run, hugely stale
                    backup                   : {lastRunAt: now - 60_000, running: false}  // fresh
                },
                intervals: {summarySweep: 600_000, backup: 86_400_000}
            }),
            services: makeServices(),
            runtime : makeRuntime()
        });

        expect(result.winner.taskName).toBe('backup');
    });
});
