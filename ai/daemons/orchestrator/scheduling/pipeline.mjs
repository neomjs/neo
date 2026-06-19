import {collectDueCandidates}                  from './collector.mjs';
import {pickNextCandidate}                      from './picker.mjs';
import {evaluateStallAlarm, getEmbedDrainPendingAge} from './embedDrainLivenessWatchdog.mjs';

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
                swarmHeartbeat        : config.orchestrator.intervals.swarmHeartbeatMs,
                embedDrainLivenessWatchdogCheck: config.orchestrator.intervals.embedDrainLivenessWatchdogCheckMs
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
                swarmHeartbeatInitFailed  : !!orchestrator.swarmHeartbeatService.initFailed,
                embedDrainLivenessWatchdogGetDueTask: orchestrator.embedDrainLivenessWatchdogGetDueTask
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
            tenantRepoSyncService        : orchestrator.tenantRepoSyncService,
            embedDrainLivenessAlarmDispatcher: orchestrator.embedDrainLivenessAlarmDispatcher
        },
        runtime: {
            goldenPathRepoEnrichmentEnabled: orchestrator.goldenPathRepoEnrichmentEnabled,
            primaryDevSyncRootsConfig      : orchestrator.primaryDevSyncRootsConfig,
            tenantRepoSyncGlobalCadenceMs  : config.orchestrator.intervals.tenantRepoSyncMs,
            tenantRepoSyncJitterRatio      : config.orchestrator.tenantRepoSync.jitterRatio,
            embedDrainLivenessWatchdogWalDir     : orchestrator.embedDrainLivenessWatchdogWalDir,
            embedDrainLivenessWatchdogThresholdMs: orchestrator.embedDrainLivenessWatchdogThresholdMs,
            embedDrainLivenessWatchdogAlarmEnabled: orchestrator.embedDaemonEnabled,
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
        policyContext : {
            runningHeavyTasks,
            isHeavyMaintenanceConflict: services.maintenanceBackpressureService.isHeavyMaintenanceConflict?.bind(
                services.maintenanceBackpressureService
            )
        }
    });

    if (winner) {
        executeCandidate({
            candidate: winner,
            activeHeavyTask: {
                name: services.maintenanceBackpressureService.getActiveHeavyMaintenanceTask({
                    candidateTaskName: winner.taskName
                })
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

    for (const candidate of candidates) {
        if (runningSet.has(candidate.taskName)) continue;

        const blockingHeavyTask = findBlockingHeavyTask({
            candidate,
            runningHeavyTasks,
            maintenanceBackpressureService
        });

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
 * @param {Object} options.candidate Scheduling candidate.
 * @param {Set<String>} options.runningHeavyTasks Running heavy task names.
 * @param {Object} options.maintenanceBackpressureService Backpressure policy service.
 * @returns {String|null}
 */
function findBlockingHeavyTask({candidate, runningHeavyTasks, maintenanceBackpressureService}) {
    if (candidate.descriptor.maintenanceClass !== 'heavy') return null;

    for (const runningTaskName of runningHeavyTasks) {
        if (runningTaskName === candidate.taskName) continue;
        if (typeof maintenanceBackpressureService.isHeavyMaintenanceConflict === 'function') {
            if (maintenanceBackpressureService.isHeavyMaintenanceConflict(candidate.taskName, runningTaskName)) {
                return runningTaskName;
            }
            continue;
        }
        return runningTaskName;
    }

    return null;
}

/**
 * @param {Object} options
 * @returns {*}
 */
export function executeCandidate({candidate, activeHeavyTask, services, runtime}) {
    const dispatch = {
        'supervised-child-process': executeSupervisedCandidate,
        'service-runner'          : executeServiceRunnerCandidate,
        'in-process-async'        : executeInProcessCandidate,
        'health-check'            : executeHealthCheckCandidate
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

/**
 * @summary Dispatches the read-only `health-check` execution kind.
 *
 * Currently a single lane (`embed-drain-liveness-watchdog`). Unlike the heavy/service kinds, a
 * health-check takes no maintenance lease and runs directly — it is read-only and lightweight, so it
 * must never be gated by backpressure. The runner itself is fully wrapped so a check failure degrades
 * to "no alarm" and never propagates into the pipeline.
 *
 * @param {Object} options
 * @returns {*}
 */
function executeHealthCheckCandidate({candidate, services, runtime}) {
    const runners = {
        'embed-drain-liveness-watchdog': (taskName, reason) =>
            runEmbedDrainLivenessWatchdogTask({taskName, reason, services, runtime})
    };

    const executeFn = runners[candidate.taskName];
    if (!executeFn) {
        recordUnsupportedCandidate({
            candidate,
            error        : `Unsupported health-check task: ${candidate.taskName}`,
            healthService: services.healthService,
            writeLog     : runtime.writeLog
        });
        return false;
    }

    return executeFn(candidate.taskName, candidate.trigger.reason);
}

/**
 * @summary Runs the embed-drain liveness watchdog: read-only WAL-backlog age check, passive
 * health-record, and a one-shot active stall alarm. Never throws.
 *
 * Dual alarm per the ticket: (1) PASSIVE — `healthService.recordTaskOutcome` every check (`failed`
 * when stalled, `completed` otherwise); (2) ACTIVE — a one-shot swarm/operator alarm fired only on
 * stall-onset, latched so consecutive stalled checks do not re-alarm; a healthy check clears the
 * latch. The active alarm is additionally gated by `embedDrainLivenessWatchdogAlarmEnabled` (the
 * orchestrator's `embedDaemonEnabled`) so a deployment with no local drainer never false-alarms on a
 * backlog another host is responsible for draining.
 *
 * The latch (`{alarmed, stalledSince}`) is persisted on the task-state envelope so it survives across
 * poll cycles and orchestrator restarts. The whole body is wrapped: any unexpected error is recorded
 * and swallowed — a watchdog fault must never block the never-fail `add_memory`/`appendWalMemory` path
 * nor break the scheduling loop.
 *
 * @param {Object} options
 * @param {String} options.taskName
 * @param {String} options.reason Scheduling reason.
 * @param {Object} options.services Runtime collaborators (`taskStateService`, `healthService`,
 *   `embedDrainLivenessAlarmDispatcher`).
 * @param {Object} options.runtime Runtime policy values (`embedDrainLivenessWatchdogWalDir`,
 *   `embedDrainLivenessWatchdogThresholdMs`, `embedDrainLivenessWatchdogAlarmEnabled`, `writeLog`).
 * @returns {Promise<void>}
 */
async function runEmbedDrainLivenessWatchdogTask({taskName, reason, services, runtime}) {
    try {
        services.taskStateService.markStarted(taskName, reason);
        services.healthService?.recordTaskOutcome?.(taskName, 'running', {reason, startedAt: new Date().toISOString()});

        const now = Date.now();
        const {oldestAgeMs, pendingCount, oldestTimestamp} = await getEmbedDrainPendingAge({
            walDir: runtime.embedDrainLivenessWatchdogWalDir,
            now
        });

        const state       = services.taskStateService.getTaskState(taskName);
        const alarmState  = state?.embedDrainAlarm ?? null;
        const thresholdMs = runtime.embedDrainLivenessWatchdogThresholdMs;

        const {stalled, shouldAlarm, nextAlarmState} = evaluateStallAlarm({
            oldestAgeMs, pendingCount, thresholdMs, alarmState
        });

        // Stamp the stall-onset timestamp (the clock-free evaluator leaves it null on the latching
        // transition); preserve it across subsequent latched checks.
        const stalledSince = stalled
            ? (shouldAlarm ? now : (alarmState?.stalledSince ?? now))
            : null;
        if (state) state.embedDrainAlarm = {alarmed: nextAlarmState.alarmed, stalledSince};

        const details = {reason, ageMs: oldestAgeMs, pendingCount, thresholdMs, checkedAt: new Date(now).toISOString()};

        if (stalled) {
            services.healthService?.recordTaskOutcome?.(taskName, 'failed', {
                ...details,
                stalledSince: stalledSince === null ? null : new Date(stalledSince).toISOString(),
                oldestTimestamp: oldestTimestamp === null ? null : new Date(oldestTimestamp).toISOString()
            });

            if (shouldAlarm && runtime.embedDrainLivenessWatchdogAlarmEnabled) {
                await dispatchEmbedDrainStallAlarm({
                    dispatcher  : services.embedDrainLivenessAlarmDispatcher,
                    ageMs       : oldestAgeMs,
                    pendingCount,
                    thresholdMs,
                    stalledSince,
                    writeLog    : runtime.writeLog
                });
            }
        } else {
            services.healthService?.recordTaskOutcome?.(taskName, 'completed', details);
        }

        services.taskStateService.markCompleted(taskName);
    } catch (e) {
        // Degrade to "no alarm": record the fault and clear running state, never rethrow. The
        // bookkeeping itself is guarded so even a failing health/state collaborator cannot turn a
        // watchdog fault into an unhandled rejection that breaks the scheduling loop.
        try {
            const state = services.taskStateService.getTaskState(taskName);
            if (state) state.lastReason = e.message;
            services.taskStateService.markFailed(taskName, 1);
            services.healthService?.recordTaskOutcome?.(taskName, 'failed', {
                reason,
                phase   : 'watchdog-error',
                error   : e.message,
                failedAt: new Date().toISOString()
            });
            runtime.writeLog?.('ERROR', `[Orchestrator] embed-drain-liveness-watchdog check failed (degraded to no-alarm): ${e.message}`);
        } catch {
            // Last-resort swallow: the never-fail guarantee dominates all observability.
        }
    }
}

/**
 * @summary Fires the one-shot active stall alarm via the injected dispatcher. Never throws — an alarm
 * dispatch failure is logged and swallowed (the passive health-record already captured the stall).
 * @param {Object} options
 * @returns {Promise<void>}
 */
async function dispatchEmbedDrainStallAlarm({dispatcher, ageMs, pendingCount, thresholdMs, stalledSince, writeLog}) {
    if (typeof dispatcher !== 'function') return;
    try {
        await dispatcher({ageMs, pendingCount, thresholdMs, stalledSince});
    } catch (e) {
        writeLog?.('ERROR', `[Orchestrator] embed-drain stall-alarm dispatch failed: ${e.message}`);
    }
}

function recordUnsupportedCandidate({candidate, error, healthService, writeLog}) {
    writeLog?.('ERROR', `[Orchestrator] ${error}`);
    healthService?.recordTaskOutcome?.(candidate.taskName, 'failed', {
        phase: 'dispatch',
        error
    });
}
