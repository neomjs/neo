/**
 * Pure, side-effect-free checker for STRICT merge-readiness of a pull request.
 *
 * `reviewDecision=APPROVED` + green checks are necessary but NOT sufficient: GitHub flattens
 * `reviewDecision` to APPROVED as soon as it has enough formal review state, even while an
 * explicitly-requested reviewer is still outstanding (`reviewRequests` non-empty). The author/operator's
 * requested-reviewer set is an explicit contract — a non-empty `reviewRequests` blocks strict
 * merge-readiness until each request is disposed (a formal APPROVED / CHANGES_REQUESTED review, a
 * visible step-out, or an author/operator unrequest). An A2A peer approval does NOT clear a
 * requested-reviewer slot. Human-only merge authority is unchanged; this only validates the *claim*
 * that a PR is strict-merge-ready, so a stale reviewer contract is not reported as a green surface.
 *
 * @module Neo.ai.scripts.lifecycle.validateMergeReady
 */

/**
 * `mergeStateStatus` values that are NOT mergeable (a conflict or stale base — not a strict-ready surface).
 * @type {String[]}
 */
export const NON_MERGEABLE_STATES = ['DIRTY', 'BEHIND', 'BLOCKED'];

/**
 * @summary Validates whether a PR is STRICT merge-ready against the full review/merge contract.
 *
 * Rules (all must hold for `strictMergeReady`):
 *  1. `reviewDecision === 'APPROVED'`.
 *  2. `checksGreen` (all required CI checks pass).
 *  3. `mergeStateStatus` is not a non-mergeable state (DIRTY/BEHIND/BLOCKED — a conflict / stale base).
 *  4. Every explicitly-requested reviewer in `reviewRequests` is disposed — i.e. `reviewRequests`
 *     minus `disposedReviewers` is empty (the reviewer-contract gate).
 *
 * @param {Object} [pr={}]
 * @param {String} [pr.reviewDecision] GitHub flattened review decision (`APPROVED` | `CHANGES_REQUESTED` | `REVIEW_REQUIRED` | null).
 * @param {Boolean} [pr.checksGreen] True when all required CI checks pass.
 * @param {String} [pr.mergeStateStatus] GitHub mergeStateStatus (`CLEAN` | `UNSTABLE` | `DIRTY` | `BEHIND` | `BLOCKED` | ...).
 * @param {String[]} [pr.reviewRequests] Logins of still-requested reviewers (the explicit author/operator contract).
 * @param {String[]} [pr.disposedReviewers] Requested reviewers already disposed (formal review / visible step-out / unrequest).
 * @returns {{strictMergeReady: Boolean, blockers: String[]}}
 */
export function validateMergeReady(pr = {}) {
    const {
        reviewDecision,
        checksGreen       = false,
        mergeStateStatus,
        reviewRequests    = [],
        disposedReviewers = []
    } = pr;

    const blockers = [];

    if (reviewDecision !== 'APPROVED') {
        blockers.push(`reviewDecision is '${reviewDecision ?? 'none'}', not APPROVED.`);
    }
    if (!checksGreen) {
        blockers.push('not all required CI checks are green.');
    }
    if (mergeStateStatus && NON_MERGEABLE_STATES.includes(mergeStateStatus)) {
        blockers.push(`mergeStateStatus is '${mergeStateStatus}' (a conflict or stale base — not mergeable).`);
    }

    const outstanding = reviewRequests.filter(reviewer => !disposedReviewers.includes(reviewer));
    if (outstanding.length > 0) {
        blockers.push(`outstanding requested reviewer(s) [${outstanding.join(', ')}] — an explicit reviewer contract is not strict-merge-ready until each is disposed (formal review, visible step-out, or unrequest); an A2A approval does not clear the slot.`);
    }

    return {strictMergeReady: blockers.length === 0, blockers};
}

export default validateMergeReady;
