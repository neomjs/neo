import {test, expect} from '@playwright/test';
import {
    buildOrchestratorSchedulingOptions,
    buildSchedulingContext,
    buildTaskStalenessMeta,
    executeCandidate,
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
            synthesizeGoldenPath: () => Promise.resolve({
                status      : 'completed',
                wroteHandoff: true
            })
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

function makeOrchestratorAdapterFixture(overrides = {}) {
    return {
        db              : {},
        taskStateService: {
            getState: () => ({})
        },
        writeLog                               : () => {},
        summaryGetDueTask                      : () => null,
        backupGetDueTask                       : () => null,
        graphLogCompactionGetDueTask           : () => null,
        primaryDevSyncGetDueTask               : () => null,
        tenantRepoSyncGetDueTask               : () => null,
        dreamGetDueTask                        : () => null,
        goldenPathGetDueTask                   : () => null,
        swarmHeartbeatGetDueTask               : () => null,
        embedDrainLivenessWatchdogGetDueTask   : () => null,
        dreamService                           : {},
        goldenPathSynthesizer                  : {},
        healthService                          : {},
        maintenanceBackpressureService         : {},
        primaryRepoSyncService                 : {},
        processSupervisorService               : {},
        swarmHeartbeatService                  : {initFailed: false},
        tenantRepoSyncService                  : {},
        embedDrainLivenessAlarmDispatcher      : () => {},
        remConsolidationLivenessAlarmDispatcher: () => {},
        goldenPathRepoEnrichmentEnabled        : true,
        primaryDevSyncRootsConfig              : null,
        tenantRepoSyncGlobalCadenceMs          : 10_000,
        tenantRepoSyncJitterRatio              : 0.1,
        embedDrainLivenessWatchdogWalDir       : '/tmp/wal',
        embedDrainLivenessWatchdogThresholdMs  : 1_000,
        embedDaemonEnabled                     : true,
        remConsolidationWatchdogRunStateDir    : '/tmp/rem',
        remConsolidationWatchdogThresholdMs    : 2_000,
        temporalSummaryEnabled                 : false,
        temporalSummaryAggregationService      : {runCycle: async () => {}},
        ...overrides
    };
}

function makeAdapterConfig({dreamMs = 3_600_000, remBacklogCatchupCooldownMs = 300_000} = {}) {
    return {
        orchestrator: {
            intervals: {
                summarySweepMs                   : 1,
                kbSyncMs                         : 1,
                githubWorkflowSyncMs             : 1,
                backupMs                         : 1,
                graphLogCompactionMs             : 1,
                primaryDevSyncMs                 : 1,
                tenantRepoSyncMs                 : 1,
                dreamMs,
                messageConceptHarvestMs          : 1,
                dreamOverflowThreshold           : 0.8,
                remBacklogCatchupCooldownMs,
                goldenPathMs                     : 1,
                swarmHeartbeatMs                 : 1,
                embedDrainLivenessWatchdogCheckMs: 1,
                remConsolidationWatchdogCheckMs  : 1
            },
            tenantRepoSync: {
                sweepCadenceMs: 1,
                jitterRatio   : 0
            }
        },
        temporalSummary: {
            aggregationIntervalMs: 1
        }
    };
}

test.describe('orchestrator/scheduling/pipeline (#11862/#11900)', () => {
    test('buildOrchestratorSchedulingOptions wires the REM liveness active alarm and dream-ownership gate (#13839)', () => {
        const remDispatcher = () => {};
        const orchestrator  = makeOrchestratorAdapterFixture({
            remConsolidationLivenessAlarmDispatcher: remDispatcher
        });

        const enabledOptions = buildOrchestratorSchedulingOptions({
            orchestrator,
            config  : makeAdapterConfig({dreamMs: 3_600_000}),
            now     : 10,
            registry: []
        });

        expect(enabledOptions.services.remConsolidationLivenessAlarmDispatcher).toBe(remDispatcher);
        expect(enabledOptions.runtime.remConsolidationWatchdogAlarmEnabled).toBe(true);
        expect(enabledOptions.context.intervals.remBacklogCatchupCooldown).toBe(300_000);

        const disabledOptions = buildOrchestratorSchedulingOptions({
            orchestrator,
            config  : makeAdapterConfig({dreamMs: 0}),
            now     : 10,
            registry: []
        });

        expect(disabledOptions.runtime.remConsolidationWatchdogAlarmEnabled).toBe(false);
    });

    test('buildOrchestratorSchedulingOptions wires the temporal-summary cadence + enable (#14938)', () => {
        const orchestrator = makeOrchestratorAdapterFixture({temporalSummaryEnabled: true});

        const options = buildOrchestratorSchedulingOptions({
            orchestrator,
            config  : makeAdapterConfig(),
            now     : 10,
            registry: []
        });

        // cadence read from config.temporalSummary.aggregationIntervalMs; enable off the orchestrator's getter.
        // The supervised child runs the service in its own process — nothing is injected in-process here.
        expect(options.context.intervals.temporalSummary).toBe(1);
        expect(options.context.enables.temporalSummary).toBe(true);
    });

    test('executeCandidate dispatches temporal-summary as a supervised child THROUGH the heavy lease (#14938)', () => {
        let leasedTask = null, spawnedTask = null;

        const services = {
            // supervised-child heavy → executeSupervisedCandidate → executeWithMaintenance → acquireLeaseAndExecute → processSupervisorService.runTask
            processSupervisorService      : {runTask: taskName => { spawnedTask = taskName; return true }},
            maintenanceBackpressureService: {
                acquireLeaseAndExecute({taskName, executeFn}) { leasedTask = taskName; return executeFn(taskName, 'periodic-temporal-summary:1') }
            }
        };

        executeCandidate({
            candidate: {
                taskName  : 'temporal-summary',
                trigger   : {reason: 'periodic-temporal-summary:1'},
                descriptor: {executionKind: 'supervised-child-process', maintenanceClass: 'heavy'}
            },
            activeHeavyTask: {name: null},
            services,
            runtime        : {writeLog() {}}
        });

        // took the heavy lease (exclusive-heavy correctness) and SPAWNED the supervised child — not an in-process call
        expect(leasedTask).toBe('temporal-summary');
        expect(spawnedTask).toBe('temporal-summary');
    });

    // Composition witness for the bootstrap rank. Gating the rank at lease admission alone is not
    // enough: a yield there only makes the picked winner abstain, and because this pipeline
    // dispatches exactly one candidate per poll and returns, that promotes nobody — the starved
    // bootstrap lane is never dispatched and its waiter entry expires before it runs, producing a
    // dead window followed by the original ordering. These arms pin the rank to SELECTION, where it
    // determines what actually executes.
    test.describe('bootstrap-critical rank is applied at selection, not only at admission', () => {
        // dream is far more stale than tenant-repo-sync, so pure staleness picks dream.
        const bootstrapCompetitionFixture = () => ({
            registry: [
                makeCandidateDescriptor({taskName: 'dream'}),
                makeCandidateDescriptor({taskName: 'tenant-repo-sync'})
            ],
            context: makeContext({
                now      : 1_000_000,
                state    : {dream: {lastRunAt: 0}, 'tenant-repo-sync': {lastRunAt: 990_000}},
                intervals: {dream: 10_000, tenantRepoSync: 10_000}
            })
        });

        test('CONTROL — without the bootstrap oracle the more-stale REM lane wins the poll', () => {
            const started             = [];
            const {registry, context} = bootstrapCompetitionFixture();

            const result = runSchedulingPipeline({
                registry,
                context,
                services: makeServices({
                    processSupervisorService: {runTask(taskName) { started.push(taskName); return true }}
                }),
                runtime: makeRuntime()
            });

            // Establishes that the assertion below is not vacuous: staleness genuinely favours dream.
            expect(result.winner.taskName).toBe('dream');
            expect(started).toEqual(['dream']);
        });

        test('a registered bootstrap-critical lane is DISPATCHED over the more-stale REM lane', () => {
            const started             = [];
            const {registry, context} = bootstrapCompetitionFixture();

            const result = runSchedulingPipeline({
                registry,
                context,
                services: makeServices({
                    maintenanceBackpressureService: {
                        acquireLeaseAndExecute({executeFn, taskName, reason, onSuccess, activeHeavyTask}) {
                            return executeFn(taskName, reason, onSuccess, {activeHeavyTask});
                        },
                        executeWithGoldenPathDependencyGate({executeFn, taskName, reason}) {
                            return executeFn(taskName, reason);
                        },
                        getActiveHeavyMaintenanceTask() { return null },
                        isHeavyMaintenanceTask() { return false },
                        recordDeferral() {},
                        isBootstrapCriticalTask(taskName) { return taskName === 'tenant-repo-sync' }
                    },
                    processSupervisorService: {runTask(taskName) { started.push(taskName); return true }}
                }),
                runtime: makeRuntime()
            });

            // The whole point of RA-1: the bootstrap lane RUNS. A veto-only fix would leave `started`
            // empty and the winner unexecuted, which is indistinguishable from progress on a dashboard.
            expect(result.winner.taskName).toBe('tenant-repo-sync');
            expect(started).toEqual(['tenant-repo-sync']);
        });

        test('a throwing bootstrap oracle fails open to staleness ordering', () => {
            const {registry, context} = bootstrapCompetitionFixture();

            const result = runSchedulingPipeline({
                registry,
                context,
                services: makeServices({
                    maintenanceBackpressureService: {
                        acquireLeaseAndExecute({executeFn, taskName, reason, onSuccess, activeHeavyTask}) {
                            return executeFn(taskName, reason, onSuccess, {activeHeavyTask});
                        },
                        executeWithGoldenPathDependencyGate({executeFn, taskName, reason}) {
                            return executeFn(taskName, reason);
                        },
                        getActiveHeavyMaintenanceTask() { return null },
                        isHeavyMaintenanceTask() { return false },
                        recordDeferral() {},
                        isBootstrapCriticalTask() { throw new Error('manifest unreadable') }
                    }
                }),
                runtime: makeRuntime()
            });

            expect(result.winner.taskName).toBe('dream');
        });
    });

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
                    maintenanceClass: 'heavy'
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
                        remBatchLimit    : 3,
                        remBatchSaturated: true,
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
                    markCompleted(taskName, lastCompletion) { calls.push(['markCompleted', taskName, lastCompletion]); },
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
            ['markCompleted', 'dream', {
                completedAt: '2026-06-21T12:00:00.000Z',
                durationMs : 42,
                runId      : 'run-completed',
                rem        : {
                    sessionsProcessed: 3,
                    batchLimit       : 3,
                    batchSaturated   : true
                }
            }]
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
                    remBatchLimit    : 3,
                    remBatchSaturated: true,
                    runId            : 'run-completed'
                }
            }
        ]);
    });

    test('records completed message-concept-harvest outcomes as successful runs (#13840)', async () => {
        const calls    = [];
        const outcomes = [];

        const result = runSchedulingPipeline({
            registry: [
                makeCandidateDescriptor({
                    taskName        : 'message-concept-harvest',
                    executionKind   : 'in-process-async',
                    maintenanceClass: 'heavy'
                })
            ],
            context : makeContext(),
            services: makeServices({
                dreamService: {
                    runMessageConceptHarvest: () => Promise.resolve({
                        candidatesAdded  : 2,
                        messagesProcessed: 7,
                        messagesMarked   : 7,
                        termsConsidered  : 3
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
            ['markStarted', 'message-concept-harvest', 'message-concept-harvest-reason'],
            ['markCompleted', 'message-concept-harvest']
        ]);
        expect(outcomes).toEqual([
            {
                taskName: 'message-concept-harvest',
                status  : 'running',
                details : {reason: 'message-concept-harvest-reason', startedAt: expect.any(String)}
            },
            {
                taskName: 'message-concept-harvest',
                status  : 'completed',
                details : {
                    reason           : 'message-concept-harvest-reason',
                    completedAt      : expect.any(String),
                    candidatesAdded  : 2,
                    messagesProcessed: 7,
                    messagesMarked   : 7,
                    termsConsidered  : 3
                }
            }
        ]);
    });

    test('records Golden Path failed outcomes without marking success (#13978)', async () => {
        const calls    = [];
        const outcomes = [];
        const state    = {};

        runSchedulingPipeline({
            registry: [
                makeCandidateDescriptor({
                    taskName        : 'golden-path',
                    executionKind   : 'in-process-async',
                    maintenanceClass: 'graph-dependent'
                })
            ],
            context : makeContext(),
            services: makeServices({
                goldenPathSynthesizer: {
                    synthesizeGoldenPath: () => Promise.resolve({
                        status      : 'failed',
                        reasonCode  : 'semantic-query-failed',
                        error       : 'Error executing plan: Internal error: Error finding id',
                        wroteHandoff: true
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

        await Promise.resolve();

        expect(calls).toEqual([
            ['markStarted', 'golden-path', 'golden-path-reason'],
            ['markFailed', 'golden-path', 1]
        ]);
        expect(state.lastReason).toBe('semantic-query-failed');
        expect(outcomes).toEqual([
            {
                taskName: 'golden-path',
                status  : 'running',
                details : {reason: 'golden-path-reason', startedAt: expect.any(String)}
            },
            {
                taskName: 'golden-path',
                status  : 'failed',
                details : {
                    reason      : 'golden-path-reason',
                    reasonCode  : 'semantic-query-failed',
                    error       : 'Error executing plan: Internal error: Error finding id',
                    failedAt    : expect.any(String),
                    wroteHandoff: true
                }
            }
        ]);
    });

    test('records Golden Path missing handoff write proof as failure (#13985)', async () => {
        const calls    = [];
        const outcomes = [];
        const state    = {};

        runSchedulingPipeline({
            registry: [
                makeCandidateDescriptor({
                    taskName        : 'golden-path',
                    executionKind   : 'in-process-async',
                    maintenanceClass: 'graph-dependent'
                })
            ],
            context : makeContext(),
            services: makeServices({
                goldenPathSynthesizer: {
                    synthesizeGoldenPath: () => Promise.resolve({status: 'completed'})
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

        await Promise.resolve();

        expect(calls).toEqual([
            ['markStarted', 'golden-path', 'golden-path-reason'],
            ['markFailed', 'golden-path', 1]
        ]);
        expect(state.lastReason).toBe('golden-path-handoff-write-unverified');
        expect(outcomes).toEqual([
            {
                taskName: 'golden-path',
                status  : 'running',
                details : {reason: 'golden-path-reason', startedAt: expect.any(String)}
            },
            {
                taskName: 'golden-path',
                status  : 'failed',
                details : {
                    reason      : 'golden-path-reason',
                    reasonCode  : 'golden-path-handoff-write-unverified',
                    error       : 'Golden Path synthesizer did not report wroteHandoff=true.',
                    failedAt    : expect.any(String),
                    wroteHandoff: false
                }
            }
        ]);
    });

    test('records skipped Dream outcomes without marking success (#13767)', async () => {
        const calls      = [];
        const outcomes   = [];
        const dreamState = {};

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
                    getTaskState: () => dreamState,
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
        // The skip's TERMINAL edge is stamped before markSkipped persists — the breathing gap in
        // dream.mjs anchors on it, so a long skip cannot spend its own gap while running.
        expect(dreamState.lastSkippedAt).toBe('2026-06-21T12:01:00.000Z');
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
            {taskName: 'tenant-repo-sync'},
            {taskName: 'golden-path'},
            {taskName: 'message-concept-harvest'},
            {taskName: 'swarm-heartbeat'},               // light → omitted
            {taskName: 'embed-drain-liveness-watchdog'}  // health → omitted
        ];
        const state = {
            summary                  : {lastRunAt: 5_000},
            'tenant-repo-sync'       : {lastRunAt: 3_000},
            'golden-path'            : {lastRunAt: 1_000},
            'message-concept-harvest': {lastRunAt: 2_000}
        };
        const intervals = {
            summarySweep         : 600_000,
            tenantRepoSync       : 60_000,
            goldenPath           : 3_600_000,
            messageConceptHarvest: 21_600_000
        };

        const meta = buildTaskStalenessMeta({candidates, state, intervals});

        expect(meta).toEqual({
            summary                  : {lastRunAt: 5_000, cadenceMs: 600_000},
            'tenant-repo-sync'       : {lastRunAt: 3_000, cadenceMs: 60_000},
            'golden-path'            : {lastRunAt: 1_000, cadenceMs: 3_600_000},
            'message-concept-harvest': {lastRunAt: 2_000, cadenceMs: 21_600_000}
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

    test('TASK_STALENESS_CADENCE_KEY: excludes lightweight / health tasks and includes tenant-repo-sync heavy work', () => {
        expect(TASK_STALENESS_CADENCE_KEY['swarm-heartbeat']).toBeUndefined();
        expect(TASK_STALENESS_CADENCE_KEY['embed-drain-liveness-watchdog']).toBeUndefined();
        expect(TASK_STALENESS_CADENCE_KEY['rem-consolidation-liveness-watchdog']).toBeUndefined();
        expect(TASK_STALENESS_CADENCE_KEY['tenant-repo-sync']).toBe('tenantRepoSync');
        expect(TASK_STALENESS_CADENCE_KEY['message-concept-harvest']).toBe('messageConceptHarvest');
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

test.describe('orchestrator/scheduling/pipeline — data-integrity-sweep never-fail wrapper (#14109)', () => {
    // The health-check runner is fire-and-forget (runSchedulingPipeline does not await it), so a
    // macrotask flush drains the runner's microtasks before assertions.
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));

    function runSweep({gatherAndDiagnose}) {
        const calls    = [],
              outcomes = [],
              state    = {};

        runSchedulingPipeline({
            registry: [makeCandidateDescriptor({
                taskName        : 'data-integrity-sweep',
                executionKind   : 'health-check',
                maintenanceClass: 'health-monitor'
            })],
            context : makeContext(),
            services: makeServices({
                dataIntegrityDiagnosisService: {gatherAndDiagnose},
                healthService                : {
                    recordTaskOutcome(taskName, status, details) { outcomes.push({taskName, status, details}); }
                },
                taskStateService: {
                    getTaskState: () => state,
                    markCompleted(taskName)        { calls.push(['markCompleted', taskName]); },
                    markFailed(taskName, exitCode) { calls.push(['markFailed', taskName, exitCode]); },
                    markSkipped(taskName)          { calls.push(['markSkipped', taskName]); },
                    markStarted(taskName, reason)  { calls.push(['markStarted', taskName, reason]); }
                }
            }),
            runtime: makeRuntime()
        });

        return {calls, outcomes, state};
    }

    test('a clean decision records a completed health-outcome', async () => {
        const {calls, outcomes} = runSweep({
            gatherAndDiagnose: async () => ({status: 'clean', classifications: [], heals: []})
        });
        await flush();

        expect(calls).toEqual([
            ['markStarted', 'data-integrity-sweep', 'data-integrity-sweep-reason'],
            ['markCompleted', 'data-integrity-sweep']
        ]);
        expect(outcomes.at(-1)).toMatchObject({
            status : 'completed',
            details: {status: 'clean', classificationCount: 0, healCount: 0}
        });
    });

    test('an autonomous heal records a COMPLETED health-outcome (the runner self-healed — no failure, no operator)', async () => {
        const {calls, outcomes} = runSweep({
            gatherAndDiagnose: async () => ({status: 'healed', classifications: [{mode: 'wal-stall', terminalAction: 're-embed-missing'}], heals: [{outcome: {status: 'healed'}}]})
        });
        await flush();

        expect(calls).toContainEqual(['markCompleted', 'data-integrity-sweep']);
        // A self-heal is a SUCCESS (the immune system worked), not a failure — there is no escalate/operator state.
        expect(outcomes.at(-1)).toMatchObject({
            status : 'completed',
            details: {status: 'healed', classificationCount: 1, healCount: 1}
        });
    });

    test('a probe-unavailable decision records a failed health-outcome (a failed probe is not silently green)', async () => {
        const {outcomes} = runSweep({
            gatherAndDiagnose: async () => ({status: 'probe-unavailable', probeError: 'Chroma unreachable', classifications: [], heals: []})
        });
        await flush();

        expect(outcomes.at(-1)).toMatchObject({
            status : 'failed',
            details: {status: 'probe-unavailable', probeError: 'Chroma unreachable'}
        });
    });

    test('a throwing gatherAndDiagnose degrades to markFailed and NEVER rethrows (the never-fail guarantee)', async () => {
        const {calls, outcomes, state} = runSweep({
            gatherAndDiagnose: async () => { throw new Error('runner boom'); }
        });
        await flush();

        // The catch records the fault and clears running state; the rejection never propagates into the
        // scheduling loop (runSchedulingPipeline returned normally above).
        expect(calls).toContainEqual(['markFailed', 'data-integrity-sweep', 1]);
        expect(state.lastReason).toBe('runner boom');
        expect(outcomes.at(-1)).toMatchObject({
            status : 'failed',
            details: {phase: 'data-integrity-sweep-error', error: 'runner boom'}
        });
    });
});

test.describe('orchestrator/scheduling/pipeline — heavy-maintenance starvation watchdog runner (#17049)', () => {
    test('persists the verdict on the task-state envelope through healthy → degraded → healthy, over the REAL ledger', async () => {
        const fs   = (await import('fs')).default;
        const os   = (await import('os')).default;
        const path = (await import('path')).default;

        const dir        = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-starvation-watchdog-'));
        const leasePath  = path.join(dir, 'heavy-maintenance.lease');
        const waitersDir = path.join(dir, 'heavy-maintenance-waiters');
        fs.mkdirSync(waitersDir, {recursive: true});

        const watchdogState = {};
        const outcomes      = [];

        const drive = () => {
            const result = runSchedulingPipeline({
                registry: [
                    makeCandidateDescriptor({
                        taskName        : 'heavy-maintenance-starvation-watchdog',
                        executionKind   : 'health-check',
                        maintenanceClass: 'health-monitor'
                    })
                ],
                context : makeContext(),
                services: makeServices({
                    healthService: {
                        recordTaskOutcome(taskName, status, details) {
                            if (status !== 'running') outcomes.push({status, posture: details?.posture});
                        }
                    },
                    maintenanceBackpressureService: {
                        resolveLeasePath             : () => leasePath,
                        getActiveHeavyMaintenanceTask: () => null
                    },
                    taskStateService: {
                        getTaskState : () => watchdogState,
                        markCompleted() {},
                        markFailed() {},
                        markSkipped() {},
                        markStarted() {}
                    }
                }),
                runtime: makeRuntime({
                    heavyMaintenanceLeaseStaleAfterMs       : 6 * 60 * 60 * 1000,
                    heavyMaintenanceStarvationDegradeAfterMs: 60 * 60 * 1000
                })
            });

            return result.executed;
        };

        try {
            // Healthy: an empty ledger.
            await drive();
            expect(watchdogState.starvation).toMatchObject({posture: 'healthy', waiterCount: 0, breaches: []});

            // Degraded: a live waiter deferred two hours against a one-hour bound. No lease file
            // exists, so the receipt's holder is honestly null rather than fabricated.
            fs.writeFileSync(path.join(waitersDir, 'backup.json'), JSON.stringify({
                taskName         : 'backup',
                priorityZero     : true,
                bootstrapCritical: false,
                deferredSince    : new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                updatedAt        : new Date().toISOString(),
                pid              : 999999
            }));
            await drive();
            expect(watchdogState.starvation.posture).toBe('degraded');
            expect(watchdogState.starvation.breaches[0]).toMatchObject({taskName: 'backup', priorityZero: true, leaseHolder: null});

            // Healthy again: the waiter acquired (entry cleared) — the verdict is recomputed from the
            // live ledger, so no latch survives and no clear-logic exists to forget.
            fs.rmSync(path.join(waitersDir, 'backup.json'));
            await drive();
            expect(watchdogState.starvation.posture).toBe('healthy');

            expect(outcomes.map(outcome => outcome.status)).toEqual(['completed', 'failed', 'completed']);
            expect(outcomes.map(outcome => outcome.posture)).toEqual(['healthy', 'degraded', 'healthy']);
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });
});
