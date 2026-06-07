/**
 * Pure collector for the Orchestrator scheduling pipeline.
 *
 * Iterates a registry of coordinator descriptors, projects each to a due-trigger via the
 * descriptor's `getDueTask(context)` adapter, normalizes the trigger shape, and attaches
 * the descriptor as metadata so downstream `pickNextCandidate` can apply policy rules.
 *
 * The collector is intentionally policy-blind: it contains no task-kind,
 * maintenance-class, or deployment-profile branching. Eligibility decisions live in
 * registry descriptor adapters via caller-provided getter values; cross-candidate
 * policy decisions live in `pickNextCandidate`. The collector itself is pure
 * iteration + normalization + metadata attachment.
 *
 * Descriptor failures are reported as data, not written directly to Orchestrator
 * state. The caller owns state-mutating health reporting, keeping this module
 * observably pure.
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
 * Registry descriptors use object triggers, but this normalizer keeps the collector
 * tolerant of any future bare-boolean trigger.
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
