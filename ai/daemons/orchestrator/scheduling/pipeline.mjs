import {collectDueCandidates} from './collector.mjs';
import {pickNextCandidate}    from './picker.mjs';

/**
 * @summary Builds the read-only context consumed by scheduling descriptors.
 * @param {Object} options Scheduling context fields.
 * @returns {Object} Uniform collector context.
 */
export function buildSchedulingContext({db, state, now, intervals, enables, hooks}) {
    return {db, state, now, intervals, enables, hooks};
}

/**
 * @summary Adapts an Orchestrator instance to the scheduling-pipeline input shape.
 * @param {Object} options
 * @param {Object} options.orchestrator Runtime Orchestrator instance.
 * @param {Object} options.config Resolved AiConfig object.
 * @param {Number} options.now Epoch milliseconds.
 * @param {Array<Object>} options.registry Scheduling descriptor registry.
 * @returns {Object} `runSchedulingPipeline()` options.
 */
export function buildOrchestratorSchedulingOptions({orchestrator, config, now, registry}) {
    return {
        registry,
        context: buildSchedulingContext({
            db       : orchestrator.db,
            state    : orchestrator.taskStateService.getState(),
            now,
            intervals: {
                summarySweep          : config.orchestrator.intervals.summarySweepMs,
                kbSync                : config.orchestrator.intervals.kbSyncMs,
                backup                : config.orchestrator.intervals.backupMs,
                graphLogCompaction    : config.orchestrator.intervals.graphLogCompactionMs,
                primaryDevSync        : config.orchestrator.intervals.primaryDevSyncMs,
                tenantRepoSync        : config.orchestrator.tenantRepoSync.sweepCadenceMs,
                dream                 : config.orchestrator.intervals.dreamMs,
                dreamOverflowThreshold: config.orchestrator.intervals.dreamOverflowThreshold,
                goldenPath            : config.orchestrator.intervals.goldenPathMs,
                swarmHeartbeat        : config.orchestrator.intervals.swarmHeartbeatMs
            },
            enables: {
                kbSync            : orchestrator.kbSyncEnabled,
                graphLogCompaction: orchestrator.graphLogCompactionEnabled,
                primaryDevSync    : orchestrator.primaryDevSyncEnabled,
                tenantRepoSync    : orchestrator.tenantRepoSyncEnabled,
                swarmHeartbeat    : orchestrator.swarmHeartbeatEnabled
            },
            hooks: {
                log                       : orchestrator.writeLog.bind(orchestrator),
                summaryGetDueTask         : orchestrator.summaryGetDueTask,
                backupGetDueTask          : orchestrator.backupGetDueTask,
                graphLogCompactionGetDueTask: orchestrator.graphLogCompactionGetDueTask,
                primaryDevSyncGetDueTask  : orchestrator.primaryDevSyncGetDueTask,
                tenantRepoSyncGetDueTask  : orchestrator.tenantRepoSyncGetDueTask,
                dreamGetDueTask           : orchestrator.dreamGetDueTask,
                goldenPathGetDueTask      : orchestrator.goldenPathGetDueTask,
                swarmHeartbeatGetDueTask  : orchestrator.swarmHeartbeatGetDueTask,
                swarmHeartbeatInitFailed  : !!orchestrator.swarmHeartbeatService.initFailed
            }
        }),
        services: {
            dreamService                 : orchestrator.dreamService,
            goldenPathSynthesizer        : orchestrator.goldenPathSynthesizer,
            healthService                : orchestrator.healthService,
            maintenanceBackpressureService: orchestrator.maintenanceBackpressureService,
            primaryRepoSyncService       : orchestrator.primaryRepoSyncService,
            processSupervisorService     : orchestrator.processSupervisorService,
            swarmHeartbeatService        : orchestrator.swarmHeartbeatService,
            taskStateService             : orchestrator.taskStateService,
            tenantRepoSyncService        : orchestrator.tenantRepoSyncService
        },
        runtime: {
            goldenPathRepoEnrichmentEnabled: orchestrator.goldenPathRepoEnrichmentEnabled,
            primaryDevSyncRootsConfig      : orchestrator.primaryDevSyncRootsConfig,
            tenantRepoSyncGlobalCadenceMs  : config.orchestrator.intervals.tenantRepoSyncMs,
            tenantRepoSyncJitterRatio      : config.orchestrator.tenantRepoSync.jitterRatio,
            writeLog                       : orchestrator.writeLog.bind(orchestrator)
        }
    };
}

/**
 * @summary Runs one registry scheduling pass and dispatches the selected candidate.
 *
 * This module owns cadence-pipeline side effects: scheduling-error reporting,
 * picker-visible deferral telemetry, and descriptor execution dispatch. The
 * Orchestrator supplies current runtime facts and remains the thin process-loop
 * coordinator.
 *
 * @param {Object} options
 * @param {Array<Object>} options.registry Scheduling descriptor registry.
 * @param {Object} options.context Context from `buildSchedulingContext()`.
 * @param {Object} options.services Runtime collaborators.
 * @param {Object} options.runtime Runtime policy values and stable functions.
 * @returns {{candidates: Object[], errors: Object[], winner: Object|null}}
 */
export function runSchedulingPipeline({registry, context, services, runtime}) {
    const {candidates, errors} = collectDueCandidates({registry, context});

    recordSchedulingErrors({errors, healthService: services.healthService, writeLog: runtime.writeLog});

    const runningTaskNames  = getRunningTaskNames(context.state);
    const runningHeavyTasks = getRunningHeavyTaskNames({
        runningTaskNames,
        maintenanceBackpressureService: services.maintenanceBackpressureService
    });

    recordPickerDeferrals({
        candidates,
        runningTaskNames,
        runningHeavyTasks,
        maintenanceBackpressureService: services.maintenanceBackpressureService
    });

    const winner = pickNextCandidate({
        candidates,
        runningTasks  : runningTaskNames,
        policyContext : {runningHeavyTasks}
    });

    if (winner) {
        executeCandidate({
            candidate: winner,
            activeHeavyTask: {
                name: services.maintenanceBackpressureService.getActiveHeavyMaintenanceTask()
            },
            services,
            runtime
        });
    }

    return {candidates, errors, winner};
}

/**
 * @param {Object} options
 * @param {Object[]} options.errors Collector error envelopes.
 * @param {Object} options.healthService Health reporter.
 * @param {Function} options.writeLog Log function.
 * @returns {void}
 */
export function recordSchedulingErrors({errors, healthService, writeLog}) {
    for (const {taskName, error} of errors) {
        writeLog?.('ERROR', `[Orchestrator] ${taskName} scheduling failed: ${error.message}`);
        healthService?.recordTaskOutcome?.(taskName, 'failed', {
            phase: 'schedule',
            error: error.message
        });
    }
}

/**
 * @param {Object} state Current task-state map.
 * @returns {String[]} Running task names.
 */
export function getRunningTaskNames(state) {
    return Object.keys(state).filter(taskName => state[taskName]?.running);
}

/**
 * @param {Object} options
 * @param {String[]} options.runningTaskNames Running task names.
 * @param {Object} options.maintenanceBackpressureService Backpressure service.
 * @returns {Set<String>} Running heavy task names.
 */
export function getRunningHeavyTaskNames({runningTaskNames, maintenanceBackpressureService}) {
    return new Set(
        runningTaskNames.filter(taskName => maintenanceBackpressureService.isHeavyMaintenanceTask(taskName))
    );
}

/**
 * Records observable deferrals for candidates the pure picker will filter.
 * @param {Object} options
 * @returns {void}
 */
export function recordPickerDeferrals({
    candidates,
    runningTaskNames,
    runningHeavyTasks,
    maintenanceBackpressureService
}) {
    const runningSet        = new Set(runningTaskNames);
    const blockingHeavyTask = runningHeavyTasks.values().next().value;

    for (const candidate of candidates) {
        if (runningSet.has(candidate.taskName)) continue;

        if (blockingHeavyTask && candidate.descriptor.maintenanceClass === 'heavy') {
            maintenanceBackpressureService.recordDeferral({
                taskName        : candidate.taskName,
                reasonCode      : 'heavy-maintenance-backpressure',
                reasonText      : candidate.trigger.reason,
                blockingTaskName: blockingHeavyTask
            });
            continue;
        }

        const blockingDependency = (candidate.descriptor.dependencies || [])
            .find(taskName => runningSet.has(taskName));

        if (blockingDependency) {
            maintenanceBackpressureService.recordDeferral({
                taskName        : candidate.taskName,
                reasonCode      : 'golden-path-dependency-backpressure',
                reasonText      : candidate.trigger.reason,
                blockingTaskName: blockingDependency
            });
        }
    }
}

/**
 * @param {Object} options
 * @returns {*}
 */
export function executeCandidate({candidate, activeHeavyTask, services, runtime}) {
    const dispatch = {
        'supervised-child-process': executeSupervisedCandidate,
        'service-runner'          : executeServiceRunnerCandidate,
        'in-process-async'        : executeInProcessCandidate
    };

    const execute = dispatch[candidate.descriptor.executionKind];

    if (!execute) {
        recordUnsupportedCandidate({
            candidate,
            error        : `Unsupported executionKind: ${candidate.descriptor.executionKind}`,
            healthService: services.healthService,
            writeLog     : runtime.writeLog
        });
        return false;
    }

    return execute({candidate, activeHeavyTask, services, runtime});
}

function executeSupervisedCandidate({candidate, activeHeavyTask, services}) {
    const {taskName, trigger} = candidate;
    return executeWithMaintenance({
        taskName,
        reason      : trigger.reason,
        onSuccess   : trigger.onSuccess,
        executeFn   : services.processSupervisorService.runTask.bind(services.processSupervisorService),
        activeHeavyTask,
        maintenanceBackpressureService: services.maintenanceBackpressureService
    });
}

function executeServiceRunnerCandidate({candidate, activeHeavyTask, services, runtime}) {
    const runners = {
        'primary-dev-sync': (taskName, reason) => services.primaryRepoSyncService.runTask({
            taskName,
            reason,
            taskStateService  : services.taskStateService,
            healthService     : services.healthService,
            writeLog          : runtime.writeLog,
            devSyncRootsConfig: runtime.primaryDevSyncRootsConfig
        }),
        'tenant-repo-sync': (taskName, reason) => services.tenantRepoSyncService.runTask({
            taskName,
            reason,
            taskStateService: services.taskStateService,
            healthService   : services.healthService,
            writeLog        : runtime.writeLog,
            globalCadenceMs : runtime.tenantRepoSyncGlobalCadenceMs,
            jitterRatio     : runtime.tenantRepoSyncJitterRatio
        })
    };

    const executeFn = runners[candidate.taskName];
    if (!executeFn) {
        recordUnsupportedCandidate({
            candidate,
            error        : `Unsupported service-runner task: ${candidate.taskName}`,
            healthService: services.healthService,
            writeLog     : runtime.writeLog
        });
        return false;
    }

    return executeWithMaintenance({
        taskName    : candidate.taskName,
        reason      : candidate.trigger.reason,
        onSuccess   : candidate.trigger.onSuccess,
        executeFn,
        activeHeavyTask,
        maintenanceBackpressureService: services.maintenanceBackpressureService
    });
}

function executeInProcessCandidate({candidate, activeHeavyTask, services, runtime}) {
    const runners = {
        dream: (taskName, reason) => runDreamTask({taskName, reason, services}),
        'golden-path': (taskName, reason) => runGoldenPathTask({
            taskName,
            reason,
            services,
            repoEnrichmentEnabled: runtime.goldenPathRepoEnrichmentEnabled
        }),
        'swarm-heartbeat': (taskName, reason) => runSwarmHeartbeatTask({taskName, reason, services})
    };

    const executeFn = runners[candidate.taskName];
    if (!executeFn) {
        recordUnsupportedCandidate({
            candidate,
            error        : `Unsupported in-process task: ${candidate.taskName}`,
            healthService: services.healthService,
            writeLog     : runtime.writeLog
        });
        return false;
    }

    if (candidate.taskName === 'golden-path') {
        return services.maintenanceBackpressureService.executeWithGoldenPathDependencyGate({
            taskName: candidate.taskName,
            executeFn,
            reason: candidate.trigger.reason,
            activeHeavyTask
        });
    }

    if (candidate.taskName === 'swarm-heartbeat') {
        return executeFn(candidate.taskName, candidate.trigger.reason);
    }

    return executeWithMaintenance({
        taskName    : candidate.taskName,
        reason      : candidate.trigger.reason,
        onSuccess   : candidate.trigger.onSuccess,
        executeFn,
        activeHeavyTask,
        maintenanceBackpressureService: services.maintenanceBackpressureService
    });
}

function executeWithMaintenance({
    taskName,
    reason,
    onSuccess,
    executeFn,
    activeHeavyTask,
    maintenanceBackpressureService
}) {
    return maintenanceBackpressureService.acquireLeaseAndExecute({
        taskName, executeFn, reason, onSuccess, activeHeavyTask
    });
}

async function runDreamTask({taskName, reason, services}) {
    services.taskStateService.markStarted(taskName, reason);
    services.healthService?.recordTaskOutcome?.(taskName, 'running', { reason, startedAt: new Date().toISOString() });

    const outcome = await services.dreamService.executeRemCycle({
        reason,
        mode        : 'periodic',
        includeDecay: true
    });

    const recordPayload = {
        reason,
        completedAt      : outcome.completedAt,
        durationMs       : outcome.durationMs,
        sessionsProcessed: outcome.sessionsProcessed,
        runId            : outcome.runId
    };

    switch (outcome.status) {
        case 'completed':
            services.taskStateService.markCompleted(taskName);
            services.healthService?.recordTaskOutcome?.(taskName, 'completed', recordPayload);
            break;
        case 'skipped':
            services.taskStateService.markCompleted(taskName);
            services.healthService?.recordTaskOutcome?.(taskName, 'skipped', {
                ...recordPayload,
                skipReason: outcome.skipReason
            });
            break;
        case 'failed': {
            const state = services.taskStateService.getTaskState(taskName);
            if (state) {
                state.lastReason = outcome.diagnostic?.reason || outcome.error?.message;
            }
            services.taskStateService.markFailed(taskName, 1);
            services.healthService?.recordTaskOutcome?.(taskName, 'failed', {
                ...recordPayload,
                failedAt    : outcome.completedAt,
                failurePhase: outcome.diagnostic ? 'provider-readiness' : 'in-pipeline',
                diagnostic  : outcome.diagnostic,
                error       : outcome.error?.message
            });
            break;
        }
    }
}

async function runGoldenPathTask({taskName, reason, services, repoEnrichmentEnabled}) {
    services.taskStateService.markStarted(taskName, reason);
    services.healthService?.recordTaskOutcome?.(taskName, 'running', { reason, startedAt: new Date().toISOString() });
    try {
        await services.goldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled});
        services.taskStateService.markCompleted(taskName);
        services.healthService?.recordTaskOutcome?.(taskName, 'completed', {
            reason,
            completedAt: new Date().toISOString()
        });
    } catch (e) {
        const state = services.taskStateService.getTaskState(taskName);
        if (state) state.lastReason = e.message;
        services.taskStateService.markFailed(taskName, 1);
        services.healthService?.recordTaskOutcome?.(taskName, 'failed', {
            reason,
            error   : e.message,
            failedAt: new Date().toISOString()
        });
    }
}

async function runSwarmHeartbeatTask({taskName, reason, services}) {
    services.taskStateService.markStarted(taskName, reason);
    services.healthService?.recordTaskOutcome?.(taskName, 'running', { reason, startedAt: new Date().toISOString() });
    try {
        await services.swarmHeartbeatService.pulse();
        services.taskStateService.markCompleted(taskName);
        services.healthService?.recordTaskOutcome?.(taskName, 'completed', {
            reason,
            completedAt: new Date().toISOString()
        });
    } catch (e) {
        const state = services.taskStateService.getTaskState(taskName);
        if (state) state.lastReason = e.message;
        services.taskStateService.markFailed(taskName, 1);
        services.healthService?.recordTaskOutcome?.(taskName, 'failed', {
            reason,
            error   : e.message,
            failedAt: new Date().toISOString()
        });
    }
}

function recordUnsupportedCandidate({candidate, error, healthService, writeLog}) {
    writeLog?.('ERROR', `[Orchestrator] ${error}`);
    healthService?.recordTaskOutcome?.(candidate.taskName, 'failed', {
        phase: 'dispatch',
        error
    });
}
