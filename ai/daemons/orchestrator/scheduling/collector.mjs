/**
 * Pure collector for the Orchestrator scheduling pipeline.
 *
 * Iterates a registry of coordinator descriptors, projects each to a due-trigger via the
 * descriptor's `getDueTask(context)` adapter, normalizes the trigger shape, and attaches
 * the descriptor as metadata so downstream `pickNextCandidate` can apply policy rules.
 *
 * **Hard guardrail (ticket #11862 AC5):** this module contains NO `switch(...)` body,
 * NO `executionKind === ...` branching, NO `maintenanceClass === ...` branching, NO
 * `if (... profile ...)` branching. Policy decisions live in `pickNextCandidate`; per-task
 * destructuring lives in registry descriptor adapters. The collector itself is pure
 * iteration + normalization + metadata attachment.
 *
 * **Failure isolation without state mutation (ticket #11862 AC4):** when a descriptor's
 * `getDueTask` throws, the collector captures the error in the returned `errors` array
 * rather than calling `healthService.recordTaskOutcome(...)` directly. Caller (Orchestrator)
 * iterates the errors array and performs the state-mutating reporting. This keeps the
 * collector observably pure — assertable via spy/before-after-snapshot in unit tests.
 *
 * @param {Object} options
 * @param {Array<Object>} options.registry Frozen task-descriptor registry (see `registry.mjs`).
 * @param {Object} options.context Uniform context passed to every descriptor's `getDueTask`.
 *   Must include `state`, `now`, `intervals`, `enables`, `hooks` (descriptor-specific
 *   destructure shape lives inside each descriptor's adapter closure).
 * @returns {{candidates: Array<Object>, errors: Array<Object>}} Due candidates and per-task
 *   errors, both as plain data structures. No side effects.
 */
export function collectDueCandidates({registry, context}) {
    const candidates = [];
    const errors     = [];

    for (const descriptor of registry) {
        try {
            const trigger = descriptor.getDueTask(context);
            if (trigger) {
                candidates.push({
                    taskName: descriptor.taskName,
                    trigger : normalizeTrigger(trigger),
                    descriptor
                });
            }
        } catch (error) {
            errors.push({taskName: descriptor.taskName, error});
        }
    }

    return {candidates, errors};
}

/**
 * Normalizes a getDueTask return value to a uniform `{reason, onSuccess}` shape.
 *
 * Historical `CadenceEngine.runIfDue` accepted both boolean-true and object triggers;
 * the registry now uses object triggers exclusively per the Sub 20 scheduling-module
 * harmonization (#11864). This normalizer preserves backward compatibility for any
 * future module that returns a bare-boolean trigger.
 *
 * @param {Object|Boolean} trigger Raw trigger from `getDueTask`.
 * @returns {Object} Normalized `{reason, onSuccess?, ...originalFields}`.
 */
function normalizeTrigger(trigger) {
    if (typeof trigger === 'object') {
        return trigger;
    }
    return {reason: 'periodic-sync'};
}
