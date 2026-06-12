import {getDueTask as getSummaryDueTask}             from './summary.mjs';
import {getDueTask as getBackupDueTask}              from './backup.mjs';
import {getDueTask as getDreamDueTask}               from './dream.mjs';
import {getDueTask as getGraphLogCompactionDueTask}  from './graphLogCompaction.mjs';
import {getDueTask as getGoldenPathDueTask}          from './goldenPath.mjs';
import {getDueTask as getMemorySummaryBackfillDueTask} from './memorySummaryBackfill.mjs';
import {getDueTask as getPrimaryDevSyncDueTask}      from './primaryDevSync.mjs';
import {getDueTask as getSwarmHeartbeatDueTask}      from './swarmHeartbeat.mjs';
import {getDueTask as getTenantRepoSyncDueTask}      from './tenantRepoSync.mjs';

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
export const TASK_REGISTRY = Object.freeze([
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
        taskName        : 'backup',
        executionKind   : 'supervised-child-process',
        maintenanceClass: 'heavy',
        backpressure    : 'exclusive-heavy',
        dependencies    : [],
        getDueTask({state, now, intervals, hooks}) {
            return (hooks.backupGetDueTask || getBackupDueTask)({
                state,
                now,
                backupIntervalMs: intervals.backup
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
                enabled                      : enables.graphLogCompaction
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
        maintenanceClass: 'continuous',
        backpressure    : 'none',
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
                state                 : state.dream ?? {},
                now,
                dreamIntervalMs       : intervals.dream,
                dreamOverflowThreshold: intervals.dreamOverflowThreshold
            });
        }
    },
    {
        taskName        : 'golden-path',
        executionKind   : 'in-process-async',
        maintenanceClass: 'graph-dependent',
        backpressure    : 'after-heavy',
        dependencies    : ['dream'],
        getDueTask({state, now, intervals, hooks}) {
            return (hooks.goldenPathGetDueTask || getGoldenPathDueTask)({
                state               : state['golden-path'] ?? {},
                now,
                goldenPathIntervalMs: intervals.goldenPath
            });
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
    }
]);
