/**
 * Pure policy picker for the Orchestrator scheduling pipeline.
 *
 * Takes the collector's due-candidates array and applies a sequence of policy filters,
 * then selects at most one winner per poll cycle. Each filter is a pure function
 * `Array<candidate> → Array<candidate>`; the pipeline composes them in priority order.
 *
 * Stage order (matters — earlier stages narrow the candidate set before later stages):
 *   1. `filterAlreadyRunning`           — drop candidates whose task is already in `runningTasks`
 *   2. `filterExclusiveHeavyConflict`   — drop heavy candidates if a conflicting heavy is running
 *   3. `filterUnmetDependencies`        — drop candidates whose `dependencies` are in `runningTasks`
 *   4. `selectByPriority`               — priority-0 (backup) → staleness-ratio among the eligible
 *                                         (taskMeta) set → registry-order across the class boundary
 *
 * **NO state mutation.** This module reads `runningTasks` + `policyContext` but never
 * writes to `TaskStateService`, `HealthService`, or lease state. Caller is responsible
 * for state transitions when the winner actually executes.
 *
 * **Continuous tasks (chroma, bridgeDaemon, mlx) are NOT handled here** — those are
 * supervisor-restart-cooldown tasks handled directly in `Orchestrator#poll()` before
 * this pipeline runs. See `registry.mjs` head comment for the design rationale.
 *
 * @param {Object} options
 * @param {Array<Object>} options.candidates Due candidates from `collectDueCandidates`.
 * @param {Set<String>|Array<String>} options.runningTasks Task names currently running
 *   (derived from the current task-state snapshot).
 * @param {Object} options.policyContext Additional policy state. Recognized fields:
 *   `runningHeavyTasks` (Set) + `isHeavyMaintenanceConflict` (fn) for the heavy-conflict filter;
 *   and for the final selector: `now` (epoch ms), `taskMeta` (`{[taskName]: {lastRunAt, cadenceMs}}`),
 *   `priorityZeroTasks` (String[]), and `isBootstrapCriticalTask` (`(taskName) => Boolean`, the
 *   live per-poll oracle that ranks an uninitialized corpus above ordinary enrichment). When
 *   `taskMeta` is absent the selector degrades to registry-order, preserving legacy
 *   `selectFirstCandidate` behavior.
 * @returns {Object|null} The winning candidate, or null if no candidate survives the pipeline.
 */
export function pickNextCandidate({candidates, runningTasks, policyContext = {}}) {
    const runningSet = runningTasks instanceof Set ? runningTasks : new Set(runningTasks);

    const stages = [
        candidates => filterAlreadyRunning(candidates, runningSet),
        candidates => filterExclusiveHeavyConflict(candidates, policyContext),
        candidates => filterUnmetDependencies(candidates, runningSet)
    ];

    let remaining = candidates;
    for (const stage of stages) {
        remaining = stage(remaining);
        if (remaining.length === 0) return null;
    }

    return selectByPriority(remaining, policyContext);
}

/**
 * Drops candidates whose task is already in the running set.
 * Same-task back-to-back execution is prevented by the per-task `lastRunAt` cooldown
 * that the descriptor's `getDueTask` already enforces; this filter handles the case
 * where a long-running task's poll-cycle overlap surfaces the same candidate twice.
 */
function filterAlreadyRunning(candidates, runningSet) {
    return candidates.filter(candidate => !runningSet.has(candidate.taskName));
}

/**
 * Heavy-class candidates (`maintenanceClass: 'heavy'`) require exclusive heavy access
 * unless the policy service declares the running/candidate pair compatible.
 *
 * The caller must pre-compute `runningHeavyTasks` (a Set of currently-running task names
 * whose descriptors carry `maintenanceClass: 'heavy'`) and pass it via `policyContext`.
 * The picker cannot derive this from `runningSet` alone because running tasks are just
 * names — they have no descriptor metadata. The caller owns the registry lookup.
 *
 * When `policyContext.isHeavyMaintenanceConflict` is absent, this preserves the legacy
 * conservative behavior: any other running heavy task blocks the heavy candidate.
 *
 * Lightweight, continuous, and graph-dependent candidates are unaffected by this filter.
 */
function filterExclusiveHeavyConflict(candidates, policyContext) {
    const runningHeavy = policyContext.runningHeavyTasks;
    if (!runningHeavy || runningHeavy.size === 0) return candidates;

    return candidates.filter(candidate => {
        if (candidate.descriptor.maintenanceClass !== 'heavy') return true;

        for (const runningTaskName of runningHeavy) {
            if (runningTaskName === candidate.taskName) continue;
            const isConflict = typeof policyContext.isHeavyMaintenanceConflict === 'function'
                ? policyContext.isHeavyMaintenanceConflict(candidate.taskName, runningTaskName)
                : true;
            if (isConflict) return false;
        }

        return true;
    });
}

/**
 * Drops candidates whose declared `dependencies` (other task names) are currently running.
 * Example: `golden-path` declares `dependencies: ['dream']` so it waits until dream
 * finishes before scheduling its own pass.
 *
 * Dependencies are static per descriptor; same-poll handoffs (a dependency started AND
 * its dependent both due in the same poll) are handled by the caller — the picker only
 * sees the running set at pipeline-entry time. Caller may re-collect after starting a
 * dependency to allow same-poll handoff.
 */
function filterUnmetDependencies(candidates, runningSet) {
    return candidates.filter(candidate => {
        const deps = candidate.descriptor.dependencies || [];
        return deps.every(dep => !runningSet.has(dep));
    });
}

/**
 * Selects the winning candidate by maintenance priority:
 *   1. **Priority-0** — data-safety tasks (e.g. `backup`) win unconditionally when present,
 *      so a daily backup is never deferred behind a backlog-draining task. Registry order
 *      breaks ties among multiple priority-0 survivors.
 *   1b. **Bootstrap-critical** — a task whose durable corpus is still uninitialized (e.g. tenant
 *      repos with no checkpoint yet) outranks ordinary enrichment, because a plane that has never
 *      ingested cannot usefully enrich. Registry order breaks ties.
 *
 *      This rank lives in SELECTION, not in lease admission, and that placement is load-bearing.
 *      The admission-side fairness gate can only make the picked winner *abstain*; since the
 *      pipeline dispatches exactly one candidate per poll and then returns, a yield there spends
 *      the poll without promoting anybody — the starved task is never dispatched, and the ledger
 *      entry simply expires before it runs. Ranking here means the bootstrap task actually
 *      executes. Admission-side fairness remains the second line of defence for holders that are
 *      already running.
 *   2. **Staleness-ratio (eligible set only)** — among candidates carrying `taskMeta` (the
 *      lease-competing heavy tasks plus `golden-path`), the most overdue by `(now - lastRunAt) /
 *      cadenceMs` is the single eligible representative, so a weeks-stale `golden-path` or a
 *      starved `memory-summary-backfill` outranks a just-drained `summary`. A never-run task
 *      (lastRunAt 0) scores very high.
 *   3. **Registry order across the class boundary** — NON-eligible candidates (no `taskMeta`:
 *      lightweight / health / continuous) keep their registry slot; the winner is the first in
 *      registry order among the non-eligible candidates plus the one eligible representative, so a
 *      registry-earlier non-heavy task still beats a later overdue heavy one. Strict `>` keeps the
 *      earlier eligible candidate on equal ratios.
 *
 * Pure. Backward-compatible: when `policyContext.taskMeta` is absent, this degrades to
 * registry-order `candidates[0]` — the legacy `selectFirstCandidate` behavior, so callers
 * (and unit tests) that supply no staleness metadata are unaffected.
 *
 * @param {Array<Object>} candidates Filtered survivors (non-empty when called from the pipeline).
 * @param {Object} [policyContext] `{now, taskMeta, priorityZeroTasks}` — see `pickNextCandidate`.
 * @returns {Object|null}
 */
function selectByPriority(candidates, policyContext = {}) {
    if (candidates.length === 0) return null;

    const {taskMeta, now, priorityZeroTasks, isBootstrapCriticalTask} = policyContext;

    // Legacy / no-metadata path: registry-order priority (earlier descriptors win).
    if (!taskMeta) return candidates[0];

    // Priority-0: data-safety tasks win unconditionally; registry order among them.
    if (Array.isArray(priorityZeroTasks) && priorityZeroTasks.length > 0) {
        const priorityZeroWinner = candidates.find(candidate => priorityZeroTasks.includes(candidate.taskName));
        if (priorityZeroWinner) return priorityZeroWinner;
    }

    // Bootstrap-critical: outranks staleness so an uninitialized corpus is DISPATCHED rather than
    // merely deferred-to. The predicate is re-evaluated every poll and is fail-open — a throwing or
    // absent oracle degrades to pure staleness ordering, never blocks the pick.
    if (typeof isBootstrapCriticalTask === 'function') {
        const bootstrapWinner = candidates.find(candidate => {
            try {
                return isBootstrapCriticalTask(candidate.taskName) === true;
            } catch {
                return false;
            }
        });

        if (bootstrapWinner) return bootstrapWinner;
    }

    // Staleness reorders ONLY the eligible set (candidates carrying `taskMeta` — the
    // lease-competing heavy tasks plus `golden-path`). The most-overdue eligible candidate is the
    // single eligible representative; every NON-eligible candidate keeps its registry slot, so the
    // cross-class boundary is unchanged (a registry-earlier non-heavy task still wins over a later
    // overdue heavy one). Strict `>` keeps the earlier eligible candidate on equal ratios.
    let topEligible = null;
    let topRatio    = -Infinity;

    for (const candidate of candidates) {
        if (!taskMeta[candidate.taskName]) continue;
        const ratio = stalenessRatio(candidate, taskMeta, now);
        if (ratio > topRatio) {
            topRatio    = ratio;
            topEligible = candidate;
        }
    }

    // Registry-order winner among the non-eligible candidates plus the one eligible representative.
    for (const candidate of candidates) {
        if (!taskMeta[candidate.taskName] || candidate === topEligible) return candidate;
    }

    return candidates[0];
}

/**
 * Overdue-relative-to-cadence score for a candidate: `(now - lastRunAt) / cadenceMs`.
 * Higher = more starved; a never-run task (lastRunAt 0/absent) scores very high. Missing
 * task metadata, a non-numeric `now`, or a non-positive cadence yields a neutral `0` so
 * registry order decides rather than NaN/Infinity skewing the comparison.
 *
 * @param {Object} candidate Scheduling candidate (`{taskName, ...}`).
 * @param {Object} taskMeta `{[taskName]: {lastRunAt, cadenceMs}}`.
 * @param {Number} now Epoch milliseconds.
 * @returns {Number}
 */
function stalenessRatio(candidate, taskMeta, now) {
    const meta = taskMeta?.[candidate.taskName];
    if (!meta || typeof now !== 'number') return 0;

    const lastRunAt = typeof meta.lastRunAt === 'number' ? meta.lastRunAt : 0;
    const cadenceMs = meta.cadenceMs;
    if (!cadenceMs || cadenceMs <= 0) return 0;

    return Math.max(0, now - lastRunAt) / cadenceMs;
}
