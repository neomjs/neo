import fs       from 'fs-extra';
import path     from 'node:path';
import Neo      from '../../../../src/Neo.mjs';
import Base     from '../../../../src/core/Base.mjs';
import AiConfig from '../../../config.mjs';
import {
    acquireHeavyMaintenanceLeaseSync,
    releaseHeavyMaintenanceLeaseSync,
    resolveHeavyMaintenanceLeasePath as resolveLeasePath
} from './HeavyMaintenanceLeaseService.mjs';
import {
    clearWaiterSync,
    findWaiterToYieldTo,
    listActiveWaitersSync,
    registerWaiterSync
} from './heavyMaintenanceWaiterLedger.mjs';

/**
 * Canonical set of heavy-maintenance task names that participate in the cross-poll
 * backpressure invariant: across orchestrator-owned tasks AND lease-aware manual scripts
 * (`ai/scripts/maintenance/*.mjs`), at most one substrate-heavy maintenance job may hold
 * the heavy-maintenance lease at a time.
 *
 * @type {ReadonlyArray<String>}
 */
/**
 * Freshness bound for waiter-ledger entries. A live waiter refreshes its entry on every deferred
 * poll (~60s cadence), so ten minutes of silence means the waiter's process is gone — its entry
 * must stop making acquirers yield. Deliberately NOT the lease's 6h `staleAfterMs`: that bound is
 * sized for the longest legitimate HOLD, and a dead waiter vetoing acquisitions for 6 hours would
 * be a brand-new starvation shape.
 * @type {Number}
 */
export const WAITER_ENTRY_STALE_AFTER_MS = 10 * 60 * 1000;

export const DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES = Object.freeze([
    'summary',
    'memory-summary-backfill',
    'kbSync',
    'githubWorkflowSync',
    'backup',
    'graphlog-compaction',
    'primary-dev-sync',
    'tenant-repo-sync',
    'dream',
    'message-concept-harvest',
    'temporal-summary'
]);

/**
 * Heavy-maintenance pairs whose resource envelopes are compatible enough to run
 * concurrently.
 *
 * Currently EMPTY — the heavy-maintenance mutex is fully serialized. The prior
 * `['kbSync','memory-summary-backfill']` pair raced on the inherited-lease-token bypass:
 * `memory-summary-backfill` released the lease before the spawned `kbSync` child finished
 * booting, so the inherited token went stale, `withHeavyMaintenanceLease` fell through, and
 * `kbSync` SKIPPED its `syncDatabase` — a silent multi-day embedding stall. miniSummary
 * serializing behind KB embedding is the lesser cost than a silent embed stall. Re-introduce
 * a pair ONLY with a race-free handshake: the spawned child must be guaranteed its run
 * regardless of parent-lease release timing.
 *
 * @type {ReadonlyArray<ReadonlyArray<String>>}
 */
export const DEFAULT_COMPATIBLE_HEAVY_MAINTENANCE_TASK_PAIRS = Object.freeze([]);

/**
 * Tasks whose graph writes must complete before a Golden Path frontier refresh runs.
 *
 * Empty by default: Golden Path is intentionally decoupled from `dream`. The hourly re-rank
 * reads the CURRENT graph directly (not the dream digest — verified via the synthesizer-coupling
 * check), so it must not block behind the multi-hour REM digest — that coupling froze the
 * forecast for days. Accepted trade-off: a refresh racing an in-progress digest may not yet
 * reflect it (bounded staleness, "better than empty/stale"; the next hourly run picks it up).
 * Stays a reactive config leaf (`goldenPathDependencyTaskNames`), so a deployment can
 * re-introduce a write-completion dependency if a specific store needs it.
 *
 * @type {ReadonlyArray<String>}
 */
export const DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES = Object.freeze([]);

// ============================================================================
// Group 1 — Read-only predicates / finders (pure functions, no side effects)
// ============================================================================

/**
 * @summary Checks whether a task participates in cross-task maintenance backpressure.
 *
 * @param {Object} options
 * @param {String} options.taskName Stable orchestrator task name.
 * @param {ReadonlyArray<String>} options.heavyMaintenanceTaskNames Heavy-classification set.
 * @returns {Boolean}
 */
export function isHeavyMaintenanceTask({taskName, heavyMaintenanceTaskNames}) {
    return heavyMaintenanceTaskNames.includes(taskName);
}

/**
 * @summary Checks whether a task's graph writes block Golden Path frontier refresh.
 *
 * @param {Object} options
 * @param {String} options.taskName Stable orchestrator task name.
 * @param {ReadonlyArray<String>} options.goldenPathDependencyTaskNames Dependency set.
 * @returns {Boolean}
 */
export function isGoldenPathDependencyTask({taskName, goldenPathDependencyTaskNames}) {
    return goldenPathDependencyTaskNames.includes(taskName);
}

/**
 * @summary Checks whether two heavy-maintenance tasks are a documented compatible pair.
 *
 * @param {Object} options
 * @param {String|null|undefined} options.taskName Stable orchestrator task name.
 * @param {String|null|undefined} options.otherTaskName Stable orchestrator task name.
 * @param {ReadonlyArray<ReadonlyArray<String>>} options.compatibleHeavyMaintenanceTaskPairs Pair allow-list.
 * @returns {Boolean}
 */
export function areHeavyMaintenanceTasksCompatible({
    taskName,
    otherTaskName,
    compatibleHeavyMaintenanceTaskPairs = []
}) {
    if (!taskName || !otherTaskName || taskName === otherTaskName) return false;

    return compatibleHeavyMaintenanceTaskPairs.some(pair => (
        pair.includes(taskName) && pair.includes(otherTaskName)
    ));
}

/**
 * @summary Finds the first running heavy-maintenance task that conflicts with a candidate.
 *
 * @param {Object} options
 * @param {ReadonlyArray<String>} options.heavyMaintenanceTaskNames Heavy-classification set.
 * @param {Object} options.taskStateService Service exposing `getTaskState(name)`.
 * @param {String|null} [options.excludeTaskName=null] Task name to ignore.
 * @param {String|null} [options.candidateTaskName=null] Candidate task whose compatibility is checked.
 * @param {ReadonlyArray<ReadonlyArray<String>>} [options.compatibleHeavyMaintenanceTaskPairs=[]] Pair allow-list.
 * @returns {String|null}
 */
export function getActiveHeavyMaintenanceTask({
    heavyMaintenanceTaskNames,
    taskStateService,
    excludeTaskName = null,
    candidateTaskName = null,
    compatibleHeavyMaintenanceTaskPairs = []
}) {
    for (const taskName of heavyMaintenanceTaskNames) {
        if (taskName === excludeTaskName) continue;
        if (areHeavyMaintenanceTasksCompatible({
            taskName     : candidateTaskName,
            otherTaskName: taskName,
            compatibleHeavyMaintenanceTaskPairs
        })) continue;
        if (taskStateService.getTaskState(taskName)?.running) return taskName;
    }
    return null;
}

/**
 * @summary Finds a running task that would make Golden Path read a partial graph state.
 *
 * @param {Object} options
 * @param {ReadonlyArray<String>} options.goldenPathDependencyTaskNames Dependency set.
 * @param {Object} options.taskStateService Service exposing `getTaskState(name)`.
 * @param {String|null} [options.activeTaskName=null] Newly started task in the current poll.
 * @returns {String|null}
 */
export function getActiveGoldenPathDependencyTask({
    goldenPathDependencyTaskNames,
    taskStateService,
    activeTaskName = null
}) {
    if (activeTaskName && goldenPathDependencyTaskNames.includes(activeTaskName)) {
        return activeTaskName;
    }
    for (const taskName of goldenPathDependencyTaskNames) {
        if (taskStateService.getTaskState(taskName)?.running) return taskName;
    }
    return null;
}

/**
 * @summary Resolves the shared heavy-maintenance lease file path with multi-tier fallback.
 *
 * Defensive at use-site rather than configure-time so direct-poll callers (unit tests
 * bypassing `start()`) inherit a `dataDir`-scoped path instead of accidentally writing
 * to the canonical production lease.
 *
 * @param {Object} options
 * @param {String|null|undefined} options.heavyMaintenanceLeasePath Explicit override.
 * @param {String|null|undefined} options.dataDir Daemon data directory.
 * @returns {String}
 */
export function resolveHeavyMaintenanceLeasePath({heavyMaintenanceLeasePath, dataDir}) {
    return resolveLeasePath({
        leasePath: heavyMaintenanceLeasePath,
        dataDir  : dataDir || AiConfig.orchestrator.dataDir
    });
}

// ============================================================================
// Group 2 — Deferral recording (pure functions; mutate caller-owned dedup Set)
// ============================================================================

/**
 * @summary Clears all dedupe keys for a task once it is no longer deferred.
 *
 * Also ends the task's deferral STREAK, because "no longer deferred" is exactly the streak
 * boundary — a task that ran is a task that was not starved.
 *
 * @param {Object} options
 * @param {Set<String>} options.deferralLogKeys Caller-owned dedup Set.
 * @param {Map<String,String>} [options.deferralStreakStarts] Caller-owned `taskName -> ISO` streak map.
 * @param {String} options.taskName Stable orchestrator task name.
 * @returns {void}
 */
export function clearDeferralLogState({deferralLogKeys, deferralStreakStarts, taskName}) {
    deferralStreakStarts?.delete(taskName);

    if (!deferralLogKeys) return;
    const prefix = `${taskName}:`;
    for (const key of deferralLogKeys) {
        if (key.startsWith(prefix)) deferralLogKeys.delete(key);
    }
}

/**
 * @summary Records a sparse non-error deferral, polymorphic on `reasonCode`.
 *
 * Three reason classes share one entry point so operator dashboards + Memory Core graph
 * ingestion can route deferrals via a single shape with a discriminator field. Dedup
 * keys are constructed per-class so equivalent recurring deferrals collapse to one log
 * line, while distinct blocker/owner combinations remain separately tracked.
 *
 * | `reasonCode`                            | Blocker source            | Used by                    |
 * |-----------------------------------------|---------------------------|----------------------------|
 * | `'heavy-maintenance-backpressure'`      | `blockingTaskName`        | Intra-process heavy tasks  |
 * | `'heavy-maintenance-lease-held'`        | `holdingLease.owner`      | Inter-process file lease   |
 * | `'golden-path-dependency-backpressure'` | `blockingTaskName`        | Golden Path graph waits    |
 *
 * @param {Object} options
 * @param {Set<String>} options.deferralLogKeys Caller-owned dedup Set.
 * @param {String} options.taskName Deferred task name.
 * @param {String} options.reasonCode Discriminator field.
 * @param {String} options.reasonText Scheduling reason for the deferred task.
 * @param {String|null} [options.blockingTaskName=null] Active blocker (intra-process / golden-path).
 * @param {Object|null} [options.holdingLease=null] Active lease payload (cross-daemon only).
 * @param {Object} [options.taskDefinitions={}] Task-definition map for label resolution.
 * @param {Function} [options.writeLog=()=>{}] Logger function `(level, message) => void`.
 * @param {Object|null} [options.healthService=null] Optional `recordTaskOutcome(name, status, payload)` sink.
 * @param {Object|null} [options.taskStateService=null] Optional `markDeferred(name, deferredAt)` sink owning the DURABLE streak. Absent means in-memory only, which resets on restart.
 * @returns {void}
 */
export function recordDeferral({
    deferralLogKeys,
    deferralStreakStarts = null,
    taskName,
    reasonCode,
    reasonText,
    blockingTaskName = null,
    holdingLease     = null,
    taskDefinitions  = {},
    writeLog         = () => {},
    healthService    = null,
    taskStateService = null
}) {
    const isLeaseHeld = reasonCode === 'heavy-maintenance-lease-held';
    const holderOwner = holdingLease?.owner || 'unknown';
    // Dedup on STABLE identifiers only — the deferred task, its blocker, and the deferral reasonCode —
    // never the volatile `reasonText`: its `:<count>` / `:<interval>` suffix changes every poll and its
    // source-class is already implied by `taskName`, so including it churns the key (the dedup never
    // fires) without adding a real distinction. The full reasonText (with count) stays in the log
    // message + the recordTaskOutcome payload below.
    const dedupKey = isLeaseHeld
        ? `${taskName}:lease-held-by-${holderOwner}`
        : `${taskName}:${blockingTaskName}:${reasonCode}`;

    if (!deferralLogKeys.has(dedupKey)) {
        const taskLabel = taskDefinitions?.[taskName]?.label || taskName;

        if (isLeaseHeld) {
            writeLog('INFO', `[Orchestrator] Deferring ${taskLabel}; cross-daemon heavy-maintenance lease held by ${holderOwner} (${reasonText}).`);
        } else if (reasonCode === 'heavy-maintenance-shed-window') {
            // The shed-window has no blocking task — a `throttle-shed` heal deferred all heavy-maintenance for a window.
            writeLog('INFO', `[Orchestrator] Deferring ${taskLabel}; heavy-maintenance shed-window active (${reasonText}).`);
        } else {
            const blockingLabel = taskDefinitions?.[blockingTaskName]?.label || blockingTaskName;
            writeLog('INFO', `[Orchestrator] Deferring ${taskLabel}; ${reasonCode === 'golden-path-dependency-backpressure' ? 'dependency task' : 'heavy maintenance task'} ${blockingLabel} is active (${reasonText}).`);
        }

        deferralLogKeys.add(dedupKey);
    }

    // `deferredAt` is THIS poll. `deferredSince` is the start of the unbroken streak, and the two
    // answer different questions — which is why an 8.5-hour backup starvation was invisible: every
    // poll truthfully reported a deferral seconds old, and nothing accumulated them.
    //
    // ⚠️ Keyed on the STARVED TASK, deliberately NOT on `dedupKey`. The dedup key carries the
    // holder (`lease-held-by-<owner>`), so a streak keyed on it restarts whenever the holder
    // rotates — and rotation is exactly what happened: tenant-repo-sync → summary →
    // tenant-repo-sync, three "fresh" deferrals covering one continuous 8.5-hour starvation. The
    // streak must survive a change of blocker, because the consumer is asking how long THIS task
    // has been unable to run, not who most recently prevented it.
    if (deferralStreakStarts && !deferralStreakStarts.has(taskName)) {
        deferralStreakStarts.set(taskName, new Date().toISOString());
    }

    const outcomePayload = {
        reason    : reasonText,
        reasonCode,
        deferredAt: new Date().toISOString()
    };

    // **The durable streak wins over the in-memory one, and that ordering is the point.** The map lives on
    // this instance, so it resets on every daemon restart — a starvation that spans a restart reported a
    // FRESH streak, and a threshold measured from a value that resets can never be crossed. The persisted
    // envelope answers "how long has this task been unable to run" across the process that observed it.
    //
    // Absent both (direct pure-function callers that pass neither) reports no streak rather than a
    // falsely-fresh one — an unmeasured streak must not read as a just-started one.
    const durableSince  = taskStateService?.markDeferred?.(taskName, outcomePayload.deferredAt),
          deferredSince = durableSince || deferralStreakStarts?.get(taskName);

    if (deferredSince) {
        outcomePayload.deferredSince = deferredSince;
    }
    if (isLeaseHeld) {
        outcomePayload.holdingOwner = holderOwner;
        outcomePayload.holdingPid   = holdingLease?.pid;
    } else {
        outcomePayload.blockingTaskName = blockingTaskName;
    }

    healthService?.recordTaskOutcome?.(taskName, 'skipped', outcomePayload);

    // The payload carries the durable `deferredSince` (when measurable) — returning it lets the
    // instance layer register the waiter with the SAME quantity the starvation measurement records,
    // instead of re-deriving a per-poll timestamp that resets on every blocker rotation.
    return outcomePayload;
}

// ============================================================================
// Group 3 — Executor wrappers (Neo-class methods; orchestrate state + leases)
// ============================================================================

/**
 * @summary Cross-task maintenance backpressure + cross-daemon lease coordination.
 *
 * Owns the orchestrator's execution-phase policy surface: heavy/dependency classification
 * predicates, deferral recording, lease acquisition + release wrapping, and Golden Path
 * dependency gating. The Orchestrator delegates these concerns here so its scheduling
 * loop can be a generic registry-driven dispatch.
 *
 * The service WRAPS the existing `HeavyMaintenanceLeaseService` primitives — it does not
 * replace them. Lease IO (acquire / release / inspect) remains in that service; this
 * service owns the policy of WHEN to acquire, defer, or record.
 *
 * `DEFAULT_COMPATIBLE_HEAVY_MAINTENANCE_TASK_PAIRS` is the compatibility allow-list,
 * currently EMPTY: the heavy-maintenance mutex is fully serialized after the prior
 * `kbSync`/`memory-summary-backfill` pair raced on the inherited-lease-token bypass and
 * silently skipped KB embedding. Any future pair must be justified here AND prove it is
 * race-free (the spawned child guaranteed its run regardless of parent-lease timing).
 *
 * @class Neo.ai.daemons.orchestrator.services.MaintenanceBackpressureService
 * @extends Neo.core.Base
 */
export class MaintenanceBackpressureService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.orchestrator.services.MaintenanceBackpressureService'
         * @protected
         */
        className: 'Neo.ai.daemons.orchestrator.services.MaintenanceBackpressureService',
        /**
         * @member {ReadonlyArray<String>} heavyMaintenanceTaskNames_=DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES
         * @reactive
         */
        heavyMaintenanceTaskNames_: DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
        /**
         * @member {ReadonlyArray<ReadonlyArray<String>>} compatibleHeavyMaintenanceTaskPairs_=DEFAULT_COMPATIBLE_HEAVY_MAINTENANCE_TASK_PAIRS
         * @reactive
         */
        compatibleHeavyMaintenanceTaskPairs_: DEFAULT_COMPATIBLE_HEAVY_MAINTENANCE_TASK_PAIRS,
        /**
         * @member {ReadonlyArray<String>} goldenPathDependencyTaskNames_=DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES
         * @reactive
         */
        goldenPathDependencyTaskNames_: DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES,
        /**
         * @member {String|null} heavyMaintenanceLeasePath_=null
         * @reactive
         */
        heavyMaintenanceLeasePath_: null,
        /**
         * `null` = "resolve from the owning config leaf on read" (see `beforeGetDataDir`): a
         * leaf value in this static block would freeze at module load, not at the use site.
         * @member {String|null} dataDir_=null
         * @reactive
         */
        dataDir_: null,
        /**
         * @member {Object|null} taskStateService_=null
         * @reactive
         */
        taskStateService_: null,
        /**
         * @member {Object|null} healthService_=null
         * @reactive
         */
        healthService_: null,
        /**
         * @member {Object|null} taskDefinitions_=null
         * @reactive
         */
        taskDefinitions_: null,
        /**
         * @member {Function} writeLog_=()=>{}
         * @reactive
         */
        writeLog_: () => {},
        /**
         * @member {Function} acquireLeaseFn_=acquireHeavyMaintenanceLeaseSync
         * @reactive
         */
        acquireLeaseFn_: acquireHeavyMaintenanceLeaseSync,
        /**
         * @member {Function} releaseLeaseFn_=releaseHeavyMaintenanceLeaseSync
         * @reactive
         */
        releaseLeaseFn_: releaseHeavyMaintenanceLeaseSync,
        /**
         * Priority-class mirror of `PRIORITY_ZERO_TASKS` (`scheduling/pipeline.mjs`) — execution
         * policy needs the class without importing the selection module; a unit spec guards drift.
         * @member {String[]} priorityZeroTaskNames_=['backup']
         * @reactive
         */
        priorityZeroTaskNames_: ['backup']
    }

    /**
     * Per-instance dedup Set for sparse deferral logging.
     * @member {Set<String>} deferralLogKeys
     */
    deferralLogKeys = new Set()

    /**
     * Per-instance `taskName -> ISO timestamp` map recording when each task's CURRENT unbroken
     * deferral streak began. Entries are created on a task's first deferral and removed by
     * {@link MaintenanceBackpressureService#clearDeferralLogState} when it runs.
     *
     * Separate from {@link MaintenanceBackpressureService#deferralLogKeys} because that Set is keyed
     * per blocker (`<task>:lease-held-by-<owner>`) for log dedup, and a streak must survive the
     * blocker changing — see the note in `recordDeferral`.
     * @member {Map<String,String>} deferralStreakStarts
     */
    deferralStreakStarts = new Map()

    /**
     * Epoch ms until which heavy-maintenance is shed (deferred). `0` = no active window. Set by the `throttle-shed`
     * heal via `setShedWindow`; auto-expires (bounded, self-healing — no operator un-shed).
     * @member {Number} shedUntil=0
     */
    shedUntil = 0

    /**
     * @summary Resolves the runtime-state directory from the owning config leaf when no explicit
     * value was set — a per-read use-site resolution, never a module-load capture.
     * @param {String|null} value
     * @returns {String}
     */
    beforeGetDataDir(value) {
        return value ?? AiConfig.orchestrator.dataDir
    }

    /**
     * @summary Opens an auto-expiring shed-window: until `now + durationMs`, `acquireLeaseAndExecute` defers ALL
     * heavy-maintenance. The actuation primitive the `throttle-shed` heal calls to relieve resource contention —
     * bounded (auto-expires), self-healing (no operator un-shed). Max-wins on overlap, so a shorter later window
     * cannot curtail a longer active one (a heal never accidentally cuts a peer heal's shed short).
     * @param {Number} durationMs How long to shed heavy-maintenance (non-positive / non-finite → no-op).
     * @param {Number} [now=Date.now()] Injected clock (epoch ms).
     * @returns {Number} The resulting `shedUntil`.
     */
    setShedWindow(durationMs, now = Date.now()) {
        const until = now + (Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0);
        this.shedUntil = Math.max(this.shedUntil, until);
        return this.shedUntil;
    }

    /**
     * @summary Whether a shed-window is currently active (heavy-maintenance should defer).
     * @param {Number} [now=Date.now()] Injected clock (epoch ms).
     * @returns {Boolean}
     */
    isShedActive(now = Date.now()) {
        return now < this.shedUntil;
    }

    // --- Predicate / finder delegations to module-level pure functions ---

    /**
     * @param {String} taskName Stable orchestrator task name.
     * @returns {Boolean}
     */
    isHeavyMaintenanceTask(taskName) {
        return isHeavyMaintenanceTask({taskName, heavyMaintenanceTaskNames: this.heavyMaintenanceTaskNames});
    }

    /**
     * @param {String} taskName Stable orchestrator task name.
     * @returns {Boolean}
     */
    isGoldenPathDependencyTask(taskName) {
        return isGoldenPathDependencyTask({taskName, goldenPathDependencyTaskNames: this.goldenPathDependencyTaskNames});
    }

    /**
     * @param {String} taskName Stable orchestrator task name.
     * @param {String|null|undefined} otherTaskName Stable orchestrator task name.
     * @returns {Boolean}
     */
    areHeavyMaintenanceTasksCompatible(taskName, otherTaskName) {
        return areHeavyMaintenanceTasksCompatible({
            taskName,
            otherTaskName,
            compatibleHeavyMaintenanceTaskPairs: this.compatibleHeavyMaintenanceTaskPairs
        });
    }

    /**
     * @param {String} taskName Candidate heavy-maintenance task name.
     * @param {String|null|undefined} otherTaskName Running or lease-holding task name.
     * @returns {Boolean}
     */
    isHeavyMaintenanceConflict(taskName, otherTaskName) {
        if (!taskName || !otherTaskName || taskName === otherTaskName) return false;
        return this.isHeavyMaintenanceTask(taskName)
            && this.isHeavyMaintenanceTask(otherTaskName)
            && !this.areHeavyMaintenanceTasksCompatible(taskName, otherTaskName);
    }

    /**
     * @param {Object} [options]
     * @param {String|null} [options.excludeTaskName=null]
     * @param {String|null} [options.candidateTaskName=null]
     * @returns {String|null}
     */
    getActiveHeavyMaintenanceTask({excludeTaskName = null, candidateTaskName = null} = {}) {
        return getActiveHeavyMaintenanceTask({
            heavyMaintenanceTaskNames          : this.heavyMaintenanceTaskNames,
            taskStateService                   : this.taskStateService,
            excludeTaskName,
            candidateTaskName,
            compatibleHeavyMaintenanceTaskPairs: this.compatibleHeavyMaintenanceTaskPairs
        });
    }

    /**
     * @param {Object} [options]
     * @param {String|null} [options.activeTaskName=null]
     * @returns {String|null}
     */
    getActiveGoldenPathDependencyTask({activeTaskName = null} = {}) {
        return getActiveGoldenPathDependencyTask({
            goldenPathDependencyTaskNames: this.goldenPathDependencyTaskNames,
            taskStateService             : this.taskStateService,
            activeTaskName
        });
    }

    /**
     * @returns {String}
     */
    resolveHeavyMaintenanceLeasePath() {
        return resolveHeavyMaintenanceLeasePath({
            heavyMaintenanceLeasePath: this.heavyMaintenanceLeasePath,
            dataDir                  : this.dataDir
        });
    }

    // --- Deferral recording delegations ---

    /**
     * @param {String} taskName Stable orchestrator task name.
     * @returns {void}
     */
    clearDeferralLogState(taskName) {
        clearDeferralLogState({
            deferralLogKeys     : this.deferralLogKeys,
            deferralStreakStarts: this.deferralStreakStarts,
            taskName
        });
    }

    /**
     * @param {Object} options
     * @param {String} options.taskName Deferred task name.
     * @param {String} options.reasonCode Discriminator field.
     * @param {String} options.reasonText Scheduling reason.
     * @param {String|null} [options.blockingTaskName]
     * @param {Object|null} [options.holdingLease]
     * @returns {void}
     */
    recordDeferral({taskName, reasonCode, reasonText, blockingTaskName = null, holdingLease = null}) {
        const outcome = recordDeferral({
            deferralLogKeys     : this.deferralLogKeys,
            deferralStreakStarts: this.deferralStreakStarts,
            taskName,
            reasonCode,
            reasonText,
            blockingTaskName,
            holdingLease,
            taskDefinitions     : this.taskDefinitions,
            writeLog            : this.writeLog,
            healthService       : this.healthService,
            taskStateService    : this.taskStateService
        });

        // Fairness half of the lease contract: a lease/backpressure deferral with a measurable streak becomes a
        // REGISTERED waiter, so acquisition can stop stepping past measurably starving work. Only the
        // contention classes register — a shed-window or dependency gate is policy, not competition.
        if (outcome?.deferredSince && ['heavy-maintenance-lease-held', 'heavy-maintenance-backpressure', 'heavy-maintenance-yield-to-waiter'].includes(reasonCode)) {
            try {
                registerWaiterSync({
                    leasePath        : this.resolveHeavyMaintenanceLeasePath(),
                    taskName,
                    priorityZero     : this.isPriorityZeroTask(taskName),
                    bootstrapCritical: this.isBootstrapCriticalTask(taskName),
                    deferredSince    : outcome.deferredSince
                });
            } catch (e) {
                this.writeLog('ERROR', `[Orchestrator] Waiter registration failed for ${taskName}: ${e.message}`);
            }
        }
    }

    /**
     * @summary Whether the task outranks ordinary maintenance in the scheduler's priority model.
     *
     * Mirrors `PRIORITY_ZERO_TASKS` in `scheduling/pipeline.mjs` without importing it — the
     * scheduling module owns selection and this service owns execution, and a one-name constant
     * is cheaper than coupling the layers. The mirror is drift-guarded by a unit spec asserting
     * both arrays stay identical.
     *
     * @param {String} taskName Stable orchestrator task name.
     * @returns {Boolean}
     */
    isPriorityZeroTask(taskName) {
        return this.priorityZeroTaskNames.includes(taskName);
    }

    /**
     * @summary Whether the task is bootstrap-critical: initializing durable state the plane
     * cannot function without.
     *
     * For tenant-repo sync, the durable truth is the persisted revisions manifest the sync
     * lane itself maintains beside its checkpoints: bootstrap-spread seeding writes an entry
     * with `lastIngestedRev: null` for every configured repo on the first sweep, and a commit
     * replaces the null with a revision. Any remaining null therefore means a configured repo
     * has never completed its initial ingest — the knowledge base is still partially
     * uninitialized, and enrichment cycles must not re-acquire ahead of it.
     *
     * Reads resolve fresh on every admission decision so the class evaporates the moment the
     * last checkpoint commits. An absent manifest is NOT treated as bootstrap-critical (a plane
     * with no tenant repos never writes one); the age-based fairness bound still guarantees the
     * first sweep runs eventually on a contended plane, which seeds the manifest and activates
     * this class for the repos that remain.
     *
     * Fail-closed on read errors: a corrupt manifest must not grant priority.
     *
     * @param {String} taskName Stable orchestrator task name.
     * @returns {Boolean}
     */
    isBootstrapCriticalTask(taskName) {
        if (taskName !== 'tenant-repo-sync') {
            return false;
        }

        try {
            const manifestPath = path.join(this.dataDir, 'tenant-repo-sync-revisions.json');

            if (!fs.existsSync(manifestPath)) {
                return false;
            }

            const revisions = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))?.revisions;

            if (!revisions || typeof revisions !== 'object' || Array.isArray(revisions)) {
                return false;
            }

            return Object.values(revisions).some(entry => !entry?.lastIngestedRev);
        } catch (e) {
            this.writeLog('WARN', `[Orchestrator] Bootstrap-critical check failed for ${taskName}: ${e.message} — treating as ordinary.`);
            return false;
        }
    }

    // --- Executor wrappers (Group 3 entry points) ---

    /**
     * Wraps a heavy-maintenance task executor with intra-process backpressure +
     * inter-process lease acquisition + deferral recording + release-on-completion.
     *
     * Two-tier backpressure:
     * 1. **Intra-process:** `activeHeavyTask` tracker serializes heavy tasks within
     *    a single orchestrator poll cycle.
     * 2. **Inter-process:** shared file lease at `heavyMaintenanceLeasePath`
     *    serializes heavy tasks across concurrent orchestrator daemons + lease-aware
     *    manual CLI scripts.
     *
     * Lease release timing: synchronous `false` return → release immediately;
     * thenable → release on settle (both fulfill and reject); other → release
     * immediately. A synchronous throw from `executeFn` releases the lease before
     * re-throwing.
     *
     * @param {Object} options
     * @param {String} options.taskName Stable orchestrator task name.
     * @param {Function} options.executeFn Task body `(taskName, reason, onSuccess, taskOptions) => result`.
     * @param {Object} [options.reason] Scheduling reason (string or trigger object).
     * @param {Function|null} [options.onSuccess=null] Success hook forwarded to `executeFn`.
     * @param {Object} options.activeHeavyTask Mutable `{name: String|null}` tracker for the current poll.
     * @returns {Boolean|Promise|*} `false` when deferred; otherwise whatever `executeFn` returns.
     */
    acquireLeaseAndExecute({taskName, executeFn, reason, onSuccess = null, activeHeavyTask, now = Date.now()}) {
        const reasonText = reason || 'scheduled';

        if (!this.isHeavyMaintenanceTask(taskName)) {
            this.clearDeferralLogState(taskName);
            return executeFn(taskName, reason, onSuccess);
        }

        // Shed-window: a `throttle-shed` heal has deferred ALL heavy-maintenance for a bounded window to relieve
        // resource contention. Gate here (the single heavy-maintenance admission point) so the EXISTING deferral
        // path handles it — non-interrupting: tasks already past this gate (running, holding a lease) finish.
        if (this.isShedActive(now)) {
            this.recordDeferral({taskName, reasonCode: 'heavy-maintenance-shed-window', reasonText});
            return false;
        }

        let blockingTaskName = activeHeavyTask?.name && this.isHeavyMaintenanceConflict(taskName, activeHeavyTask.name)
            ? activeHeavyTask.name
            : null;

        if (!blockingTaskName) {
            blockingTaskName = this.getActiveHeavyMaintenanceTask({
                excludeTaskName  : taskName,
                candidateTaskName: taskName
            });
        }

        if (blockingTaskName) {
            this.recordDeferral({
                taskName,
                reasonCode: 'heavy-maintenance-backpressure',
                reasonText,
                blockingTaskName
            });
            return false;
        }

        // Fairness gate: do not step past a starving registered waiter that outranks this acquirer.
        //
        // SCOPE: this is the orchestrator-owned admission point only. Manual/container CLI entry
        // points acquire the global lease directly and do NOT pass through this service, so they
        // inherit lease exclusion but not this fairness rule.
        //
        // This gate is the SECOND line of defence, not the mechanism. It can only make an admitted
        // acquirer abstain, and the scheduling pipeline dispatches one candidate per poll — so a
        // yield here spends the poll without promoting anyone. Selection-time rank in
        // `scheduling/picker.mjs` is what actually gets a starved bootstrap lane executed; this
        // gate covers the residue (a task that reached admission while a higher-ranked peer was
        // registered mid-poll).
        //
        // Fail-open: a broken ledger read must not halt all maintenance — it logs and proceeds,
        // degrading to pre-fairness behavior.
        try {
            const {waiters, unreadable} = listActiveWaitersSync({
                leasePath   : this.resolveHeavyMaintenanceLeasePath(),
                staleAfterMs: WAITER_ENTRY_STALE_AFTER_MS,
                now
            });

            // A corrupt entry is an invisible loss of fairness: the waiter it represents cannot be
            // yielded to, so it silently starves while every surface reads healthy. Surface it —
            // the ledger reports these rather than throwing precisely so a consumer can decide, and
            // "broken reads log" is only true if someone actually logs them.
            if (unreadable?.length > 0) {
                this.writeLog('WARN', `[Orchestrator] Waiter ledger has ${unreadable.length} unreadable entr${unreadable.length === 1 ? 'y' : 'ies'} (${unreadable.join(', ')}); those waiters cannot be yielded to until repaired.`);
            }

            const yieldTo = findWaiterToYieldTo({
                taskName,
                priorityZero        : this.isPriorityZeroTask(taskName),
                bootstrapCritical   : this.isBootstrapCriticalTask(taskName),
                ownDeferredSince    : this.taskStateService?.getTaskState?.(taskName)?.deferralStreakStartedAt ?? null,
                waiters,
                fairnessYieldAfterMs: AiConfig.orchestrator.heavyMaintenanceLease.fairnessYieldAfterMs,
                now
            });

            if (yieldTo) {
                this.recordDeferral({
                    taskName,
                    reasonCode      : 'heavy-maintenance-yield-to-waiter',
                    reasonText      : `${reasonText}; yielding to starving ${yieldTo.taskName} (deferred since ${yieldTo.deferredSince})`,
                    blockingTaskName: yieldTo.taskName
                });
                return false;
            }
        } catch (e) {
            this.writeLog('ERROR', `[Orchestrator] Waiter fairness check failed for ${taskName}: ${e.message} — proceeding without it.`);
        }

        let acquisition;
        try {
            acquisition = this.acquireLeaseFn({
                owner       : taskName,
                reason      : reasonText,
                metadata    : {source: 'orchestrator'},
                leasePath   : this.resolveHeavyMaintenanceLeasePath(),
                staleAfterMs: AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs
            });
        } catch (e) {
            this.writeLog('ERROR', `[Orchestrator] Heavy-maintenance lease acquire failed for ${taskName}: ${e.message}`);
            this.healthService?.recordTaskOutcome?.(taskName, 'failed', {
                reason    : reasonText,
                reasonCode: 'heavy-maintenance-lease-acquire-error',
                error     : e.message,
                failedAt  : new Date().toISOString()
            });
            return false;
        }

        // Compatible-pair bypass: the incumbent keeps the global lease token; the
        // candidate runs without inheriting it so every non-compatible heavy task
        // remains serialized by the existing cross-daemon lease.
        const leaseToken = acquisition.acquired ? acquisition.lease.token : null;

        if (!acquisition.acquired && !this.areHeavyMaintenanceTasksCompatible(taskName, acquisition.lease?.owner)) {
            this.recordDeferral({
                taskName,
                reasonCode  : 'heavy-maintenance-lease-held',
                reasonText,
                holdingLease: acquisition.lease
            });
            return false;
        }

        this.clearDeferralLogState(taskName);

        // The task proceeds (own lease or compatible-pair bypass): it is no longer a waiter, and a
        // stale self-entry must not make OTHER acquirers yield to work that is already running.
        try {
            clearWaiterSync({leasePath: this.resolveHeavyMaintenanceLeasePath(), taskName});
        } catch (e) {
            this.writeLog('ERROR', `[Orchestrator] Waiter clear failed for ${taskName}: ${e.message}`);
        }

        const releaseLease = () => {
            if (!leaseToken) return;
            try {
                this.releaseLeaseFn({
                    token    : leaseToken,
                    leasePath: this.resolveHeavyMaintenanceLeasePath()
                });
            } catch (e) {
                this.writeLog('ERROR', `[Orchestrator] Heavy-maintenance lease release failed for ${taskName}: ${e.message}`);
            }
        };

        const taskOptions = {
            env       : leaseToken ? {NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN: leaseToken} : {},
            onComplete: releaseLease
        };

        let result;
        try {
            result = executeFn(taskName, reason, onSuccess, taskOptions);
        } catch (e) {
            releaseLease();
            throw e;
        }

        if (result === false) {
            releaseLease();
        } else if (result && typeof result.then === 'function') {
            result.then(releaseLease, releaseLease);
        } else if (result !== true) {
            releaseLease();
        }

        if (result !== false && activeHeavyTask) {
            activeHeavyTask.name = taskName;
        }

        return result;
    }

    /**
     * Wraps Golden Path execution with dependency ordering. Does NOT acquire a lease —
     * Golden Path is graph-dependent but classified as light maintenance (the synthesizer
     * reads the graph; it does not write the heavy substrates), so it only needs the
     * dependency gate to avoid reading a partial graph state.
     *
     * @param {Object} options
     * @param {String} options.taskName Stable orchestrator task name (`'golden-path'`).
     * @param {Function} options.executeFn Task body `(taskName, reason) => result`.
     * @param {Object} [options.reason] Scheduling reason.
     * @param {Object} options.activeHeavyTask Mutable `{name: String|null}` tracker for the current poll.
     * @returns {Boolean|*} `false` when deferred; otherwise whatever `executeFn` returns.
     */
    executeWithGoldenPathDependencyGate({taskName, executeFn, reason, activeHeavyTask}) {
        const reasonText       = reason || 'scheduled';
        const blockingTaskName = this.getActiveGoldenPathDependencyTask({
            activeTaskName: activeHeavyTask?.name
        });

        if (blockingTaskName) {
            this.recordDeferral({
                taskName  : 'golden-path',
                reasonCode: 'golden-path-dependency-backpressure',
                reasonText,
                blockingTaskName
            });
            return false;
        }

        this.clearDeferralLogState(taskName);
        return executeFn(taskName, reason);
    }
}

export default Neo.setupClass(MaintenanceBackpressureService);
