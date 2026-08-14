import {collectDueCandidates}                                  from './collector.mjs';
import {pickNextCandidate}                                     from './picker.mjs';
import {evaluateStallAlarm, getEmbedDrainPendingAge}           from './embedDrainLivenessWatchdog.mjs';
import {evaluateConsolidationStallAlarm, getRemCycleStaleness} from './remConsolidationLivenessWatchdog.mjs';
import {evaluateWaiterStarvation}                              from './heavyMaintenanceStarvationWatchdog.mjs';
import {classifyBootFreshness}                                 from '../services/bootIdentityFreshness.mjs';
import {listActiveWaitersSync}                                 from '../services/heavyMaintenanceWaiterLedger.mjs';
import {inspectHeavyMaintenanceLeaseSync}                      from '../services/heavyMaintenanceLeasePrimitives.mjs';
import {WAITER_ENTRY_STALE_AFTER_MS}                           from '../services/MaintenanceBackpressureService.mjs';

/**
 * Tasks that win the per-poll pick unconditionally when due. `backup` is data-safety:
 * a missed daily backup is a data-loss exposure, so it must never sit behind a backlog-draining
 * task. Registry order breaks ties among multiple priority-0 tasks.
 * @type {ReadonlyArray<String>}
 */
export const PRIORITY_ZERO_TASKS = Object.freeze(['backup']);

/**
 * Maps a staleness-eligible task to the `context.intervals` cadence key the picker normalizes its
 * overdue-ness against. DELIBERATELY scoped to the lease-competing heavy tasks plus the
 * graph-dependent `golden-path`, and EXCLUDES lightweight / health / continuous tasks
 * (`swarm-heartbeat`, `embed-drain-liveness-watchdog`): those keep registry-order (a neutral
 * staleness score of 0) so a frequently-due light task can never out-rank a heavy one and starve the
 * heavy pipeline — the inverse of the bug this ticket fixes. Backlog-driven tasks (`summary`,
 * `memory-summary-backfill`) have no real interval, so they share the summary-sweep cadence as a
 * nominal denominator; that reduces their comparison to least-recently-run, which is the intended
 * ordering (a starved backfill out-ages a constantly-running summary).
 * @type {Readonly<Object>}
 */
export const TASK_STALENESS_CADENCE_KEY = Object.freeze({
    summary                  : 'summarySweep',
    'memory-summary-backfill': 'summarySweep',
    kbSync                   : 'kbSync',
    githubWorkflowSync       : 'githubWorkflowSync',
    backup                   : 'backup',
    'graphlog-compaction'    : 'graphLogCompaction',
    'primary-dev-sync'       : 'primaryDevSync',
    'tenant-repo-sync'       : 'tenantRepoSync',
    dream                    : 'dream',
    'message-concept-harvest': 'messageConceptHarvest',
    'temporal-summary'       : 'temporalSummary',
    'golden-path'            : 'goldenPath'
});

/**
 * The maintenance-backpressure deferral `reasonCode`s that `MaintenanceBackpressureService.recordDeferral`
 * emits onto a deferred task's `skipped` outcome. The REM-consolidation watchdog re-labels a recent
 * `dream` (REM producer) skip as a `designed-deferral` boot-freshness disposition ONLY when its
 * `reasonCode` is one of these AND it carries a recency-bounded deferral-specific `deferredAt` — so a
 * generic or unrecognized skip is NOT a designed deferral and can never mask a genuine stall. Keep in
 * lockstep with the `recordDeferral` emitters in `MaintenanceBackpressureService`.
 * @type {ReadonlyArray<String>}
 */
export const RECOGNIZED_DEFERRAL_REASON_CODES = Object.freeze([
    'heavy-maintenance-shed-window',
    'heavy-maintenance-backpressure',
    'heavy-maintenance-lease-acquire-error',
    'heavy-maintenance-lease-held',
    'golden-path-dependency-backpressure'
]);

/**
 * @summary Builds the picker's per-candidate `{lastRunAt, cadenceMs}` staleness map.
 *
 * Only staleness-eligible candidates (keys of `TASK_STALENESS_CADENCE_KEY`) get an entry; the rest
 * are omitted so the pure picker scores them a neutral `0` and they fall back to registry order.
 *
 * @param {Object} options
 * @param {Array<Object>} options.candidates Due candidates from the collector.
 * @param {Object} options.state Orchestrator task-state map (`{[taskName]: {lastRunAt}}`).
 * @param {Object} options.intervals Resolved cadence intervals (`context.intervals`).
 * @returns {Object} `{[taskName]: {lastRunAt, cadenceMs}}`.
 */
export function buildTaskStalenessMeta({candidates, state, intervals}) {
    const taskMeta = {};
    for (const candidate of candidates) {
        const cadenceKey = TASK_STALENESS_CADENCE_KEY[candidate.taskName];
        if (!cadenceKey) continue;
        taskMeta[candidate.taskName] = {
            lastRunAt: state?.[candidate.taskName]?.lastRunAt ?? 0,
            cadenceMs: intervals?.[cadenceKey]
        };
    }
    return taskMeta;
}

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
    const state = typeof orchestrator.getAuthorityTaskState === 'function'
        ? orchestrator.getAuthorityTaskState()
        : orchestrator.taskStateService.getState();

    return {
        registry,
        context: buildSchedulingContext({
            db       : orchestrator.db,
            state,
            now,
            intervals: {
                summarySweep                           : config.orchestrator.intervals.summarySweepMs,
                kbSync                                 : config.orchestrator.intervals.kbSyncMs,
                githubWorkflowSync                     : config.orchestrator.intervals.githubWorkflowSyncMs,
                backup                                 : config.orchestrator.intervals.backupMs,
                backupRetryDelay                       : config.orchestrator.intervals.backupRetryDelayMs,
                backupRetryWindow                      : config.orchestrator.intervals.backupRetryWindowMs,
                graphLogCompaction                     : config.orchestrator.intervals.graphLogCompactionMs,
                primaryDevSync                         : config.orchestrator.intervals.primaryDevSyncMs,
                tenantRepoSync                         : config.orchestrator.tenantRepoSync.sweepCadenceMs,
                dream                                  : config.orchestrator.intervals.dreamMs,
                messageConceptHarvest                  : config.orchestrator.intervals.messageConceptHarvestMs,
                dreamOverflowThreshold                 : config.orchestrator.intervals.dreamOverflowThreshold,
                dreamBreathingGap                      : config.orchestrator.intervals.dreamBreathingGapMs,
                dreamIdleBacklogCadenceMultiplier      : config.orchestrator.intervals.dreamIdleBacklogCadenceMultiplier,
                remBacklogCatchupCooldown              : config.orchestrator.intervals.remBacklogCatchupCooldownMs,
                remStarvationBreaker                   : config.orchestrator.intervals.remStarvationBreakerMs,
                goldenPath                             : config.orchestrator.intervals.goldenPathMs,
                swarmHeartbeat                         : config.orchestrator.intervals.swarmHeartbeatMs,
                embedDrainLivenessWatchdogCheck        : config.orchestrator.intervals.embedDrainLivenessWatchdogCheckMs,
                remConsolidationWatchdogCheck          : config.orchestrator.intervals.remConsolidationWatchdogCheckMs,
                heavyMaintenanceStarvationWatchdogCheck: config.orchestrator.intervals.heavyMaintenanceStarvationWatchdogCheckMs,
                dataIntegritySweepCheck                : config.orchestrator.intervals.dataIntegritySweepCheckMs,
                temporalSummary                        : config.temporalSummary.aggregationIntervalMs
            },
            enables: {
                kbSync            : orchestrator.kbSyncEnabled,
                githubWorkflowSync: orchestrator.githubWorkflowSyncEnabled,
                graphLogCompaction: orchestrator.graphLogCompactionEnabled,
                primaryDevSync    : orchestrator.primaryDevSyncEnabled,
                tenantRepoSync    : orchestrator.tenantRepoSyncEnabled,
                swarmHeartbeat    : orchestrator.swarmHeartbeatEnabled,
                temporalSummary   : orchestrator.temporalSummaryEnabled
            },
            hooks: {
                log                                 : orchestrator.writeLog.bind(orchestrator),
                summaryGetDueTask                   : orchestrator.summaryGetDueTask,
                backupGetDueTask                    : orchestrator.backupGetDueTask,
                graphLogCompactionGetDueTask        : orchestrator.graphLogCompactionGetDueTask,
                primaryDevSyncGetDueTask            : orchestrator.primaryDevSyncGetDueTask,
                tenantRepoSyncGetDueTask            : orchestrator.tenantRepoSyncGetDueTask,
                dreamGetDueTask                     : orchestrator.dreamGetDueTask,
                goldenPathGetDueTask                : orchestrator.goldenPathGetDueTask,
                swarmHeartbeatGetDueTask            : orchestrator.swarmHeartbeatGetDueTask,
                swarmHeartbeatInitFailed            : !!orchestrator.swarmHeartbeatService.initFailed,
                embedDrainLivenessWatchdogGetDueTask: orchestrator.embedDrainLivenessWatchdogGetDueTask
            }
        }),
        services: {
            dreamService                           : orchestrator.dreamService,
            goldenPathSynthesizer                  : orchestrator.goldenPathSynthesizer,
            healthService                          : orchestrator.healthService,
            maintenanceBackpressureService         : orchestrator.maintenanceBackpressureService,
            primaryRepoSyncService                 : orchestrator.primaryRepoSyncService,
            processSupervisorService               : orchestrator.processSupervisorService,
            swarmHeartbeatService                  : orchestrator.swarmHeartbeatService,
            taskStateService                       : orchestrator.taskStateService,
            tenantRepoSyncService                  : orchestrator.tenantRepoSyncService,
            embedDrainLivenessAlarmDispatcher      : orchestrator.embedDrainLivenessAlarmDispatcher,
            remConsolidationLivenessAlarmDispatcher: orchestrator.remConsolidationLivenessAlarmDispatcher,
            dataIntegrityDiagnosisService          : orchestrator.dataIntegrityDiagnosisService
        },
        runtime: {
            goldenPathRepoEnrichmentEnabled         : orchestrator.goldenPathRepoEnrichmentEnabled,
            primaryDevSyncRootsConfig               : orchestrator.primaryDevSyncRootsConfig,
            tenantRepoSyncGlobalCadenceMs           : config.orchestrator.intervals.tenantRepoSyncMs,
            tenantRepoSyncJitterRatio               : config.orchestrator.tenantRepoSync.jitterRatio,
            embedDrainLivenessWatchdogWalDir        : orchestrator.embedDrainLivenessWatchdogWalDir,
            embedDrainLivenessWatchdogThresholdMs   : orchestrator.embedDrainLivenessWatchdogThresholdMs,
            embedDrainLivenessWatchdogAlarmEnabled  : orchestrator.embedDaemonEnabled,
            remConsolidationWatchdogRunStateDir     : orchestrator.remConsolidationWatchdogRunStateDir,
            remConsolidationWatchdogThresholdMs     : orchestrator.remConsolidationWatchdogThresholdMs,
            remConsolidationWatchdogAlarmEnabled    : config.orchestrator.intervals.dreamMs > 0,
            heavyMaintenanceStarvationDegradeAfterMs: orchestrator.heavyMaintenanceStarvationDegradeAfterMs,
            writeLog                                : orchestrator.writeLog.bind(orchestrator)
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
        runningTasks : runningTaskNames,
        policyContext: {
            runningHeavyTasks,
            isHeavyMaintenanceConflict: services.maintenanceBackpressureService.isHeavyMaintenanceConflict?.bind(
                services.maintenanceBackpressureService
            ),
            now              : context.now,
            taskMeta         : buildTaskStalenessMeta({candidates, state: context.state, intervals: context.intervals}),
            priorityZeroTasks: PRIORITY_ZERO_TASKS,
            // Selection-time bootstrap rank. Bound here rather than left to lease admission because
            // this pipeline dispatches exactly one candidate per poll: an admission-side yield makes
            // the winner abstain without promoting the starved task, so the bootstrap lane would
            // never be dispatched at all. Optional-chained so a service build without the predicate
            // degrades to staleness ordering.
            isBootstrapCriticalTask: services.maintenanceBackpressureService.isBootstrapCriticalTask?.bind(
                services.maintenanceBackpressureService
            )
        }
    });

    if (winner) {
        executeCandidate({
            candidate      : winner,
            activeHeavyTask: {
                name: services.maintenanceBackpressureService.getActiveHeavyMaintenanceTask({
                    candidateTaskName: winner.taskName
                })
            },
            services,
            runtime
        });
    }

    // Health-check lanes are read-only, lease-free, and self-cadenced (their own getDueTask gates
    // re-runs), so every DUE one dispatches alongside the winner instead of competing for the single
    // per-poll slot. Without this, a perpetually-due priority-zero task — a backup held behind an
    // out-of-process lease, exactly the starved state the starvation watchdog exists to report —
    // wins every poll and silences every monitor. Heavy-task admission semantics are untouched: the
    // winner path above is unchanged, and these dispatches acquire no lease and defer to nothing.
    for (const candidate of candidates) {
        if (candidate.descriptor?.executionKind !== 'health-check') continue;
        if (winner && candidate.taskName === winner.taskName) continue;

        executeCandidate({
            candidate,
            activeHeavyTask: {
                name: services.maintenanceBackpressureService.getActiveHeavyMaintenanceTask({
                    candidateTaskName: candidate.taskName
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
    const runningSet = new Set(runningTaskNames);

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
        reason                        : trigger.reason,
        onSuccess                     : trigger.onSuccess,
        executeFn                     : services.processSupervisorService.runTask.bind(services.processSupervisorService),
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
        taskName                      : candidate.taskName,
        reason                        : candidate.trigger.reason,
        onSuccess                     : candidate.trigger.onSuccess,
        executeFn,
        activeHeavyTask,
        maintenanceBackpressureService: services.maintenanceBackpressureService
    });
}

function executeInProcessCandidate({candidate, activeHeavyTask, services, runtime}) {
    const runners = {
        dream                    : (taskName, reason) => runDreamTask({taskName, reason, services}),
        'message-concept-harvest': (taskName, reason) => runMessageConceptHarvestTask({taskName, reason, services}),
        'golden-path'            : (taskName, reason) => runGoldenPathTask({
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
            reason  : candidate.trigger.reason,
            activeHeavyTask
        });
    }

    if (candidate.taskName === 'swarm-heartbeat') {
        return executeFn(candidate.taskName, candidate.trigger.reason);
    }

    return executeWithMaintenance({
        taskName                      : candidate.taskName,
        reason                        : candidate.trigger.reason,
        onSuccess                     : candidate.trigger.onSuccess,
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
    if (outcome.remBatchLimit !== undefined) recordPayload.remBatchLimit = outcome.remBatchLimit;
    if (outcome.remBatchSaturated !== undefined) recordPayload.remBatchSaturated = outcome.remBatchSaturated;

    switch (outcome.status) {
        case 'completed':
            services.taskStateService.markCompleted(taskName, {
                completedAt: outcome.completedAt,
                durationMs : outcome.durationMs,
                runId      : outcome.runId,
                rem        : {
                    sessionsProcessed: outcome.sessionsProcessed,
                    batchLimit       : outcome.remBatchLimit,
                    batchSaturated   : outcome.remBatchSaturated === true
                }
            });
            services.healthService?.recordTaskOutcome?.(taskName, 'completed', recordPayload);
            break;
        case 'skipped': {
            // Stamp the skip's TERMINAL edge before markSkipped persists (markSkipped stamps no
            // timestamp itself): a zero-session skip still runs decay and can take minutes on a CPU
            // plane, and the breathing gap in dream.mjs anchors on terminal time — without this
            // stamp, a long skip would already have "spent" the gap while running.
            const state = services.taskStateService.getTaskState(taskName);
            if (state) state.lastSkippedAt = outcome.completedAt;
            services.taskStateService.markSkipped(taskName);
            services.healthService?.recordTaskOutcome?.(taskName, 'skipped', {
                ...recordPayload,
                skipReason: outcome.skipReason
            });
            break;
        }
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

async function runMessageConceptHarvestTask({taskName, reason, services}) {
    services.taskStateService.markStarted(taskName, reason);
    services.healthService?.recordTaskOutcome?.(taskName, 'running', { reason, startedAt: new Date().toISOString() });

    try {
        const outcome = await services.dreamService.runMessageConceptHarvest();
        services.taskStateService.markCompleted(taskName);
        services.healthService?.recordTaskOutcome?.(taskName, 'completed', {
            reason,
            completedAt      : new Date().toISOString(),
            candidatesAdded  : outcome.candidatesAdded,
            messagesProcessed: outcome.messagesProcessed,
            messagesMarked   : outcome.messagesMarked,
            termsConsidered  : outcome.termsConsidered
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

async function runGoldenPathTask({taskName, reason, services, repoEnrichmentEnabled}) {
    services.taskStateService.markStarted(taskName, reason);
    services.healthService?.recordTaskOutcome?.(taskName, 'running', { reason, startedAt: new Date().toISOString() });
    try {
        const outcome = await services.goldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled});

        if (outcome?.status === 'failed' || outcome?.wroteHandoff !== true) {
            const writeProofMissing = outcome?.wroteHandoff !== true,
                  reasonCode        = writeProofMissing ? 'golden-path-handoff-write-unverified' : outcome.reasonCode,
                  error             = writeProofMissing ? 'Golden Path synthesizer did not report wroteHandoff=true.' : outcome.error;
            const state = services.taskStateService.getTaskState(taskName);
            if (state) state.lastReason = reasonCode || error || 'golden-path-failed';
            services.taskStateService.markFailed(taskName, 1);
            services.healthService?.recordTaskOutcome?.(taskName, 'failed', {
                reason,
                reasonCode,
                error,
                failedAt    : new Date().toISOString(),
                wroteHandoff: outcome?.wroteHandoff === true
            });
            return;
        }

        const completedAt = new Date().toISOString();
        services.taskStateService.markCompleted(taskName, {
            completedAt,
            prunedGuideEdges: outcome.prunedGuideEdges,
            selectedTopNodes: outcome.selectedTopNodes,
            wroteHandoff    : true
        });
        services.healthService?.recordTaskOutcome?.(taskName, 'completed', {
            reason,
            completedAt,
            prunedGuideEdges: outcome.prunedGuideEdges,
            selectedTopNodes: outcome.selectedTopNodes,
            wroteHandoff    : true
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
            runEmbedDrainLivenessWatchdogTask({taskName, reason, services, runtime}),
        'rem-consolidation-liveness-watchdog': (taskName, reason) =>
            runRemConsolidationLivenessWatchdogTask({taskName, reason, services, runtime}),
        'heavy-maintenance-starvation-watchdog': (taskName, reason) =>
            runHeavyMaintenanceStarvationWatchdogTask({taskName, reason, services, runtime}),
        'data-integrity-sweep': (taskName, reason) =>
            runDataIntegritySweepTask({taskName, reason, services, runtime})
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
 * @summary Runs the heavy-maintenance starvation watchdog: a read-only waiter-ledger scan that
 * degrades the health surface while any live waiter's deferral streak exceeds the configured bound.
 * Never throws.
 *
 * Verdict per check, four postures, no latch: the reading is recomputed from the live ledger, so a
 * waiter that acquires (entry cleared by `clearWaiterSync`) or whose heartbeat expires past the
 * ADMISSION freshness bound (`WAITER_ENTRY_STALE_AFTER_MS` — the same authority the fairness gate
 * reads, never the lease holder's 6h TTL) drops out on the next check by construction. Outcome
 * mapping: `degraded` → failed record with the receipt (each starved waiter's name, class,
 * `deferredSince`, the current lease holder); `unknown` (unreadable entries beside no readable
 * breach, or a watchdog fault) → skipped record — inconclusive is neither green nor red, and it
 * never authorizes degradation; `healthy` / `disabled` → completed record.
 *
 * @param {Object} options
 * @param {String} options.taskName
 * @param {String} options.reason Scheduling reason.
 * @param {Object} options.services Runtime collaborators (`taskStateService`, `healthService`,
 *   `maintenanceBackpressureService` for the lease-path resolution via its canonical
 *   `resolveHeavyMaintenanceLeasePath()`).
 * @param {Object} options.runtime Runtime policy values (`heavyMaintenanceStarvationDegradeAfterMs`, `writeLog`).
 * @returns {Promise<void>}
 */
async function runHeavyMaintenanceStarvationWatchdogTask({taskName, reason, services, runtime}) {
    try {
        services.taskStateService.markStarted(taskName, reason);
        services.healthService?.recordTaskOutcome?.(taskName, 'running', {reason, startedAt: new Date().toISOString()});

        const now       = Date.now();
        const leasePath = services.maintenanceBackpressureService.resolveHeavyMaintenanceLeasePath();

        // Freshness authority is the ADMISSION one: WAITER_ENTRY_STALE_AFTER_MS (10min heartbeat
        // bound), never the lease holder's 6h TTL — health must expire a dead waiter on the same
        // clock admission does, or a corpse the fairness gate already ignores holds health red for
        // hours while no starvation exists.
        const ledgerReading = listActiveWaitersSync({
            leasePath,
            staleAfterMs: WAITER_ENTRY_STALE_AFTER_MS,
            now
        });

        const inspection  = inspectHeavyMaintenanceLeaseSync({leasePath, now});
        const leaseHolder = inspection.active ? (inspection.lease?.owner ?? null) : null;

        const evaluation = evaluateWaiterStarvation({
            ledgerReading,
            now,
            degradeAfterMs: runtime.heavyMaintenanceStarvationDegradeAfterMs,
            leaseHolder
        });

        if (evaluation.unreadableCount > 0) {
            runtime.writeLog?.('WARN', `[Orchestrator] heavy-maintenance-starvation-watchdog: skipped ${evaluation.unreadableCount} unreadable waiter entr${evaluation.unreadableCount === 1 ? 'y' : 'ies'} (fail-open to the readable set).`);
        }

        const verdict = {
            posture        : evaluation.posture,
            checkedAt      : new Date(now).toISOString(),
            degradeAfterMs : evaluation.degradeAfterMs,
            waiterCount    : evaluation.waiterCount,
            unreadableCount: evaluation.unreadableCount,
            leaseHolder    : evaluation.leaseHolder,
            breaches       : evaluation.breaches
        };

        // Persist the verdict on the lane's durable task-state envelope BEFORE the terminal mark
        // (whose writeState carries it to disk). This is the CONSUMED channel: the deployment-state
        // bridge projects `state.starvation` into the snapshot that `inspect_deployment` /
        // `get_deployment_state_snapshot` serve — the in-memory health record below is per-process
        // telemetry and nothing reads it across the plane.
        const state = services.taskStateService.getTaskState(taskName);
        if (state) state.starvation = verdict;

        const details = {reason, ...verdict};

        if (evaluation.posture === 'degraded') {
            services.healthService?.recordTaskOutcome?.(taskName, 'failed', details);
            runtime.writeLog?.('WARN', `[Orchestrator] heavy-maintenance-starvation-watchdog: ${evaluation.breaches.length} waiter(s) starved past ${evaluation.degradeAfterMs}ms under holder ${evaluation.leaseHolder ?? 'none'}: ${evaluation.breaches.map(breach => `${breach.taskName} (deferred since ${breach.deferredSince})`).join(', ')} — the fairness yield bound has been exceeded; the lease pipeline is not admitting its waiters.`);
        } else if (evaluation.posture === 'unknown') {
            // Inconclusive is neither green nor red: recorded as skipped (the check ran, the answer
            // could not be asserted), and the posture — not the outcome word — is what consumers read.
            services.healthService?.recordTaskOutcome?.(taskName, 'skipped', details);
        } else {
            services.healthService?.recordTaskOutcome?.(taskName, 'completed', details);
        }

        services.taskStateService.markCompleted(taskName);
    } catch (e) {
        // Degrade to "unknown", never to silence and never to a false red: the persisted verdict says
        // the instrument failed (a broken watchdog is not a degraded plane), and the same never-fail
        // guarantee as the sibling watchdogs holds — record and swallow, never rethrow.
        try {
            const state = services.taskStateService.getTaskState(taskName);
            if (state) {
                state.lastReason = e.message;
                state.starvation = {
                    posture  : 'unknown',
                    checkedAt: new Date().toISOString(),
                    error    : e.message
                };
            }
            services.taskStateService.markFailed(taskName, 1);
            services.healthService?.recordTaskOutcome?.(taskName, 'failed', {
                reason,
                phase   : 'watchdog-error',
                posture : 'unknown',
                error   : e.message,
                failedAt: new Date().toISOString()
            });
            runtime.writeLog?.('ERROR', `[Orchestrator] heavy-maintenance-starvation-watchdog check failed (verdict recorded as unknown): ${e.message}`);
        } catch {
            // Last-resort swallow: the never-fail guarantee dominates all observability.
        }
    }
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

        const now                                          = Date.now();
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
                stalledSince   : stalledSince === null ? null : new Date(stalledSince).toISOString(),
                oldestTimestamp: oldestTimestamp === null ? null : new Date(oldestTimestamp).toISOString()
            });

            if (shouldAlarm && runtime.embedDrainLivenessWatchdogAlarmEnabled) {
                await dispatchEmbedDrainStallAlarm({
                    dispatcher: services.embedDrainLivenessAlarmDispatcher,
                    ageMs     : oldestAgeMs,
                    pendingCount,
                    thresholdMs,
                    stalledSince,
                    writeLog  : runtime.writeLog
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
 * @summary Runs the REM consolidation-liveness watchdog: read-only staleness check against the REM
 * run-state store, a passive health-record every check, and a one-shot active alarm. Never throws.
 *
 * Consolidation-side analog of {@link runEmbedDrainLivenessWatchdogTask} (one subsystem over). The
 * dream cycle is decoupled from the Golden Path forecast, so a stalled consolidation is otherwise
 * silent ("green-but-rotting"). Dual signal: (1) PASSIVE — `healthService.recordTaskOutcome` every
 * check (`failed` when the last successful REM cycle is stale/absent, `completed` otherwise) — the
 * observable consolidation-liveness signal; (2) a one-shot active alarm fired only on stall-onset
 * (latched via the clock-free `evaluateConsolidationStallAlarm`), so consecutive stalled checks do not
 * re-alert. The latch (`{alarmed, stalledSince}`) persists on the task-state envelope so it survives poll
 * cycles and restarts. The body is fully wrapped: a watchdog fault degrades to "no alarm" and never
 * breaks the scheduling loop.
 *
 * @param {Object} options
 * @param {String} options.taskName
 * @param {String} options.reason Scheduling reason.
 * @param {Object} options.services Runtime collaborators (`taskStateService`, `healthService`,
 *   `remConsolidationLivenessAlarmDispatcher`).
 * @param {Object} options.runtime Runtime policy (`remConsolidationWatchdogRunStateDir`,
 *   `remConsolidationWatchdogThresholdMs`, `remConsolidationWatchdogAlarmEnabled`, `writeLog`).
 * @returns {Promise<void>}
 */
async function runRemConsolidationLivenessWatchdogTask({taskName, reason, services, runtime}) {
    try {
        services.taskStateService.markStarted(taskName, reason);
        services.healthService?.recordTaskOutcome?.(taskName, 'running', {reason, startedAt: new Date().toISOString()});

        const now                                                 = Date.now();
        const {hasCycle, readFault, lastCompletedAt, stalenessMs} = await getRemCycleStaleness({
            remRunStateDir: runtime.remConsolidationWatchdogRunStateDir,
            now
        });

        // Backlog guard (the load-bearing axis this watchdog is scoped around): a stale/absent cycle only alarms when there is
        // undigested work to consolidate. Read it read-only via the dream service's existing scan; a
        // backlog-read fault folds into `readFault` so it fails soft to no alarm (never a false stall).
        let undigestedCount  = 0;
        let backlogReadFault = false;
        try {
            const undigested = await services.dreamService?.findUndigestedSessions?.();
            undigestedCount  = Array.isArray(undigested) ? undigested.length : 0;
        } catch {
            backlogReadFault = true;
        }

        // Persist the backlog count to the DREAM lane's state so its starvation-breaker (dream.mjs getDueTask)
        // can read it without a second scan — the watchdog already paid for this read. Fail-open: skip on a
        // backlog-read fault (the count stays 0/stale and the breaker holds rather than firing on noise).
        if (!backlogReadFault) {
            const dreamTaskState = services.taskStateService.getTaskState('dream');
            if (dreamTaskState) dreamTaskState.undigestedCount = undigestedCount;
        }

        const state       = services.taskStateService.getTaskState(taskName);
        const alarmState  = state?.remConsolidationAlarm ?? null;
        const thresholdMs = runtime.remConsolidationWatchdogThresholdMs;

        const {stalled, shouldAlarm, downTimeSuppressed, drainObserved, recoveryStarted, effectiveStalenessMs, nextAlarmState} = evaluateConsolidationStallAlarm({
            hasCycle,
            readFault      : readFault || backlogReadFault,
            stalenessMs,
            undigestedCount,
            thresholdMs,
            // Down-time exclusion: host-off / orchestrator-stopped intervals are time no cycle could
            // have run, so the stall clock is capped by this process's uptime (the evaluator defaults
            // to legacy wall-clock behavior for callers that do not pass it). The runtime override
            // exists so fixtures can pin the process-age dimension instead of depending on ambient
            // test-worker uptime.
            uptimeMs       : runtime.remConsolidationWatchdogUptimeMs ?? Math.round(process.uptime() * 1000),
            alarmState
        });

        // Stamp the stall-onset timestamp (the clock-free evaluator leaves it null on the latching
        // transition); preserve it across subsequent latched checks.
        const stalledSince = stalled
            ? (shouldAlarm ? now : (alarmState?.stalledSince ?? now))
            : null;
        // Persist the FULL recovery state: dropping recoveryBaseline would re-open the phase on the
        // next check (repeat note, undrainable comparison).
        if (state) state.remConsolidationAlarm = {alarmed: nextAlarmState.alarmed, stalledSince, recoveryBaseline: nextAlarmState.recoveryBaseline};

        const details = {
            reason,
            hasCycle,
            undigestedCount,
            stalenessMs,
            thresholdMs,
            lastCompletedAt: lastCompletedAt === null ? null : new Date(lastCompletedAt).toISOString(),
            checkedAt      : new Date(now).toISOString()
        };

        if (stalled) {
            // Advisory boot-identity classification: when a stall fires, distinguish a restart-lost
            // scheduler (this process booted after the last recorded cycle) from an as-yet-unexplained
            // gap, so the alarm carries its likely disposition rather than triggering a forensic hunt.
            // Advisory only — it never changes WHETHER the stall alarms, only its recorded reason.
            // A recent maintenance-deferral of the REM producer ('dream') explains the gap as a
            // designed deferral, not a restart-lost scheduler: read its reason from the shared
            // HealthService task-outcome surface, recency-bounded to the staleness window so a stale
            // prior deferral can't mask a genuine gap. Advisory only — a present reason re-labels the
            // disposition, never whether the stall alarms.
            const dreamOutcome = services.healthService?.getTaskOutcome?.('dream');
            // A recent `dream` skip re-labels the stall as a DESIGNED deferral ONLY when it is a
            // RECOGNIZED maintenance-backpressure deferral carrying a recency-bounded deferral-specific
            // `deferredAt` — so a generic / unrecognized skip can never mask a genuine gap.
            const deferralDetails = dreamOutcome?.status === 'skipped' ? dreamOutcome.details : null;
            const deferredAtMs    = Date.parse(deferralDetails?.deferredAt);
            const deferralReason  = (
                deferralDetails &&
                RECOGNIZED_DEFERRAL_REASON_CODES.includes(deferralDetails.reasonCode) &&
                Number.isFinite(deferredAtMs) &&
                (now - deferredAtMs) <= thresholdMs
            ) ? (deferralDetails.reason ?? deferralDetails.reasonCode) : null;

            const bootFreshness = classifyBootFreshness({
                bootAt     : now - Math.round(process.uptime() * 1000),
                lastCycleAt: lastCompletedAt,
                now,
                deferralReason
            }, {designedCadenceMs: thresholdMs, marginMs: 0});

            services.healthService?.recordTaskOutcome?.(taskName, 'failed', {
                ...details,
                stalledSince       : stalledSince === null ? null : new Date(stalledSince).toISOString(),
                bootFreshness      : bootFreshness.classification,
                bootFreshnessReason: bootFreshness.reason
            });

            if (shouldAlarm) {
                runtime.writeLog?.('WARN', `[Orchestrator] rem-consolidation-liveness-watchdog: REM consolidation STALLED (hasCycle=${hasCycle}, stalenessMs=${stalenessMs}, thresholdMs=${thresholdMs}, bootFreshness=${bootFreshness.classification}) — the dream stopped laying trails; the graph is rotting while the forecast looks fresh.`);
                if (runtime.remConsolidationWatchdogAlarmEnabled) {
                    await dispatchRemConsolidationStallAlarm({
                        dispatcher     : services.remConsolidationLivenessAlarmDispatcher,
                        hasCycle,
                        lastCompletedAt: details.lastCompletedAt,
                        stalenessMs,
                        undigestedCount,
                        thresholdMs,
                        stalledSince,
                        writeLog       : runtime.writeLog
                    });
                }
            }
        } else {
            services.healthService?.recordTaskOutcome?.(taskName, 'completed', {...details, drainObserved, recoveryBaseline: nextAlarmState.recoveryBaseline});

            if (recoveryStarted) {
                // Digest-resume note (INFO, never the swarm alarm): the cycle gap spans host-offline
                // time, so the stall clock resumed from boot instead of alerting. Emitted exactly
                // once at recovery-phase onset; the phase completes only when a later check observes
                // a strictly decreased backlog (evaluator recoveryBaseline).
                runtime.writeLog?.('INFO', `[Orchestrator] rem-consolidation-liveness-watchdog: digest-resume — cycle gap of ${stalenessMs}ms spans host-offline time (uptime ${effectiveStalenessMs}ms); recovery phase opened, watching for backlog drain (undigested: ${undigestedCount}).`);
            }
        }

        services.taskStateService.markCompleted(taskName);
    } catch (e) {
        // Degrade to "no alarm": record the fault and clear running state, never rethrow.
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
            runtime.writeLog?.('ERROR', `[Orchestrator] rem-consolidation-liveness-watchdog check failed (degraded to no-alarm): ${e.message}`);
        } catch {
            // Last-resort swallow: the never-fail guarantee dominates all observability.
        }
    }
}

/**
 * @summary Runs the data-integrity sweep: the read-only coverage probe + diagnosis routing of the
 * DataIntegrityDiagnosisService runner, recorded as a passive health signal. Never throws.
 *
 * The runner self-routes each finding to the actuator's AUTONOMOUS heal sink (`applyHeal`) — there is no
 * escalate/operator path. This wrapper records the passive health signal (`completed` on a clean store OR
 * after autonomous heals; `failed` only when the evidence probe was unavailable — the `status`/`probeError`
 * details distinguish them) and the never-fail guarantee: any error degrades to a recorded fault and never
 * breaks the scheduling loop.
 *
 * @param {Object} options
 * @param {String} options.taskName
 * @param {String} options.reason Scheduling reason.
 * @param {Object} options.services Runtime collaborators (`taskStateService`, `healthService`,
 *   `dataIntegrityDiagnosisService`).
 * @param {Object} options.runtime Runtime policy values (`writeLog`).
 * @returns {Promise<void>}
 */
async function runDataIntegritySweepTask({taskName, reason, services, runtime}) {
    try {
        services.taskStateService.markStarted(taskName, reason);
        services.healthService?.recordTaskOutcome?.(taskName, 'running', {reason, startedAt: new Date().toISOString()});

        const decision = await services.dataIntegrityDiagnosisService.gatherAndDiagnose();

        const details = {
            reason,
            status             : decision.status,
            classificationCount: Array.isArray(decision.classifications) ? decision.classifications.length : 0,
            healCount          : Array.isArray(decision.heals) ? decision.heals.length : 0,
            checkedAt          : new Date().toISOString()
        };
        if (decision.probeError) details.probeError = decision.probeError;

        // Chronic unsafe-input mis-wire alert: a sustained fail-closed for the same (action, collection) means a
        // caller is mis-wired and that heal silently never executes — surface it (the immune system's own
        // self-observability), since a single fail-closed is correct but a chronic one is otherwise invisible.
        if (Array.isArray(decision.chronicUnsafeInput) && decision.chronicUnsafeInput.length > 0) {
            details.chronicUnsafeInput = decision.chronicUnsafeInput;
            runtime.writeLog?.('WARN', `[Orchestrator] chronic unsafe-input mis-wire: ${decision.chronicUnsafeInput.map(c => `${c.action}/${c.collection}×${c.count}`).join(', ')} — a heal is silently never executing`);
        }

        // Self-heal semantics: a clean store AND an autonomously-healed store are both healthy outcomes (the
        // immune system worked). Only an unavailable probe is a not-healthy signal — there is no escalate state.
        const notHealthy = decision.status === 'probe-unavailable';
        services.healthService?.recordTaskOutcome?.(taskName, notHealthy ? 'failed' : 'completed', details);

        services.taskStateService.markCompleted(taskName);
    } catch (e) {
        // Degrade to "no alarm": record the fault and clear running state, never rethrow.
        try {
            const state = services.taskStateService.getTaskState(taskName);
            if (state) state.lastReason = e.message;
            services.taskStateService.markFailed(taskName, 1);
            services.healthService?.recordTaskOutcome?.(taskName, 'failed', {
                reason,
                phase   : 'data-integrity-sweep-error',
                error   : e.message,
                failedAt: new Date().toISOString()
            });
            runtime.writeLog?.('ERROR', `[Orchestrator] data-integrity-sweep check failed (degraded to no-alarm): ${e.message}`);
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

async function dispatchRemConsolidationStallAlarm({
    dispatcher,
    hasCycle,
    lastCompletedAt,
    stalenessMs,
    undigestedCount,
    thresholdMs,
    stalledSince,
    writeLog
}) {
    if (typeof dispatcher !== 'function') return;
    try {
        await dispatcher({hasCycle, lastCompletedAt, stalenessMs, undigestedCount, thresholdMs, stalledSince});
    } catch (e) {
        writeLog?.('ERROR', `[Orchestrator] REM consolidation stall-alarm dispatch failed: ${e.message}`);
    }
}

function recordUnsupportedCandidate({candidate, error, healthService, writeLog}) {
    writeLog?.('ERROR', `[Orchestrator] ${error}`);
    healthService?.recordTaskOutcome?.(candidate.taskName, 'failed', {
        phase: 'dispatch',
        error
    });
}
