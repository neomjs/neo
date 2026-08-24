import {getDueTask as getSummaryDueTask}                            from './summary.mjs';
import {getDueTask as getBackupDueTask}                             from './backup.mjs';
import {getDueTask as getDreamDueTask}                              from './dream.mjs';
import {getDueTask as getGraphLogCompactionDueTask}                 from './graphLogCompaction.mjs';
import {getDueTask as getGoldenPathDueTask}                         from './goldenPath.mjs';
import {getDueTask as getMemorySummaryBackfillDueTask}              from './memorySummaryBackfill.mjs';
import {getDueTask as getPrimaryDevSyncDueTask}                     from './primaryDevSync.mjs';
import {getDueTask as getSwarmHeartbeatDueTask}                     from './swarmHeartbeat.mjs';
import {getDueTask as getTenantRepoSyncDueTask}                     from './tenantRepoSync.mjs';
import {getDueTask as getEmbedDrainLivenessWatchdogDueTask}         from './embedDrainLivenessWatchdog.mjs';
import {getDueTask as getRemConsolidationLivenessWatchdogDueTask}   from './remConsolidationLivenessWatchdog.mjs';
import {getDueTask as getHeavyMaintenanceStarvationWatchdogDueTask} from './heavyMaintenanceStarvationWatchdog.mjs';
import {getDueTask as getDataIntegritySweepDueTask}                 from './dataIntegritySweep.mjs';
import {getTaskAuthorityClass}                                      from '../taskAuthority.mjs';

function toTimestampMs(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string' && value) {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function getLatestTimestampMs(...values) {
    const timestamps = values.map(toTimestampMs).filter(Number.isFinite);
    return timestamps.length ? Math.max(...timestamps) : null;
}

/**
 * Coordinator-descriptor registry for the Orchestrator scheduling pipeline.
 *
 * Each descriptor maps a logical scheduling lane to:
 *   - `taskName`         — stable identity for state, lease, and health-record keying
 *   - `executionKind`    — dispatch discriminator for `Orchestrator#execute(winner)`
 *   - `maintenanceClass` — backpressure-policy bucket for `pickNextCandidate`
 *   - `backpressure`     — interaction rule with concurrent heavy maintenance
 *   - `dependencies`     — task names that must NOT be running before this one starts
 *   - `getDueTask`       — pure-function trigger projection (no I/O, no state writes)
 *
 * The `getDueTask` closure adapts the uniform `context` passed by the collector to each
 * scheduling module's specific destructure shape. This adapter lives inside the descriptor
 * so the collector can remain pure iteration rather than branch on task-specific shapes.
 *
 * Continuous tasks (`chroma`, `bridgeDaemon`, `mlx`) are intentionally NOT in this registry
 * — they are supervisor-restart-cooldown tasks handled directly in `Orchestrator#poll()`
 * before the cadence-driven pipeline runs. They have no cadence trigger, no due-check, and
 * no backpressure interaction. Forcing them into the descriptor model would add
 * trigger-less descriptors the picker would just bypass — pure ceremony.
 *
 * @see Orchestrator#poll
 * @see collectDueCandidates
 * @see pickNextCandidate
 */
const taskRegistry = [
    {
        taskName        : 'summary',
        executionKind   : 'supervised-child-process',
        maintenanceClass: 'heavy',
        backpressure    : 'exclusive-heavy',
        dependencies    : [],
        getDueTask({db, state, now, intervals, hooks}) {
            return (hooks.summaryGetDueTask || getSummaryDueTask)({
                db,
                state,
                now,
                summarySweepIntervalMs: intervals.summarySweep,
                log                   : hooks.log
            });
        }
    },
    {
        taskName        : 'memory-summary-backfill',
        executionKind   : 'supervised-child-process',
        maintenanceClass: 'heavy',
        backpressure    : 'exclusive-heavy',
        dependencies    : [],
        getDueTask({db, state, now}) {
            return getMemorySummaryBackfillDueTask({db, state, now});
        }
    },
    {
        taskName        : 'kbSync',
        executionKind   : 'supervised-child-process',
        maintenanceClass: 'heavy',
        backpressure    : 'exclusive-heavy',
        dependencies    : [],
        getDueTask({state, now, intervals, enables}) {
            if (!enables.kbSync) return null;
            const lastRunAt  = state.kbSync?.lastRunAt ?? 0;
            const intervalMs = intervals.kbSync;
            if (intervalMs > 0 && now - lastRunAt >= intervalMs) {
                return {
                    taskName: 'kbSync',
                    source  : 'periodic-sync',
                    reason  : `periodic-sync:${intervalMs}`
                };
            }
            return null;
        }
    },
    {
        taskName        : 'core-corpus-projection',
        executionKind   : 'supervised-child-process',
        maintenanceClass: 'heavy',
        backpressure    : 'exclusive-heavy',
        dependencies    : [],
        getDueTask({state, now, intervals, enables}) {
            if (!enables.corpusProjection) return null;
            const taskState     = state['core-corpus-projection'] || {};
            const terminalAt    = getLatestTimestampMs(taskState.lastSuccessAt, taskState.lastErrorAt);
            const cadenceAnchor = terminalAt ?? toTimestampMs(taskState.lastRunAt) ?? 0;
            const intervalMs    = intervals.corpusProjection;
            if (intervalMs > 0 && now - cadenceAnchor >= intervalMs) {
                return {
                    taskName: 'core-corpus-projection',
                    source  : 'periodic-projection',
                    reason  : `periodic-projection:${intervalMs}`
                };
            }
            return null;
        }
    },
    {
        taskName        : 'backup',
        executionKind   : 'supervised-child-process',
        maintenanceClass: 'heavy',
        backpressure    : 'exclusive-heavy',
        dependencies    : [],
        getDueTask({state, now, intervals, hooks}) {
            return (hooks.backupGetDueTask || getBackupDueTask)({
                state,
                now,
                backupIntervalMs   : intervals.backup,
                backupRetryDelayMs : intervals.backupRetryDelay,
                backupRetryWindowMs: intervals.backupRetryWindow
            });
        }
    },
    {
        taskName        : 'graphlog-compaction',
        executionKind   : 'supervised-child-process',
        maintenanceClass: 'heavy',
        backpressure    : 'exclusive-heavy',
        dependencies    : [],
        getDueTask({state, now, intervals, enables, hooks}) {
            return (hooks.graphLogCompactionGetDueTask || getGraphLogCompactionDueTask)({
                state,
                now,
                graphLogCompactionIntervalMs: intervals.graphLogCompaction,
                enabled                     : enables.graphLogCompaction
            });
        }
    },
    {
        taskName        : 'primary-dev-sync',
        executionKind   : 'service-runner',
        maintenanceClass: 'heavy',
        backpressure    : 'exclusive-heavy',
        dependencies    : [],
        getDueTask({state, now, intervals, enables, hooks}) {
            return (hooks.primaryDevSyncGetDueTask || getPrimaryDevSyncDueTask)({
                state,
                now,
                intervalMs: intervals.primaryDevSync,
                enabled   : enables.primaryDevSync
            });
        }
    },
    {
        taskName        : 'tenant-repo-sync',
        executionKind   : 'service-runner',
        maintenanceClass: 'heavy',
        backpressure    : 'exclusive-heavy',
        dependencies    : [],
        getDueTask({state, now, intervals, enables, hooks}) {
            return (hooks.tenantRepoSyncGetDueTask || getTenantRepoSyncDueTask)({
                state,
                now,
                intervalMs: intervals.tenantRepoSync,
                enabled   : enables.tenantRepoSync
            });
        }
    },
    {
        taskName        : 'dream',
        executionKind   : 'in-process-async',
        maintenanceClass: 'heavy',
        backpressure    : 'exclusive-heavy',
        dependencies    : [],
        getDueTask({state, now, intervals, hooks}) {
            return (hooks.dreamGetDueTask || getDreamDueTask)({
                state                       : state.dream ?? {},
                now,
                dreamIntervalMs             : intervals.dream,
                dreamOverflowThreshold      : intervals.dreamOverflowThreshold,
                remBacklogCatchupCooldownMs : intervals.remBacklogCatchupCooldown,
                remStarvationBreakerMs      : intervals.remStarvationBreaker,
                breathingGapMs              : intervals.dreamBreathingGap,
                idleBacklogCadenceMultiplier: intervals.dreamIdleBacklogCadenceMultiplier,
                // The undigested-backlog count the watchdog pairs with staleness, persisted to the dream
                // task state each pipeline tick (see the watchdog eval) so this pure projection stays I/O-free.
                undigestedBacklog           : state.dream?.undigestedCount ?? 0
            });
        }
    },
    {
        taskName        : 'message-concept-harvest',
        executionKind   : 'in-process-async',
        maintenanceClass: 'heavy',
        backpressure    : 'exclusive-heavy',
        dependencies    : [],
        getDueTask({state, now, intervals}) {
            const lastRunAt  = state['message-concept-harvest']?.lastRunAt ?? 0;
            const intervalMs = intervals.messageConceptHarvest;
            if (intervalMs > 0 && now - lastRunAt >= intervalMs) {
                return {
                    taskName: 'message-concept-harvest',
                    source  : 'periodic-message-concept-harvest',
                    reason  : `periodic-message-concept-harvest:${intervalMs}`
                };
            }
            return null;
        }
    },
    {
        // The temporal-pyramid L1/L2 durable aggregation lane: folds PRs + sessions + graduations into the
        // durable SUMMARY_SESSION / SUMMARY_DAILY records. A heavy, exclusive-heavy, backpressure-aware
        // supervised-child task (the landed heavy-maintenance pattern) — the orchestrator owns cadence + lease
        // and spawns a one-shot child per due tick; NOT an independent child poller. Inert until the config
        // opt-in flips: an unset `enables.temporalSummary` fails the guard, so the lane never dispatches while off.
        taskName        : 'temporal-summary',
        executionKind   : 'supervised-child-process',
        maintenanceClass: 'heavy',
        backpressure    : 'exclusive-heavy',
        dependencies    : [],
        getDueTask({state, now, intervals, enables}) {
            if (!enables.temporalSummary) return null;
            const lastRunAt  = state['temporal-summary']?.lastRunAt ?? 0;
            const intervalMs = intervals.temporalSummary;
            if (intervalMs > 0 && now - lastRunAt >= intervalMs) {
                return {
                    taskName: 'temporal-summary',
                    source  : 'periodic-temporal-summary',
                    reason  : `periodic-temporal-summary:${intervalMs}`
                };
            }
            return null;
        }
    },
    {
        taskName        : 'golden-path',
        executionKind   : 'in-process-async',
        maintenanceClass: 'graph-dependent',
        backpressure    : 'after-heavy',
        // Decoupled from `dream`: golden-path synthesis is cheap (rank + summarize the CURRENT
        // graph) and must run hourly for FRESHNESS — it must NOT block behind the heavy daily REM
        // digest (which can run hours, off-peak). A re-rank of the current graph is "not perfect,
        // but better than empty/stale" — the fix for the multi-day stale forecast.
        // `backpressure: 'after-heavy'` still yields briefly post-heavy-task.
        dependencies    : [],
        getDueTask({state, now, intervals, hooks}) {
            return (hooks.goldenPathGetDueTask || getGoldenPathDueTask)({
                state               : state['golden-path'] ?? {},
                now,
                goldenPathIntervalMs: intervals.goldenPath
            });
        }
    },
    {
        // The defect-ledger observer: a periodic digest over the zero-ceremony defect channel's
        // fold. Read-mostly — its one write is the digest broadcast itself, which doubles as the
        // re-report suppression ledger (a record re-qualifies only on count growth). Lightweight:
        // no lease, no backpressure, registry-order among the light tasks; the supervised child
        // self-limits and exits with no A2A write when nothing newly qualifies.
        taskName        : 'defect-ledger-digest',
        executionKind   : 'supervised-child-process',
        maintenanceClass: 'lightweight-signal',
        backpressure    : 'none',
        dependencies    : [],
        getDueTask({state, now, intervals}) {
            const lastRunAt  = state['defect-ledger-digest']?.lastRunAt ?? 0;
            const intervalMs = intervals.defectLedgerDigest;
            if (intervalMs > 0 && now - lastRunAt >= intervalMs) {
                return {
                    taskName: 'defect-ledger-digest',
                    source  : 'periodic-defect-ledger-digest',
                    reason  : `periodic-defect-ledger-digest:${intervalMs}`
                };
            }
            return null;
        }
    },
    {
        taskName        : 'swarm-heartbeat',
        executionKind   : 'in-process-async',
        maintenanceClass: 'lightweight-signal',
        backpressure    : 'none',
        dependencies    : [],
        getDueTask({state, now, intervals, enables, hooks}) {
            if (!enables.swarmHeartbeat) return null;
            if (hooks.swarmHeartbeatInitFailed) return null;
            return (hooks.swarmHeartbeatGetDueTask || getSwarmHeartbeatDueTask)({
                state                   : state['swarm-heartbeat'] ?? {},
                now,
                swarmHeartbeatIntervalMs: intervals.swarmHeartbeat
            });
        }
    },
    {
        taskName        : 'embed-drain-liveness-watchdog',
        executionKind   : 'health-check',
        maintenanceClass: 'health-monitor',
        backpressure    : 'none',
        dependencies    : [],
        getDueTask({state, now, intervals, hooks}) {
            return (hooks.embedDrainLivenessWatchdogGetDueTask || getEmbedDrainLivenessWatchdogDueTask)({
                state                            : state['embed-drain-liveness-watchdog'] ?? {},
                now,
                embedDrainLivenessWatchdogCheckMs: intervals.embedDrainLivenessWatchdogCheck
            });
        }
    },
    {
        // Consolidation-side analog of `embed-drain-liveness-watchdog` (one subsystem over): the REM
        // dream cycle digests sessions into the graph but is decoupled from the Golden Path forecast,
        // so a stalled consolidation produces NO user-visible error (the "green-but-rotting" state).
        // This read-only, no-backpressure health-check alarms on a stale/absent REM cycle —
        // consolidation-liveness observable, never assumed-green. Excluded from
        // TASK_STALENESS_CADENCE_KEY like the embed-drain sibling (health tasks keep registry-order).
        taskName        : 'rem-consolidation-liveness-watchdog',
        executionKind   : 'health-check',
        maintenanceClass: 'health-monitor',
        backpressure    : 'none',
        dependencies    : [],
        getDueTask({state, now, intervals, hooks}) {
            return (hooks.remConsolidationLivenessWatchdogGetDueTask || getRemConsolidationLivenessWatchdogDueTask)({
                state                          : state['rem-consolidation-liveness-watchdog'] ?? {},
                now,
                remConsolidationWatchdogCheckMs: intervals.remConsolidationWatchdogCheck
            });
        }
    },
    {
        taskName        : 'heavy-maintenance-starvation-watchdog',
        executionKind   : 'health-check',
        maintenanceClass: 'health-monitor',
        backpressure    : 'none',
        dependencies    : [],
        getDueTask({state, now, intervals, hooks}) {
            return (hooks.heavyMaintenanceStarvationWatchdogGetDueTask || getHeavyMaintenanceStarvationWatchdogDueTask)({
                state                                    : state['heavy-maintenance-starvation-watchdog'] ?? {},
                now,
                heavyMaintenanceStarvationWatchdogCheckMs: intervals.heavyMaintenanceStarvationWatchdogCheck
            });
        }
    },
    {
        // The data-integrity sweep: live scheduling of the data-integrity DETECT signal (the
        // "up but data-gutted reports green" blind spot). A read-only, no-backpressure health-check
        // that runs the DataIntegrityDiagnosisService runner (coverage audit -> diagnosis -> escalate
        // sink) — never a privileged action. Excluded from TASK_STALENESS_CADENCE_KEY like the watchdog
        // siblings (health tasks keep registry-order).
        taskName        : 'data-integrity-sweep',
        executionKind   : 'health-check',
        maintenanceClass: 'health-monitor',
        backpressure    : 'none',
        dependencies    : [],
        getDueTask({state, now, intervals}) {
            return getDataIntegritySweepDueTask({
                state                    : state['data-integrity-sweep'] ?? {},
                now,
                dataIntegritySweepCheckMs: intervals.dataIntegritySweepCheck
            });
        }
    }
];

export const TASK_REGISTRY = Object.freeze(taskRegistry.map(descriptor => ({
    ...descriptor,
    authorityClass: getTaskAuthorityClass(descriptor.taskName)
})));
