/**
 * Pure policy picker for the Orchestrator scheduling pipeline.
 *
 * Takes the collector's due-candidates array and applies a sequence of policy filters,
 * then selects at most one winner per poll cycle. Each filter is a pure function
 * `Array<candidate> → Array<candidate>`; the pipeline composes them in priority order.
 *
 * Stage order (matters — earlier stages narrow the candidate set before later stages):
 *   1. `filterAlreadyRunning`           — drop candidates whose task is already in `runningTasks`
 *   2. `filterExclusiveHeavyConflict`   — drop heavy candidates if another heavy is running
 *   3. `filterUnmetDependencies`        — drop candidates whose `dependencies` are in `runningTasks`
 *   4. `selectFirstCandidate`           — pick the first remaining (registry-order priority)
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
 * @param {Object} options.policyContext Additional policy state (currently unused;
 *   reserved for future deployment-profile + cross-daemon-lease integration).
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

    return selectFirstCandidate(remaining);
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
 * Heavy-class candidates (`maintenanceClass: 'heavy'`) require exclusive heavy access.
 * If ANY task with `maintenanceClass: 'heavy'` is already running, drop all heavy
 * candidates from this poll cycle.
 *
 * The caller must pre-compute `runningHeavyTasks` (a Set of currently-running task names
 * whose descriptors carry `maintenanceClass: 'heavy'`) and pass it via `policyContext`.
 * The picker cannot derive this from `runningSet` alone because running tasks are just
 * names — they have no descriptor metadata. The caller owns the registry lookup.
 *
 * Lightweight, continuous, and graph-dependent candidates are unaffected by this filter.
 */
function filterExclusiveHeavyConflict(candidates, policyContext) {
    const runningHeavy = policyContext.runningHeavyTasks;
    if (!runningHeavy || runningHeavy.size === 0) return candidates;

    return candidates.filter(candidate => candidate.descriptor.maintenanceClass !== 'heavy');
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
 * Selects the first candidate from the filtered list. Registry order is the priority:
 * earlier descriptors win ties. Adjust `TASK_REGISTRY` order to change priority.
 */
function selectFirstCandidate(candidates) {
    return candidates[0] ?? null;
}
