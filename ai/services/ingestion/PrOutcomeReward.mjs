/**
 * @summary Pure PR-outcome → RLAIF reward-signal mapping — the foundational slice of the PR Outcome
 * Tracker. Maps a pull request's terminal merge outcome to a scalar reward, giving the RLAIF
 * pipeline a ground-truth signal the LLM-estimated session quality/productivity scores cannot see
 * (a session whose PRs were all reverted must not score as productive).
 *
 * Deliberately PURE — no I/O, no Chroma/graph write, no `gh` calls. The outcome SCAN (gh I/O),
 * session-linking, the ChromaDB retroactive-tag write (RLS + dry-run-first), and the
 * DreamService/runSandman integration are the rest of the tracker (the RLAIF/memory-core domain). Placed
 * beside its eventual consumer (`MemorySessionIngestor`); relocate to a dedicated `rlaif/` module if
 * the integration design warrants. Plain function exports (no Neo singleton) mirror this directory's
 * local-pure-helper convention — a stateless mapping needs no instance.
 *
 * Reward table:
 * | outcome             | reward | rationale                      |
 * |---------------------|--------|--------------------------------|
 * | `mergedClean`       |   1.0  | merge-ready code               |
 * | `mergedWithChanges` |   0.7  | good work, minor polish        |
 * | `closedUnmerged`    |   0.0  | wasted effort — wrong approach |
 * | `reverted`          |  -1.0  | actively harmful — regression  |
 *
 * @module ai/services/ingestion/PrOutcomeReward
 */

/**
 * @summary The canonical PR-outcome → reward scalar table. Frozen so callers cannot mutate
 * the shared signal definition.
 * @type {Readonly<Object<String,Number>>}
 */
export const PR_OUTCOME_REWARDS = Object.freeze({
    mergedClean      : 1.0,
    mergedWithChanges: 0.7,
    closedUnmerged   : 0.0,
    reverted         : -1.0
});

/**
 * @summary Classifies a pull request's terminal state into one of the four reward outcomes. Revert
 * dominates merge (a reverted PR is `reverted` regardless of how it merged); an unmerged PR is
 * `closedUnmerged` regardless of any requested-changes history.
 * @param {Object} [state={}]
 * @param {Boolean} state.merged True if the PR was merged.
 * @param {Boolean} [state.reverted=false] True if the merge was later reverted.
 * @param {Boolean} [state.hadRequestedChanges=false] True if the PR carried a requested-changes review before merging.
 * @returns {String} one of the `PR_OUTCOME_REWARDS` keys.
 */
export function classifyPrOutcome({merged, reverted = false, hadRequestedChanges = false} = {}) {
    if (reverted) return 'reverted';
    if (!merged)  return 'closedUnmerged';

    return hadRequestedChanges ? 'mergedWithChanges' : 'mergedClean';
}

/**
 * @summary Resolves the scalar reward for a PR-outcome key, or for a raw `classifyPrOutcome` state.
 * @param {String|Object} outcomeOrState An outcome key, or a state object for `classifyPrOutcome`.
 * @returns {Number|null} the reward scalar, or `null` for an unrecognized outcome key.
 */
export function computeOutcomeReward(outcomeOrState) {
    const outcome = typeof outcomeOrState === 'string'
        ? outcomeOrState
        : classifyPrOutcome(outcomeOrState);

    return Object.prototype.hasOwnProperty.call(PR_OUTCOME_REWARDS, outcome)
        ? PR_OUTCOME_REWARDS[outcome]
        : null;
}
